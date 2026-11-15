/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead } from './config';

const SHELF_SHORTS = 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS';
const SHORTS_MARKERS = ['reelWatchEndpoint', SHELF_SHORTS];
const MAX_NODES = 16000;

const originalParse = JSON.parse;
JSON.parse = function () {
  const args = arguments;
  const result = originalParse.apply(this, args);
  if (!configRead('removeShorts')) return result;

  // Most player, settings, and browse responses contain no Shorts metadata.
  // Check the raw payload before walking its object tree.
  const source = typeof args[0] === 'string' ? args[0] : '';
  if (!source || !SHORTS_MARKERS.some((marker) => source.indexOf(marker) !== -1)) {
    return result;
  }

  const grids = findObjects(result, ['gridRenderer', 'gridContinuation']);
  grids.forEach((grid) => removeShorts(grid));

  const sections = findObjects(result, ['sectionListRenderer']);
  sections.forEach((section) => removeShelvesWithShorts(section));

  return result;
};

function removeShorts(container) {
  if (!Array.isArray(container?.items)) return;
  container.items = container.items.filter(
    (entry) => entry?.tileRenderer?.onSelectCommand?.reelWatchEndpoint == null
  );
}

function removeShelvesWithShorts(container) {
  if (!Array.isArray(container?.contents)) return;
  container.contents = container.contents.filter(
    (entry) => entry?.shelfRenderer?.tvhtml5ShelfRendererType !== SHELF_SHORTS
  );
}

/**
 * Iterative key lookup with a hard work limit. JSON.parse cannot produce
 * cycles, but the seen set also makes this helper safe for direct unit tests.
 */
function findObjects(root, names) {
  const wanted = new Set(names);
  const found = [];
  const stack = [root];
  const seen = new Set();
  let visited = 0;

  while (stack.length && visited < MAX_NODES) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    visited += 1;

    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i -= 1) {
        const item = current[i];
        if (item && typeof item === 'object') stack.push(item);
      }
      continue;
    }

    Object.keys(current).forEach((key) => {
      const value = current[key];
      if (wanted.has(key) && value && typeof value === 'object') {
        found.push(value);
      }
      if (value && typeof value === 'object') stack.push(value);
    });
  }
  return found;
}
