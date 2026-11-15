/*global navigate, __YTAF_VERSION__*/
import './spatial-navigation-polyfill.js';
import {
  configAddChangeListener,
  configRead,
  configWrite,
  configGetDesc,
  sponsorBlockCategories
} from './config.js';
import './ui.css';
import { requireElement } from './player_api/helpers';

// We handle key events ourselves.
window.__spatialNavigation__.keyMode = 'NONE';

const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };

const colorCodeMap = new Map([
  [403, 'red'],

  [404, 'green'],
  [172, 'green'],

  [405, 'yellow'],
  [170, 'yellow'],

  [406, 'blue'],
  [167, 'blue'],
  [191, 'blue']
]);

let sponsorBlockSegments = [];
let skipSponsorBlockSegment = () => {};
let sponsorBlockSegmentList = null;
let manualSegmentButton = null;
let notificationContainer = null;

/**
 * Returns the name of the color button associated with a code or null if not a color button.
 * @param {number} charCode KeyboardEvent.charCode property from event
 * @returns {string | null} Color name or null
 */
function getKeyColor(charCode) {
  if (colorCodeMap.has(charCode)) {
    return colorCodeMap.get(charCode);
  }

  return null;
}

function createConfigCheckbox(key) {
  const elmInput = document.createElement('input');
  elmInput.type = 'checkbox';
  elmInput.checked = configRead(key);

  /** @type {(evt: Event) => void} */
  const changeHandler = (evt) => {
    configWrite(key, evt.target.checked);
  };

  elmInput.addEventListener('change', changeHandler);

  configAddChangeListener(key, (evt) => {
    elmInput.checked = evt.detail.newValue;
  });

  const elmLabel = document.createElement('label');
  elmLabel.appendChild(elmInput);
  // Use non-breaking space (U+00A0)
  elmLabel.appendChild(document.createTextNode('\u00A0' + configGetDesc(key)));

  return elmLabel;
}

function createSponsorBlockSettings() {
  const section = document.createElement('section');
  section.className = 'ytaf-sponsorblock-settings';

  const heading = document.createElement('h2');
  heading.textContent = 'SponsorBlock segment settings';
  section.appendChild(heading);
  section.appendChild(createConfigCheckbox('sponsorBlockSkipSegmentsOnce'));

  for (const category of sponsorBlockCategories) {
    const prefix = `sponsorBlock_${category.id}`;
    const row = document.createElement('div');
    row.className = 'ytaf-sponsorblock-category';

    const name = document.createElement('span');
    name.textContent = category.name;
    row.appendChild(name);

    const mode = document.createElement('select');
    mode.setAttribute('aria-label', `${category.name} behavior`);
    for (const [value, label] of [
      ['auto', 'Auto skip'],
      ['manual', 'Manual skip'],
      ['disabled', 'Disabled']
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      mode.appendChild(option);
    }
    const modeKey = `${prefix}_mode`;
    mode.value = configRead(modeKey);
    mode.addEventListener('change', () => configWrite(modeKey, mode.value));
    configAddChangeListener(modeKey, (event) => {
      mode.value = event.detail.newValue;
    });
    row.appendChild(mode);

    const color = document.createElement('input');
    color.type = 'color';
    color.value = configRead(`${prefix}_color`);
    color.setAttribute('aria-label', `${category.name} color`);
    color.title = 'Segment color';
    color.addEventListener('input', () =>
      configWrite(`${prefix}_color`, color.value)
    );
    configAddChangeListener(`${prefix}_color`, (event) => {
      color.value = event.detail.newValue;
    });
    row.appendChild(color);

    const showLabel = document.createElement('label');
    showLabel.className = 'ytaf-sponsorblock-show';
    const showText = document.createElement('span');
    showText.textContent = 'Bar';
    showLabel.appendChild(showText);

    const show = document.createElement('input');
    show.type = 'checkbox';
    const showKey = `${prefix}_show`;
    show.checked = configRead(showKey);
    show.setAttribute('aria-label', `Show ${category.name} in progress bar`);
    show.title = `Show ${category.name} in progress bar`;
    show.addEventListener('change', () =>
      configWrite(showKey, show.checked)
    );
    configAddChangeListener(showKey, (event) => {
      show.checked = event.detail.newValue;
    });
    showLabel.appendChild(show);
    row.appendChild(showLabel);
    section.appendChild(row);
  }

  const listHeading = document.createElement('h2');
  listHeading.textContent = 'Segments in this video';
  section.appendChild(listHeading);

  sponsorBlockSegmentList = document.createElement('div');
  sponsorBlockSegmentList.className = 'ytaf-sponsorblock-segment-list';
  section.appendChild(sponsorBlockSegmentList);
  renderSponsorBlockSegments();
  return section;
}

function formatSegmentTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function renderSponsorBlockSegments() {
  if (!sponsorBlockSegmentList) return;
  while (sponsorBlockSegmentList.firstChild) {
    sponsorBlockSegmentList.removeChild(sponsorBlockSegmentList.firstChild);
  }

  if (!sponsorBlockSegments.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No segments found for this video.';
    sponsorBlockSegmentList.appendChild(empty);
    return;
  }

  for (const segment of sponsorBlockSegments) {
    const row = document.createElement('div');
    row.className = 'ytaf-sponsorblock-segment-row';
    const categoryId =
      segment.actionType === 'mute' ? 'mute' : segment.category;
    const category = sponsorBlockCategories.find(
      (item) => item.id === categoryId
    );
    const color = document.createElement('span');
    color.className = 'ytaf-sponsorblock-list-color';
    color.style.backgroundColor = category
      ? configRead(`sponsorBlock_${categoryId}_color`)
      : '#008fd6';
    row.appendChild(color);

    const title = document.createElement('span');
    const mutePrefix = segment.actionType === 'mute' ? 'Muted · ' : '';
    title.textContent = `${mutePrefix}${segment.category} · ${formatSegmentTime(
      segment.segment[0]
    )}–${formatSegmentTime(segment.segment[1])}`;
    row.appendChild(title);

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent =
      segment.actionType === 'mute'
        ? 'Mute'
        : segment.actionType === 'poi' ||
            segment.category === 'poi_highlight' ||
            segment.category === 'highlight'
          ? 'Jump to Highlight'
          : 'Skip now';
    skip.addEventListener('click', () => skipSponsorBlockSegment(segment));
    row.appendChild(skip);
    sponsorBlockSegmentList.appendChild(row);
  }
}

export function setSponsorBlockSegments(segments, skipSegment) {
  sponsorBlockSegments = segments;
  skipSponsorBlockSegment = skipSegment;
  renderSponsorBlockSegments();
}

export function showManualSegmentSkip(label, onSkip) {
  if (!manualSegmentButton) {
    manualSegmentButton = document.createElement('button');
    manualSegmentButton.type = 'button';
    manualSegmentButton.className = 'ytaf-sponsorblock-manual-skip';
    document.body.appendChild(manualSegmentButton);
  }
  manualSegmentButton.textContent = label;
  manualSegmentButton.onclick = onSkip;
  manualSegmentButton.style.display = 'block';
}

export function clearManualSegmentSkip() {
  if (manualSegmentButton) {
    manualSegmentButton.style.display = 'none';
    manualSegmentButton.onclick = null;
  }
}

function createOptionsPanel() {
  const elmContainer = document.createElement('div');

  elmContainer.classList.add('ytaf-ui-container');
  elmContainer.style['display'] = 'none';
  elmContainer.setAttribute('tabindex', 0);

  elmContainer.addEventListener(
    'focus',
    () => console.debug('Options panel focused!'),
    true
  );
  elmContainer.addEventListener(
    'blur',
    () => console.debug('Options panel blurred!'),
    true
  );

  elmContainer.addEventListener(
    'keydown',
    (evt) => {
      console.debug('Options panel key event:', evt.type, evt.charCode);

      if (
        getKeyColor(evt.charCode) === 'green' ||
        getKeyColor(evt.keyCode) === 'green'
      ) {
        return;
      }

      if (evt.keyCode in ARROW_KEY_CODE) {
        navigate(ARROW_KEY_CODE[evt.keyCode]);
      } else if (evt.keyCode === 13) {
        // "OK" button

        /**
         * The YouTube app generates these "OK" events from clicks (including
         * with the Magic Remote), and we don't want to send a duplicate click
         * event for those. Youtube uses the `Event` class instead of
         * `KeyboardEvent` so we check for that.
         * See issue #143 and #200 for context.
         */
        if (evt instanceof KeyboardEvent) {
          document.activeElement.click();
        }
      } else if (evt.keyCode === 27) {
        // Back button
        showOptionsPanel(false);
      }

      evt.preventDefault();
      evt.stopPropagation();
    },
    true
  );

  const elmHeading = document.createElement('h1');
  elmHeading.textContent = 'webOS YouTube Extended';
  elmContainer.appendChild(elmHeading);

  elmContainer.appendChild(createConfigCheckbox('enableAdBlock'));
  elmContainer.appendChild(createConfigCheckbox('upgradeThumbnails'));
  elmContainer.appendChild(createConfigCheckbox('fastThumbnailUpgrade'));
  elmContainer.appendChild(createConfigCheckbox('hideLogo'));
  elmContainer.appendChild(createConfigCheckbox('showWatch'));
  elmContainer.appendChild(createConfigCheckbox('removeShorts'));
  elmContainer.appendChild(createConfigCheckbox('forceHighResVideo'));
  elmContainer.appendChild(createConfigCheckbox('removeEndscreen'));
  elmContainer.appendChild(createConfigCheckbox('autoAccountSelect'));
  elmContainer.appendChild(createConfigCheckbox('enableSponsorBlock'));

  elmContainer.appendChild(createSponsorBlockSettings());

  const elmSponsorLink = document.createElement('small');
  elmSponsorLink.className = 'ytaf-ui-sponsor';
  elmSponsorLink.textContent =
    'Sponsor segments skipping - https://sponsor.ajay.app';
  elmContainer.appendChild(elmSponsorLink);

  const version = document.createElement('div');
  version.className = 'ytaf-ui-version';
  version.textContent = `v${__YTAF_VERSION__}`;

  elmContainer.appendChild(version);

  return elmContainer;
}

const optionsPanel = createOptionsPanel();
document.body.appendChild(optionsPanel);

let optionsPanelVisible = false;

/**
 * Show or hide the options panel.
 * @param {boolean} [visible=true] Whether to show the options panel.
 */
function showOptionsPanel(visible) {
  visible ??= true;

  if (visible && !optionsPanelVisible) {
    console.debug('Showing and focusing options panel!');
    optionsPanel.style.display = 'block';
    optionsPanel.focus();
    optionsPanelVisible = true;
  } else if (!visible && optionsPanelVisible) {
    console.debug('Hiding options panel!');
    optionsPanel.style.display = 'none';
    optionsPanel.blur();
    optionsPanelVisible = false;
  }
}

window.ytaf_showOptionsPanel = showOptionsPanel;

const eventHandler = (evt) => {
  console.debug('Key event:', evt.charCode, evt.keyCode, evt.defaultPrevented);

  if (
    getKeyColor(evt.charCode) === 'green' ||
    getKeyColor(evt.keyCode) === 'green'
  ) {
    console.debug('Taking over!');

    evt.preventDefault();
    evt.stopPropagation();

    showOptionsPanel(!optionsPanelVisible);
    return false;
  } else if (
    getKeyColor(evt.charCode) === 'blue' ||
    getKeyColor(evt.keyCode) === 'blue'
  ) {
    evt.preventDefault();
    evt.stopPropagation();

    // Jump to the next Highlight when one exists; otherwise toggle Audio-Only.
    if (!window.ytaf_jumpToHighlight?.()) {
      initAudioOnlyToggle();
    }
    return false;
  }
  return true;
};

document.addEventListener('keydown', eventHandler, true);

const COLOR_MAP = {
  red: 'rgba(255, 0, 0, 0.9)',
  green: 'rgba(0, 162, 0, 0.9)',
  yellow: 'rgba(255, 255, 0, 0.9)',
  blue: 'rgba(0, 128, 255, 0.9)',
  grey: 'rgba(255, 255, 255, 0.5)',
  none: 'rgba(0, 0, 0, 0)'
};

export function showNotification(text, time = 3000, color = 'grey') {
  if (!notificationContainer?.isConnected) {
    notificationContainer = document.querySelector(
      '.ytaf-notification-container'
    );
  }
  if (!notificationContainer) {
    console.debug('Adding notification container');
    notificationContainer = document.createElement('div');
    notificationContainer.classList.add('ytaf-notification-container');
    document.body.appendChild(notificationContainer);
  }

  const elm = document.createElement('div');
  const elmInner = document.createElement('div');
  elmInner.innerText = text;
  elmInner.classList.add('message');
  elmInner.classList.add('message-hidden');
  elm.appendChild(elmInner);
  notificationContainer.appendChild(elm);
  elmInner.style.borderColor = COLOR_MAP[color] || color;

  setTimeout(() => {
    elmInner.classList.remove('message-hidden');
  }, 100);
  setTimeout(() => {
    elmInner.classList.add('message-hidden');
    setTimeout(() => {
      elm.remove();
    }, 1000);
  }, time);
}

/**
 * Initialize ability to hide YouTube logo in top right corner.
 */
function initHideLogo() {
  const style = document.createElement('style');
  document.head.appendChild(style);

  /** @type {(hide: boolean) => void} */
  const setHidden = (hide) => {
    const visibility = hide ? 'hidden' : 'visible';
    style.textContent = `ytlr-redux-connect-ytlr-logo-entity { visibility: ${visibility}; }`;
  };

  setHidden(configRead('hideLogo'));

  configAddChangeListener('hideLogo', (evt) => {
    setHidden(evt.detail.newValue);
  });
}

function applyUIFixes() {
  try {
    const bodyClasses = document.body.classList;

    const observer = new MutationObserver(function bodyClassCallback(
      _records,
      _observer
    ) {
      try {
        if (bodyClasses.contains('app-quality-root')) {
          bodyClasses.remove('app-quality-root');
        }
      } catch (e) {
        console.error('error in <body> class observer callback:', e);
      }
    });

    observer.observe(document.body, {
      subtree: false,
      childList: false,
      attributes: true,
      attributeFilter: ['class'],
      characterData: false
    });
  } catch (e) {
    console.error('error setting up <body> class observer:', e);
  }
}

let audioOnlyEnabled = false;
let overlayObserver = null;

async function initAudioOnlyToggle() {
  const elVideo = await requireElement('video', HTMLVideoElement);

  audioOnlyEnabled = !audioOnlyEnabled;
  elVideo.style.visibility = audioOnlyEnabled ? 'hidden' : '';

  const AUDIO_OVERLAY_SELECTOR = '.ytLrAudioPlayerOverlayAudioMode';
  const YTAF_OVERLAY_CLASS = 'ytaf-ui-watchControl-overlayMessage';

  const applyAudioOverlayFilter = () => {
    const node = document.querySelector(AUDIO_OVERLAY_SELECTOR);
    if (!node) return;
    if (audioOnlyEnabled) {
      node.style.setProperty('filter', 'brightness(0)', 'important');
    } else {
      node.style.removeProperty('filter');
    }
  };
  applyAudioOverlayFilter();

  showNotification(
    `Audio-Only mode: ${audioOnlyEnabled ? 'Enabled' : 'Disabled'}`,
    2000,
    'blue'
  );

  const controlsContainer = await requireElement(
    '[idomkey="controls"]',
    HTMLElement
  );

  const updateOverlay = (root = controlsContainer) => {
    let overlay = root.querySelector(`.${YTAF_OVERLAY_CLASS}`);

    if (!audioOnlyEnabled) {
      overlay?.remove();
      return;
    }

    if (overlay) return;

    overlay = Object.assign(document.createElement('div'), {
      textContent: 'Audio-Only Mode Enabled - Press [BLUE] to toggle',
      className: YTAF_OVERLAY_CLASS
    });
    root.prepend(overlay);
  };
  updateOverlay();

  if (overlayObserver) overlayObserver.disconnect();
  overlayObserver = new MutationObserver(() => {
    updateOverlay();
    applyAudioOverlayFilter();
  });

  overlayObserver.observe(controlsContainer, {
    childList: true,
    subtree: true
  });
}

applyUIFixes();
initHideLogo();

setTimeout(() => {
  showNotification(
    'Press [GREEN] to open YTAF configuration screen',
    2000,
    'green'
  );
});
