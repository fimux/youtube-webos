import sha256 from 'tiny-sha256';
import {
  configAddChangeListener,
  configRead,
  configRemoveChangeListener,
  sponsorBlockCategories
} from './config';
import {
  clearManualSegmentSkip,
  setSponsorBlockSegments,
  showManualSegmentSkip,
  showNotification
} from './ui';

const sponsorblockAPI = 'https://sponsorblock.inf.re/api';
const requestedCategories = sponsorBlockCategories
  .filter((category) => category.id !== 'mute')
  .map((category) => category.id);
const configKeys = sponsorBlockCategories.reduce(
  (keys, category) =>
    keys.concat([
      `sponsorBlock_${category.id}_mode`,
      `sponsorBlock_${category.id}_color`,
      `sponsorBlock_${category.id}_show`
    ]),
  ['sponsorBlockSkipSegmentsOnce']
);

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

class SponsorBlockHandler {
  active = true;
  video = null;
  segments = [];
  sortedSegments = [];
  categorySettingsCache = new Map();
  segmentIds = new WeakMap();
  skippedSegments = new Set();
  skipSegmentsOnce = false;
  attachVideoTimeout = null;
  nextSkipTimeout = null;
  muteOriginalState = null;
  activeMuteSegment = null;
  muteSegmentRange = null;
  slider = null;
  sliderInterval = null;
  sliderObserver = null;
  sliderSegmentsOverlay = null;
  scheduleSkipHandler = null;
  durationChangeHandler = null;
  manualSegmentHandler = null;
  muteProgressHandler = null;
  configChangeHandler = null;
  jumpToNextHighlightHandler = null;
  manualSegmentId = null;

  constructor(videoID) {
    this.videoID = videoID;
  }

  async init() {
    const videoHash = sha256(this.videoID).substring(0, 4);
    const resp = await fetch(
      `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(
        JSON.stringify(requestedCategories)
      )}&actionTypes=${encodeURIComponent(
        JSON.stringify(['skip', 'mute', 'poi'])
      )}`
    );
    if (!resp.ok) {
      throw new Error(`SponsorBlock request failed: ${resp.status}`);
    }
    const results = await resp.json();
    if (!this.active) return;
    const result = results.find((video) => video.videoID === this.videoID);
    console.debug(this.videoID, 'Got it:', result);
    this.sortedSegments = (result?.segments || []).slice().sort(
      (first, second) => first.segment[0] - second.segment[0]
    );
    this.segments = this.sortedSegments;
    this.skipSegmentsOnce = configRead('sponsorBlockSkipSegmentsOnce');

    this.scheduleSkipHandler = () => this.scheduleSkip();
    this.durationChangeHandler = () => this.buildOverlay();
    this.manualSegmentHandler = () => this.updateManualSegmentSkip();
    this.muteProgressHandler = () => this.updateMuteProgress();
    this.configChangeHandler = () => {
      this.categorySettingsCache.clear();
      this.skipSegmentsOnce = configRead('sponsorBlockSkipSegmentsOnce');
      this.renderOverlaySegments();
      this.updateSegmentList();
      this.scheduleSkip();
    };

    for (const key of configKeys) {
      configAddChangeListener(key, this.configChangeHandler);
    }

    this.attachVideo();
    this.buildOverlay();
    this.updateSegmentList();
  }

  categoryForSegment(segment) {
    return segment.actionType === 'mute' ? 'mute' : segment.category;
  }

  categorySettings(segment) {
    const category = this.categoryForSegment(segment);
    if (this.categorySettingsCache.has(category)) {
      return this.categorySettingsCache.get(category);
    }

    const definition = sponsorBlockCategories.find(
      (item) => item.id === category
    );
    if (!definition) {
      const settings = {
        name: segment.category,
        color: '#008fd6',
        mode: 'manual',
        show: true
      };
      this.categorySettingsCache.set(category, settings);
      return settings;
    }
    const settings = {
      name: definition.name,
      color: configRead(`sponsorBlock_${category}_color`),
      mode: configRead(`sponsorBlock_${category}_mode`),
      show: configRead(`sponsorBlock_${category}_show`)
    };
    this.categorySettingsCache.set(category, settings);
    return settings;
  }

  segmentId(segment) {
    let id = this.segmentIds.get(segment);
    if (!id) {
      id =
        segment.UUID ||
        `${segment.category}:${segment.segment[0]}:${segment.segment[1]}`;
      this.segmentIds.set(segment, id);
    }
    return id;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    this.video = document.querySelector('video');
    if (!this.video) {
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 100);
      return;
    }

    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.manualSegmentHandler);
    this.video.addEventListener('timeupdate', this.muteProgressHandler);
    this.video.addEventListener('durationchange', this.durationChangeHandler);
  }

  buildOverlay() {
    if (!this.video || !this.video.duration) return;

    if (!this.sliderSegmentsOverlay) {
      this.sliderSegmentsOverlay = document.createElement('div');
      this.sliderSegmentsOverlay.className =
        'ytaf-sponsorblock-segment-container';
      this.watchForSlider();
    }
    this.renderOverlaySegments();
  }

  renderOverlaySegments() {
    if (!this.sliderSegmentsOverlay || !this.video?.duration) return;

    while (this.sliderSegmentsOverlay.firstChild) {
      this.sliderSegmentsOverlay.removeChild(
        this.sliderSegmentsOverlay.firstChild
      );
    }
    for (const segment of this.segments) {
      const settings = this.categorySettings(segment);
      if (!settings.show) continue;

      const [start, end] = segment.segment;
      const element = document.createElement('div');
      element.className = 'ytaf-sponsorblock-segment';
      element.style.backgroundColor = settings.color;
      element.style.left = `${(start / this.video.duration) * 100}%`;
      element.style.width = `${Math.max(
        0.3,
        ((end - start) / this.video.duration) * 100
      )}%`;
      element.title = `${settings.name} (${formatTime(start)}–${formatTime(end)})`;
      this.sliderSegmentsOverlay.appendChild(element);
    }
  }

  watchForSlider() {
    const addSliderOverlay = () => {
      if (this.slider && this.sliderSegmentsOverlay?.parentElement !== this.slider) {
        this.slider.appendChild(this.sliderSegmentsOverlay);
      }
    };

    const watch = () => {
      if (this.sliderInterval) clearInterval(this.sliderInterval);
      this.sliderInterval = setInterval(() => {
        const nodes = document.querySelectorAll('[idomkey=progress-bar]');
        const last = nodes[nodes.length - 1];
        if (nodes.length === 3) {
          this.slider = last;
        } else if (nodes.length === 2) {
          this.slider = last.querySelector('[idomkey=slider]');
        } else {
          return;
        }

        clearInterval(this.sliderInterval);
        this.sliderInterval = null;
        this.sliderObserver.observe(last, { childList: true, subtree: true });
        addSliderOverlay();
      }, 100);
    };

    this.sliderObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node === this.sliderSegmentsOverlay) {
            addSliderOverlay();
          } else if (node === this.slider) {
            this.sliderObserver.disconnect();
            this.slider = null;
            watch();
          }
        }
      }
    });

    watch();
  }

  updateSegmentList() {
    setSponsorBlockSegments(this.segments, (segment) =>
      this.handleSegmentAction(segment)
    );
  }

  isHighlight(segment) {
    return (
      segment.actionType === 'poi' ||
      segment.category === 'poi_highlight' ||
      segment.category === 'highlight'
    );
  }

  handleSegmentAction(segment) {
    if (!this.video) return;
    if (segment.actionType === 'mute') {
      this.muteSegment(segment);
    } else if (this.isHighlight(segment)) {
      this.video.currentTime = segment.segment[0];
      showNotification(
        `Jumping to Highlight at ${formatTime(segment.segment[0])}`,
        2000,
        'blue'
      );
    } else {
      this.skipSegment(segment);
    }
  }

  updateManualSegmentSkip() {
    if (!this.video || this.video.paused) {
      clearManualSegmentSkip();
      this.manualSegmentId = null;
      return;
    }

    const currentSegment = this.segments.find((segment) => {
      const settings = this.categorySettings(segment);
      return (
        settings.mode === 'manual' &&
        this.video.currentTime >= segment.segment[0] &&
        this.video.currentTime < segment.segment[1]
      );
    });

    if (!currentSegment) {
      clearManualSegmentSkip();
      this.manualSegmentId = null;
      return;
    }

    const id = this.segmentId(currentSegment);
    if (this.manualSegmentId === id) return;
    this.manualSegmentId = id;
    const settings = this.categorySettings(currentSegment);
    const isMute = currentSegment.actionType === 'mute';
    const isHighlight = this.isHighlight(currentSegment);
    showManualSegmentSkip(
      `${isMute ? 'Mute' : isHighlight ? 'Jump to' : 'Skip'} ${settings.name}`,
      () => {
        if (isMute || isHighlight) {
          this.handleSegmentAction(currentSegment);
          this.manualSegmentId = null;
          clearManualSegmentSkip();
        } else {
          this.skipSegment(currentSegment);
        }
      }
    );
  }

  skipSegment(segment) {
    if (!this.video) return;
    this.skippedSegments.add(this.segmentId(segment));
    this.video.currentTime = segment.segment[1];
    this.manualSegmentId = null;
    clearManualSegmentSkip();
    this.scheduleSkip();
  }

  muteSegment(segment) {
    if (!this.video) return;
    if (
      this.video.currentTime < segment.segment[0] ||
      this.video.currentTime >= segment.segment[1]
    ) {
      this.video.currentTime = segment.segment[0];
    }
    if (this.muteOriginalState === null) {
      this.muteOriginalState = this.video.muted;
    }
    this.activeMuteSegment = this.segmentId(segment);
    this.muteSegmentRange = segment.segment;
    this.video.muted = true;
  }

  updateMuteProgress() {
    if (
      this.activeMuteSegment &&
      this.muteSegmentRange &&
      (this.video.currentTime < this.muteSegmentRange[0] ||
        this.video.currentTime >= this.muteSegmentRange[1])
    ) {
      this.restoreMuteState();
      this.scheduleSkip();
    }
  }

  restoreMuteState() {
    if (this.video && this.muteOriginalState !== null) {
      this.video.muted = this.muteOriginalState;
    }
    this.muteOriginalState = null;
    this.activeMuteSegment = null;
    this.muteSegmentRange = null;
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;
    if (!this.active || !this.video || this.video.paused) return;

    const currentTime = this.video.currentTime;
    let low = 0;
    let high = this.sortedSegments.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.sortedSegments[middle].segment[0] <= currentTime - 0.3) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    let nextSegment = null;
    for (let index = low; index < this.sortedSegments.length; index++) {
      const segment = this.sortedSegments[index];
      if (segment.segment[1] <= currentTime + 0.05) continue;

      const id = this.segmentId(segment);
      if (
        this.categorySettings(segment).mode === 'auto' &&
        this.activeMuteSegment !== id &&
        !(this.skipSegmentsOnce && this.skippedSegments.has(id))
      ) {
        nextSegment = segment;
        break;
      }
    }

    if (!nextSegment) return;

    this.nextSkipTimeout = setTimeout(() => {
      if (!this.active || !this.video || this.video.paused) return;

      const settings = this.categorySettings(nextSegment);
      if (settings.mode !== 'auto') return;

      if (nextSegment.actionType === 'mute') {
        if (this.activeMuteSegment !== this.segmentId(nextSegment)) {
          if (this.skipSegmentsOnce) {
            this.skippedSegments.add(this.segmentId(nextSegment));
          }
          this.muteSegment(nextSegment);
        }
      } else {
        this.skippedSegments.add(this.segmentId(nextSegment));
        showNotification(`Skipping ${settings.name}`, 2000, 'indigo');
        this.video.currentTime = nextSegment.segment[1];
      }
      this.scheduleSkip();
    }, Math.max(0, (nextSegment.segment[0] - this.video.currentTime) * 1000));
  }

  jumpToNextHighlight() {
    if (!this.video) return false;
    const highlight = this.segments
      .filter(
        (segment) =>
          segment.actionType === 'poi' ||
          segment.category === 'poi_highlight' ||
          segment.category === 'highlight'
      )
      .filter((segment) => segment.segment[0] > this.video.currentTime + 0.1)
      .sort((first, second) => first.segment[0] - second.segment[0])[0];

    if (!highlight) return false;
    this.video.currentTime = highlight.segment[0];
    showNotification(
      `Jumping to Highlight at ${formatTime(highlight.segment[0])}`,
      2000,
      'blue'
    );
    return true;
  }

  destroy() {
    this.active = false;
    clearTimeout(this.nextSkipTimeout);
    clearTimeout(this.attachVideoTimeout);
    clearInterval(this.sliderInterval);
    this.sliderObserver?.disconnect();
    this.sliderSegmentsOverlay?.remove();
    clearManualSegmentSkip();
    setSponsorBlockSegments([], () => {});

    if (this.video) {
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.removeEventListener('pause', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.manualSegmentHandler);
      this.video.removeEventListener('timeupdate', this.muteProgressHandler);
      this.video.removeEventListener(
        'durationchange',
        this.durationChangeHandler
      );
      this.restoreMuteState();
    }
    for (const key of configKeys) {
      configRemoveChangeListener(key, this.configChangeHandler);
    }
    if (window.ytaf_jumpToHighlight === this.jumpToNextHighlightHandler) {
      window.ytaf_jumpToHighlight = null;
    }
  }
}

window.sponsorblock = null;
let sponsorblockNavigationTimeout = null;

function uninitializeSponsorblock() {
  if (!window.sponsorblock) return;
  try {
    window.sponsorblock.destroy();
  } catch (err) {
    console.warn('window.sponsorblock.destroy() failed!', err);
  }
  window.sponsorblock = null;
}

function handleSponsorBlockNavigation() {
  const newURL = new URL(location.hash.substring(1), location.href);
  if (newURL.pathname !== '/watch' && window.sponsorblock) {
    uninitializeSponsorblock();
    return;
  }

  const videoID = newURL.searchParams.get('v');
  const needsReload =
    videoID &&
    (!window.sponsorblock || window.sponsorblock.videoID !== videoID);
  if (!needsReload) return;

  uninitializeSponsorblock();
  if (!configRead('enableSponsorBlock')) return;

  const handler = new SponsorBlockHandler(videoID);
  handler.jumpToNextHighlightHandler = () => handler.jumpToNextHighlight();
  window.ytaf_jumpToHighlight = handler.jumpToNextHighlightHandler;
  window.sponsorblock = handler;
  handler.init().catch((error) => {
    console.error('Failed to initialize SponsorBlock:', error);
  });
}

window.addEventListener(
  'hashchange',
  () => {
    clearTimeout(sponsorblockNavigationTimeout);
    sponsorblockNavigationTimeout = setTimeout(() => {
      sponsorblockNavigationTimeout = null;
      handleSponsorBlockNavigation();
    }, 75);
  },
  false
);
