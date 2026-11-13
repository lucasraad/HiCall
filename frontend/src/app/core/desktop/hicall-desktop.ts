import { screenCaptureVideoConstraints } from '../voice/voice-video-contract';

export type HicallDesktopSourceType = 'screen' | 'window';

export interface HicallDesktopSource {
  id: string;
  name: string;
  type: HicallDesktopSourceType;
  thumbnail: string;
}

export interface HicallDesktopApi {
  isDesktop: true;
  getSources(): Promise<HicallDesktopSource[]>;
  prepareCapture(
    sourceId: string,
    options?: { includeSystemAudio?: boolean },
  ): Promise<{ ok: boolean }>;
}

export interface DisplayMediaResult {
  stream: MediaStream;
  audioFailed: boolean;
}

export function isHicallDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.hicallDesktop;
}

export function getHicallDesktop(): HicallDesktopApi | null {
  return window.hicallDesktop ?? null;
}

/**
 * Captura via getDisplayMedia (pipeline WebRTC do Chromium).
 * chromeMediaSource + getUserMedia no Electron gera faixa preta para os peers.
 */
export async function captureDesktopSource(
  sourceId: string,
  video: MediaTrackConstraints = screenCaptureVideoConstraints(),
  options: { includeSystemAudio?: boolean } = {},
): Promise<DisplayMediaResult> {
  const desktop = getHicallDesktop();
  if (!desktop?.prepareCapture) {
    throw new Error('Captura desktop indisponível. Atualize o app HiCall.');
  }

  await desktop.prepareCapture(sourceId, {
    includeSystemAudio: options.includeSystemAudio !== false,
  });
  return acquireDisplayMedia(video);
}

const MIC_AUDIO_LABEL = /(microphone|microfone|headset mic|\bmic\b)/i;
const LOOPBACK_AUDIO_LABEL = /(loopback|system|desktop|stereo mix|what u hear|wave out|cable)/i;

/** True se a faixa for o microfone da call — não deve ir no áudio da transmissão. */
export function isLikelyMicrophoneAudioTrack(
  track: MediaStreamTrack,
  micTrack: MediaStreamTrack | null = null,
): boolean {
  if (track.kind !== 'audio') {
    return false;
  }
  if (micTrack && track.id === micTrack.id) {
    return true;
  }
  const label = track.label.trim();
  if (!label) {
    return false;
  }
  if (LOOPBACK_AUDIO_LABEL.test(label)) {
    return false;
  }
  return MIC_AUDIO_LABEL.test(label);
}

/** Áudio da superfície compartilhada ou loopback do sistema — nunca o microfone da call. */
export function pickScreenShareAudioTrack(
  stream: MediaStream,
  micTrack: MediaStreamTrack | null = null,
): MediaStreamTrack | null {
  return (
    stream.getAudioTracks().find(
      (track) => track.readyState !== 'ended' && !isLikelyMicrophoneAudioTrack(track, micTrack),
    ) ?? null
  );
}

export function prepareScreenShareAudioTrack(track: MediaStreamTrack): MediaStreamTrack {
  track.enabled = true;
  if ('contentHint' in track) {
    track.contentHint = 'music';
  }
  return track;
}

/**
 * Áudio de filme: sem AEC/NS/AGC.
 * restrictOwnAudio: Chrome 141+ e Electron 43.4+/44, só no Windows 11.
 * Exclui a página ou janela que captura, não o processo inteiro.
 */
export function screenShareAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    sampleRate: 48000,
    suppressLocalAudioPlayback: false,
    restrictOwnAudio: true,
  } as MediaTrackConstraints;
}

export function screenShareMediaOptions(
  video: MediaTrackConstraints = screenCaptureVideoConstraints(),
): DisplayMediaStreamOptions {
  return {
    video,
    audio: screenShareAudioConstraints(),
    systemAudio: 'include',
    windowAudio: 'window',
    preferCurrentTab: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  } as DisplayMediaStreamOptions;
}

function displayMediaErrorName(err: unknown): string {
  if (err instanceof DOMException) {
    return err.name;
  }
  if (err && typeof err === 'object' && 'name' in err) {
    return String((err as { name: string }).name);
  }
  return '';
}

export async function acquireDisplayMedia(
  video: MediaTrackConstraints = screenCaptureVideoConstraints(),
): Promise<DisplayMediaResult> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia(screenShareMediaOptions(video));
    return { stream, audioFailed: false };
  } catch (err) {
    const name = displayMediaErrorName(err);
    if (name !== 'NotReadableError' && name !== 'AbortError') {
      throw err;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video, audio: false });
    return { stream, audioFailed: true };
  }
}

declare global {
  interface Window {
    hicallDesktop?: HicallDesktopApi;
  }
}
