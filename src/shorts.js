/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead } from './config';

const SHELF_SHORTS = 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS';

const origParse = JSON.parse;
JSON.parse = function () {
  const r = origParse.apply(this, arguments);
  if (!hasShortsSchema(r)) {
    return r;
  }
  if (!configRead('removeShorts')) {
    return r;
  }

  const tabs = r?.contents?.twoColumnBrowseResultsRenderer?.tabs;
  const subscriptionTabs = Array.isArray(tabs) ? tabs : [];
  for (const tab of subscriptionTabs) {
    const browseId =
      tab?.tabRenderer?.endpoint?.browseEndpoint?.browseId;
    if (browseId !== 'FEsubscriptions') continue;

    const content = tab.tabRenderer.content;
    const renderers = findFirstRenderers(content);
    const gridRenderer = renderers.gridRenderer;
    if (gridRenderer?.items) {
      removeShorts(gridRenderer);
    }

    const sectionListRenderer = renderers.sectionListRenderer;
    if (sectionListRenderer?.contents) {
      removeShelvesWithShorts(sectionListRenderer);
    }
  }

  const gridContinuation = r?.continuationContents?.gridContinuation;
  if (gridContinuation?.items && isSubscriptionsRoute()) {
    removeShorts(gridContinuation);
  }

  return r;
};

function hasShortsSchema(response) {
  return Boolean(
    response?.contents?.twoColumnBrowseResultsRenderer?.tabs ||
      response?.continuationContents?.gridContinuation
  );
}

function isSubscriptionsRoute() {
  const route = new URL(location.hash.substring(1), location.href);
  return (
    route.pathname === '/feed/subscriptions' ||
    route.pathname.startsWith('/browse/FEsubscriptions')
  );
}

function removeShorts(container) {
  container.items = container.items.filter(
    (elm) => elm?.tileRenderer?.onSelectCommand?.reelWatchEndpoint == null
  );
}

function removeShelvesWithShorts(container) {
  container.contents = container.contents.filter(
    (elm) => elm?.shelfRenderer?.tvhtml5ShelfRendererType != SHELF_SHORTS
  );
}

function findFirstRenderers(root) {
  const result = { gridRenderer: null, sectionListRenderer: null };
  const stack = [root];

  while (stack.length && (!result.gridRenderer || !result.sectionListRenderer)) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') continue;

    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }

    if (!result.gridRenderer && node.gridRenderer) {
      result.gridRenderer = node.gridRenderer;
    }
    if (!result.sectionListRenderer && node.sectionListRenderer) {
      result.sectionListRenderer = node.sectionListRenderer;
    }
    stack.push(...Object.values(node));
  }

  return result;
}
