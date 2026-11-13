import type { ResolvedScreenQuality } from './screen-quality';
import { DEFAULT_SCREEN_QUALITY } from './screen-quality';

/**
 * Tela: track nativo getDisplayMedia + encode HW.
 * Default da tela: 4K60. Câmera permanece 1920×1080 @ 30 no canvas.
 */
export const OUTBOUND_VIDEO_WIDTH = 1920;
export const OUTBOUND_VIDEO_HEIGHT = 1080;
/** Pump da câmera (canvas). Tela nativa não usa este teto. */
export const OUTBOUND_VIDEO_FPS = 30;
export const SCREEN_CAPTURE_FPS = DEFAULT_SCREEN_QUALITY.frameRate;
export const SCREEN_ENCODE_FPS = DEFAULT_SCREEN_QUALITY.frameRate;
export const SCREEN_MAX_BITRATE = DEFAULT_SCREEN_QUALITY.maxBitrate;
export const CAMERA_MAX_BITRATE = 1_500_000;
export const CAMERA_MAX_FRAMERATE = 30;
export const SCREEN_CONTENT_HINT = 'motion';

export interface OutboundVideoEncoding {
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

export function screenCaptureVideoConstraints(
  quality: ResolvedScreenQuality = DEFAULT_SCREEN_QUALITY,
): MediaTrackConstraints {
  return {
    displaySurface: 'monitor',
    width: { ideal: quality.width },
    height: { ideal: quality.height },
    frameRate: { ideal: quality.frameRate, max: quality.frameRate },
  };
}

export function screenTrackApplyConstraints(
  quality: ResolvedScreenQuality = DEFAULT_SCREEN_QUALITY,
): MediaTrackConstraints {
  return {
    width: { ideal: quality.width },
    height: { ideal: quality.height },
    frameRate: { ideal: quality.frameRate, max: quality.frameRate },
  };
}

export function outboundVideoEncodings(
  sharingScreen: boolean,
  quality: ResolvedScreenQuality = DEFAULT_SCREEN_QUALITY,
): OutboundVideoEncoding {
  return {
    maxBitrate: sharingScreen ? quality.maxBitrate : CAMERA_MAX_BITRATE,
    maxFramerate: sharingScreen ? quality.frameRate : CAMERA_MAX_FRAMERATE,
    scaleResolutionDownBy: 1,
  };
}

export function outboundVideoEncodingsForTrack(
  sharingScreen: boolean,
  quality: ResolvedScreenQuality = DEFAULT_SCREEN_QUALITY,
  track: MediaStreamTrack | null = null,
): OutboundVideoEncoding {
  const encoding = outboundVideoEncodings(sharingScreen, quality);
  if (!sharingScreen || !track?.getSettings) {
    return encoding;
  }
  const width = track.getSettings().width ?? 0;
  if (width > quality.width * 1.15) {
    encoding.scaleResolutionDownBy = Math.max(1, Number((width / quality.width).toFixed(2)));
  }
  return encoding;
}

export function isContractResolution(width: number, height: number): boolean {
  return width === OUTBOUND_VIDEO_WIDTH && height === OUTBOUND_VIDEO_HEIGHT;
}

export function isPlaceholderResolution(width: number, height = 0): boolean {
  return width > 0 && width <= 64 && (height === 0 || height <= 64);
}
