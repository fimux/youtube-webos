import { configRead, configAddChangeListener } from './config';

const webpTestImgs = {
  lossy: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  lossless: 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
  alpha:
    'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==',
  animation:
    'UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GJgAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDQAAAC8AAAAQBxAREYiI/gcA'
} as const;

function checkWebpFeature(
  feature: keyof typeof webpTestImgs,
  callback: (
    featureName: keyof typeof webpTestImgs,
    isSupported: boolean
  ) => void
) {
  const img = new Image();
  img.onload = function () {
    const result = img.width > 0 && img.height > 0;
    callback(feature, result);
  };

  img.onerror = function () {
    callback(feature, false);
  };

  img.src = 'data:image/webp;base64,' + webpTestImgs[feature];
}

let webpSupported = false;
checkWebpFeature('lossy', (_, support) => {
  webpSupported = support;
});

function rewriteURL(url: URL) {
  const YT_THUMBNAIL_PATHNAME_REGEX =
    /vi(?:_webp)?(\/.*?\/)([a-z0-9]+?)(_\w*?)?\.[a-z]+$/g;

  const YT_TARGET_THUMBNAIL_NAMES = [
    'sddefault',
    'hqdefault',
    'mqdefault',
    'default'
  ] as const;

  const isABTest = url.hostname.match(/^i\d/) !== null;
  // Don't know how to handle A/B test thumbnails so we don't upgrade them.
  if (isABTest) return null;

  const replacementPathname = url.pathname.replace(
    YT_THUMBNAIL_PATHNAME_REGEX,
    (match, p1, p2, p3) => {
      if (!YT_TARGET_THUMBNAIL_NAMES.includes(p2)) return match; // Only rewrite regular thumbnail URLs. Not shorts, etc.
      return `${webpSupported ? 'vi_webp' : 'vi'}${p1}sddefault${p3 ?? ''}.${webpSupported ? 'webp' : 'jpg'}`;
    }
  );
  if (url.pathname === replacementPathname)
    // pathname not changed because not a regular thumbnail or already upgraded.
    return null;

  url = new URL(url);

  url.pathname = replacementPathname;
  url.search = '';

  return url;
}

function parseCSSUrl(value: string): URL | undefined {
  try {
    return new URL(value.slice(4, -1).replace(/["']/g, ''));
  } catch (e) {
    return undefined; // Not a valid URL
  }
}

let thumbnailObserverActive = false;
let observedThumbnails = new WeakSet<HTMLElement>();
const previousStyle = document.createElement('div');

function isThumbnailRoute() {
  const route = new URL(location.hash.substring(1), location.href).pathname;
  return (
    route === '/' ||
    route === '/home' ||
    route === '/watch' ||
    route === '/results' ||
    route === '/feed/subscriptions' ||
    route.startsWith('/browse')
  );
}

function handleThumbnailStyleChange(
  element: HTMLElement,
  oldValue?: string | null
) {
  if (!thumbnailObserverActive || !element.isConnected) return;

  previousStyle.style.cssText = oldValue ?? '';
  if (
    previousStyle.style.backgroundImage === element.style.backgroundImage ||
    element.style.backgroundImage === ''
  ) {
    return;
  }
  upgradeBgImg(element);
}

function observeThumbnail(element: HTMLElement) {
  if (
    !thumbnailObserverActive ||
    !element.matches('ytlr-thumbnail-details') ||
    observedThumbnails.has(element)
  ) {
    return;
  }

  observedThumbnails.add(element);
  obs.observe(element, {
    attributes: true,
    attributeFilter: ['style'],
    attributeOldValue: true
  });
  upgradeBgImg(element);
}

function inspectAddedNode(node: Node) {
  if (!(node instanceof HTMLElement)) return;
  observeThumbnail(node);

  const thumbnails = node.getElementsByTagName('ytlr-thumbnail-details');
  for (let index = 0; index < thumbnails.length; index++) {
    observeThumbnail(thumbnails[index] as HTMLElement);
  }
}

const obs = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes') {
      handleThumbnailStyleChange(
        mutation.target as HTMLElement,
        mutation.oldValue
      );
    } else {
      for (const node of mutation.addedNodes) {
        inspectAddedNode(node);
      }
    }
  }
});

function disableObserver() {
  thumbnailObserverActive = false;
  obs.disconnect();
  observedThumbnails = new WeakSet<HTMLElement>();
}

function enableObserver() {
  disableObserver();
  if (
    !configRead('upgradeThumbnails') ||
    configRead('fastThumbnailUpgrade') ||
    !isThumbnailRoute()
  ) {
    return;
  }

  thumbnailObserverActive = true;
  const root =
    document.querySelector<HTMLElement>('[idomkey="page-manager"]') ||
    document.body;
  obs.observe(root, { subtree: true, childList: true });

  const thumbnails = root.getElementsByTagName('ytlr-thumbnail-details');
  for (let index = 0; index < thumbnails.length; index++) {
    observeThumbnail(thumbnails[index] as HTMLElement);
  }
}

function handleThumbnailRouteChange() {
  if (!configRead('upgradeThumbnails') || !isThumbnailRoute()) {
    disableObserver();
    return;
  }

  if (configRead('fastThumbnailUpgrade')) {
    disableObserver();
    const root =
      document.querySelector<HTMLElement>('[idomkey="page-manager"]') ||
      document.body;
    const thumbnails = root.getElementsByTagName('ytlr-thumbnail-details');
    for (let index = 0; index < thumbnails.length; index++) {
      upgradeBgImg(thumbnails[index] as HTMLElement);
    }
    return;
  }

  enableObserver();
}

function shouldUpgradeThumbnail() {
  return (
    configRead('upgradeThumbnails') &&
    (thumbnailObserverActive || configRead('fastThumbnailUpgrade'))
  );
}

function upgradeBgImg(element: HTMLElement) {
  if (!shouldUpgradeThumbnail()) return;
  const style = element.style;
  const old = parseCSSUrl(style.backgroundImage);
  if (!old) return;

  const target = rewriteURL(old);
  if (!target) return;

  const lazyLoader = new Image();

  lazyLoader.onload = () => {
    if (!shouldUpgradeThumbnail() || !element.isConnected) return;
    // Don't swap if a placeholder thumbnail was provided.
    // Placeholder thumbnails are the same size as the "default" size.
    if (lazyLoader.naturalHeight === 90) return;

    const curr = parseCSSUrl(style.backgroundImage);
    if (!curr) return;

    // Don't swap out element image if it has been changed while target image was loading.
    if (curr.href !== old.href) return;

    style.backgroundImage = `url(${target.href})`;
  };

  lazyLoader.src = target.href;
}

handleThumbnailRouteChange();

configAddChangeListener('upgradeThumbnails', handleThumbnailRouteChange);
configAddChangeListener('fastThumbnailUpgrade', handleThumbnailRouteChange);
window.addEventListener('hashchange', handleThumbnailRouteChange);
window.addEventListener('yt-navigate-finish', handleThumbnailRouteChange);
