/*global navigate, __YTAF_VERSION__*/
import './spatial-navigation-polyfill.js';
import {
  configAddChangeListener,
  configRead,
  configWrite,
  configGetDesc
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


const SEGMENT_TYPES = [
  ['sponsor', 'Patrocinadores'], ['intro', 'Introducciones'],
  ['outro', 'Final / créditos'], ['interaction', 'Interacciones'],
  ['selfpromo', 'Autopromoción'], ['music_offtopic', 'Partes no musicales'],
  ['preview', 'Resumen / avance'], ['poi_highlight', 'Highlight'],
  ['filler', 'Tangentes'], ['hook', 'Hook / saludos'],
  ['exclusive_access', 'Acceso exclusivo'], ['chapter', 'Capítulos']
];
const SEGMENT_COLORS = [
  '#00d400', '#00ffff', '#0202ed', '#cc00ff', '#ffff00', '#ff9900',
  '#008fd6', '#ff1684', '#7300ff', '#395699', '#a66bff', '#aaaaaa', '#ff4040', '#ffffff'
];
const SHORTCUT_ACTIONS = [
  ['none', 'Sin acción'], ['seekBack10', 'Retroceder 10 s'],
  ['seekForward10', 'Avanzar 10 s'], ['playPause', 'Reproducir / pausar'],
  ['jumpHighlight', 'Siguiente Highlight'], ['toggleSegmentList', 'Mostrar segmentos'],
  ['skipNextSegment', 'Saltar siguiente segmento'], ['restartVideo', 'Reiniciar video']
];

function updateSegmentOption(category, patch) {
  const all = Object.assign({}, configRead('sponsorBlockOptions') || {});
  all[category] = Object.assign({}, all[category] || {}, patch);
  configWrite('sponsorBlockOptions', all);
}

function createAdvancedSponsorControls() {
  const section = document.createElement('div');
  section.className = 'ytaf-sponsor-settings';
  const heading = document.createElement('h2');
  heading.textContent = 'SponsorBlock · opciones por categoría';
  section.appendChild(heading);
  const description = document.createElement('p');
  description.textContent = 'Configura omisión automática, manual, marcas de progreso y color para cada tipo.';
  section.appendChild(description);
  SEGMENT_TYPES.forEach(([category, label]) => {
    const stored = (configRead('sponsorBlockOptions') || {})[category] || {};
    const row = document.createElement('div');
    row.className = 'ytaf-sponsor-setting-row';
    const title = document.createElement('strong');
    title.textContent = label;
    row.appendChild(title);
    [['autoSkip', 'Auto'], ['manualSkip', 'Manual'], ['showInProgress', 'Barra'], ['disabled', 'Desactivado']].forEach(([key, text]) => {
      const labelEl = document.createElement('label');
      labelEl.className = 'ytaf-sponsor-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.disabled = key === 'autoSkip' && ['poi_highlight', 'chapter'].includes(category);
      input.checked = key === 'disabled' ? !!stored.disabled :
        (stored[key] !== undefined ? !!stored[key] :
          (key === 'autoSkip' ? !['poi_highlight', 'filler', 'hook', 'chapter'].includes(category) : true));
      input.addEventListener('change', () => updateSegmentOption(category, { [key]: input.checked }));
      labelEl.appendChild(input);
      labelEl.appendChild(document.createTextNode(text));
      row.appendChild(labelEl);
    });
    const color = document.createElement('select');
    color.className = 'ytaf-sponsor-color';
    color.setAttribute('aria-label', 'Color de ' + label);
    SEGMENT_COLORS.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      option.style.backgroundColor = value;
      color.appendChild(option);
    });
    color.value = stored.color || SEGMENT_COLORS[SEGMENT_TYPES.findIndex((v) => v[0] === category)] || '#717171';
    color.addEventListener('change', () => updateSegmentOption(category, { color: color.value }));
    row.appendChild(color);
    section.appendChild(row);
  });
  const blueLabel = document.createElement('label');
  blueLabel.className = 'ytaf-shortcut-setting';
  blueLabel.appendChild(document.createTextNode('Botón azul '));
  const blue = document.createElement('select');
  [['highlight', 'Siguiente Highlight'], ['audio', 'Modo solo audio'], ['segments', 'Mostrar / ocultar segmentos']].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    blue.appendChild(option);
  });
  blue.value = configRead('blueButtonAction');
  blue.addEventListener('change', () => configWrite('blueButtonAction', blue.value));
  blueLabel.appendChild(blue);
  section.appendChild(blueLabel);
  const shortcutHeading = document.createElement('h2');
  shortcutHeading.textContent = 'Atajos numéricos (0–9)';
  section.appendChild(shortcutHeading);
  const shortcuts = configRead('numberKeyActions') || {};
  for (let number = 0; number <= 9; number += 1) {
    const label = document.createElement('label');
    label.className = 'ytaf-shortcut-setting';
    label.appendChild(document.createTextNode(number + ' '));
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Acción de la tecla ' + number);
    SHORTCUT_ACTIONS.forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    });
    select.value = shortcuts[number] || 'none';
    select.addEventListener('change', () => {
      const next = Object.assign({}, configRead('numberKeyActions') || {});
      next[number] = select.value;
      configWrite('numberKeyActions', next);
    });
    label.appendChild(select);
    section.appendChild(label);
  }
  return section;
}

function runNumberShortcut(action) {
  const video = document.querySelector('video');
  if (!video) return;
  switch (action) {
    case 'seekBack10': video.currentTime = Math.max(0, video.currentTime - 10); break;
    case 'seekForward10': video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); break;
    case 'playPause': video.paused ? video.play() : video.pause(); break;
    case 'jumpHighlight': window.ytaf_jumpToNextHighlight && window.ytaf_jumpToNextHighlight(); break;
    case 'toggleSegmentList': window.ytaf_toggleSponsorBlockList && window.ytaf_toggleSponsorBlockList(); break;
    case 'skipNextSegment': window.sponsorblock && window.sponsorblock.skipNextManual && window.sponsorblock.skipNextManual(); break;
    case 'restartVideo': video.currentTime = 0; break;
    default: return;
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

      if (getKeyColor(evt.charCode) === 'green') {
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
  elmContainer.appendChild(createConfigCheckbox('hideLogo'));
  elmContainer.appendChild(createConfigCheckbox('showWatch'));
  elmContainer.appendChild(createConfigCheckbox('removeShorts'));
  elmContainer.appendChild(createConfigCheckbox('forceHighResVideo'));
  elmContainer.appendChild(createConfigCheckbox('removeEndscreen'));
  elmContainer.appendChild(createConfigCheckbox('autoAccountSelect'));
  elmContainer.appendChild(createConfigCheckbox('enableSponsorBlock'));

  elmContainer.appendChild(createConfigCheckbox('enableMutedSegments'));
  elmContainer.appendChild(createConfigCheckbox('skipSegmentsOnce'));
  elmContainer.appendChild(createConfigCheckbox('hideQrOverlays'));
  elmContainer.appendChild(createConfigCheckbox('hideShopButton'));
  elmContainer.appendChild(createConfigCheckbox('enableReturnYouTubeDislike'));
  elmContainer.appendChild(createAdvancedSponsorControls());

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
  console.debug(
    'Key event:',
    evt.type,
    evt.charCode,
    evt.keyCode,
    evt.defaultPrevented
  );

  if (evt.type === 'keydown' && /^[0-9]$/.test(evt.key || '') &&
      !optionsPanelVisible &&
      !(document.activeElement instanceof HTMLInputElement) &&
      !(document.activeElement instanceof HTMLSelectElement) &&
      !(document.activeElement instanceof HTMLTextAreaElement)) {
    const shortcuts = configRead('numberKeyActions') || {};
    const action = shortcuts[evt.key] || 'none';
    if (action !== 'none') {
      evt.preventDefault();
      evt.stopPropagation();
      runNumberShortcut(action);
      return false;
    }
  }

  if (getKeyColor(evt.charCode) === 'green') {
    console.debug('Taking over!');

    evt.preventDefault();
    evt.stopPropagation();

    if (evt.type === 'keydown') {
      // Toggle visibility.
      showOptionsPanel(!optionsPanelVisible);
    }
    return false;
  } else if (getKeyColor(evt.charCode) === 'blue') {
    evt.preventDefault();
    evt.stopPropagation();

    if (evt.type === 'keydown') {
      const action = configRead('blueButtonAction');
      if (action === 'audio') initAudioOnlyToggle();
      else if (action === 'segments') window.ytaf_toggleSponsorBlockList && window.ytaf_toggleSponsorBlockList();
      else window.ytaf_jumpToNextHighlight && window.ytaf_jumpToNextHighlight();
    }
    return false;
  }
  return true;
};

document.addEventListener('keydown', eventHandler, true);
document.addEventListener('keypress', eventHandler, true);
document.addEventListener('keyup', eventHandler, true);

const COLOR_MAP = {
  red: 'rgba(255, 0, 0, 0.9)',
  green: 'rgba(0, 162, 0, 0.9)',
  yellow: 'rgba(255, 255, 0, 0.9)',
  blue: 'rgba(0, 128, 255, 0.9)',
  grey: 'rgba(255, 255, 255, 0.5)',
  none: 'rgba(0, 0, 0, 0)'
};

export function showNotification(text, time = 3000, color = 'grey') {
  if (!document.querySelector('.ytaf-notification-container')) {
    console.debug('Adding notification container');
    const c = document.createElement('div');
    c.classList.add('ytaf-notification-container');
    document.body.appendChild(c);
  }

  const elm = document.createElement('div');
  const elmInner = document.createElement('div');
  elmInner.innerText = text;
  elmInner.classList.add('message');
  elmInner.classList.add('message-hidden');
  elm.appendChild(elmInner);
  document.querySelector('.ytaf-notification-container').appendChild(elm);
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
