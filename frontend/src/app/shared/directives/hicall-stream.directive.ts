import { Directive, ElementRef, OnDestroy, effect, input } from '@angular/core';

/**
 * Chrome não começa a tocar um track adicionado depois de srcObject = stream vazio.
 * Religa o MediaStream e chama play() de novo.
 */
@Directive({
  selector: 'video[hicallStream], audio[hicallStream]',
  standalone: true,
})
export class HicallStreamDirective implements OnDestroy {
  readonly hicallStream = input<MediaStream | null>(null);

  private bound: MediaStream | null = null;
  private readonly onTracks = (): void => this.reattach();

  constructor(private readonly el: ElementRef<HTMLMediaElement>) {
    effect(() => {
      this.bind(this.hicallStream());
    });
  }

  ngOnDestroy(): void {
    this.unbind();
    this.el.nativeElement.srcObject = null;
  }

  private bind(stream: MediaStream | null): void {
    if (this.bound === stream) {
      this.play();
      return;
    }

    this.unbind();
    this.bound = stream;
    this.el.nativeElement.srcObject = stream;
    this.silenceVideoElement();
    if ('preservesPitch' in this.el.nativeElement) {
      this.el.nativeElement.preservesPitch = true;
    }
    if (stream) {
      stream.addEventListener('addtrack', this.onTracks);
      stream.addEventListener('removetrack', this.onTracks);
      stream.getTracks().forEach((track) => {
        track.addEventListener('unmute', this.onTracks);
      });
    }
    this.play();
  }

  private reattach(): void {
    const media = this.el.nativeElement;
    media.srcObject = null;
    media.srcObject = this.bound;
    this.silenceVideoElement();
    this.play();
  }

  private silenceVideoElement(): void {
    const media = this.el.nativeElement;
    if (!(media instanceof HTMLVideoElement)) {
      return;
    }
    media.muted = true;
    media.volume = 0;
  }

  private unbind(): void {
    this.bound?.removeEventListener('addtrack', this.onTracks);
    this.bound?.removeEventListener('removetrack', this.onTracks);
    this.bound?.getTracks().forEach((track) => {
      track.removeEventListener('unmute', this.onTracks);
    });
    this.bound = null;
  }

  private play(): void {
    void this.el.nativeElement.play().catch(() => undefined);
  }
}
