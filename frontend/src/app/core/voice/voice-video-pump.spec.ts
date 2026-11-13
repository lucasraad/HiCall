import {
  OUTBOUND_VIDEO_FPS,
  OUTBOUND_VIDEO_HEIGHT,
  OUTBOUND_VIDEO_WIDTH,
  SCREEN_CONTENT_HINT,
} from './voice-video-contract';
import { OutboundVideoPump } from './voice-video-pump';

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await waitMs(40);
  }
}

describe('OutboundVideoPump', () => {
  let pump: OutboundVideoPump | null = null;
  let source: MediaStream | null = null;

  afterEach(() => {
    pump?.stop();
    pump = null;
    source?.getTracks().forEach((track) => track.stop());
    source = null;
  });

  it('nasce em 1080p30 via captureStream(30), sem placeholder 16×16', () => {
    const captureSpy = spyOn(HTMLCanvasElement.prototype, 'captureStream').and.callThrough();
    pump = new OutboundVideoPump();

    expect(captureSpy).toHaveBeenCalledWith(OUTBOUND_VIDEO_FPS);
    expect(captureSpy).toHaveBeenCalledWith(30);
    expect(pump.outputWidth).toBe(OUTBOUND_VIDEO_WIDTH);
    expect(pump.outputHeight).toBe(OUTBOUND_VIDEO_HEIGHT);
    expect(pump.outputWidth).toBe(1920);
    expect(pump.outputHeight).toBe(1080);

    const track = pump.track;
    expect(track.kind).toBe('video');
    expect(track.readyState).toBe('live');
    expect(track.enabled).toBeTrue();
    expect(track.contentHint).toBe(SCREEN_CONTENT_HINT);

    const settings = track.getSettings?.() ?? {};
    expect(settings.width === 16 || settings.height === 16).toBeFalse();
  });

  it('setSource não troca o track de saída (mesmo id — sem replaceTrack 16×16)', async () => {
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      pending('canvas.captureStream indisponível');
      return;
    }

    pump = new OutboundVideoPump();
    const outboundId = pump.track.id;

    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    expect(ctx).toBeTruthy();
    ctx!.fillStyle = '#cc0000';
    ctx!.fillRect(0, 0, 1920, 1080);
    source = canvas.captureStream(30);

    await pump.setSource(source);
    await waitUntil(() => pump!.sourceWidth >= 2);

    expect(pump.track.id).toBe(outboundId);
    expect(pump.track.readyState).toBe('live');
    expect(pump.outputWidth).toBe(1920);
    expect(pump.outputHeight).toBe(1080);
    expect(pump.sourceWidth).toBeGreaterThanOrEqual(2);
    expect(pump.sourceHeight).toBeGreaterThanOrEqual(2);
  });

  it('intervalo pinta a ~30 fps (não 60)', async () => {
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      pending('canvas.captureStream indisponível');
      return;
    }

    const setIntervalSpy = spyOn(window, 'setInterval').and.callThrough();
    pump = new OutboundVideoPump();

    const intervalMs = setIntervalSpy.calls.allArgs().find((args) => typeof args[1] === 'number')?.[1];
    expect(intervalMs).toBe(Math.round(1000 / 30));
    expect(intervalMs).not.toBe(Math.round(1000 / 60));
    expect(pump.diagnostics.paintCount).toBeGreaterThan(0);
    expect(pump.diagnostics.canvasWidth).toBe(1920);
    expect(pump.diagnostics.canvasHeight).toBe(1080);
  });
});
