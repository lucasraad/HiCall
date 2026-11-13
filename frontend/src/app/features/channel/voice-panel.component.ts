import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { interval } from 'rxjs';
import { Channel } from '../../core/models/channel.model';
import { Server } from '../../core/models/server.model';
import { permissionsOf } from '../../core/models/role.model';
import { VoiceGridTile } from '../../core/models/voice.model';
import { buildVoiceGridTiles } from '../../core/voice/voice-grid.util';
import { VoiceRtcService } from '../../core/services/voice-rtc.service';
import { VoiceSignalingService } from '../../core/services/voice-signaling.service';
import { NoiseFilterMode } from '../../core/voice/mic-noise-filter';
import { ScreenQualityId } from '../../core/voice/screen-quality';
import { DESKTOP_SETUP_URL } from '../../core/desktop/desktop-download';
import { isHicallDesktop } from '../../core/desktop/hicall-desktop';
import { extractErrorMessage } from '../../core/utils/http-error';
import { LucideMessageSquare, LucideMic, LucideMicOff, LucideMonitor, LucideUserX, LucideVolume2, LucideVolumeX } from '../../shared/icons/app-icons';
import { HicallStreamDirective } from '../../shared/directives/hicall-stream.directive';
import { VoiceControlsComponent } from './voice-controls.component';
import { ScreenSharePickEvent, ScreenSharePickerComponent } from './screen-share-picker.component';

const BOTTOM_CONTROLS_ZONE_PX = 120;
const CONTROLS_HIDE_MS = 3_000;

@Component({
  selector: 'app-voice-panel',
  standalone: true,
  imports: [FormsModule, VoiceControlsComponent, ScreenSharePickerComponent, HicallStreamDirective, LucideVolume2, LucideVolumeX, LucideMonitor, LucideMessageSquare, LucideMic, LucideMicOff, LucideUserX],
  host: { class: 'relative flex min-w-0 flex-1 flex-col h-full overflow-hidden' },
  template: `
    <div class="flex h-full min-w-0 flex-1 flex-col bg-black">
      <header class="hidden h-12 shrink-0 items-center border-b border-zinc-800 px-4 md:flex">
        <svg lucideVolume2 class="h-4 w-4 shrink-0 text-zinc-400"></svg>
        <h2 class="ml-2 min-w-0 truncate text-sm font-semibold text-zinc-200">{{ channel().name }}</h2>
        @if (voice.inCall() || voice.linkStatus() === 'connecting') {
          <span
            class="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            [class.bg-amber-950]="voice.linkStatus() !== 'connected'"
            [class.text-amber-200]="voice.linkStatus() !== 'connected'"
            [class.bg-emerald-950]="voice.linkStatus() === 'connected'"
            [class.text-emerald-300]="voice.linkStatus() === 'connected'"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              [class.bg-amber-400]="voice.linkStatus() !== 'connected'"
              [class.bg-emerald-400]="voice.linkStatus() === 'connected'"
            ></span>
            {{ linkStatusLabel() }}
          </span>
        }
        <span class="min-w-0 flex-1"></span>
        @if (!chatOpen()) {
          <button
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            type="button"
            title="Abrir chat"
            (click)="openChat.emit()"
          >
            <svg lucideMessageSquare class="h-4 w-4"></svg>
          </button>
        }
      </header>

      @if (!voice.inCall()) {
        <div class="flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-900 to-zinc-800 px-6">
          <div class="text-center">
            <p class="text-lg font-medium text-zinc-200">{{ channel().name }}</p>
            <p class="mt-1 text-sm text-zinc-400">
              @if (peerCount() > 0) {
                {{ peerCount() }} {{ peerCount() === 1 ? 'pessoa em voz' : 'pessoas em voz' }}
              } @else {
                Ninguém está em voz
              }
            </p>
          </div>

          @if (voice.error()) {
            <p class="text-sm text-red-400">{{ voice.error() }}</p>
          }

          @if (voice.linkStatus() === 'connecting') {
            <p class="text-xs text-amber-200">{{ linkStatusLabel() }}</p>
          }

          <button
            class="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
            type="button"
            [disabled]="voice.connecting() || voice.linkStatus() === 'connecting'"
            (click)="joinCall()"
          >
            {{ voice.connecting() || voice.linkStatus() === 'connecting' ? 'Conectando...' : 'Entrar na chamada de voz' }}
          </button>
        </div>
      } @else {
        <div class="relative min-h-0 flex-1 overflow-hidden bg-black">
          @if (voice.screenAudioHint()) {
            <div class="absolute left-3 right-3 top-3 z-20 flex flex-col gap-2 rounded-md border border-amber-700/80 bg-amber-950/90 px-3 py-2 text-xs text-amber-100">
              <p>{{ screenAudioHintText() }}</p>
              @if (voice.screenAudioHint() === 'leaky-update-app') {
                <a class="w-fit font-medium text-amber-50 underline" [href]="desktopSetupUrl">Atualizar o HiCall</a>
              }
              @if (voice.screenAudioHint() === 'leaky' || voice.screenAudioHint() === 'leaky-update-app') {
                <button
                  class="w-fit rounded bg-amber-200 px-2 py-1 text-[11px] font-medium text-amber-950 hover:bg-amber-100"
                  type="button"
                  (click)="voice.sendHeldScreenAudio()"
                >
                  Enviar mesmo assim
                </button>
              }
            </div>
          }

          <div [class]="gridClass()">
            @for (tile of gridTiles(); track tile.key) {
              <div
                class="voice-tile"
                [class.voice-tile--interactive]="isTileFocusable(tile)"
                [class.voice-tile--focused]="focusedTileKey() === tile.key"
                [class.voice-tile--speaking]="tile.kind === 'participant' && voice.isSpeaking(tile.userId)"
                [style.background]="tile.showVideo ? '#1a1a1a' : tileColor(tile.name)"
                (click)="selectTile(tile)"
              >
                @if (tile.showVideo && tile.stream) {
                  <video
                    class="h-full w-full"
                    [class.object-contain]="tile.kind === 'screen'"
                    [class.object-cover]="tile.kind === 'participant'"
                    [hicallStream]="tile.stream"
                    autoplay
                    playsinline
                    [muted]="true"
                    (loadedmetadata)="bindTileVideo($event.target, tile)"
                  ></video>
                } @else {
                  <div class="absolute inset-0 flex items-center justify-center">
                    @if (tile.kind === 'screen') {
                      <svg lucideMonitor class="h-12 w-12 text-zinc-500"></svg>
                    } @else {
                      <span
                        class="occupant-avatar flex h-20 w-20 items-center justify-center rounded-full bg-black/25 text-2xl font-semibold text-white"
                        [class.occupant-avatar--speaking]="voice.isSpeaking(tile.userId)"
                      >
                        {{ initial(tile.name) }}
                      </span>
                    }
                  </div>
                }

                @if (tile.kind === 'participant' && tile.stream && !tile.isLocal) {
                  <audio
                    autoplay
                    [hicallStream]="tile.stream"
                    [muted]="peerVolume(tile.userId) === 0"
                    [volume]="peerVolume(tile.userId)"
                    (loadedmetadata)="bindPeerAudio($event.target, tile.userId)"
                  ></audio>
                }

                @if (tile.kind === 'screen' && tile.stream && !tile.isLocal) {
                  <audio
                    autoplay
                    [hicallStream]="tile.stream"
                    [muted]="screenVolume(tile.userId) === 0"
                    [volume]="screenVolume(tile.userId)"
                    (loadedmetadata)="bindScreenAudio($event.target, tile.userId)"
                  ></audio>
                }

                @if (!tile.isLocal && tile.kind === 'participant' && (canKickCall() || canMuteCall()) && tile.userId !== server().owner_id) {
                  <div
                    class="absolute left-2 top-2 z-10 flex gap-1"
                    (click)="$event.stopPropagation()"
                    (mousedown)="$event.stopPropagation()"
                  >
                    @if (canMuteCall()) {
                      @if (tile.forceMuted) {
                        <button
                          class="flex h-7 items-center justify-center gap-1 rounded-full bg-emerald-700/90 px-2 text-[10px] font-medium text-white hover:bg-emerald-600"
                          type="button"
                          title="Desmutar na chamada"
                          (click)="unmutePeer(tile.userId)"
                        >
                          <svg lucideMic class="h-3.5 w-3.5"></svg>
                          Desmutar
                        </button>
                      } @else {
                        <button
                          class="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-700"
                          type="button"
                          title="Mutar na chamada"
                          (click)="mutePeer(tile.userId)"
                        >
                          <svg lucideMicOff class="h-3.5 w-3.5"></svg>
                        </button>
                      }
                    }
                    @if (canKickCall()) {
                      <button
                        class="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-700"
                        type="button"
                        title="Expulsar da chamada"
                        (click)="kickPeer(tile.userId)"
                      >
                        <svg lucideUserX class="h-3.5 w-3.5"></svg>
                      </button>
                    }
                  </div>
                }
                @if (!tile.isLocal && tile.kind === 'screen') {
                  <div
                    class="screen-volume absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full bg-black/70 px-2 py-1"
                    (click)="$event.stopPropagation()"
                    (mousedown)="$event.stopPropagation()"
                  >
                    <button type="button" class="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/20"
                      [attr.aria-label]="tileAudioLabel(tile)"
                      [attr.aria-pressed]="tileVolume(tile) === 0" (click)="toggleTileMute(tile)">
                    @if (tileVolume(tile) === 0) {
                      <svg lucideVolumeX class="h-3.5 w-3.5 shrink-0 text-white"></svg>
                    } @else {
                      <svg lucideVolume2 class="h-3.5 w-3.5 shrink-0 text-white"></svg>
                    }
                    </button>
                    <input
                      class="screen-volume__range"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      [value]="tileVolume(tile)"
                      title="Volume da transmissão"
                      (input)="onTileVolumeInput($event, tile)"
                    />
                  </div>
                }
                @if (!tile.isLocal && tile.kind === 'participant') {
                  <div
                    class="screen-volume absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full bg-black/70 px-2 py-1"
                    (click)="$event.stopPropagation()"
                    (mousedown)="$event.stopPropagation()"
                  >
                    <button type="button" class="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/20"
                      [attr.aria-label]="tileAudioLabel(tile)"
                      [attr.aria-pressed]="tileVolume(tile) === 0" (click)="toggleTileMute(tile)">
                    @if (tileVolume(tile) === 0) {
                      <svg lucideVolumeX class="h-3.5 w-3.5 shrink-0 text-white"></svg>
                    } @else {
                      <svg lucideVolume2 class="h-3.5 w-3.5 shrink-0 text-white"></svg>
                    }
                    </button>
                    <input
                      class="screen-volume__range"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      [value]="tileVolume(tile)"
                      title="Volume da voz"
                      (input)="onTileVolumeInput($event, tile)"
                    />
                  </div>
                }

                <div class="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                  @if (tile.kind === 'screen') {
                    <svg lucideMonitor class="h-3 w-3 shrink-0"></svg>
                    <span class="truncate">Tela — {{ tile.name }}</span>
                  } @else {
                    <span class="truncate">{{ tile.name }}</span>
                    @if (tile.sharingScreen) {
                      <span class="shrink-0 text-emerald-400">· Transmitindo</span>
                    }
                    @if (!tile.videoMuted && tile.kind === 'participant') {
                      <span class="shrink-0 text-sky-400">· Câmera</span>
                    }
                    @if (tile.forceMuted) {
                      <span class="shrink-0 text-red-300">· mutado</span>
                    } @else if (tile.audioMuted) {
                      <span class="shrink-0 text-zinc-400">· mudo</span>
                    }
                  }
                </div>
              </div>
            }
          </div>
        </div>

        @if (!stageFullscreen()) {
          <div class="relative">
            <app-voice-controls
              [audioMuted]="voice.audioMuted()"
              [videoMuted]="voice.videoMuted()"
              [screenSharing]="voice.sharingScreen()"
              [audioLocked]="audioLocked()"
              [videoLocked]="videoLocked()"
              [screenLocked]="screenLocked()"
              [fullscreenActive]="stageFullscreen()"
              [fullscreenAvailable]="canEnterFullscreen()"
              [chatOpen]="chatOpen()"
              (openChat)="openChat.emit()"
              (toggleAudio)="onToggleAudio()"
              (toggleVideo)="onToggleVideo()"
              (toggleScreen)="onToggleScreen()"
              (enterFullscreen)="enterStage()"
              (exitFullscreen)="exitStage()"
              (hangup)="leaveCall()"
              (toggleDevices)="onToggleDevices()"
            />
          </div>
        }
      }
    </div>

    @if (voice.pickerOpen()) {
      <app-screen-share-picker
        [sources]="voice.pickerSources()"
        [loading]="voice.pickerLoading()"
        [error]="voice.pickerError()"
        [qualityId]="voice.screenQualityId()"
        [qualities]="voice.availableScreenPresets()"
        (select)="onPickDesktopSource($event)"
        (cancel)="voice.cancelDesktopPicker()"
        (qualityChange)="onPickerQuality($event)"
      />
    }

    @if (stageFullscreen()) {
      <div
        id="voice-stage-overlay"
        class="voice-stage-overlay voice-stage-overlay--active"
        (mousemove)="onStageMouseMove($event)"
      >
        <video
          #stageVideo
          class="h-full w-full object-contain bg-black"
          autoplay
          playsinline
          [muted]="true"
          [hicallStream]="focusedTile()?.stream ?? null"
        ></video>

        @if (focusedTile() && !stageIsLocal() && (focusedTile()!.kind === 'screen' || focusedTile()!.kind === 'participant')) {
          <div class="screen-volume absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/70 px-3 py-2">
            <button type="button" class="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/20"
              [attr.aria-label]="tileVolume(focusedTile()!) === 0 ? 'Ouvir só para mim' : 'Silenciar só para mim'"
              [attr.aria-pressed]="tileVolume(focusedTile()!) === 0" (click)="toggleTileMute(focusedTile()!)">
            @if (tileVolume(focusedTile()!) === 0) {
              <svg lucideVolumeX class="h-4 w-4 shrink-0 text-white"></svg>
            } @else {
              <svg lucideVolume2 class="h-4 w-4 shrink-0 text-white"></svg>
            }
            </button>
            <input
              class="screen-volume__range screen-volume__range--wide"
              type="range"
              min="0"
              max="1"
              step="0.01"
              [value]="tileVolume(focusedTile()!)"
              [title]="focusedTile()!.kind === 'screen' ? 'Volume da transmissão' : 'Volume da voz'"
              (input)="onTileVolumeInput($event, focusedTile()!)"
            />
          </div>
        }

        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-6 transition-opacity duration-300"
          [class.opacity-0]="!stageControlsVisible()"
          [class.pointer-events-none]="!stageControlsVisible()"
          [class.opacity-100]="stageControlsVisible()"
          [class.pointer-events-auto]="stageControlsVisible()"
        >
          <app-voice-controls
            [audioMuted]="voice.audioMuted()"
            [videoMuted]="voice.videoMuted()"
            [screenSharing]="voice.sharingScreen()"
            [audioLocked]="audioLocked()"
            [videoLocked]="videoLocked()"
            [screenLocked]="screenLocked()"
            [fullscreenActive]="stageFullscreen()"
            [fullscreenAvailable]="canEnterFullscreen()"
            [chatOpen]="chatOpen()"
            [overlay]="true"
            (openChat)="openChat.emit()"
            (toggleAudio)="onToggleAudio()"
            (toggleVideo)="onToggleVideo()"
            (toggleScreen)="onToggleScreen()"
            (enterFullscreen)="enterStage()"
            (exitFullscreen)="exitStage()"
            (hangup)="leaveCall()"
            (toggleDevices)="onToggleDevices()"
          />
        </div>
      </div>
    }

    @if (voice.inCall() && devicesOpen()) {
      <div
        class="absolute inset-x-3 bottom-24 z-[120] mx-auto flex w-[min(20rem,calc(100%-1.5rem))] flex-col gap-2.5 rounded-xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-xl"
        (mousedown)="$event.stopPropagation()"
      >
        <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Dispositivos</p>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-zinc-400">Microfone</span>
          <select
            class="h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            name="hicall-mic"
            [ngModel]="voice.inputDeviceId()"
            (ngModelChange)="onInputDeviceId($event)"
          >
            @for (device of voice.audioInputs(); track device.deviceId) {
              <option [value]="device.deviceId">{{ device.label || 'Microfone' }}</option>
            } @empty {
              <option value="" disabled>Nenhum microfone encontrado</option>
            }
          </select>
          @if (bluetoothMicHint()) {
            <p class="text-[11px] leading-snug text-amber-200">
              Microfone de fone Bluetooth deixa todo o som abafado. Para ouvir em alta qualidade, escolha outro microfone.
            </p>
          }
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-zinc-400">Saída de áudio</span>
          <select
            class="h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            name="hicall-output"
            [ngModel]="voice.outputDeviceId()"
            (ngModelChange)="onOutputDeviceId($event)"
          >
            <option value="">Padrão do sistema</option>
            @for (device of voice.audioOutputs(); track device.deviceId) {
              <option [value]="device.deviceId">{{ device.label || 'Saída' }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-zinc-400">Qualidade da tela</span>
          <select
            class="h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            name="hicall-screen-quality"
            [ngModel]="voice.screenQualityId()"
            (ngModelChange)="onScreenQualityId($event)"
          >
            @for (option of voice.availableScreenPresets(); track option.id) {
              <option [value]="option.id">{{ option.label }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-zinc-400">Redutor de ruído HiCall</span>
          <select
            class="h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            name="hicall-noise"
            [ngModel]="voice.noiseFilterMode()"
            (ngModelChange)="onNoiseFilterId($event)"
          >
            @for (option of noiseFilterOptions; track option.id) {
              <option [value]="option.id">{{ option.label }}</option>
            }
          </select>
          <span class="text-xs text-zinc-500">O modo HiCall usa RNNoise apenas nas vozes; o som das transmissões é preservado.</span>
        </label>
      </div>
    }
  `,
})
export class VoicePanelComponent implements OnDestroy {
  readonly server = input.required<Server>();
  readonly channel = input.required<Channel>();
  readonly chatOpen = input(true);
  readonly openChat = output<void>();

  @ViewChild('stageVideo') stageVideoRef?: ElementRef<HTMLVideoElement>;

  readonly voice = inject(VoiceRtcService);
  private readonly signaling = inject(VoiceSignalingService);
  private readonly destroyRef = inject(DestroyRef);
  readonly desktopSetupUrl = DESKTOP_SETUP_URL;

  readonly peerCount = signal(0);
  readonly focusedTileKey = signal<string | null>(null);
  readonly stageFullscreen = signal(false);
  readonly stageControlsVisible = signal(false);
  readonly stageIsLocal = signal(false);
  readonly devicesOpen = signal(false);
  readonly noiseFilterOptions: { id: NoiseFilterMode; label: string }[] = [
    { id: 'off', label: 'Desligado' },
    { id: 'standard', label: 'Padrão do dispositivo' },
    { id: 'high', label: 'HiCall — meu microfone' },
    { id: 'post', label: 'HiCall — meu microfone e vozes recebidas' },
  ];
  private readonly screenVolumes = signal<Record<number, number>>({});
  private readonly peerVolumes = signal<Record<number, number>>({});
  private readonly screenAudioElements = new Map<number, HTMLAudioElement>();
  private readonly peerAudioElements = new Map<number, HTMLAudioElement>();
  private readonly lastAudibleVolumes = new Map<string, number>();

  readonly participants = computed(() => this.voice.participants());
  readonly perms = computed(() => permissionsOf(this.server()));
  readonly canKickCall = computed(() => this.perms().can_kick_call);
  readonly canMuteCall = computed(() => this.perms().can_mute_call);
  readonly audioLocked = computed(() => this.perms().deny_voice || this.voice.forceMuted());
  readonly videoLocked = computed(() => this.perms().deny_camera);
  readonly screenLocked = computed(() => this.perms().deny_screen);
  readonly gridTiles = computed((): VoiceGridTile[] => buildVoiceGridTiles(this.participants()));

  readonly focusedTile = computed(() => {
    const key = this.focusedTileKey();
    if (!key) {
      return null;
    }
    return this.gridTiles().find((tile) => tile.key === key) ?? null;
  });

  readonly gridClass = computed(() => {
    const count = this.gridTiles().length;
    if (count <= 1) {
      return 'voice-grid voice-grid--1';
    }
    if (count === 2) {
      return 'voice-grid voice-grid--2';
    }
    if (count === 3) {
      return 'voice-grid voice-grid--3';
    }
    if (count === 4) {
      return 'voice-grid voice-grid--4';
    }
    return 'voice-grid voice-grid--many';
  });

  readonly canEnterFullscreen = computed(() => {
    const tile = this.focusedTile();
    return tile != null && tile.showVideo && tile.stream != null;
  });

  readonly bluetoothMicHint = computed(() => {
    const selected = this.voice.inputDeviceId();
    const device = this.voice.audioInputs().find((entry) => entry.deviceId === selected);
    return /hands-?free/i.test(device?.label ?? '');
  });

  private controlsHideTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    let previousChannelId: number | null = null;

    effect(() => {
      const channelId = this.channel().id;

      if (previousChannelId !== null && previousChannelId !== channelId && this.voice.inCall()) {
        void this.leaveCall();
      }

      previousChannelId = channelId;

      if (!this.voice.inCall()) {
        this.refreshPeerCount(channelId);
      }
    });

    effect(() => {
      const perms = this.perms();
      this.voice.setCallRestrictions({
        denyVoice: perms.deny_voice,
        denyScreen: perms.deny_screen,
        denyCamera: perms.deny_camera,
      });
    });

    effect(() => {
      const key = this.focusedTileKey();
      const tiles = this.gridTiles();
      if (key && !tiles.some((tile) => tile.key === key)) {
        this.focusedTileKey.set(null);
        if (this.stageFullscreen()) {
          this.exitStage(false);
        }
      }
    });

    effect(() => {
      this.focusedTile();
      if (this.stageFullscreen()) {
        setTimeout(() => this.attachStageStream(), 0);
      }
    });

    effect(() => {
      this.voice.outputDeviceId();
      this.applyOutputSinks();
    });

    interval(5_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.voice.inCall()) {
          this.refreshPeerCount(this.channel().id);
        }
      });
  }

  ngOnDestroy(): void {
    this.clearControlsHideTimeout();
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement && this.stageFullscreen()) {
      this.exitStage(false);
    }
  }

  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  screenVolume(userId: number): number {
    return this.screenVolumes()[userId] ?? 0;
  }

  peerVolume(userId: number): number {
    return this.peerVolumes()[userId] ?? 1;
  }

  tileVolume(tile: VoiceGridTile): number {
    return tile.kind === 'screen' ? this.screenVolume(tile.userId) : this.peerVolume(tile.userId);
  }

  screenAudioHintText(): string {
    const hint = this.voice.screenAudioHint();
    if (hint === 'leaky-update-app') {
      return 'O som do computador não foi enviado: nesta versão do app ele levaria as vozes da call. Atualize o HiCall.';
    }
    if (hint === 'audio-failed') {
      return 'Não foi possível capturar o som; a transmissão segue só com vídeo.';
    }
    if (hint === 'leaky') {
      if (isHicallDesktop()) {
        return 'O som do computador não foi enviado porque, neste Windows, ele levaria as vozes da call. A separação exige Windows 11.';
      }
      return 'O som do computador não foi enviado porque levaria as vozes da call. Compartilhe uma aba (o som dela vai limpo) ou use Chrome ou Edge atualizado no Windows 11.';
    }
    return '';
  }

  bindTileVideo(target: EventTarget | null, tile: VoiceGridTile): void {
    const video = target as HTMLVideoElement | null;
    if (!video) {
      return;
    }
    video.muted = true;
    video.volume = 0;
    this.applyPreservesPitch(video);
  }

  bindScreenAudio(target: EventTarget | null, userId: number): void {
    const audio = target as HTMLAudioElement | null;
    if (!audio) {
      return;
    }
    this.screenAudioElements.set(userId, audio);
    this.applyPreservesPitch(audio);
    this.applyScreenAudio(userId);
    this.applySink(audio);
    void audio.play().catch(() => undefined);
  }

  bindPeerAudio(target: EventTarget | null, userId: number): void {
    const audio = target as HTMLAudioElement | null;
    if (!audio) {
      return;
    }
    this.peerAudioElements.set(userId, audio);
    this.applyPreservesPitch(audio);
    this.applyPeerAudio(userId);
    this.applySink(audio);
    void audio.play().catch(() => undefined);
  }

  onTileVolumeInput(event: Event, tile: VoiceGridTile): void {
    event.stopPropagation();
    const value = Number((event.target as HTMLInputElement).value);
    this.setTileVolume(tile, value);
  }

  toggleTileMute(tile: VoiceGridTile): void {
    const key = `${tile.kind}-${tile.userId}`;
    this.setTileVolume(tile, this.tileVolume(tile) > 0 ? 0 : (this.lastAudibleVolumes.get(key) ?? 1));
  }

  tileAudioLabel(tile: VoiceGridTile): string {
    return (this.tileVolume(tile) === 0 ? 'Ouvir ' : 'Silenciar ')
      + (tile.kind === 'screen' ? 'transmissão só para mim' : 'voz só para mim');
  }

  private setTileVolume(tile: VoiceGridTile, value: number): void {
    const volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    if (volume > 0) {
      this.lastAudibleVolumes.set(`${tile.kind}-${tile.userId}`, volume);
    }
    if (tile.kind === 'screen') {
      this.screenVolumes.update((current) => ({ ...current, [tile.userId]: volume }));
      this.applyScreenAudio(tile.userId);
    } else {
      this.peerVolumes.update((current) => ({ ...current, [tile.userId]: volume }));
      this.applyPeerAudio(tile.userId);
    }
  }

  onToggleDevices(): void {
    const next = !this.devicesOpen();
    this.devicesOpen.set(next);
    if (next) {
      void this.voice.refreshDevices();
    }
  }

  onInputDeviceId(deviceId: string): void {
    void this.voice.setInputDevice(deviceId);
  }

  onOutputDeviceId(deviceId: string): void {
    this.voice.setOutputDevice(deviceId);
    void this.applyOutputSinks();
  }

  onScreenQualityId(id: string): void {
    void this.voice.setScreenQuality(id as ScreenQualityId);
  }

  onPickerQuality(id: ScreenQualityId): void {
    void this.voice.setScreenQuality(id);
  }

  onNoiseFilterId(mode: string): void {
    void this.voice.setNoiseFilterMode(mode as NoiseFilterMode);
  }

  private applyScreenAudio(userId: number): void {
    this.applyVolume(this.screenAudioElements.get(userId), this.screenVolume(userId));
  }

  private applyPeerAudio(userId: number): void {
    this.applyVolume(this.peerAudioElements.get(userId), this.peerVolume(userId));
  }

  private applyVolume(el: HTMLMediaElement | undefined, volume: number): void {
    if (!el) {
      return;
    }
    el.muted = volume === 0;
    el.volume = volume;
    this.applyPreservesPitch(el);
  }

  private applyPreservesPitch(el: HTMLMediaElement): void {
    if ('preservesPitch' in el) {
      el.preservesPitch = true;
    }
  }

  private applySink(el: HTMLMediaElement): void {
    const sinkId = this.voice.outputDeviceId();
    const withSink = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
    if (typeof withSink.setSinkId !== 'function') {
      return;
    }
    void withSink.setSinkId(sinkId).catch(() => {
      this.voice.error.set('O navegador não deixou trocar a saída de áudio.');
    });
  }

  private applyOutputSinks(): void {
    for (const audio of this.peerAudioElements.values()) {
      this.applySink(audio);
    }
    for (const audio of this.screenAudioElements.values()) {
      this.applySink(audio);
    }
  }

  tileColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 22% 24%)`;
  }

  isTileFocusable(tile: VoiceGridTile): boolean {
    return tile.kind === 'screen' || tile.showVideo;
  }

  selectTile(tile: VoiceGridTile): void {
    if (!this.isTileFocusable(tile)) {
      return;
    }

    this.focusedTileKey.update((current) => (current === tile.key ? null : tile.key));
  }

  linkStatusLabel(): string {
    const status = this.voice.linkStatus();
    if (status === 'connected') {
      return 'Conectado';
    }
    if (status === 'reconnecting') {
      return 'Reconectando…';
    }
    if (status === 'connecting') {
      return 'Conectando…';
    }
    return 'Desconectado';
  }

  async joinCall(): Promise<void> {
    this.focusedTileKey.set(null);
    this.devicesOpen.set(false);
    this.screenVolumes.set({});
    this.peerVolumes.set({});
    this.screenAudioElements.clear();
    this.peerAudioElements.clear();
    await this.voice.join(this.channel().id);
  }

  async leaveCall(): Promise<void> {
    this.focusedTileKey.set(null);
    this.devicesOpen.set(false);
    this.screenVolumes.set({});
    this.peerVolumes.set({});
    this.screenAudioElements.clear();
    this.peerAudioElements.clear();
    this.exitStage(false);
    await this.voice.leave();
    this.refreshPeerCount(this.channel().id);
  }

  onToggleAudio(): void {
    this.voice.toggleAudio();
    this.showStageControlsBriefly();
  }

  mutePeer(userId: number): void {
    this.signaling.muteInCall(this.channel().id, userId, true).subscribe({
      next: (res) => this.voice.noteRemoteForceMuted(userId, res.force_muted),
      error: (err: unknown) => this.voice.error.set(extractErrorMessage(err, 'Não foi possível mutar.')),
    });
  }

  unmutePeer(userId: number): void {
    this.signaling.muteInCall(this.channel().id, userId, false).subscribe({
      next: (res) => this.voice.noteRemoteForceMuted(userId, res.force_muted),
      error: (err: unknown) => this.voice.error.set(extractErrorMessage(err, 'Não foi possível desmutar.')),
    });
  }

  kickPeer(userId: number): void {
    this.signaling.kickFromCall(this.channel().id, userId).subscribe({
      error: (err: unknown) => this.voice.error.set(extractErrorMessage(err, 'Não foi possível expulsar da chamada.')),
    });
  }

  async onToggleVideo(): Promise<void> {
    await this.voice.toggleVideo();
    this.showStageControlsBriefly();
  }

  async onToggleScreen(): Promise<void> {
    const focusedKey = this.focusedTileKey();
    await this.voice.toggleScreenShare();

    if (!this.voice.sharingScreen() && !this.voice.anyScreenSharing() && !this.voice.pickerOpen()) {
      if (focusedKey?.startsWith('screen-')) {
        this.focusedTileKey.set(null);
      }
      this.exitStage();
    }

    this.showStageControlsBriefly();
  }

  async onPickDesktopSource(event: ScreenSharePickEvent): Promise<void> {
    await this.voice.confirmDesktopSource(event.sourceId, {
      includeSystemAudio: event.includeSystemAudio,
    });
    this.showStageControlsBriefly();
  }

  enterStage(): void {
    const tile = this.focusedTile();
    if (!tile?.stream) {
      return;
    }

    this.stageIsLocal.set(tile.isLocal);
    this.stageFullscreen.set(true);
    this.showStageControlsBriefly();

    setTimeout(() => this.attachStageStream(), 0);

    const overlay = document.getElementById('voice-stage-overlay');
    if (overlay) {
      void overlay.requestFullscreen?.().catch(() => {});
    }
  }

  exitStage(restore = true): void {
    if (document.fullscreenElement && restore) {
      void document.exitFullscreen().catch(() => {});
    }
    this.stageFullscreen.set(false);
    this.stageControlsVisible.set(false);
    this.clearControlsHideTimeout();
  }

  onStageMouseMove(event: MouseEvent): void {
    if (!this.stageFullscreen()) {
      return;
    }
    if (event.clientY >= window.innerHeight - BOTTOM_CONTROLS_ZONE_PX) {
      this.stageControlsVisible.set(true);
      this.scheduleHideStageControls();
    }
  }

  private attachStageStream(): void {
    const video = this.stageVideoRef?.nativeElement;
    if (video) {
      video.muted = true;
      this.applyPreservesPitch(video);
    }
  }

  private refreshPeerCount(channelId: number): void {
    this.signaling.peers(channelId).subscribe({
      next: (peers) => this.peerCount.set(peers.length),
      error: () => this.peerCount.set(0),
    });
  }

  private showStageControlsBriefly(): void {
    if (!this.stageFullscreen()) {
      return;
    }
    this.stageControlsVisible.set(true);
    this.scheduleHideStageControls();
  }

  private scheduleHideStageControls(): void {
    this.clearControlsHideTimeout();
    this.controlsHideTimeout = setTimeout(() => {
      this.stageControlsVisible.set(false);
    }, CONTROLS_HIDE_MS);
  }

  private clearControlsHideTimeout(): void {
    if (this.controlsHideTimeout) {
      clearTimeout(this.controlsHideTimeout);
      this.controlsHideTimeout = null;
    }
  }
}
