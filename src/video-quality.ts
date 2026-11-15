import { configAddChangeListener, configRead } from './config';
import { getPlayerManager, PlayerMode } from './player_api';
import type { EventMapOf, PlayerManager, VideoID } from './player_api';
import { showNotification } from './ui';

const playerManager = await getPlayerManager();
let activeQualityPoll: {
  intervalToken: number;
  timeoutToken: number | undefined;
} | null = null;

function clearQualityPoll() {
  if (!activeQualityPoll) return;
  clearInterval(activeQualityPoll.intervalToken);
  if (activeQualityPoll.timeoutToken !== undefined) {
    clearTimeout(activeQualityPoll.timeoutToken);
  }
  activeQualityPoll = null;
}

function shouldForce() {
  return configRead('forceHighResVideo');
}

type EventMap = EventMapOf<PlayerManager>;

function getMaxQualityLabel(player: PlayerManager['player']) {
  return player.getAvailableQualityData()[0]?.qualityLabel;
}

function notifyPlaybackQuality(this: PlayerManager) {
  if (!shouldForce()) return;

  const player = this.player;

  const selected = player.getPlaybackQualityLabel();
  const max = getMaxQualityLabel(player);

  showNotification(`${selected} selected (Max ${max})`, 3000);

  this.removeEventListener('playbackStart', setPlaybackQuality);
}

function setPlaybackQuality(this: PlayerManager, _: unknown) {
  if (!shouldForce()) return;

  this.removeEventListener('playbackStart', setPlaybackQuality);
  if (this.playerMode === PlayerMode.PREVIEW) return;

  clearQualityPoll();
  console.debug('[video-quality] setting playback quality');
  const prevQuality = this.player.getPlaybackQualityLabel();
  this.player.setPlaybackQualityRange('highres', 'highres');

  if (prevQuality === getMaxQualityLabel(this.player)) {
    notifyPlaybackQuality.call(this);
    return;
  }

  // No reliable event for quality change, so poll for it
  const poll: {
    intervalToken: number;
    timeoutToken: number | undefined;
  } = { intervalToken: 0, timeoutToken: undefined };
  activeQualityPoll = poll;
  poll.intervalToken = window.setInterval(() => {
    if (activeQualityPoll !== poll) return;
    const currQuality = this.player.getPlaybackQualityLabel();
    if (currQuality !== prevQuality) {
      notifyPlaybackQuality.call(this);
      clearQualityPoll();
    }
  }, 100);

  poll.timeoutToken = window.setTimeout(() => {
    if (activeQualityPoll !== poll) return;
    console.warn('[video-quality] timed out waiting for quality change');
    clearQualityPoll();
    notifyPlaybackQuality.call(this);
  }, 3000);
}

function handleNewVideo(this: PlayerManager, _: EventMap['newVideo']) {
  clearQualityPoll();
  this.removeEventListener('playbackStart', setPlaybackQuality);
  if (!shouldForce()) return;

  this.addEventListener('playbackStart', setPlaybackQuality);
}

playerManager.addEventListener('newVideo', handleNewVideo);
configAddChangeListener('forceHighResVideo', (event) => {
  if (event instanceof CustomEvent && !event.detail.newValue) {
    clearQualityPoll();
    playerManager.removeEventListener('playbackStart', setPlaybackQuality);
  }
});
