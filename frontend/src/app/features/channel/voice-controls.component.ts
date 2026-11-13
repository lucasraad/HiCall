import { Component, computed, input, output } from '@angular/core';
import {
  LucideMaximize2,
  LucideMessageSquare,
  LucideMic,
  LucideMicOff,
  LucideMinimize2,
  LucideMonitorUp,
  LucidePhone,
  LucideSettings,
  LucideVideo,
  LucideVideoOff,
} from '../../shared/icons/app-icons';

@Component({
  selector: 'app-voice-controls',
  standalone: true,
  imports: [LucideMessageSquare, LucideMic, LucideMicOff, LucideVideo, LucideVideoOff, LucideMonitorUp, LucideMaximize2, LucideMinimize2, LucideSettings, LucidePhone],
  template: `
    <div [class]="barClass()">
      @if (!chatOpen()) {
        <button
          class="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700 text-white hover:bg-zinc-600 md:h-10 md:w-10"
          type="button"
          title="Abrir chat"
          (click)="openChat.emit()"
        >
          <svg lucideMessageSquare class="h-5 w-5"></svg>
        </button>
      }

      <button
        class="flex h-12 w-12 items-center justify-center rounded-full text-white md:h-10 md:w-10"
        [class.bg-zinc-700]="!audioMuted()"
        [class.bg-red-600]="audioMuted()"
        [class.opacity-40]="audioLocked()"
        type="button"
        [disabled]="audioLocked()"
        [title]="audioTitle()"
        (click)="toggleAudio.emit()"
      >
        @if (audioMuted()) {
          <svg lucideMicOff class="h-5 w-5"></svg>
        } @else {
          <svg lucideMic class="h-5 w-5"></svg>
        }
      </button>

      <button
        class="flex h-12 w-12 items-center justify-center rounded-full text-white md:h-10 md:w-10"
        [class.bg-green-600]="!videoMuted()"
        [class.bg-red-600]="videoMuted()"
        [class.opacity-40]="videoLocked()"
        type="button"
        [disabled]="videoLocked()"
        [title]="videoTitle()"
        (click)="toggleVideo.emit()"
      >
        @if (videoMuted()) {
          <svg lucideVideoOff class="h-5 w-5"></svg>
        } @else {
          <svg lucideVideo class="h-5 w-5"></svg>
        }
      </button>

      <button
        class="flex h-12 w-12 items-center justify-center rounded-full text-white md:h-10 md:w-10"
        [class.bg-green-600]="screenSharing()"
        [class.bg-zinc-700]="!screenSharing()"
        [class.hover:bg-zinc-600]="!screenSharing() && !screenLocked()"
        [class.opacity-40]="screenLocked() && !screenSharing()"
        type="button"
        [disabled]="screenLocked() && !screenSharing()"
        [title]="screenShareTitle()"
        (click)="toggleScreen.emit()"
      >
        <svg lucideMonitorUp class="h-5 w-5"></svg>
      </button>

      @if (fullscreenActive()) {
        <button
          class="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700 text-white hover:bg-zinc-600 md:h-10 md:w-10"
          type="button"
          title="Sair da tela cheia"
          (click)="exitFullscreen.emit()"
        >
          <svg lucideMinimize2 class="h-5 w-5"></svg>
        </button>
      } @else {
        <button
          class="flex h-12 w-12 items-center justify-center rounded-full text-white md:h-10 md:w-10"
          [class.bg-zinc-700]="fullscreenAvailable()"
          [class.hover:bg-zinc-600]="fullscreenAvailable()"
          [class.bg-zinc-800]="!fullscreenAvailable()"
          [class.opacity-40]="!fullscreenAvailable()"
          type="button"
          title="Tela cheia"
          [disabled]="!fullscreenAvailable()"
          (click)="enterFullscreen.emit()"
        >
          <svg lucideMaximize2 class="h-5 w-5"></svg>
        </button>
      }

      <button
        class="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700 text-white hover:bg-zinc-600 md:h-10 md:w-10"
        type="button"
        title="Dispositivos de áudio"
        (click)="toggleDevices.emit()"
      >
        <svg lucideSettings class="h-5 w-5"></svg>
      </button>

      <button
        class="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 md:h-10 md:w-10"
        type="button"
        title="Sair da chamada"
        (click)="hangup.emit()"
      >
        <svg lucidePhone class="h-5 w-5"></svg>
      </button>
    </div>
  `,
})
export class VoiceControlsComponent {
  readonly audioMuted = input(false);
  readonly videoMuted = input(false);
  readonly screenSharing = input(false);
  readonly audioLocked = input(false);
  readonly videoLocked = input(false);
  readonly screenLocked = input(false);
  readonly fullscreenActive = input(false);
  readonly fullscreenAvailable = input(false);
  readonly chatOpen = input(true);
  readonly overlay = input(false);

  readonly openChat = output<void>();
  readonly toggleAudio = output<void>();
  readonly toggleVideo = output<void>();
  readonly toggleScreen = output<void>();
  readonly enterFullscreen = output<void>();
  readonly exitFullscreen = output<void>();
  readonly hangup = output<void>();
  readonly toggleDevices = output<void>();

  readonly barClass = computed(() =>
    this.overlay()
      ? 'flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-zinc-900/90 px-4 py-3 shadow-lg backdrop-blur-md md:gap-3 md:px-6'
      : 'flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-zinc-700 border-opacity-50 px-3 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:gap-3 md:px-4 md:py-3',
  );

  readonly screenShareTitle = computed(() => {
    if (this.screenLocked() && !this.screenSharing()) {
      return 'Seu cargo não permite transmitir tela';
    }
    return this.screenSharing()
      ? 'Parar compartilhamento'
      : 'Compartilhar tela (janela ou monitor, sem barra de aba)';
  });

  readonly audioTitle = computed(() => {
    if (this.audioLocked()) {
      return 'Seu cargo não permite falar na chamada';
    }
    return this.audioMuted() ? 'Ativar microfone' : 'Desativar microfone';
  });

  readonly videoTitle = computed(() => {
    if (this.videoLocked()) {
      return 'Seu cargo não permite ligar a câmera';
    }
    return this.videoMuted() ? 'Ativar câmera' : 'Desativar câmera';
  });
}
