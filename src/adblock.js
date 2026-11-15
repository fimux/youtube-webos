/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead, configAddChangeListener } from './config';

/**
 * Bounded schema-key filtering for YouTube TV response objects.
 *
 * Do not use substring deletion or generic "ad" property matching: many
 * playback/session fields contain ad-related names but are not renderer nodes.
 * Keep the denylist explicit and mutate only known response schemas.
 */
const AD_RENDERERS = new Set([
  'adPlacements',
  'adSlots',
  'playerAds',
  'adSlotRenderer',
  'adSlotContentRenderer',
  'inFeedAdLayoutRenderer',
  'adLayoutRenderer',
  'compactAdRenderer',
  'promotedItemRenderer',
  'promotedVideoRenderer',
  'compactPromotedVideoRenderer',
  'promotedSparklesWebRenderer',
  'promotedSparklesTextSearchRenderer',
  'videoPromotionRenderer',
  'searchPyvRenderer',
  'promotedItemSectionRenderer',
  'promotedShelfRenderer',
  'brandVideoShelfRenderer',
  'brandVideoSingletonRenderer',
  'videoMastheadAdV3Renderer',
  'videoMastheadAdRenderer',
  'videoMastheadV3Renderer',
  'tvMastheadRenderer',
  'tvMastheadAdV3Renderer',
  'tvMastheadAdRenderer',
  'displayAdRenderer',
  'statementBannerRenderer',
  'bannerPromoRenderer',
  'billboardRenderer',
  'promoCardRenderer',
  'paidContentOverlay'
]);

const AD_MARKERS = [...AD_RENDERERS];

const HOME_SECTION_PATH = [
  'contents', 'tvBrowseRenderer', 'content',
  'tvSurfaceContentRenderer', 'content', 'sectionListRenderer'
];

function hasOwn(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

function atPath(root, path) {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = current[key];
  }
  return current && typeof current === 'object' ? current : null;
}

function isAdEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return Object.keys(entry).some((key) => AD_RENDERERS.has(key));
}

function filterKnownList(list) {
  if (!Array.isArray(list)) return;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (isAdEntry(list[i])) list.splice(i, 1);
  }
}

/**
 * Traverses JSON containers iteratively with a fixed work cap. The raw response
 * is inspected first so unrelated payloads do not pay the traversal cost.
 */
function scrubAdSchemas(root) {
  if (!root || typeof root !== 'object') return 0;
  const stack = [root];
  const seen = new Set();
  let removed = 0;
  let visited = 0;
  const maxNodes = 12000;

  while (stack.length && visited < maxNodes) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    visited += 1;

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i -= 1) {
        if (isAdEntry(node[i])) {
          node.splice(i, 1);
          removed += 1;
        } else {
          stack.push(node[i]);
        }
      }
      continue;
    }

    for (const key of Object.keys(node)) {
      if (AD_RENDERERS.has(key)) {
        delete node[key];
        removed += 1;
        continue;
      }
      const value = node[key];
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return removed;
}

const originalParse = JSON.parse;
JSON.parse = function () {
  const args = arguments;
  const result = originalParse.apply(this, args);
  if (!configRead('enableAdBlock')) return result;

  const source = typeof args[0] === 'string' ? args[0] : '';
  if (source && AD_MARKERS.some((marker) => source.indexOf('"' + marker + '"') !== -1)) {
    const removed = scrubAdSchemas(result);
    if (removed) console.info('[adblock] Removed ad renderer entries:', removed);
  }

  // Leanback response paths differ from ordinary YouTube web response paths.
  const home = atPath(result, HOME_SECTION_PATH);
  if (home && Array.isArray(home.contents)) filterKnownList(home.contents);

  const search = atPath(result, ['contents', 'sectionListRenderer']);
  if (search && Array.isArray(search.contents)) filterKnownList(search.contents);

  // Shorts-feed ad elements use a typed ad marker, not the same renderer schema.
  if (Array.isArray(result?.entries)) {
    result.entries = result.entries.filter((entry) =>
      !entry?.command?.reelWatchEndpoint?.adClientParams?.isAd
    );
  }
  return result;
};

/**
 * Hide only the dedicated player QR and Shop controls. These are DOM overlays,
 * not response payload fields, so keep their handling outside JSON parsing.
 */
let cosmeticStyle = null;
function applyPlaybackOverlayFilters() {
  if (!cosmeticStyle) {
    cosmeticStyle = document.createElement('style');
    cosmeticStyle.id = 'ytaf-playback-overlay-filters';
    (document.head || document.documentElement).appendChild(cosmeticStyle);
  }
  const selectors = [];
  if (configRead('hideQrOverlays')) {
    selectors.push(
      'ytlr-qr-code-overlay',
      'ytlr-qr-code-renderer',
      '[idomkey="qr-code-overlay"]',
      '[class*="qrCodeOverlay"]',
      '[class*="qr-code-overlay"]'
    );
  }
  if (configRead('hideShopButton')) {
    selectors.push(
      'ytlr-shop-button',
      'ytlr-immersive-shop-button',
      '[idomkey="shop-button"]',
      '[class*="shop-button"]'
    );
  }
  cosmeticStyle.textContent = selectors.length
    ? selectors.join(',') + ' { display: none !important; visibility: hidden !important; }'
    : '';
}

applyPlaybackOverlayFilters();
configAddChangeListener('hideQrOverlays', applyPlaybackOverlayFilters);
configAddChangeListener('hideShopButton', applyPlaybackOverlayFilters);
