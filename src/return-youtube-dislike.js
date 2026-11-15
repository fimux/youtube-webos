import { configRead, configAddChangeListener } from './config';

const API = 'https://returnyoutubedislikeapi.com/votes?videoId=';
const TARGETS = [
  'ytlr-watch-metadata',
  'ytlr-video-description',
  '[idomkey="video-info"]',
  '[idomkey="description"]',
  '.ytlr-watch-metadata',
  '.ytlr-video-description'
];

let currentVideoID = null;
let currentCount = null;
let observer = null;
let requestToken = 0;

function findDescriptionTarget() {
  for (const selector of TARGETS) {
    const node = document.querySelector(selector);
    if (node) return node;
  }
  return null;
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  try {
    return new Intl.NumberFormat(navigator.language, {
      notation: number >= 1000000 ? 'compact' : 'standard',
      maximumFractionDigits: 1
    }).format(number);
  } catch {
    return String(Math.round(number));
  }
}

function render() {
  const old = document.querySelector('.ytaf-ryd-count');
  if (!configRead('enableReturnYouTubeDislike') || currentCount === null) {
    old?.remove();
    return;
  }
  const target = findDescriptionTarget();
  if (!target) return;
  let badge = document.querySelector('.ytaf-ryd-count');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'ytaf-ryd-count';
    badge.setAttribute('role', 'note');
  }
  badge.textContent = 'No me gusta (estimado): ' + formatCount(currentCount);
  if (badge.parentNode !== target) target.appendChild(badge);
}

async function load(videoID) {
  const token = ++requestToken;
  currentVideoID = videoID;
  currentCount = null;
  render();
  if (!videoID || !configRead('enableReturnYouTubeDislike')) return;
  try {
    const response = await fetch(API + encodeURIComponent(videoID), {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('RYD API status ' + response.status);
    const data = await response.json();
    if (token !== requestToken || currentVideoID !== videoID) return;
    if (data && Number.isFinite(Number(data.dislikes))) {
      currentCount = Number(data.dislikes);
      render();
    }
  } catch (error) {
    console.warn('[ReturnYouTubeDislike] Could not load dislike count:', error);
  }
}

function syncRoute() {
  const route = new URL(location.hash.substring(1), location.href);
  if (route.pathname !== '/watch') {
    currentVideoID = null;
    currentCount = null;
    requestToken += 1;
    render();
    return;
  }
  const videoID = route.searchParams.get('v');
  if (videoID && videoID !== currentVideoID) void load(videoID);
}

configAddChangeListener('enableReturnYouTubeDislike', () => {
  if (configRead('enableReturnYouTubeDislike')) syncRoute();
  else {
    currentCount = null;
    render();
  }
});

window.addEventListener('hashchange', syncRoute, false);
observer = new MutationObserver(() => render());
observer.observe(document.documentElement, { childList: true, subtree: true });
syncRoute();
