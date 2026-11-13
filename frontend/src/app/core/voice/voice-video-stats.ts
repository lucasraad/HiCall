/**
 * O que realmente prova 1080p e FPS — não screenshot, não getSettings().frameRate sozinho.
 *
 * 1080p
 *  - captura: MediaStreamTrack.getSettings().width/height (e video.videoWidth da preview)
 *  - encoder: outbound-rtp.frameWidth/Height (último quadro codificado)
 *  - viewer:  inbound-rtp.frameWidth/Height E <video>.videoWidth/Height
 *
 * FPS (W3C webrtc-stats): framesPerSecond é estimativa do último segundo.
 * Prova: Δframes / Δt entre getStats a cada 1s.
 *  - captura: ΔsourceFrameCount (requestVideoFrameCallback na preview)
 *  - pump:    ΔpaintCount (setInterval que alimenta captureStream)
 *  - encoder: ΔframesEncoded / ΔframesSent (outbound-rtp)
 *  - viewer:  ΔframesDecoded (inbound-rtp) — se captura=30 e decoded=15, o buraco é encode/rede/pump
 */

export const PROOF_WIDTH = 1920;
export const PROOF_HEIGHT = 1080;

export interface StatsRow {
  type?: string;
  kind?: string;
  mediaType?: string;
  frameWidth?: unknown;
  frameHeight?: unknown;
  framesDecoded?: unknown;
  framesReceived?: unknown;
  framesDropped?: unknown;
  framesPerSecond?: unknown;
  bytesReceived?: unknown;
  bytesSent?: unknown;
  packetsLost?: unknown;
  framesSent?: unknown;
  framesEncoded?: unknown;
  qualityLimitationReason?: unknown;
  encoderImplementation?: unknown;
  mimeType?: unknown;
  codecId?: unknown;
  width?: unknown;
  height?: unknown;
  frames?: unknown;
}

export interface CaptureLayer {
  width: number;
  height: number;
  frameRate: number | null;
  displaySurface: string | null;
  contentHint: string;
}

export interface PumpLayer {
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  paintCount: number;
  sourceFrameCount: number;
  outboundWidth: number;
  outboundHeight: number;
  outboundFrameRate: number | null;
}

export interface EncoderLayer {
  frameWidth: number | null;
  frameHeight: number | null;
  framesSent: number;
  framesEncoded: number;
  framesPerSecond: number | null;
  bytesSent: number;
  qualityLimitationReason: string | null;
  encoderImplementation: string | null;
  mimeType: string | null;
  maxBitrate: number | null;
  maxFramerate: number | null;
  scaleResolutionDownBy: number | null;
}

export interface MediaSourceLayer {
  width: number | null;
  height: number | null;
  frames: number | null;
  framesPerSecond: number | null;
}

export interface InboundLayer {
  frameWidth: number | null;
  frameHeight: number | null;
  framesDecoded: number;
  framesReceived: number;
  framesDropped: number;
  framesPerSecond: number | null;
  bytesReceived: number;
  packetsLost: number;
}

export interface ProbeTick {
  t: number;
  capture: CaptureLayer;
  pump: PumpLayer;
  mediaSource: MediaSourceLayer;
  outbound: EncoderLayer;
  inbound: InboundLayer;
  videos: { w: number; h: number }[];
}

export interface ProbeRates {
  dtMs: number;
  captureSourceFps: number | null;
  pumpFps: number | null;
  encoderFps: number | null;
  framesSentPerSec: number | null;
  decodedFps: number | null;
  kbpsOut: number | null;
  kbpsIn: number | null;
}

export function isProof1080p(width: number | null | undefined, height: number | null | undefined): boolean {
  return width === PROOF_WIDTH && height === PROOF_HEIGHT;
}

export function perSecond(prev: number, next: number, dtMs: number): number | null {
  if (!(dtMs > 0) || !Number.isFinite(prev) || !Number.isFinite(next)) {
    return null;
  }
  return (next - prev) / (dtMs / 1000);
}

export function round1(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

export function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (nums.length === 0) {
    return null;
  }
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function minMax(values: Array<number | null | undefined>): { min: number | null; max: number | null } {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (nums.length === 0) {
    return { min: null, max: null };
  }
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function pickVideoRtp(rows: StatsRow[], type: 'inbound-rtp' | 'outbound-rtp'): StatsRow | null {
  return (
    rows.find((row) => {
      const kind = row.kind ?? row.mediaType;
      return row.type === type && kind === 'video';
    }) ?? null
  );
}

export function pickMediaSource(rows: StatsRow[]): StatsRow | null {
  return rows.find((row) => row.type === 'media-source' && (row.kind ?? row.mediaType) === 'video') ?? null;
}

export function statsReportToRows(stats: { forEach: (cb: (report: Record<string, unknown>) => void) => void }): StatsRow[] {
  const rows: StatsRow[] = [];
  stats.forEach((report) => rows.push(report as StatsRow));
  return rows;
}

export function inboundFromRow(row: StatsRow | null): InboundLayer {
  return {
    frameWidth: asNumber(row?.frameWidth),
    frameHeight: asNumber(row?.frameHeight),
    framesDecoded: asNumber(row?.framesDecoded) ?? 0,
    framesReceived: asNumber(row?.framesReceived) ?? 0,
    framesDropped: asNumber(row?.framesDropped) ?? 0,
    framesPerSecond: asNumber(row?.framesPerSecond),
    bytesReceived: asNumber(row?.bytesReceived) ?? 0,
    packetsLost: asNumber(row?.packetsLost) ?? 0,
  };
}

export function outboundFromRow(
  row: StatsRow | null,
  encodings?: {
    maxBitrate?: number;
    maxFramerate?: number;
    scaleResolutionDownBy?: number;
  } | null,
): EncoderLayer {
  return {
    frameWidth: asNumber(row?.frameWidth),
    frameHeight: asNumber(row?.frameHeight),
    framesSent: asNumber(row?.framesSent) ?? 0,
    framesEncoded: asNumber(row?.framesEncoded) ?? 0,
    framesPerSecond: asNumber(row?.framesPerSecond),
    bytesSent: asNumber(row?.bytesSent) ?? 0,
    qualityLimitationReason: asString(row?.qualityLimitationReason),
    encoderImplementation: asString(row?.encoderImplementation),
    mimeType: asString(row?.mimeType) ?? asString(row?.codecId),
    maxBitrate: asNumber(encodings?.maxBitrate),
    maxFramerate: asNumber(encodings?.maxFramerate),
    scaleResolutionDownBy: asNumber(encodings?.scaleResolutionDownBy),
  };
}

export function mediaSourceFromRow(row: StatsRow | null): MediaSourceLayer {
  return {
    width: asNumber(row?.width),
    height: asNumber(row?.height),
    frames: asNumber(row?.frames),
    framesPerSecond: asNumber(row?.framesPerSecond),
  };
}

export function ratesBetween(prev: ProbeTick, next: ProbeTick): ProbeRates {
  const dtMs = next.t - prev.t;
  return {
    dtMs,
    captureSourceFps: (() => {
      const fromMedia = perSecond(prev.mediaSource.frames ?? 0, next.mediaSource.frames ?? 0, dtMs);
      if (fromMedia != null && fromMedia > 0) {
        return fromMedia;
      }
      return perSecond(prev.pump.sourceFrameCount, next.pump.sourceFrameCount, dtMs);
    })(),
    pumpFps: perSecond(prev.pump.paintCount, next.pump.paintCount, dtMs),
    encoderFps: perSecond(prev.outbound.framesEncoded, next.outbound.framesEncoded, dtMs),
    framesSentPerSec: perSecond(prev.outbound.framesSent, next.outbound.framesSent, dtMs),
    decodedFps: perSecond(prev.inbound.framesDecoded, next.inbound.framesDecoded, dtMs),
    kbpsOut: (() => {
      const bytes = perSecond(prev.outbound.bytesSent, next.outbound.bytesSent, dtMs);
      return bytes == null ? null : (bytes * 8) / 1000;
    })(),
    kbpsIn: (() => {
      const bytes = perSecond(prev.inbound.bytesReceived, next.inbound.bytesReceived, dtMs);
      return bytes == null ? null : (bytes * 8) / 1000;
    })(),
  };
}

export function emptyPump(): PumpLayer {
  return {
    canvasWidth: 0,
    canvasHeight: 0,
    sourceWidth: 0,
    sourceHeight: 0,
    paintCount: 0,
    sourceFrameCount: 0,
    outboundWidth: 0,
    outboundHeight: 0,
    outboundFrameRate: null,
  };
}

export interface ProbeSummary {
  samples: number;
  durationMs: number;
  proof: {
    capture1080p: boolean;
    encoder1080p: boolean;
    inbound1080p: boolean;
    videoEl1080p: boolean;
  };
  avg: {
    captureSourceFps: number | null;
    pumpFps: number | null;
    encoderFps: number | null;
    framesSentPerSec: number | null;
    decodedFps: number | null;
    kbpsOut: number | null;
    kbpsIn: number | null;
  };
  range: {
    encoderFps: { min: number | null; max: number | null };
    decodedFps: { min: number | null; max: number | null };
  };
  last: {
    capture: { width: number; height: number; getSettingsFps: number | null };
    encoder: {
      width: number | null;
      height: number | null;
      impl: string | null;
      qualityLimitation: string | null;
      mimeType: string | null;
      maxFramerate: number | null;
      maxBitrate: number | null;
    };
    inbound: { width: number | null; height: number | null; reportedFps: number | null };
    videoEl: { w: number; h: number } | null;
  };
  table: Array<{
    s: number;
    capW: number;
    capH: number;
    encW: number | null;
    encH: number | null;
    inW: number | null;
    inH: number | null;
    videoW: number;
    videoH: number;
    capFps: number | null;
    pumpFps: number | null;
    encFps: number | null;
    sentFps: number | null;
    decFps: number | null;
    kbpsOut: number | null;
    kbpsIn: number | null;
    limit: string | null;
  }>;
}

export function summarizeProbe(ticks: ProbeTick[]): ProbeSummary {
  const last = ticks[ticks.length - 1];
  const first = ticks[0];
  const rates = ticks.slice(1).map((tick, index) => ratesBetween(ticks[index], tick));
  const video = last?.videos.find((entry) => entry.w >= 320) ?? last?.videos[0] ?? null;

  return {
    samples: ticks.length,
    durationMs: last && first ? last.t - first.t : 0,
    proof: {
      capture1080p: isProof1080p(last?.capture.width, last?.capture.height),
      encoder1080p: isProof1080p(last?.outbound.frameWidth, last?.outbound.frameHeight),
      inbound1080p: isProof1080p(last?.inbound.frameWidth, last?.inbound.frameHeight),
      videoEl1080p: isProof1080p(video?.w, video?.h),
    },
    avg: {
      captureSourceFps: round1(mean(rates.map((row) => row.captureSourceFps))),
      pumpFps: round1(mean(rates.map((row) => row.pumpFps))),
      encoderFps: round1(mean(rates.map((row) => row.encoderFps))),
      framesSentPerSec: round1(mean(rates.map((row) => row.framesSentPerSec))),
      decodedFps: round1(mean(rates.map((row) => row.decodedFps))),
      kbpsOut: round1(mean(rates.map((row) => row.kbpsOut))),
      kbpsIn: round1(mean(rates.map((row) => row.kbpsIn))),
    },
    range: {
      encoderFps: {
        min: round1(minMax(rates.map((row) => row.encoderFps)).min),
        max: round1(minMax(rates.map((row) => row.encoderFps)).max),
      },
      decodedFps: {
        min: round1(minMax(rates.map((row) => row.decodedFps)).min),
        max: round1(minMax(rates.map((row) => row.decodedFps)).max),
      },
    },
    last: {
      capture: {
        width: last?.capture.width ?? 0,
        height: last?.capture.height ?? 0,
        getSettingsFps: last?.capture.frameRate ?? null,
      },
      encoder: {
        width: last?.outbound.frameWidth ?? null,
        height: last?.outbound.frameHeight ?? null,
        impl: last?.outbound.encoderImplementation ?? null,
        qualityLimitation: last?.outbound.qualityLimitationReason ?? null,
        mimeType: last?.outbound.mimeType ?? null,
        maxFramerate: last?.outbound.maxFramerate ?? null,
        maxBitrate: last?.outbound.maxBitrate ?? null,
      },
      inbound: {
        width: last?.inbound.frameWidth ?? null,
        height: last?.inbound.frameHeight ?? null,
        reportedFps: last?.inbound.framesPerSecond ?? null,
      },
      videoEl: video,
    },
    table: rates.map((row, index) => {
      const tick = ticks[index + 1];
      const el = tick.videos.find((entry) => entry.w >= 320) ?? tick.videos[0] ?? { w: 0, h: 0 };
      return {
        s: round1(tick.t / 1000) ?? index + 1,
        capW: tick.capture.width,
        capH: tick.capture.height,
        encW: tick.outbound.frameWidth,
        encH: tick.outbound.frameHeight,
        inW: tick.inbound.frameWidth,
        inH: tick.inbound.frameHeight,
        videoW: el.w,
        videoH: el.h,
        capFps: round1(row.captureSourceFps),
        pumpFps: round1(row.pumpFps),
        encFps: round1(row.encoderFps),
        sentFps: round1(row.framesSentPerSec),
        decFps: round1(row.decodedFps),
        kbpsOut: round1(row.kbpsOut),
        kbpsIn: round1(row.kbpsIn),
        limit: tick.outbound.qualityLimitationReason,
      };
    }),
  };
}
