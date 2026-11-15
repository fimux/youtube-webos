const CONFIG_KEY = 'ytaf-configuration';

export const sponsorBlockCategories = [
  {
    id: 'sponsor',
    name: 'Sponsor',
    color: '#00d400',
    mode: 'auto',
    legacyKey: 'enableSponsorBlockSponsor'
  },
  {
    id: 'intro',
    name: 'Intro',
    color: '#00ffff',
    mode: 'auto',
    legacyKey: 'enableSponsorBlockIntro'
  },
  {
    id: 'outro',
    name: 'Outro',
    color: '#0202ed',
    mode: 'auto',
    legacyKey: 'enableSponsorBlockOutro'
  },
  {
    id: 'interaction',
    name: 'Interaction reminder',
    color: '#cc00ff',
    mode: 'auto',
    legacyKey: 'enableSponsorBlockInteraction'
  },
  {
    id: 'selfpromo',
    name: 'Self-promotion',
    color: '#ffff00',
    mode: 'auto',
    legacyKey: 'enableSponsorBlockSelfPromo'
  },
  {
    id: 'music_offtopic',
    name: 'Non-music part',
    color: '#ff9900',
    mode: 'auto',
    legacyKey: 'enableSponsorBlockMusicOfftopic'
  },
  {
    id: 'preview',
    name: 'Recap or preview',
    color: '#008fd6',
    mode: 'disabled',
    legacyKey: 'enableSponsorBlockPreview'
  },
  {
    id: 'filler',
    name: 'Filler',
    color: '#7300ff',
    mode: 'manual'
  },
  {
    id: 'poi_highlight',
    name: 'Highlight',
    color: '#ffff00',
    mode: 'manual'
  },
  {
    id: 'exclusive_access',
    name: 'Exclusive access',
    color: '#008a5c',
    mode: 'manual'
  },
  {
    id: 'hook',
    name: 'Hook',
    color: '#ff6b6b',
    mode: 'manual'
  },
  {
    id: 'tangent',
    name: 'Tangents',
    color: '#b565d9',
    mode: 'manual'
  },
  {
    id: 'mute',
    name: 'Muted segments',
    color: '#777777',
    mode: 'auto'
  }
];

const configOptions = new Map([
  ['enableAdBlock', { default: true, desc: 'Enable ad blocking' }],
  ['upgradeThumbnails', { default: false, desc: 'Upgrade thumbnail quality' }],
  [
    'fastThumbnailUpgrade',
    {
      default: false,
      desc: 'Use fast upgrades with higher-quality thumbnails'
    }
  ],
  [
    'removeShorts',
    { default: false, desc: 'Remove Shorts from subscriptions' }
  ],
  ['enableSponsorBlock', { default: true, desc: 'Enable SponsorBlock' }],
  [
    'enableSponsorBlockSponsor',
    { default: true, desc: 'Skip sponsor segments' }
  ],
  ['enableSponsorBlockIntro', { default: true, desc: 'Skip intro segments' }],
  ['enableSponsorBlockOutro', { default: true, desc: 'Skip outro segments' }],
  [
    'enableSponsorBlockInteraction',
    {
      default: true,
      desc: 'Skip interaction reminder segments'
    }
  ],
  [
    'enableSponsorBlockSelfPromo',
    {
      default: true,
      desc: 'Skip self promotion segments'
    }
  ],
  [
    'enableSponsorBlockMusicOfftopic',
    {
      default: true,
      desc: 'Skip non-music segments in music videos'
    }
  ],
  [
    'enableSponsorBlockPreview',
    {
      default: false,
      desc: 'Skip recaps and previews'
    }
  ],
  [
    'sponsorBlockSkipSegmentsOnce',
    { default: false, desc: 'Skip each segment only once per video' }
  ],
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

for (const category of sponsorBlockCategories) {
  const prefix = `sponsorBlock_${category.id}`;
  configOptions.set(`${prefix}_mode`, {
    default: category.mode,
    desc: `${category.name} segment behavior`
  });
  configOptions.set(`${prefix}_color`, {
    default: category.color,
    desc: `${category.name} segment color`
  });
  configOptions.set(`${prefix}_show`, {
    default: true,
    desc: `Show ${category.name} in progress bar`
  });
}

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
    return JSON.parse(storage);
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
    const category = sponsorBlockCategories.find(
      (item) => item.legacyKey && key === `sponsorBlock_${item.id}_mode`
    );
    if (
      category?.legacyKey &&
      Object.prototype.hasOwnProperty.call(localConfig, category.legacyKey)
    ) {
      localConfig[key] = localConfig[category.legacyKey] ? 'auto' : 'disabled';
      return localConfig[key];
    }

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
