import sha256 from 'tiny-sha256';
import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import { showNotification } from './ui';

const API = 'https://sponsorblock.inf.re/api';
const FALLBACK_API = 'https://sponsor.ajay.app/api';
const HIGHLIGHT = 'poi_highlight';
const CATEGORIES = [
  'sponsor', 'intro', 'outro', 'interaction', 'selfpromo',
  'music_offtopic', 'preview', 'poi_highlight', 'filler', 'hook', 'exclusive_access', 'chapter'
];
const LEGACY_KEYS = {
  sponsor: 'enableSponsorBlockSponsor',
  intro: 'enableSponsorBlockIntro',
  outro: 'enableSponsorBlockOutro',
  interaction: 'enableSponsorBlockInteraction',
  selfpromo: 'enableSponsorBlockSelfPromo',
  music_offtopic: 'enableSponsorBlockMusicOfftopic',
  preview: 'enableSponsorBlockPreview',
  poi_highlight: 'enableSponsorBlockHighlight',
  filler: 'enableSponsorBlockFiller',
  hook: 'enableSponsorBlockHook',
  exclusive_access: 'enableSponsorBlockExclusiveAccess',
  chapter: 'enableSponsorBlockChapter'
};
const CATEGORY_NAMES = {
  sponsor: 'Patrocinador',
  intro: 'Introducción',
  outro: 'Final / créditos',
  interaction: 'Interacción',
  selfpromo: 'Autopromoción',
  music_offtopic: 'Parte no musical',
  preview: 'Resumen / avance',
  poi_highlight: 'Highlight',
  filler: 'Tangentes / relleno',
  hook: 'Hook / saludo',
  exclusive_access: 'Acceso exclusivo (video completo)',
  chapter: 'Capítulo'
};
const DEFAULT_COLORS = {
  sponsor: '#00d400', intro: '#00ffff', outro: '#0202ed',
  interaction: '#cc00ff', selfpromo: '#ffff00', music_offtopic: '#ff9900',
  preview: '#008fd6', poi_highlight: '#ff1684', filler: '#7300ff', hook: '#395699',
  exclusive_access: '#a66bff', chapter: '#aaaaaa'
};

function getOptions() {
  return configRead('sponsorBlockOptions') || {};
}

function categoryOptions(category) {
  const all = getOptions();
  const stored = all[category] || {};
  return {
    autoSkip: stored.autoSkip !== undefined ? stored.autoSkip : !!LEGACY_KEYS[category] && configRead(LEGACY_KEYS[category]),
    manualSkip: stored.manualSkip !== undefined ? stored.manualSkip : true,
    showInProgress: stored.showInProgress !== undefined ? stored.showInProgress : true,
    disabled: !!stored.disabled,
    color: /^#[0-9a-f]{6}$/i.test(stored.color || '') ? stored.color : (DEFAULT_COLORS[category] || '#717171')
  };
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function validSegment(raw) {
  if (!raw || typeof raw.category !== 'string' || !Array.isArray(raw.segment) || raw.segment.length < 2) return null;
  const start = Number(raw.segment[0]);
  const end = Number(raw.segment[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return null;
  const isFullVideo = raw.category === 'exclusive_access' && raw.actionType === 'full';
  if (start === end && raw.category !== HIGHLIGHT && raw.actionType !== 'poi' && raw.actionType !== 'chapter' && !isFullVideo) return null;
  return {
    category: raw.category,
    segment: [start, end],
    actionType: typeof raw.actionType === 'string' ? raw.actionType : 'skip',
    UUID: typeof raw.UUID === 'string' ? raw.UUID : `${raw.category}:${start}:${end}`,
    description: typeof raw.description === 'string' ? raw.description : ''
  };
}

function parseSegments(data, videoID) {
  const item = Array.isArray(data) ? data.find((entry) => entry && entry.videoID === videoID) : data;
  if (!item || !Array.isArray(item.segments)) return [];
  return item.segments.map(validSegment).filter(Boolean).sort((a, b) => a.segment[0] - b.segment[0]).slice(0, 500);
}

async function requestSegments(videoID) {
  const hash = sha256(videoID).substring(0, 4);
  const categories = encodeURIComponent(JSON.stringify(CATEGORIES));
  const actionTypes = encodeURIComponent(JSON.stringify(['skip', 'mute', 'full', 'poi', 'chapter']));
  const url = `/skipSegments/${hash}?categories=${categories}&actionTypes=${actionTypes}`;
  for (const base of [API, FALLBACK_API]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(base + url, { signal: controller.signal });
      if (response.status === 404) return [];
      if (!response.ok) continue;
      return await response.json();
    } catch (error) {
      console.warn('[SponsorBlock] API request failed', error);
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

class SponsorBlockHandler {
  constructor(videoID) {
    this.videoID = videoID;
    this.video = null;
    this.segments = [];
    this.timer = null;
    this.attachTimer = null;
    this.sliderTimer = null;
    this.sliderObserver = null;
    this.slider = null;
    this.overlay = null;
    this.panel = null;
    this.active = true;
    this.skipped = new Set();
    this.mutedSegment = null;
    this.wasMuted = false;
    this.userUnmuted = false;
    this.listeners = [];
  }

  async init() {
    const data = await requestSegments(this.videoID);
    if (!this.active) return;
    this.segments = parseSegments(data, this.videoID);
    this.attachVideo();
    this.renderSegmentList();
    this.buildProgressMarkers();
    this.watchConfig();
    this.jumpToHighlight(false);
    if (!this.segments.length) console.debug('[SponsorBlock] No segments for', this.videoID);
  }

  watchConfig() {
    const update = () => {
      this.renderSegmentList();
      this.buildProgressMarkers();
      this.scheduleSkip();
      this.checkMutedSegment();
    };
    configAddChangeListener('sponsorBlockOptions', update);
    configAddChangeListener('skipSegmentsOnce', update);
    configAddChangeListener('enableMutedSegments', update);
    this.listeners.push(() => configRemoveChangeListener('sponsorBlockOptions', update));
    this.listeners.push(() => configRemoveChangeListener('skipSegmentsOnce', update));
    this.listeners.push(() => configRemoveChangeListener('enableMutedSegments', update));
  }

  attachVideo() {
    if (!this.active) return;
    this.video = document.querySelector('video');
    if (!this.video) {
      this.attachTimer = setTimeout(() => this.attachVideo(), 250);
      return;
    }
    this.video.addEventListener('play', this.scheduleSkip);
    this.video.addEventListener('playing', this.scheduleSkip);
    this.video.addEventListener('pause', this.scheduleSkip);
    this.video.addEventListener('timeupdate', this.scheduleSkip);
    this.video.addEventListener('timeupdate', this.checkMutedSegment);
    this.video.addEventListener('seeked', this.checkMutedSegment);
    this.video.addEventListener('volumechange', this.onVolumeChange);
    this.video.addEventListener('durationchange', this.buildProgressMarkers);
  }

  onVolumeChange = () => {
    if (this.mutedSegment && this.video && !this.video.muted) this.userUnmuted = true;
  };

  eligible(segment) {
    const opts = categoryOptions(segment.category);
    return !opts.disabled && (segment.actionType === 'skip' || segment.actionType === 'full') && segment.category !== HIGHLIGHT;
  }

  autoSegments() {
    return this.segments.filter((segment) => this.eligible(segment) && categoryOptions(segment.category).autoSkip);
  }

  scheduleSkip = () => {
    clearTimeout(this.timer);
    this.timer = null;
    const video = this.video;
    if (!this.active || !video || video.paused) return;
    const now = video.currentTime;
    const fullVideo = this.autoSegments().find((segment) => segment.actionType === 'full');
    if (fullVideo && Number.isFinite(video.duration) && video.duration > 0 &&
        video.currentTime < video.duration - 0.5) {
      this.skipSegment(fullVideo, true);
      return;
    }
    const next = this.autoSegments().find((segment) => {
      if (configRead('skipSegmentsOnce') && this.skipped.has(segment.UUID)) return false;
      return segment.segment[1] > now + 0.05;
    });
    if (!next) return;
    const [start, end] = next.segment;
    const delay = Math.max(0, (start - now) * 1000 / (video.playbackRate || 1));
    this.timer = setTimeout(() => {
      if (!this.active || video.paused) return;
      // Re-check the playhead: buffering and rate changes can invalidate timers.
      if (video.currentTime < start - 0.35 || video.currentTime >= end) {
        this.scheduleSkip();
        return;
      }
      this.skipSegment(next, true);
    }, delay);
  };

  skipSegment(segment, automatic) {
    if (!this.video || !this.active) return;
    const [, end] = segment.segment;
    if (segment.actionType !== 'skip' && segment.actionType !== 'full' && segment.category !== HIGHLIGHT) return;
    this.skipped.add(segment.UUID);
    const duration = this.video.duration;
    const target = segment.actionType === 'full' && Number.isFinite(duration) && duration > 0
      ? Math.max(0, duration - 0.25)
      : Number.isFinite(duration) && duration > 0 && end >= duration - 1
        ? Math.max(0, duration - 0.25)
        : Math.min(end, duration || end);
    if (segment.category === HIGHLIGHT) {
      this.video.currentTime = segment.segment[0];
    } else {
      this.video.currentTime = target;
    }
    showNotification(`${automatic ? 'Omitiendo' : 'Saltando'} ${CATEGORY_NAMES[segment.category] || segment.category}`, 2200, 'indigo');
    this.renderSegmentList();
    this.scheduleSkip();
  }

  checkMutedSegment = () => {
    if (!this.video || !configRead('enableMutedSegments')) {
      this.restoreMute();
      return;
    }
    const t = this.video.currentTime;
    const segment = this.segments.find((item) => {
      const opts = categoryOptions(item.category);
      return item.actionType === 'mute' && !opts.disabled && t >= item.segment[0] && t < item.segment[1];
    });
    if (!segment) {
      this.restoreMute();
      return;
    }
    if (this.mutedSegment && this.mutedSegment.UUID === segment.UUID) return;
    if (!this.mutedSegment) {
      this.wasMuted = this.video.muted;
      this.userUnmuted = false;
    }
    this.mutedSegment = segment;
    this.video.muted = true;
  };

  restoreMute() {
    if (!this.mutedSegment) return;
    this.mutedSegment = null;
    if (this.video && !this.userUnmuted) this.video.muted = this.wasMuted;
    this.userUnmuted = false;
  }

  buildProgressMarkers = () => {
    if (!this.active || !this.video || !this.video.duration) return;
    clearInterval(this.sliderTimer);
    this.sliderTimer = setInterval(() => {
      const bars = document.querySelectorAll('[idomkey="progress-bar"]');
      if (!bars.length) return;
      const last = bars[bars.length - 1];
      const slider = last.querySelector('[idomkey="slider"]') || last;
      if (!slider) return;
      this.slider = slider;
      if (!this.overlay) {
        this.overlay = document.createElement('div');
        this.overlay.className = 'ytaf-sponsorblock-segment-container';
      }
      this.renderProgressMarkers();
      if (!this.overlay.parentNode) slider.appendChild(this.overlay);
      clearInterval(this.sliderTimer);
      this.sliderTimer = null;
      if (!this.sliderObserver) {
        this.sliderObserver = new MutationObserver(() => {
          if (!this.overlay || !this.slider || !this.active) return;
          if (!this.overlay.isConnected) this.slider.appendChild(this.overlay);
        });
        this.sliderObserver.observe(last, { childList: true, subtree: true });
      }
    }, 250);
  };

  renderProgressMarkers() {
    if (!this.overlay || !this.video || !this.video.duration) return;
    this.overlay.textContent = '';
    this.segments.forEach((segment) => {
      const opts = categoryOptions(segment.category);
      if (opts.disabled || !opts.showInProgress) return;
      const [start, end] = segment.segment;
      const marker = document.createElement('div');
      marker.className = 'ytaf-sponsorblock-segment';
      marker.style.backgroundColor = opts.color;
      marker.style.left = segment.actionType === 'full' ? '0%' : `${(start / this.video.duration) * 100}%`;
      marker.style.width = segment.actionType === 'full' ? '100%' : `${Math.max(0.25, ((end - start) / this.video.duration) * 100)}%`;
      this.overlay.appendChild(marker);
    });
  }

  renderSegmentList() {
    if (!this.active) return;
    if (!this.panel) {
      this.panel = document.createElement('section');
      this.panel.className = 'ytaf-sponsorblock-list';
      this.panel.setAttribute('aria-label', 'Segmentos SponsorBlock');
      document.body.appendChild(this.panel);
    }
    this.panel.textContent = '';
    const heading = document.createElement('div');
    heading.className = 'ytaf-sponsorblock-heading';
    heading.textContent = `SponsorBlock · ${this.segments.length} segmentos`;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Ocultar lista de segmentos');
    close.addEventListener('click', () => this.panel.classList.toggle('collapsed'));
    heading.appendChild(close);
    this.panel.appendChild(heading);

    this.segments.forEach((segment, index) => {
      const opts = categoryOptions(segment.category);
      if (opts.disabled) return;
      const row = document.createElement('div');
      row.className = 'ytaf-sponsorblock-row';
      const swatch = document.createElement('span');
      swatch.className = 'ytaf-sponsorblock-swatch';
      swatch.style.backgroundColor = opts.color;
      const name = document.createElement('span');
      name.className = 'ytaf-sponsorblock-name';
      name.textContent = segment.description || CATEGORY_NAMES[segment.category] || segment.category;
      const time = document.createElement('span');
      time.className = 'ytaf-sponsorblock-time';
      time.textContent = segment.actionType === 'full'
        ? 'Video completo'
        : segment.actionType === 'chapter'
          ? formatTime(segment.segment[0])
          : segment.category === HIGHLIGHT
            ? formatTime(segment.segment[0])
            : `${formatTime(segment.segment[0])}–${formatTime(segment.segment[1])}`;
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(time);
      if (opts.manualSkip && (segment.actionType === 'skip' || segment.actionType === 'full' || segment.category === HIGHLIGHT || segment.actionType === 'chapter')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ytaf-sponsorblock-skip';
        const alreadySkipped = configRead('skipSegmentsOnce') && this.skipped.has(segment.UUID);
        button.disabled = alreadySkipped;
        button.textContent = alreadySkipped ? 'Saltado' : segment.actionType === 'full' ? 'Omitir video' : segment.category === HIGHLIGHT ? 'Highlight' : segment.actionType === 'chapter' ? 'Ir' : 'Saltar';
        button.addEventListener('click', () => {
          if (segment.category === HIGHLIGHT) this.skipSegment(segment, false);
          else if (segment.actionType === 'chapter' && this.video) this.video.currentTime = segment.segment[0];
          else this.skipSegment(segment, false);
        });
        row.appendChild(button);
      }
      row.addEventListener('click', (event) => {
        if (event.target === row || event.target === name || event.target === time || event.target === swatch) {
          if (this.video) this.video.currentTime = segment.segment[0];
        }
      });
      this.panel.appendChild(row);
    });
    this.panel.classList.toggle('empty', !this.segments.length);
    this.renderProgressMarkers();
  }

  skipNextManual() {
    if (!this.video) return false;
    const segment = this.segments.find((item) => {
      const options = categoryOptions(item.category);
      return (item.actionType === 'skip' || item.actionType === 'full') && item.category !== HIGHLIGHT &&
        !options.disabled && options.manualSkip && item.segment[1] > this.video.currentTime + 0.1 &&
        (!configRead('skipSegmentsOnce') || !this.skipped.has(item.UUID));
    });
    if (!segment) {
      showNotification('No hay segmentos manuales disponibles', 1800);
      return false;
    }
    this.skipSegment(segment, false);
    return true;
  }

  nextHighlight() {
    if (!this.video) return false;
    const now = this.video.currentTime + 0.5;
    const found = this.segments.find((segment) => {
      const opts = categoryOptions(segment.category);
      return segment.category === HIGHLIGHT && !opts.disabled && segment.segment[0] >= now;
    });
    if (!found) {
      showNotification('No hay más Highlights en este video', 1800);
      return false;
    }
    this.video.currentTime = found.segment[0];
    showNotification(`Highlight · ${formatTime(found.segment[0])}`, 2200, 'blue');
    return true;
  }

  jumpToHighlight(notify) {
    if (!notify || !this.video) return false;
    return this.nextHighlight();
  }

  destroy() {
    this.active = false;
    clearTimeout(this.timer);
    clearTimeout(this.attachTimer);
    clearInterval(this.sliderTimer);
    if (this.sliderObserver) this.sliderObserver.disconnect();
    if (this.overlay) this.overlay.remove();
    if (this.panel) this.panel.remove();
    this.restoreMute();
    if (this.video) {
      this.video.removeEventListener('play', this.scheduleSkip);
      this.video.removeEventListener('playing', this.scheduleSkip);
      this.video.removeEventListener('pause', this.scheduleSkip);
      this.video.removeEventListener('timeupdate', this.scheduleSkip);
      this.video.removeEventListener('timeupdate', this.checkMutedSegment);
      this.video.removeEventListener('seeked', this.checkMutedSegment);
      this.video.removeEventListener('volumechange', this.onVolumeChange);
      this.video.removeEventListener('durationchange', this.buildProgressMarkers);
    }
    this.listeners.forEach((remove) => remove());
  }
}

window.sponsorblock = null;

function teardown() {
  if (window.sponsorblock) window.sponsorblock.destroy();
  window.sponsorblock = null;
}

function syncRoute() {
  const route = new URL(location.hash.substring(1), location.href);
  if (route.pathname !== '/watch') {
    teardown();
    return;
  }
  const videoID = route.searchParams.get('v');
  if (!videoID || (window.sponsorblock && window.sponsorblock.videoID === videoID)) return;
  teardown();
  if (!configRead('enableSponsorBlock')) return;
  const handler = new SponsorBlockHandler(videoID);
  window.sponsorblock = handler;
  handler.init();
}

window.addEventListener('hashchange', syncRoute, false);
syncRoute();

export function jumpToNextHighlight() {
  return window.sponsorblock?.nextHighlight() || false;
}

export function toggleSponsorBlockList() {
  const panel = window.sponsorblock?.panel;
  if (!panel) return;
  panel.classList.toggle('collapsed');
}

window.ytaf_jumpToNextHighlight = jumpToNextHighlight;
window.ytaf_toggleSponsorBlockList = toggleSponsorBlockList;
