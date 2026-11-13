import type { HicallDesktopSourceType } from '../desktop/hicall-desktop';

export type ScreenAudioKind = 'none' | 'tab' | 'app' | 'system-clean' | 'system-leaky';

export type ScreenAudioHint = 'leaky-update-app' | 'leaky' | 'audio-failed' | null;

export interface ScreenAudioClassification {
  kind: ScreenAudioKind;
  deviceId: string;
  label: string;
}

export function displaySurfaceOf(track: MediaStreamTrack | null): string {
  if (!track?.getSettings) {
    return '';
  }
  return String((track.getSettings() as { displaySurface?: string }).displaySurface ?? '');
}

export function effectiveDisplaySurface(
  videoTrack: MediaStreamTrack | null,
  desktopSourceType: HicallDesktopSourceType | null = null,
): string {
  const surface = displaySurfaceOf(videoTrack);
  if (surface) {
    return surface;
  }
  if (desktopSourceType === 'window') {
    return 'window';
  }
  if (desktopSourceType === 'screen') {
    return 'monitor';
  }
  return '';
}

export function isLegacyHicallElectron(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean {
  if (typeof window === 'undefined' || !window.hicallDesktop) {
    return false;
  }
  const match = userAgent.match(/Electron\/(\d+)/i);
  if (!match) {
    return true;
  }
  return Number(match[1]) < 43;
}

export function leakyScreenAudioHint(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): Exclude<ScreenAudioHint, 'audio-failed' | null> {
  return isLegacyHicallElectron(userAgent) ? 'leaky-update-app' : 'leaky';
}

function trackDeviceId(track: MediaStreamTrack): string {
  if (!track.getSettings) {
    return '';
  }
  return String(track.getSettings().deviceId ?? '');
}

/**
 * Classifica o áudio capturado pela faixa, não pelo picker.
 * deviceId loopback (exceto loopbackWithoutChrome), default ou vazio = leaky.
 * Superfície browser = tab.
 */
export function classifyScreenAudio(
  video: MediaStreamTrack | null,
  audio: MediaStreamTrack | null,
  desktopSourceType: HicallDesktopSourceType | null = null,
): ScreenAudioClassification {
  const deviceId = audio ? trackDeviceId(audio) : '';
  const label = audio?.label ?? '';

  if (!audio || audio.readyState === 'ended') {
    return { kind: 'none', deviceId, label };
  }

  const surface = effectiveDisplaySurface(video, desktopSourceType);
  if (surface === 'browser') {
    return { kind: 'tab', deviceId, label };
  }

  if (deviceId === 'loopbackWithoutChrome') {
    return { kind: 'system-clean', deviceId, label };
  }

  if (deviceId.startsWith('loopback') || deviceId === 'default' || deviceId === '') {
    return { kind: 'system-leaky', deviceId, label };
  }

  if (surface === 'window') {
    return { kind: 'app', deviceId, label };
  }

  return { kind: 'system-leaky', deviceId, label };
}
