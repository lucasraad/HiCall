import {
  OUTBOUND_VIDEO_FPS,
  OUTBOUND_VIDEO_HEIGHT,
  OUTBOUND_VIDEO_WIDTH,
  SCREEN_CONTENT_HINT,
} from './voice-video-contract';

export {
  OUTBOUND_VIDEO_FPS,
  OUTBOUND_VIDEO_HEIGHT,
  OUTBOUND_VIDEO_WIDTH,
} from './voice-video-contract';

/**
 * Única faixa de vídeo enviada aos peers quando o track nativo não é usado.
 * getDisplayMedia/câmera só alimentam este canvas — o sender nunca faz replaceTrack
 * de 16×16 para 1080p (Chrome trava o encoder na resolução inicial).
 *
 * captureStream(fps) é o teto (MDN / Chrome capture-stream). setInterval pinta mesmo
 * com a aba em segundo plano; rAF/rVFC sozinhos congelam em background.
 * Câmera: 30 fps no canvas. Tela de jogos usa o track nativo (sem drawImage).
 */
export class OutboundVideoPump {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly preview: HTMLVideoElement;
  private readonly outbound: MediaStream;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sourceTrack: MediaStreamTrack | null = null;
  private paintCount = 0;
  private sourceFrameCount = 0;
  private sourceRvf: number | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = OUTBOUND_VIDEO_WIDTH;
    this.canvas.height = OUTBOUND_VIDEO_HEIGHT;
    const ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) {
      throw new Error('Canvas 2D indisponível para transmitir vídeo.');
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.preview = document.createElement('video');
    this.preview.muted = true;
    this.preview.autoplay = true;
    this.preview.playsInline = true;
    this.preview.setAttribute('playsinline', '');

    this.outbound = this.canvas.captureStream(OUTBOUND_VIDEO_FPS);
    const track = this.outbound.getVideoTracks()[0];
    if (track) {
      track.contentHint = SCREEN_CONTENT_HINT;
      track.enabled = true;
    }

    this.paint();
    this.timer = window.setInterval(() => this.paint(), Math.round(1000 / OUTBOUND_VIDEO_FPS));
  }

  get track(): MediaStreamTrack {
    const track = this.outbound.getVideoTracks()[0];
    if (!track) {
      throw new Error('Faixa de vídeo de saída encerrada.');
    }
    return track;
  }

  get outputWidth(): number {
    return this.canvas.width;
  }

  get outputHeight(): number {
    return this.canvas.height;
  }

  get sourceWidth(): number {
    return this.preview.videoWidth;
  }

  get sourceHeight(): number {
    return this.preview.videoHeight;
  }

  get diagnostics(): {
    canvasWidth: number;
    canvasHeight: number;
    sourceWidth: number;
    sourceHeight: number;
    paintCount: number;
    sourceFrameCount: number;
    outboundWidth: number;
    outboundHeight: number;
    outboundFrameRate: number | null;
    contentHint: string;
  } {
    const settings = this.track.getSettings?.() ?? {};
    return {
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      sourceWidth: this.preview.videoWidth,
      sourceHeight: this.preview.videoHeight,
      paintCount: this.paintCount,
      sourceFrameCount: this.sourceFrameCount,
      outboundWidth: settings.width ?? this.canvas.width,
      outboundHeight: settings.height ?? this.canvas.height,
      outboundFrameRate: typeof settings.frameRate === 'number' ? settings.frameRate : null,
      contentHint: this.track.contentHint ?? '',
    };
  }

  async setSource(stream: MediaStream | null): Promise<void> {
    this.unbindSource();
    const videoTrack = stream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null;
    this.sourceTrack = videoTrack;

    if (videoTrack) {
      videoTrack.contentHint = SCREEN_CONTENT_HINT;
      videoTrack.addEventListener('ended', this.onSourceEnded);
    }

    this.preview.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
    this.track.enabled = true;
    this.track.contentHint = SCREEN_CONTENT_HINT;

    if (videoTrack) {
      try {
        await this.preview.play();
      } catch {
        /* autoplay — o intervalo continua pintando quando o vídeo liberar */
      }
      this.bindSourceFrames();
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.unbindSource();
    this.preview.srcObject = null;
    this.outbound.getTracks().forEach((track) => track.stop());
  }

  private readonly onSourceEnded = (): void => {
    void this.setSource(null);
  };

  private unbindSource(): void {
    this.cancelSourceFrames();
    this.sourceTrack?.removeEventListener('ended', this.onSourceEnded);
    this.sourceTrack = null;
  }

  private bindSourceFrames(): void {
    this.cancelSourceFrames();
    const video = this.preview as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof video.requestVideoFrameCallback !== 'function') {
      return;
    }
    const loop = (): void => {
      this.sourceFrameCount += 1;
      this.sourceRvf = video.requestVideoFrameCallback!(loop);
    };
    this.sourceRvf = video.requestVideoFrameCallback(loop);
  }

  private cancelSourceFrames(): void {
    const video = this.preview as HTMLVideoElement & {
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    if (this.sourceRvf != null && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(this.sourceRvf);
    }
    this.sourceRvf = null;
  }

  private paint(): void {
    this.paintCount += 1;
    const { ctx, canvas, preview } = this;
    const vw = preview.videoWidth;
    const vh = preview.videoHeight;
    if (vw < 2 || vh < 2) {
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const scale = Math.min(canvas.width / vw, canvas.height / vh);
    const width = vw * scale;
    const height = vh * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    if (x > 0.5 || y > 0.5) {
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    try {
      ctx.drawImage(preview, x, y, width, height);
    } catch {
      /* canvas tainted — o próximo intervalo tenta de novo */
    }
  }
}
