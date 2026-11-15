/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead } from './config';

const originalParse = JSON.parse;
const contentKeys = new Set([
  'contents',
  'content',
  'primaryContents',
  'secondaryContents',
  'tabs',
  'tabRenderer',
  'continuationContents',
  'onResponseReceivedActions',
  'onResponseReceivedEndpoints',
  'playerResponse',
  'playerOverlays',
  'playerOverlayRenderer',
  'decoratedPlayerBarRenderer',
  'videoWithContextRenderer',
  'tvBrowseRenderer',
  'tvSurfaceContentRenderer',
  'twoColumnSearchResultsRenderer',
  'twoColumnBrowseResultsRenderer',
  'sectionListRenderer',
  'gridRenderer',
  'gridContinuation',
  'richGridRenderer',
  'richGridContinuation',
  'horizontalListRenderer',
  'itemSectionRenderer',
  'shelfRenderer',
  'richItemRenderer'
]);
const thumbnailTraversalKeys = new Set([
  ...traversalKeys,
  'items',
  'thumbnail',
  'videoRenderer',
  'compactVideoRenderer',
  'gridVideoRenderer',
  'playlistVideoRenderer',
  'reelItemRenderer',
  'tileRenderer',
  'richThumbnail',
  'channelThumbnail',
  'avatar'
]);
const removableAdRenderers = new Set([
  'adSlotRenderer',
  'displayAdRenderer',
  'inFeedAdLayoutRenderer',
  'promotedVideoRenderer',
  'promotedSparklesWebRenderer'
]);
const removablePlayerOverlayRenderers = new Set([
  'adOverlayRenderer',
  'promotedSparklesWebRenderer',
  'qrCodeRenderer',
  'shopButtonRenderer',
  'shoppingOverlayRenderer'
]);
const traversalKeys = new Set([
  ...contentKeys,
  'playerOverlays',
  'playerOverlayRenderer',
  'decoratedPlayerBarRenderer',
  'videoWithContextRenderer'
]);
const playerOverlayTraversalKeys = new Set([
  'playerOverlays',
  'playerOverlayRenderer',
  'decoratedPlayerBarRenderer',
  'videoWithContextRenderer'
]);
const adFields = ['playerAds', 'adPlacements', 'adSlots'];

JSON.parse = function () {
  const response = originalParse.apply(this, arguments);
  if (!isObject(response) || !hasAdSchema(response)) {
    return response;
  }

  const shouldBlockAds = configRead('enableAdBlock');
  const shouldUpgradeThumbnails =
    configRead('upgradeThumbnails') && configRead('fastThumbnailUpgrade');
  if (!shouldBlockAds && !shouldUpgradeThumbnails) {
    return response;
  }

  visitContent(response, response, shouldBlockAds, shouldUpgradeThumbnails);
  return response;
};

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function hasAdSchema(response) {
  return (
    'playerAds' in response ||
    'adPlacements' in response ||
    'adSlots' in response ||
    'playerResponse' in response ||
    'gridRenderer' in response ||
    'gridContinuation' in response ||
    'sectionListRenderer' in response ||
    (Array.isArray(response.entries) &&
      response.entries.some((entry) => isAdEntry(entry))) ||
    Boolean(
      response.contents?.tvBrowseRenderer ||
        response.contents?.twoColumnSearchResultsRenderer ||
        response.contents?.twoColumnBrowseResultsRenderer ||
        response.contents?.sectionListRenderer ||
        response.contents?.gridRenderer ||
        response.continuationContents?.gridContinuation
    )
  );
}

function visitContent(
  node,
  root,
  shouldBlockAds,
  shouldUpgradeThumbnails,
  isPlayerResponse = false
) {
  if (Array.isArray(node)) {
    for (const item of node) {
      visitContent(
        item,
        root,
        shouldBlockAds,
        shouldUpgradeThumbnails,
        isPlayerResponse
      );
    }
    return;
  }
  if (!isObject(node)) return;

  if (shouldBlockAds && (node === root || isPlayerResponse)) {
    for (const key of adFields) {
      if (key in node) {
        delete node[key];
        console.info(`[adblock] Removed ${key}`);
      }
    }
  }

  if (shouldBlockAds) {
    for (const key of ['contents', 'items', 'entries']) {
      if (Array.isArray(node[key])) {
        node[key] = node[key].filter((item) => !isAdEntry(item));
      }
    }

    for (const key of removablePlayerOverlayRenderers) {
      if (key in node) {
        delete node[key];
        console.info(`[adblock] Removed player overlay ${key}`);
      }
    }
  }

  if (shouldUpgradeThumbnails && Array.isArray(node.thumbnails)) {
    for (const thumbnail of node.thumbnails) {
      if (typeof thumbnail?.url === 'string') {
        thumbnail.url = rewriteThumbnailUrl(thumbnail.url);
      }
    }
  }

  for (const key of Object.keys(node)) {
    const shouldVisit = shouldBlockAds
      ? isPlayerResponse
        ? playerOverlayTraversalKeys.has(key)
        : shouldUpgradeThumbnails
          ? thumbnailTraversalKeys.has(key)
          : traversalKeys.has(key)
      : thumbnailTraversalKeys.has(key);
    if (shouldVisit) {
      visitContent(
        node[key],
        root,
        shouldBlockAds,
        shouldUpgradeThumbnails,
        key === 'playerResponse'
      );
    }
  }
}

function rewriteThumbnailUrl(url) {
  return url.replace(
    /^(https?:\/\/[^/]+\/)vi(?:_webp)?(\/[^/]+\/)(?:default|mqdefault|hqdefault)\.(?:jpg|webp)([?#].*)?$/,
    '$1vi$2sddefault.jpg$3'
  );
}

function isAdEntry(entry) {
  if (!isObject(entry)) return false;

  for (const renderer of removableAdRenderers) {
    if (renderer in entry) return true;
  }

  return Boolean(
    entry.videoRenderer?.isAd ||
      entry.richItemRenderer?.content?.videoRenderer?.isAd ||
      entry.tileRenderer?.onSelectCommand?.reelWatchEndpoint?.adClientParams
        ?.isAd ||
      entry.command?.reelWatchEndpoint?.adClientParams?.isAd
  );
}
