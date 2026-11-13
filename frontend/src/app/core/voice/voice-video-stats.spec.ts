import {
  inboundFromRow,
  isProof1080p,
  mean,
  outboundFromRow,
  perSecond,
  pickVideoRtp,
  ratesBetween,
  round1,
  summarizeProbe,
  type ProbeTick,
} from './voice-video-stats';

function tick(partial: Partial<ProbeTick> & { t: number }): ProbeTick {
  return {
    capture: { width: 1920, height: 1080, frameRate: 30, displaySurface: 'monitor', contentHint: 'detail' },
    pump: {
      canvasWidth: 1920,
      canvasHeight: 1080,
      sourceWidth: 1920,
      sourceHeight: 1080,
      paintCount: 0,
      sourceFrameCount: 0,
      outboundWidth: 1920,
      outboundHeight: 1080,
      outboundFrameRate: 30,
    },
    mediaSource: { width: 1920, height: 1080, frames: 0, framesPerSecond: 30 },
    outbound: {
      frameWidth: 1920,
      frameHeight: 1080,
      framesSent: 0,
      framesEncoded: 0,
      framesPerSecond: 30,
      bytesSent: 0,
      qualityLimitationReason: 'none',
      encoderImplementation: 'OpenH264',
      mimeType: 'video/H264',
      maxBitrate: 8_000_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    },
    inbound: {
      frameWidth: 1920,
      frameHeight: 1080,
      framesDecoded: 0,
      framesReceived: 0,
      framesDropped: 0,
      framesPerSecond: 30,
      bytesReceived: 0,
      packetsLost: 0,
    },
    videos: [{ w: 1920, h: 1080 }],
    ...partial,
  };
}

describe('voice-video-stats proof', () => {
  it('1080p só vale com 1920×1080 — não 1280×720 nem 0×0', () => {
    expect(isProof1080p(1920, 1080)).toBeTrue();
    expect(isProof1080p(1280, 720)).toBeFalse();
    expect(isProof1080p(0, 0)).toBeFalse();
    expect(isProof1080p(null, 1080)).toBeFalse();
  });

  it('FPS de verdade é Δframes / Δt, não framesPerSecond isolado', () => {
    expect(round1(perSecond(100, 130, 1000))).toBe(30);
    expect(round1(perSecond(100, 115, 1000))).toBe(15);
    expect(round1(perSecond(10, 70, 1000))).toBe(60);
    expect(perSecond(0, 30, 0)).toBeNull();
  });

  it('detecta buraco encode/rede: captura 30 e decoded 15', () => {
    const a = tick({
      t: 0,
      pump: {
        canvasWidth: 1920,
        canvasHeight: 1080,
        sourceWidth: 1920,
        sourceHeight: 1080,
        paintCount: 0,
        sourceFrameCount: 0,
        outboundWidth: 1920,
        outboundHeight: 1080,
        outboundFrameRate: 30,
      },
      outbound: {
        frameWidth: 1920,
        frameHeight: 1080,
        framesSent: 0,
        framesEncoded: 0,
        framesPerSecond: 30,
        bytesSent: 0,
        qualityLimitationReason: 'cpu',
        encoderImplementation: 'OpenH264',
        mimeType: 'video/H264',
        maxBitrate: 8_000_000,
        maxFramerate: 30,
        scaleResolutionDownBy: 1,
      },
      inbound: {
        frameWidth: 1920,
        frameHeight: 1080,
        framesDecoded: 0,
        framesReceived: 0,
        framesDropped: 0,
        framesPerSecond: 30,
        bytesReceived: 0,
        packetsLost: 0,
      },
    });
    const b = tick({
      t: 1000,
      pump: { ...a.pump, paintCount: 30, sourceFrameCount: 30 },
      outbound: { ...a.outbound, framesEncoded: 15, framesSent: 15 },
      inbound: { ...a.inbound, framesDecoded: 15 },
    });
    const rates = ratesBetween(a, b);
    expect(round1(rates.captureSourceFps)).toBe(30);
    expect(round1(rates.pumpFps)).toBe(30);
    expect(round1(rates.encoderFps)).toBe(15);
    expect(round1(rates.decodedFps)).toBe(15);
  });

  it('summarizeProbe prova 1080p nas três camadas e média de FPS', () => {
    const ticks = [0, 1, 2].map((s) =>
      tick({
        t: s * 1000,
        pump: {
          canvasWidth: 1920,
          canvasHeight: 1080,
          sourceWidth: 1920,
          sourceHeight: 1080,
          paintCount: s * 30,
          sourceFrameCount: s * 30,
          outboundWidth: 1920,
          outboundHeight: 1080,
          outboundFrameRate: 30,
        },
        outbound: {
          frameWidth: 1920,
          frameHeight: 1080,
          framesSent: s * 30,
          framesEncoded: s * 30,
          framesPerSecond: 30,
          bytesSent: s * 500_000,
          qualityLimitationReason: 'none',
          encoderImplementation: 'NVENC',
          mimeType: 'video/H264',
          maxBitrate: 8_000_000,
          maxFramerate: 30,
          scaleResolutionDownBy: 1,
        },
        inbound: {
          frameWidth: 1920,
          frameHeight: 1080,
          framesDecoded: s * 30,
          framesReceived: s * 30,
          framesDropped: 0,
          framesPerSecond: 30,
          bytesReceived: s * 500_000,
          packetsLost: 0,
        },
      }),
    );
    const summary = summarizeProbe(ticks);
    expect(summary.proof.capture1080p).toBeTrue();
    expect(summary.proof.encoder1080p).toBeTrue();
    expect(summary.proof.inbound1080p).toBeTrue();
    expect(summary.proof.videoEl1080p).toBeTrue();
    expect(summary.avg.decodedFps).toBe(30);
    expect(summary.avg.encoderFps).toBe(30);
    expect(summary.table.length).toBe(2);
  });

  it('pickVideoRtp ignora áudio e pega só inbound/outbound de vídeo', () => {
    const rows = [
      { type: 'inbound-rtp', kind: 'audio', framesDecoded: 9 },
      { type: 'inbound-rtp', kind: 'video', frameWidth: 1920, framesDecoded: 40 },
      { type: 'outbound-rtp', kind: 'video', frameWidth: 1280, framesSent: 12 },
    ];
    expect(pickVideoRtp(rows, 'inbound-rtp')?.framesDecoded).toBe(40);
    expect(outboundFromRow(pickVideoRtp(rows, 'outbound-rtp')).frameWidth).toBe(1280);
    expect(inboundFromRow(pickVideoRtp(rows, 'inbound-rtp')).frameWidth).toBe(1920);
  });

  it('mean ignora nulos', () => {
    expect(round1(mean([30, null, 28, undefined, 32]))).toBe(30);
    expect(mean([])).toBeNull();
  });
});
