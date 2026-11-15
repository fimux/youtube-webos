const CONFIG_KEY = 'ytaf-configuration';

const sponsorBlockOptions = {
  sponsor: { autoSkip: true, manualSkip: true, showInProgress: true, disabled: false, color: '#00d400' },
  intro: { autoSkip: true, manualSkip: true, showInProgress: true, disabled: false, color: '#00ffff' },
  outro: { autoSkip: true, manualSkip: true, showInProgress: true, disabled: false, color: '#0202ed' },
  interaction: { autoSkip: true, manualSkip: true, showInProgress: true, disabled: false, color: '#cc00ff' },
  selfpromo: { autoSkip: true, manualSkip: true, showInProgress: true, disabled: false, color: '#ffff00' },
  music_offtopic: { autoSkip: true, manualSkip: true, showInProgress: true, disabled: false, color: '#ff9900' },
  preview: { autoSkip: true, manualSkip: true, showInProgress: true, disabled: false, color: '#008fd6' },
  poi_highlight: { autoSkip: false, manualSkip: true, showInProgress: true, disabled: false, color: '#ff1684' },
  filler: { autoSkip: false, manualSkip: true, showInProgress: true, disabled: false, color: '#7300ff' },
  hook: { autoSkip: false, manualSkip: true, showInProgress: true, disabled: false, color: '#395699' }
};

const numberKeyActions = {
  0: 'none',
  1: 'none',
  2: 'none',
  3: 'none',
  4: 'none',
  5: 'none',
  6: 'none',
  7: 'none',
  8: 'none',
  9: 'none'
};

const configOptions = new Map([
  ['enableAdBlock', { default: true, desc: 'Enable ad blocking' }],
  ['upgradeThumbnails', { default: false, desc: 'Upgrade thumbnail quality' }],
  [
    'removeShorts',
    { default: false, desc: 'Remove Shorts from subscriptions' }
  ],
  ['enableSponsorBlock', { default: true, desc: 'Enable SponsorBlock' }],
  [
    'enableSponsorBlockSponsor',
    { default: true, desc: 'Skip sponsor segments (legacy setting)' }
  ],
  ['enableSponsorBlockIntro', { default: true, desc: 'Skip intro segments (legacy setting)' }],
  ['enableSponsorBlockOutro', { default: true, desc: 'Skip outro segments (legacy setting)' }],
  ['enableSponsorBlockInteraction', { default: true, desc: 'Skip interaction reminder segments (legacy setting)' }],
  ['enableSponsorBlockSelfPromo', { default: true, desc: 'Skip self promotion segments (legacy setting)' }],
  ['enableSponsorBlockMusicOfftopic', { default: true, desc: 'Skip non-music segments (legacy setting)' }],
  ['enableSponsorBlockPreview', { default: false, desc: 'Skip recaps and previews (legacy setting)' }],
  ['enableSponsorBlockHook', { default: false, desc: 'Enable hook/greetings segments' }],
  ['enableSponsorBlockFiller', { default: false, desc: 'Enable filler/tangents segments' }],
  ['enableSponsorBlockHighlight', { default: true, desc: 'Enable SponsorBlock highlights' }],
  ['enableMutedSegments', { default: true, desc: 'Mute SponsorBlock muted segments' }],
  ['skipSegmentsOnce', { default: false, desc: 'Skip each segment only once per playback session' }],
  ['sponsorBlockOptions', { default: sponsorBlockOptions, desc: 'Per-category SponsorBlock settings' }],
  ['blueButtonAction', { default: 'highlight', desc: 'Action for the blue remote button' }],
  ['numberKeyActions', { default: numberKeyActions, desc: 'Programmable remote number keys' }],
  ['hideQrOverlays', { default: true, desc: 'Hide QR-code overlays during playback' }],
  ['hideShopButton', { default: true, desc: 'Hide the Shop button during playback' }],
  ['enableReturnYouTubeDislike', { default: false, desc: 'Show estimated dislikes in video details' }],
  [
    'hideLogo',
    {
      default: false,
      desc: 'Hide YouTube logo'
    }
  ],
  [
    'showWatch',
    {
      default: false,
      desc: 'Display time in UI'
    }
  ],
  [
    'forceHighResVideo',
    {
      default: false,
      desc: 'Force max resolution video playback'
    }
  ],
  [
    'removeEndscreen',
    {
      default: false,
      desc: 'Remove end screens from video'
    }
  ],
  [
    'autoAccountSelect',
    {
      default: false,
      desc: 'Bypass initial account selection on startup'
    }
  ]
]);

const defaultConfig = (() => {
  let ret = {};
  for (const [k, v] of configOptions) {
    ret[k] = v.default;
  }
  return ret;
})();

/** @type {Record<string, DocumentFragment>} as const */
const configFrags = (() => {
  let ret = {};
  for (const k of configOptions.keys()) {
    ret[k] = new DocumentFragment();
  }
  return ret;
})();

function loadStoredConfig() {
  const storage = window.localStorage.getItem(CONFIG_KEY);

  if (storage === null) {
    console.info('Config not set; using defaults.');
    return null;
  }

  try {
    const stored = JSON.parse(storage);
    if (!stored.sponsorBlockOptions) {
      stored.sponsorBlockOptions = JSON.parse(JSON.stringify(sponsorBlockOptions));
      for (const [category, key] of Object.entries({
        sponsor: 'enableSponsorBlockSponsor',
        intro: 'enableSponsorBlockIntro',
        outro: 'enableSponsorBlockOutro',
        interaction: 'enableSponsorBlockInteraction',
        selfpromo: 'enableSponsorBlockSelfPromo',
        music_offtopic: 'enableSponsorBlockMusicOfftopic',
        preview: 'enableSponsorBlockPreview'
      })) {
        if (typeof stored[key] === 'boolean') {
          stored.sponsorBlockOptions[category].autoSkip = stored[key];
        }
      }
    }
    if (!stored.numberKeyActions) {
      stored.numberKeyActions = Object.assign({}, numberKeyActions);
    }
    return stored;
  } catch (err) {
    console.warn('Error parsing stored config:', err);
    return null;
  }
}

// Use defaultConfig as a prototype so writes to localConfig don't change it.
let localConfig = loadStoredConfig() ?? Object.create(defaultConfig);

function configExists(key) {
  return configOptions.has(key);
}

export function configGetDesc(key) {
  if (!configExists(key)) {
    throw new Error('tried to get desc for unknown config key: ' + key);
  }

  return configOptions.get(key).desc;
}

export function configRead(key) {
  if (!configExists(key)) {
    throw new Error('tried to read unknown config key: ' + key);
  }

  if (localConfig[key] === undefined) {
    console.warn(
      'Populating key',
      key,
      'with default value',
      defaultConfig[key]
    );

    localConfig[key] = defaultConfig[key];
  }

  return localConfig[key];
}

export function configWrite(key, value) {
  if (!configExists(key)) {
    throw new Error('tried to write unknown config key: ' + key);
  }

  const oldValue =
    localConfig[key] !== undefined ? localConfig[key] : defaultConfig[key];

  console.info('Changing key', key, 'from', oldValue, 'to', value);
  localConfig[key] = value;
  window.localStorage[CONFIG_KEY] = JSON.stringify(localConfig);

  configFrags[key].dispatchEvent(
    new CustomEvent('ytafConfigChange', {
      detail: { key, newValue: value, oldValue }
    })
  );
}

/**
 * Add a listener for changes in the value of a specified config option
 * @param {string} key Config option to monitor
 * @param {(evt: Event) => void} callback Function to be called on change
 */
export function configAddChangeListener(key, callback) {
  const frag = configFrags[key];

  frag.addEventListener('ytafConfigChange', callback);
}

/**
 * Remove a listener for changes in the value of a specified config option
 * @param {string} key Config option to monitor
 * @param {(evt: Event) => void} callback Function to be called on change
 */
export function configRemoveChangeListener(key, callback) {
  const frag = configFrags[key];

  frag.removeEventListener('ytafConfigChange', callback);
}
