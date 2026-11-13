import { Injectable, NgZone, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  captureDesktopSource,
  getHicallDesktop,
  isHicallDesktop,
  acquireDisplayMedia,
  pickScreenShareAudioTrack,
  prepareScreenShareAudioTrack,
  isLikelyMicrophoneAudioTrack,
  type HicallDesktopSource,
  type HicallDesktopSourceType,
} from '../desktop/hicall-desktop';
import { AuthService } from './auth.service';
import { VoiceSignalingService } from './voice-signaling.service';
import { VoiceParticipant, VoicePeer, VoiceSignal } from '../models/voice.model';
import {
  coerceSharingFlag,
  deriveVoiceLinkStatus,
  isPeerConnectionUp,
  mergeSharingFromPoll,
  shouldAcceptRemoteOffer,
  type VoiceLinkStatus,
} from '../voice/voice-share.util';
import { OutboundVideoPump } from '../voice/voice-video-pump';
import {
  SCREEN_CONTENT_HINT,
  outboundVideoEncodingsForTrack,
  screenCaptureVideoConstraints,
  screenTrackApplyConstraints,
} from '../voice/voice-video-contract';
import {
  fallbackScreenEncodeCaps,
  probeScreenEncodeCaps,
  readStoredScreenQualityId,
  resolveScreenQuality,
  visibleScreenQualityOptions,
  writeStoredScreenQualityId,
  type ResolvedScreenQuality,
  type ScreenEncodeCaps,
  type ScreenQualityId,
  type ScreenQualityOption,
} from '../voice/screen-quality';
import {
  InboundRnnoiseBank,
  MicRnnoisePipeline,
  micCaptureConstraints,
  readStoredNoiseFilterMode,
  usesInboundRnnoise,
  usesOutboundRnnoise,
  voicePlaybackTracks,
  writeStoredNoiseFilterMode,
  type NoiseFilterMode,
} from '../voice/mic-noise-filter';
import {
  classifyScreenAudio,
  leakyScreenAudioHint,
  type ScreenAudioClassification,
  type ScreenAudioHint,
} from '../voice/screen-audio-policy';
import { VoiceSpeakingMonitor, type SpeakingSource } from '../voice/voice-speaking';
import { playCallChime } from '../voice/call-chimes';
import { applyScreenAudioSenderParams, tuneScreenAudioSdp } from '../voice/screen-audio-encode';
import {
  emptyPump,
  inboundFromRow,
  mediaSourceFromRow,
  outboundFromRow,
  pickMediaSource,
  pickVideoRtp,
  statsReportToRows,
  summarizeProbe,
  type CaptureLayer,
  type ProbeTick,
  type PumpLayer,
} from '../voice/voice-video-stats';
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const SCREEN_STOP_GRACE_MS = 8_000;

const POLL_MS = 1_000;
const POLL_FAST_MS = 200;
const POLL_FAST_FOR_MS = 20_000;
const HEARTBEAT_MS = 10_000;

export type { VoiceLinkStatus };

@Injectable({ providedIn: 'root' })
export class VoiceRtcService {
  private readonly signaling = inject(VoiceSignalingService);
  private readonly auth = inject(AuthService);
  private readonly ngZone = inject(NgZone);

  readonly participants = signal<VoiceParticipant[]>([]);
  readonly connecting = signal(false);
  readonly inCall = signal(false);
  readonly joinedChannelId = signal<number | null>(null);
  readonly linkStatus = signal<VoiceLinkStatus>('idle');
  readonly error = signal<string | null>(null);
  readonly audioMuted = signal(false);
  readonly videoMuted = signal(true);
  readonly sharingScreen = signal(false);
  readonly forceMuted = signal(false);
  readonly pickerOpen = signal(false);
  readonly pickerSources = signal<HicallDesktopSource[]>([]);
  readonly pickerLoading = signal(false);
  readonly pickerError = signal<string | null>(null);
  readonly audioInputs = signal<MediaDeviceInfo[]>([]);
  readonly audioOutputs = signal<MediaDeviceInfo[]>([]);
  readonly inputDeviceId = signal('');
  readonly outputDeviceId = signal('');
  readonly screenQualityId = signal<ScreenQualityId>(readStoredScreenQualityId());
  readonly availableScreenPresets = signal<ScreenQualityOption[]>(
    visibleScreenQualityOptions(fallbackScreenEncodeCaps()),
  );
  readonly noiseFilterMode = signal<NoiseFilterMode>(readStoredNoiseFilterMode());
  readonly speakingUserIds = signal<number[]>([]);
  readonly screenAudioHint = signal<ScreenAudioHint>(null);

  private channelId: number | null = null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections = new Map<number, RTCPeerConnection>();
  private videoTransceivers = new Map<number, RTCRtpTransceiver>();
  private screenAudioTransceivers = new Map<number, RTCRtpTransceiver>();
  private remoteStreams = new Map<number, MediaStream>();
  private remoteVoiceStreams = new Map<number, MediaStream>();
  private remoteScreenStreams = new Map<number, MediaStream>();
  private remoteScreenSharing = new Map<number, boolean>();
  private remoteCameraOn = new Map<number, boolean>();
  private pendingIce = new Map<number, RTCIceCandidateInit[]>();
  private iceOutbox = new Map<number, { candidates: RTCIceCandidateInit[]; timer: ReturnType<typeof setTimeout> | null }>();
  private makingOffer = new Set<number>();
  private renegotiateQueued = new Set<number>();
  private renegotiateListeners = new Map<number, () => void>();
  private offerRetries = new Map<number, number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastSignalId = 0;
  private lastPollAt = 0;
  private joinedAtMs = 0;
  private videoSendStreams = new Map<number, MediaStream>();
  private peerNames = new Map<number, string>();
  private activePeerIds = new Set<number>();
  private watchingDevices = false;
  private videoPump: OutboundVideoPump | null = null;
  private screenStopGraceUntil = new Map<number, number>();
  private screenStartThisTick = new Set<number>();
  private screenStopThisTick = new Set<number>();
  private restrictions = {
    denyVoice: false,
    denyScreen: false,
    denyCamera: false,
  };
  private leavingAfterKick = false;
  private screenEncodeCaps: ScreenEncodeCaps = fallbackScreenEncodeCaps();
  private readonly rnnoise = new MicRnnoisePipeline();
  private readonly inboundRnnoise = new InboundRnnoiseBank();
  private readonly speaking = new VoiceSpeakingMonitor();
  private lastDesktopSourceType: HicallDesktopSourceType | null = null;
  private includeWindowSystemAudio = false;
  private screenAudioSent = false;
  private screenAudioPolicy: (ScreenAudioClassification & { sent: boolean }) | null = null;
  private pollBusy = false;
  private pollQueued = false;
  private chimesArmed = false;
  private selfJoinChimed = false;
  private remoteForceMuted = new Map<number, boolean>();
  private filteredMicTrack: MediaStreamTrack | null = null;
  private readonly onDeviceChange = (): void => {
    void this.refreshDevices();
  };

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated() && this.inCall()) {
        void this.leave();
      }
    });
  }

  async join(channelId: number): Promise<void> {
    if (this.inCall()) {
      await this.leave();
    }

    this.channelId = channelId;
    this.connecting.set(true);
    this.linkStatus.set('connecting');
    this.chimesArmed = false;
    this.selfJoinChimed = false;
    this.error.set(null);

    try {
      this.installDebugHook();
      this.ensureVideoPump();
      this.screenQualityId.set(readStoredScreenQualityId());
      void this.refreshScreenEncodeCaps();
      const savedMic = this.readStoredDevice('hicall.mic');
      const savedOut = this.readStoredDevice('hicall.output');
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: micCaptureConstraints(savedMic || undefined, this.noiseFilterMode()),
        video: false,
      });
      this.audioMuted.set(false);
      this.videoMuted.set(true);
      if (this.restrictions.denyVoice) {
        this.applyForceMute();
      } else {
        this.forceMuted.set(false);
      }
      const micId = this.cameraStream.getAudioTracks()[0]?.getSettings()?.deviceId ?? savedMic;
      this.inputDeviceId.set(micId);
      if (savedOut) {
        this.outputDeviceId.set(savedOut);
      }
      void this.refreshDevices();
      this.watchDevices(true);

      const peers = await firstValueFrom(this.signaling.join(channelId));
      this.joinedAtMs = Date.now();
      this.inCall.set(true);
      this.joinedChannelId.set(channelId);
      this.startTimers();

      for (const peer of peers ?? []) {
        this.peerNames.set(peer.user_id, peer.user.name);
        this.activePeerIds.add(peer.user_id);
        const sharing = coerceSharingFlag(peer.sharing_screen);
        this.remoteScreenSharing.set(peer.user_id, sharing);
        this.remoteCameraOn.set(peer.user_id, coerceSharingFlag(peer.camera_on));
        this.remoteForceMuted.set(peer.user_id, peer.force_muted === true);
      }
      await Promise.all(
        (peers ?? []).map((peer) => this.connectToPeer(peer.user_id, this.shouldInitiate(peer.user_id))),
      );
      void this.syncOutboundMicTrack();

      this.refreshParticipants();
      this.updateLinkStatus();
    } catch (err) {
      this.connecting.set(false);
      this.linkStatus.set('idle');
      this.error.set(this.readError(err));
      await this.leave();
    }
  }

  async leave(): Promise<void> {
    const channelId = this.channelId;
    const wasInCall = this.inCall();
    this.stopTimers();
    this.pollBusy = false;
    this.pollQueued = false;

    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();
    this.videoTransceivers.clear();
    this.screenAudioTransceivers.clear();
    this.videoSendStreams.clear();
    this.remoteStreams.clear();
    this.remoteVoiceStreams.clear();
    this.remoteScreenStreams.clear();
    this.remoteScreenSharing.clear();
    this.remoteCameraOn.clear();
    this.remoteForceMuted.clear();
    this.pendingIce.clear();
    this.clearIceOutbox();
    this.makingOffer.clear();
    this.renegotiateQueued.clear();
    this.renegotiateListeners.clear();
    this.offerRetries.clear();
    this.activePeerIds.clear();

    this.rnnoise.destroy();
    this.inboundRnnoise.destroy();
    this.speaking.stop();
    this.speakingUserIds.set([]);
    this.filteredMicTrack = null;
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.videoPump?.stop();
    this.videoPump = null;
    this.screenStopGraceUntil.clear();
    this.screenStartThisTick.clear();
    this.screenStopThisTick.clear();
    this.cameraStream = null;
    this.screenStream = null;
    this.sharingScreen.set(false);
    this.screenAudioHint.set(null);
    this.screenAudioSent = false;
    this.screenAudioPolicy = null;
    this.lastDesktopSourceType = null;
    this.includeWindowSystemAudio = false;
    this.closeDesktopPicker();
    this.audioMuted.set(false);
    this.videoMuted.set(true);
    this.forceMuted.set(false);
    this.leavingAfterKick = false;
    this.watchDevices(false);
    this.inCall.set(false);
    this.joinedChannelId.set(null);
    this.connecting.set(false);
    this.linkStatus.set('idle');
    this.chimesArmed = false;
    this.selfJoinChimed = false;
    this.participants.set([]);
    this.lastSignalId = 0;
    if (wasInCall) {
      void playCallChime('leave', this.outputDeviceId());
    }

    if (channelId) {
      try {
        await firstValueFrom(this.signaling.leave(channelId));
      } catch {
        /* ignore */
      }
    }

    this.channelId = null;
  }

  setCallRestrictions(restrictions: { denyVoice?: boolean; denyScreen?: boolean; denyCamera?: boolean }): void {
    this.restrictions = {
      denyVoice: restrictions.denyVoice ?? this.restrictions.denyVoice,
      denyScreen: restrictions.denyScreen ?? this.restrictions.denyScreen,
      denyCamera: restrictions.denyCamera ?? this.restrictions.denyCamera,
    };

    if (!this.inCall()) {
      return;
    }

    if (this.restrictions.denyVoice) {
      this.applyForceMute();
    }

    if (this.restrictions.denyCamera && !this.videoMuted()) {
      this.videoMuted.set(true);
      this.cameraStream?.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
      void this.broadcastMediaState();
      this.refreshParticipants();
    }

    if (this.restrictions.denyScreen && this.sharingScreen()) {
      void this.stopScreenShare();
    }
  }

  toggleAudio(): boolean {
    if (this.forceMuted() || this.restrictions.denyVoice) {
      this.applyForceMute();
      this.error.set('Seu microfone está bloqueado neste servidor.');
      return true;
    }
    if (!this.cameraStream) {
      return this.audioMuted();
    }
    const next = !this.audioMuted();
    this.audioMuted.set(next);
    this.cameraStream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    if (this.filteredMicTrack) {
      this.filteredMicTrack.enabled = !next;
    }
    this.refreshParticipants();
    return next;
  }

  async refreshDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.audioInputs.set(devices.filter((device) => device.kind === 'audioinput' && device.deviceId));
    this.audioOutputs.set(devices.filter((device) => device.kind === 'audiooutput' && device.deviceId));
  }

  async setInputDevice(deviceId: string): Promise<void> {
    const previous = this.inputDeviceId();
    this.inputDeviceId.set(deviceId);
    this.writeStoredDevice('hicall.mic', deviceId);
    if (!this.inCall() || !this.cameraStream) {
      return;
    }

    let nextStream: MediaStream;
    try {
      nextStream = await this.captureMicrophone(deviceId);
    } catch (err) {
      this.inputDeviceId.set(previous);
      this.writeStoredDevice('hicall.mic', previous);
      this.error.set(this.readError(err));
      return;
    }
    await this.swapMicrophoneFromStream(nextStream, () => {
      this.inputDeviceId.set(previous);
      this.writeStoredDevice('hicall.mic', previous);
    });
  }

  async setScreenQuality(id: ScreenQualityId): Promise<void> {
    this.screenQualityId.set(id);
    writeStoredScreenQualityId(id);
    if (!this.sharingScreen() || !this.screenStream) {
      return;
    }
    const screenTrack = this.screenStream.getVideoTracks()[0];
    if (screenTrack) {
      await this.constrainScreenTrack(screenTrack);
    }
    await this.applyVideoSenderParamsAll();
  }

  async setNoiseFilterMode(mode: NoiseFilterMode): Promise<void> {
    const previous = this.noiseFilterMode();
    this.noiseFilterMode.set(mode);
    writeStoredNoiseFilterMode(mode);
    if (!this.inCall() || !this.cameraStream) {
      return;
    }
    if (previous === mode || (usesOutboundRnnoise(previous) && usesOutboundRnnoise(mode))) {
      await this.syncOutboundMicTrack();
      await this.syncInboundVoiceFilters();
      return;
    }
    const deviceId = this.inputDeviceId() || this.cameraStream.getAudioTracks()[0]?.getSettings()?.deviceId;
    let nextStream: MediaStream;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        audio: micCaptureConstraints(deviceId || undefined, mode, !!deviceId),
        video: false,
      });
    } catch (err) {
      this.noiseFilterMode.set(previous);
      writeStoredNoiseFilterMode(previous);
      this.error.set(this.readError(err));
      return;
    }
    await this.swapMicrophoneFromStream(nextStream, () => {
      this.noiseFilterMode.set(previous);
      writeStoredNoiseFilterMode(previous);
    });
    await this.syncInboundVoiceFilters();
  }

  sendHeldScreenAudio(): void {
    if (!this.sharingScreen() || this.screenAudioSent || !this.screenStream) {
      return;
    }
    const track = pickScreenShareAudioTrack(
      this.screenStream,
      this.cameraStream?.getAudioTracks()[0] ?? null,
    );
    if (!track || track.readyState !== 'live') {
      return;
    }
    prepareScreenShareAudioTrack(track);
    track.onended = () => this.clearOutboundScreenAudio();
    this.screenAudioSent = true;
    this.screenAudioHint.set(null);
    if (this.screenAudioPolicy) {
      this.screenAudioPolicy = { ...this.screenAudioPolicy, sent: true };
    }
    void this.replaceScreenAudioTrack(track, true);
  }

  setOutputDevice(deviceId: string): void {
    this.outputDeviceId.set(deviceId);
    this.writeStoredDevice('hicall.output', deviceId);
  }

  private async swapMicrophoneFromStream(
    nextStream: MediaStream,
    rollback: () => void,
  ): Promise<void> {
    const newTrack = nextStream.getAudioTracks()[0];
    if (!newTrack || !this.cameraStream) {
      nextStream.getTracks().forEach((track) => track.stop());
      rollback();
      return;
    }
    newTrack.enabled = !this.audioMuted();
    const oldTrack = this.cameraStream.getAudioTracks()[0] ?? null;
    if (oldTrack) {
      this.cameraStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.cameraStream.addTrack(newTrack);
    nextStream.getTracks().forEach((track) => {
      if (track !== newTrack) {
        track.stop();
      }
    });
    await this.syncOutboundMicTrack();
  }

  private async captureMicrophone(deviceId: string): Promise<MediaStream> {
    const mode = this.noiseFilterMode();
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: micCaptureConstraints(deviceId, mode, true),
        video: false,
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name !== 'OverconstrainedError' && name !== 'NotFoundError') {
        throw err;
      }
      return navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      });
    }
  }

  private readStoredDevice(key: string): string {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  }

  private writeStoredDevice(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  private watchDevices(on: boolean): void {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }
    if (on && !this.watchingDevices) {
      navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange);
      this.watchingDevices = true;
    }
    if (!on && this.watchingDevices) {
      navigator.mediaDevices.removeEventListener('devicechange', this.onDeviceChange);
      this.watchingDevices = false;
    }
  }

  async toggleVideo(): Promise<boolean> {
    if (!this.cameraStream || !this.inCall()) {
      return this.videoMuted();
    }

    if (this.videoMuted() && this.restrictions.denyCamera) {
      this.error.set('Você não pode ligar a câmera neste servidor.');
      return true;
    }

    if (this.videoMuted()) {
      let videoTrack = this.cameraStream.getVideoTracks()[0];
      if (!videoTrack) {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          videoTrack = videoStream.getVideoTracks()[0];
          this.cameraStream.addTrack(videoTrack);
        } catch (err) {
          this.error.set(this.readError(err));
          return true;
        }
      } else {
        videoTrack.enabled = true;
      }
      this.videoMuted.set(false);
      if (!this.sharingScreen()) {
        await this.pumpLocalVideo();
      }
    } else {
      this.videoMuted.set(true);
      const videoTrack = this.cameraStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = false;
      }
      if (!this.sharingScreen()) {
        await this.pumpLocalVideo();
      }
    }

    await this.broadcastMediaState();
    this.refreshParticipants();
    return this.videoMuted();
  }

  async toggleScreenShare(): Promise<boolean> {
    if (!this.channelId || !this.inCall()) {
      return this.sharingScreen();
    }

    if (!this.sharingScreen() && this.restrictions.denyScreen) {
      this.error.set('Você não pode transmitir tela neste servidor.');
      return false;
    }

    if (this.sharingScreen()) {
      await this.stopScreenShare();
    } else if (this.pickerOpen()) {
      this.closeDesktopPicker();
    } else {
      await this.startScreenShare();
    }

    return this.sharingScreen();
  }

  async confirmDesktopSource(
    sourceId: string,
    options: { includeSystemAudio?: boolean } = {},
  ): Promise<void> {
    this.lastDesktopSourceType =
      this.pickerSources().find((source) => source.id === sourceId)?.type ?? null;
    this.includeWindowSystemAudio = options.includeSystemAudio === true;
    this.closeDesktopPicker();
    try {
      const { stream, audioFailed } = await captureDesktopSource(
        sourceId,
        screenCaptureVideoConstraints(this.resolvedScreenQuality()),
        { includeSystemAudio: this.includeWindowSystemAudio },
      );
      await this.applyScreenStream(stream, { audioFailed });
    } catch (err) {
      this.error.set(this.readError(err));
    }
  }

  cancelDesktopPicker(): void {
    this.closeDesktopPicker();
  }

  noteRemoteForceMuted(userId: number, muted: boolean): void {
    this.remoteForceMuted.set(userId, muted);
    this.refreshParticipants();
  }

  isSharingScreen(): boolean {
    return this.sharingScreen();
  }

  isAudioMuted(): boolean {
    return this.audioMuted();
  }

  isVideoMuted(): boolean {
    return this.videoMuted();
  }

  anyScreenSharing(): boolean {
    if (this.sharingScreen()) {
      return true;
    }
    return [...this.remoteScreenSharing.values()].some(Boolean);
  }

  getFocusedStream(userId: number, kind: 'participant' | 'screen'): MediaStream | null {
    const participant = this.participants().find((entry) => entry.userId === userId);
    if (!participant) {
      return null;
    }

    if (kind === 'screen') {
      return participant.screenStream;
    }

    if (participant.videoMuted || !participant.cameraStream) {
      return null;
    }

    const track = participant.cameraStream.getVideoTracks()[0];
    return track?.enabled ? participant.cameraStream : null;
  }

  private async startScreenShare(): Promise<void> {
    const channelId = this.channelId;
    if (!channelId) {
      return;
    }

    if (isHicallDesktop()) {
      await this.openDesktopPicker();
      return;
    }

    try {
      this.lastDesktopSourceType = null;
      this.includeWindowSystemAudio = false;
      const { stream, audioFailed } = await acquireDisplayMedia(
        screenCaptureVideoConstraints(this.resolvedScreenQuality()),
      );
      await this.applyScreenStream(stream, { audioFailed });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        return;
      }
      this.error.set(this.readError(err));
    }
  }

  private async openDesktopPicker(): Promise<void> {
    const desktop = getHicallDesktop();
    if (!desktop) {
      return;
    }

    this.pickerOpen.set(true);
    this.pickerLoading.set(true);
    this.pickerError.set(null);
    this.pickerSources.set([]);
    void this.refreshScreenEncodeCaps();

    try {
      const sources = await desktop.getSources();
      this.pickerSources.set(sources);
      if (sources.length === 0) {
        this.pickerError.set('Nenhuma janela ou monitor encontrado.');
      }
    } catch (err) {
      this.pickerError.set(this.readError(err));
    } finally {
      this.pickerLoading.set(false);
    }
  }

  private closeDesktopPicker(): void {
    this.pickerOpen.set(false);
    this.pickerLoading.set(false);
    this.pickerError.set(null);
    this.pickerSources.set([]);
  }

  private async applyScreenStream(
    stream: MediaStream,
    options: { audioFailed?: boolean } = {},
  ): Promise<void> {
    const channelId = this.channelId;
    if (!channelId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.screenStream = stream;
    const screenTrack = this.screenStream.getVideoTracks()[0];
    if (!screenTrack) {
      stream.getTracks().forEach((track) => track.stop());
      this.error.set('Não foi possível capturar o vídeo da tela.');
      return;
    }

    await this.constrainScreenTrack(screenTrack);
    screenTrack.onended = () => {
      void this.stopScreenShare();
    };

    this.stripMicrophoneFromScreenStream();
    this.screenAudioHint.set(null);
    this.screenAudioSent = false;
    const screenAudio = pickScreenShareAudioTrack(
      this.screenStream,
      this.cameraStream?.getAudioTracks()[0] ?? null,
    );
    const classified = classifyScreenAudio(screenTrack, screenAudio, this.lastDesktopSourceType);
    this.screenAudioPolicy = { ...classified, sent: false };

    if (screenAudio) {
      screenAudio.onended = () => this.clearOutboundScreenAudio();
    }

    if (options.audioFailed) {
      this.screenAudioHint.set('audio-failed');
    } else if (classified.kind === 'system-leaky') {
      this.screenAudioHint.set(leakyScreenAudioHint());
    } else if (
      screenAudio &&
      (classified.kind === 'tab' || classified.kind === 'app' || classified.kind === 'system-clean')
    ) {
      prepareScreenShareAudioTrack(screenAudio);
      this.screenAudioSent = true;
      this.screenAudioPolicy = { ...classified, sent: true };
    }

    this.sharingScreen.set(true);

    await this.pumpLocalVideo();
    await this.waitForLiveVideoTrack(screenTrack);
    await this.syncOutboundVideoTrack();
    await this.replaceScreenAudioTrack(this.outboundScreenAudioTrack(), true);
    await this.applyVideoSenderParamsAll();
    await this.broadcastMediaState();
    await firstValueFrom(this.signaling.setScreenSharing(channelId, true));
    this.refreshParticipants();
  }

  private clearOutboundScreenAudio(): void {
    this.screenAudioSent = false;
    this.screenAudioHint.set(null);
    if (this.screenAudioPolicy) {
      this.screenAudioPolicy = { ...this.screenAudioPolicy, sent: false };
    }
    void this.replaceScreenAudioTrack(null, false);
  }

  private async stopScreenShare(): Promise<void> {
    const channelId = this.channelId;
    const stopping = this.screenStream;
    this.screenStream = null;
    this.sharingScreen.set(false);
    this.screenAudioHint.set(null);
    this.screenAudioSent = false;
    this.screenAudioPolicy = null;
    this.lastDesktopSourceType = null;
    this.includeWindowSystemAudio = false;

    await this.pumpLocalVideo();
    await this.syncOutboundVideoTrack();
    stopping?.getTracks().forEach((track) => track.stop());
    await this.replaceScreenAudioTrack(null, false);
    await this.applyVideoSenderParamsAll();

    if (channelId) {
      await firstValueFrom(this.signaling.setScreenSharing(channelId, false));
      await this.broadcastMediaState();
    }

    this.refreshParticipants();
  }

  private async pumpLocalVideo(): Promise<void> {
    const pump = this.ensureVideoPump();
    if (this.sharingScreen() && this.screenStream) {
      await pump.setSource(null);
      return;
    }
    const camera = this.cameraStream?.getVideoTracks()[0];
    if (!this.videoMuted() && camera?.readyState === 'live' && camera.enabled) {
      await pump.setSource(this.cameraStream);
      return;
    }
    await pump.setSource(null);
  }

  private async waitForLiveVideoTrack(track: MediaStreamTrack, timeoutMs = 2_500): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const width = track.getSettings?.().width ?? 0;
      if (track.readyState === 'live' && typeof width === 'number' && width >= 2) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /** Troca o sender 1080p canvas ↔ 1080p nativo. Não é o replaceTrack 16×16 que trava o encoder. */
  private async syncOutboundVideoTrack(): Promise<void> {
    const track = this.outboundVideoTrack();
    for (const [remoteUserId, transceiver] of this.videoTransceivers.entries()) {
      const videoStream = this.videoSendStreams.get(remoteUserId) ?? new MediaStream();
      videoStream.getVideoTracks().forEach((existing) => {
        if (existing !== track) {
          videoStream.removeTrack(existing);
        }
      });
      if (!videoStream.getVideoTracks().includes(track)) {
        videoStream.addTrack(track);
      }
      this.videoSendStreams.set(remoteUserId, videoStream);
      if (transceiver.sender.track !== track) {
        await transceiver.sender.replaceTrack(track);
      }
      await this.applyVideoSenderParams(transceiver.sender);
    }
  }

  private outboundVideoPath(): 'native' | 'canvas' {
    if (this.sharingScreen() && this.screenStream) {
      return 'native';
    }
    return 'canvas';
  }

  private outboundVideoTrack(): MediaStreamTrack {
    const native =
      this.screenStream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null;
    if (this.sharingScreen() && native) {
      return native;
    }
    return this.ensureVideoPump().track;
  }

  private resolvedScreenQuality(): ResolvedScreenQuality {
    return resolveScreenQuality(this.screenQualityId(), this.screenEncodeCaps);
  }

  private async refreshScreenEncodeCaps(): Promise<void> {
    try {
      this.screenEncodeCaps = await probeScreenEncodeCaps();
    } catch {
      this.screenEncodeCaps = fallbackScreenEncodeCaps();
    }
    this.availableScreenPresets.set(visibleScreenQualityOptions(this.screenEncodeCaps));
  }

  private outboundMicTrack(): MediaStreamTrack | null {
    return this.filteredMicTrack ?? this.cameraStream?.getAudioTracks()[0] ?? null;
  }

  private async syncOutboundMicTrack(): Promise<void> {
    const raw = this.cameraStream?.getAudioTracks()[0] ?? null;
    if (!raw) {
      this.rnnoise.destroy();
      this.filteredMicTrack = null;
      await this.replaceMicOnPeers(null);
      return;
    }

    raw.enabled = !this.audioMuted();
    let outbound = raw;
    if (usesOutboundRnnoise(this.noiseFilterMode())) {
      outbound = await this.rnnoise.apply(raw);
      if (outbound === raw) {
        try {
          await raw.applyConstraints({
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
          });
        } catch {
          /* fallback nativo opcional */
        }
      }
    } else {
      this.rnnoise.destroy();
      this.filteredMicTrack = null;
    }

    if (outbound !== raw) {
      this.filteredMicTrack = outbound;
      outbound.enabled = !this.audioMuted();
    } else {
      this.filteredMicTrack = null;
    }
    await this.replaceMicOnPeers(this.outboundMicTrack());
    this.syncSpeakingTracks();
  }

  private async replaceMicOnPeers(track: MediaStreamTrack | null): Promise<void> {
    for (const [remoteUserId, pc] of this.peerConnections.entries()) {
      const screenSender = this.screenAudioTransceivers.get(remoteUserId)?.sender;
      const sender = pc.getSenders().find((entry) => entry.track?.kind === 'audio' && entry !== screenSender)
        ?? pc.getSenders().find((entry) => entry !== screenSender && entry.track == null && entry.dtmf != null);
      const fallback = pc
        .getTransceivers()
        .find((entry) => entry.receiver.track?.kind === 'audio' && entry.sender !== screenSender)?.sender;
      const micSender = sender ?? fallback ?? null;
      if (micSender) {
        await micSender.replaceTrack(track);
      }
    }
  }

  private async constrainScreenTrack(track: MediaStreamTrack): Promise<void> {
    track.contentHint = SCREEN_CONTENT_HINT;
    track.enabled = true;
    try {
      await track.applyConstraints(screenTrackApplyConstraints(this.resolvedScreenQuality()));
    } catch {
      /* constraint opcional — getDisplayMedia já pediu o envelope */
    }
  }

  /**
   * H264 (HW/NVENC no Chrome Windows) e VP8 não herdam o teto histórico de ~5 fps
   * do VP9 screenshare no Chromium (webrtc issue 13016 / LiveKit #1069).
   * Tem de ser chamado antes do offer/answer.
   */
  private preferRealtimeScreenCodecs(transceiver: RTCRtpTransceiver): void {
    const caps = RTCRtpSender.getCapabilities?.('video');
    if (!caps?.codecs?.length) {
      return;
    }
    const rank = (mime: string): number => {
      const type = mime.toLowerCase();
      if (type === 'video/h264') {
        return 0;
      }
      if (type === 'video/vp8') {
        return 1;
      }
      if (type === 'video/vp9') {
        return 2;
      }
      if (type === 'video/av1') {
        return 3;
      }
      return 4;
    };
    const sorted = [...caps.codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
    try {
      transceiver.setCodecPreferences(sorted);
    } catch {
      /* transceiver já negociado / motor sem a API */
    }
  }

  private async restartIce(remoteUserId: number, pc: RTCPeerConnection): Promise<void> {
    if (!this.channelId || this.peerConnections.get(remoteUserId) !== pc) {
      return;
    }
    try {
      pc.restartIce();
      await this.renegotiatePeer(remoteUserId);
    } catch {
      this.removePeer(remoteUserId);
    }
  }

  private async applyVideoSenderParamsAll(): Promise<void> {
    for (const transceiver of this.videoTransceivers.values()) {
      await this.applyVideoSenderParams(transceiver.sender);
    }
  }

  private async replaceScreenAudioTrack(track: MediaStreamTrack | null, allowRenegotiate = true): Promise<void> {
    for (const [remoteUserId, pc] of this.peerConnections.entries()) {
      const transceiver = this.screenAudioTransceivers.get(remoteUserId);
      if (!transceiver) {
        if (track) {
          const sender = pc.addTrack(track, this.screenStream ?? new MediaStream([track]));
          const created = pc.getTransceivers().find((entry) => entry.sender === sender);
          if (created) {
            this.screenAudioTransceivers.set(remoteUserId, created);
          }
          if (allowRenegotiate) {
            await this.renegotiatePeer(remoteUserId);
          }
        }
        continue;
      }

      await transceiver.sender.replaceTrack(track);
      transceiver.direction = 'sendrecv';
      await applyScreenAudioSenderParams(transceiver.sender);
      if (allowRenegotiate && track) {
        await this.renegotiatePeer(remoteUserId);
      }
    }
  }

  private async renegotiatePeer(remoteUserId: number): Promise<void> {
    const pc = this.peerConnections.get(remoteUserId);
    if (!pc || !this.channelId) {
      return;
    }

    if (this.makingOffer.has(remoteUserId) || pc.signalingState !== 'stable') {
      this.queueRenegotiate(remoteUserId, pc);
      return;
    }

    try {
      this.makingOffer.add(remoteUserId);
      const offer = await pc.createOffer();
      await this.setLocalSdp(pc, offer, remoteUserId);
      await this.sendSdp(remoteUserId, 'offer', pc.localDescription);
      this.scheduleOfferRetry(remoteUserId, pc);
    } finally {
      this.makingOffer.delete(remoteUserId);
      if (this.renegotiateQueued.has(remoteUserId) && pc.signalingState === 'stable') {
        this.renegotiateQueued.delete(remoteUserId);
        void this.renegotiatePeer(remoteUserId);
      }
    }
  }

  private applyVideoSenderParams(sender: RTCRtpSender): Promise<void> {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        return Promise.resolve();
      }
      const encoding = outboundVideoEncodingsForTrack(
        this.sharingScreen(),
        this.resolvedScreenQuality(),
        this.screenStream?.getVideoTracks()[0] ?? null,
      );
      params.encodings[0].active = true;
      params.encodings[0].scaleResolutionDownBy = encoding.scaleResolutionDownBy;
      params.encodings[0].maxBitrate = encoding.maxBitrate;
      params.encodings[0].maxFramerate = encoding.maxFramerate;
      params.degradationPreference = 'maintain-resolution';
      return sender.setParameters(params).catch(() => undefined);
    } catch {
      return Promise.resolve();
    }
  }

  private scheduleOfferRetry(remoteUserId: number, pc: RTCPeerConnection): void {
    window.setTimeout(() => {
      if (this.peerConnections.get(remoteUserId) !== pc || !this.channelId) {
        return;
      }
      if (isPeerConnectionUp(pc)) {
        this.offerRetries.delete(remoteUserId);
        return;
      }
      if (pc.signalingState !== 'have-local-offer' || !pc.localDescription) {
        this.offerRetries.delete(remoteUserId);
        return;
      }
      if (!this.activePeerIds.has(remoteUserId)) {
        return;
      }
      const attempts = (this.offerRetries.get(remoteUserId) ?? 0) + 1;
      if (attempts > 20) {
        return;
      }
      this.offerRetries.set(remoteUserId, attempts);
      void this.sendSdp(remoteUserId, 'offer', pc.localDescription).catch(() => undefined);
      this.scheduleOfferRetry(remoteUserId, pc);
    }, 3_000);
  }

  private async sendSdp(
    remoteUserId: number,
    type: 'offer' | 'answer',
    desc: RTCSessionDescription | RTCSessionDescriptionInit | null,
  ): Promise<void> {
    if (!this.channelId) {
      return;
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await firstValueFrom(this.signaling.sendSignal(this.channelId, remoteUserId, type, this.sdpPayload(desc)));
        this.kickPoll();
        return;
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  private async setLocalSdp(
    pc: RTCPeerConnection,
    desc: RTCSessionDescriptionInit,
    remoteUserId: number,
  ): Promise<void> {
    const mid = this.screenAudioTransceivers.get(remoteUserId)?.mid ?? null;
    await pc.setLocalDescription({
      type: desc.type,
      sdp: desc.sdp ? tuneScreenAudioSdp(desc.sdp, mid) : desc.sdp,
    });
    const screenSender = this.screenAudioTransceivers.get(remoteUserId)?.sender;
    if (screenSender) {
      void applyScreenAudioSenderParams(screenSender);
    }
  }

  private sdpPayload(desc: RTCSessionDescription | RTCSessionDescriptionInit | null): Record<string, unknown> {
    if (!desc) {
      return { sdp: null };
    }
    const sdp = desc.sdp ?? '';
    return {
      sdp: {
        type: desc.type,
        sdp,
        sdpB64: this.encodeSdpB64(sdp),
      },
    };
  }

  private encodeSdpB64(sdp: string): string {
    return btoa(unescape(encodeURIComponent(sdp)));
  }

  private decodeSdpB64(b64: string): string {
    return decodeURIComponent(escape(atob(b64)));
  }

  /** JSON/MySQL corta o CRLF final do SDP; o Chrome rejeita a última linha sem terminador. */
  private normalizeSdp(sdp: string): string {
    let text = sdp.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/msid:-/g, `msid:${this.sdpMsidFallback}`);
    if (!text.endsWith('\n')) {
      text += '\n';
    }
    return text.replace(/\n/g, '\r\n');
  }

  private isStaleSignal(signal: VoiceSignal): boolean {
    if (!signal.created_at) {
      return false;
    }
    const created = Date.parse(signal.created_at);
    if (Number.isNaN(created)) {
      return false;
    }
    if (this.joinedAtMs && created < this.joinedAtMs - 10_000) {
      return true;
    }
    if (signal.type === 'offer' || signal.type === 'answer') {
      return false;
    }
    return Date.now() - created > 30_000;
  }

  private readonly sdpMsidFallback = crypto.randomUUID();

  private readSdp(
    payload: Record<string, unknown>,
    fallbackType?: VoiceSignal['type'],
  ): RTCSessionDescriptionInit | null {
    const nested = payload['sdp'] as unknown;
    const fromObject = (value: unknown): RTCSessionDescriptionInit | null => {
      if (!value || typeof value !== 'object') {
        return null;
      }
      const init = value as { type?: unknown; sdp?: unknown; sdpB64?: unknown };
      const type = typeof init.type === 'string' ? init.type : fallbackType;
      let sdpText: string | null = null;
      if (typeof init.sdpB64 === 'string' && init.sdpB64.length > 0) {
        try {
          sdpText = this.decodeSdpB64(init.sdpB64);
        } catch {
          sdpText = null;
        }
      }
      if (!sdpText && typeof init.sdp === 'string' && init.sdp.length > 0) {
        sdpText = init.sdp;
      }
      if ((type === 'offer' || type === 'answer') && sdpText) {
        return { type, sdp: this.normalizeSdp(sdpText) };
      }
      return null;
    };

    const fromNested = fromObject(nested);
    if (fromNested) {
      return fromNested;
    }

    const fromRoot = fromObject(payload);
    if (fromRoot) {
      return fromRoot;
    }

    if (typeof nested === 'string') {
      try {
        const parsed = fromObject(JSON.parse(nested));
        if (parsed) {
          return parsed;
        }
      } catch {
        /* not JSON */
      }
      if ((fallbackType === 'offer' || fallbackType === 'answer') && nested.startsWith('v=')) {
        return { type: fallbackType, sdp: this.normalizeSdp(nested) };
      }
    }

    return null;
  }

  private queueRenegotiate(remoteUserId: number, pc: RTCPeerConnection): void {
    this.renegotiateQueued.add(remoteUserId);
    if (this.renegotiateListeners.has(remoteUserId)) {
      return;
    }

    const onState = (): void => {
      if (pc.signalingState !== 'stable') {
        return;
      }
      pc.removeEventListener('signalingstatechange', onState);
      this.renegotiateListeners.delete(remoteUserId);
      if (this.renegotiateQueued.has(remoteUserId)) {
        this.renegotiateQueued.delete(remoteUserId);
        void this.renegotiatePeer(remoteUserId);
      }
    };

    this.renegotiateListeners.set(remoteUserId, onState);
    pc.addEventListener('signalingstatechange', onState);
  }

  private async broadcastMediaState(): Promise<void> {
    if (!this.channelId) {
      return;
    }

    const cameraOn = !this.videoMuted();
    const payload = {
      sharing: this.sharingScreen(),
      camera: cameraOn,
    };
    try {
      await firstValueFrom(this.signaling.setMediaState(this.channelId, this.sharingScreen(), cameraOn));
    } catch {
      /* persist é best-effort; o sinal ainda vai para os peers */
    }
    const myId = this.auth.user()?.id;
    for (const userId of this.activePeerIds) {
      if (userId === myId) {
        continue;
      }
      try {
        await firstValueFrom(this.signaling.sendSignal(this.channelId, userId, 'screen', payload));
      } catch {
        /* ignore */
      }
    }
  }

  private startTimers(): void {
    this.stopTimers();
    this.armPollTimer();
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
    this.ngZone.runOutsideAngular(() => {
      this.speaking.start((ids) => {
        this.ngZone.run(() => this.speakingUserIds.set(ids));
      });
    });
    this.syncSpeakingTracks();
    void this.poll();
  }

  private armPollTimer(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    const fast = Date.now() - this.joinedAtMs < POLL_FAST_FOR_MS;
    const interval = fast ? POLL_FAST_MS : POLL_MS;
    this.pollTimer = setInterval(() => {
      void this.poll();
      if (fast && Date.now() - this.joinedAtMs >= POLL_FAST_FOR_MS) {
        this.armPollTimer();
      }
    }, interval);
  }

  private kickPoll(): void {
    if (!this.channelId || !this.inCall()) {
      return;
    }
    if (this.pollBusy) {
      this.pollQueued = true;
      return;
    }
    void this.poll();
  }

  private stopTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.speaking.stop();
    this.speakingUserIds.set([]);
  }

  private async heartbeat(): Promise<void> {
    if (!this.channelId) {
      return;
    }
    try {
      const res = await firstValueFrom(this.signaling.heartbeat(this.channelId));
      if (res.force_muted) {
        this.applyForceMute();
      } else if (!this.restrictions.denyVoice) {
        this.forceMuted.set(false);
      }
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
      if ((status === 404 || status === 403) && this.inCall() && !this.leavingAfterKick) {
        this.leavingAfterKick = true;
        this.error.set('Você foi expulso da chamada.');
        await this.leave();
      }
    }
  }

  private async poll(): Promise<void> {
    if (!this.channelId) {
      return;
    }
    if (this.pollBusy) {
      this.pollQueued = true;
      return;
    }
    const since = Date.now() - this.lastPollAt;
    if (since < POLL_FAST_MS) {
      return;
    }
    this.pollBusy = true;
    this.lastPollAt = Date.now();

    const channelId = this.channelId;

    try {
      const signals = await firstValueFrom(this.signaling.pollSignals(channelId, this.lastSignalId || undefined));
      const peers = await firstValueFrom(this.signaling.peers(channelId));

      this.screenStartThisTick.clear();
      this.screenStopThisTick.clear();
      for (const signal of signals ?? []) {
        if (this.isStaleSignal(signal)) {
          this.lastSignalId = Math.max(this.lastSignalId, signal.id);
          continue;
        }
        if (signal.type === 'screen') {
          if (coerceSharingFlag(signal.payload['sharing'])) {
            this.screenStartThisTick.add(signal.from_user_id);
          } else if ('sharing' in signal.payload) {
            this.screenStopThisTick.add(signal.from_user_id);
          }
        }
        try {
          await this.handleSignal(signal);
        } catch {
          /* sinal inválido */
        }
        this.lastSignalId = Math.max(this.lastSignalId, signal.id);
      }

      await this.syncPeers(peers ?? []);
      this.refreshParticipants();
      this.updateLinkStatus();
    } catch {
      /* network blip */
    } finally {
      this.pollBusy = false;
      if (this.pollQueued && this.channelId && this.inCall()) {
        this.pollQueued = false;
        const wait = Math.max(0, POLL_FAST_MS - (Date.now() - this.lastPollAt));
        setTimeout(() => void this.poll(), wait);
      }
    }
  }

  private async syncPeers(peers: VoicePeer[]): Promise<void> {
    const activeIds = new Set(peers.map((peer) => peer.user_id));
    const newcomers: number[] = [];

    this.activePeerIds.clear();
    for (const peer of peers) {
      if (!this.peerConnections.has(peer.user_id) && this.chimesArmed) {
        newcomers.push(peer.user_id);
      }
      this.activePeerIds.add(peer.user_id);
    }

    const now = Date.now();
    for (const peer of peers) {
      this.peerNames.set(peer.user_id, peer.user.name);
      const wasSharing = this.remoteScreenSharing.get(peer.user_id) ?? false;
      const fromApi = coerceSharingFlag(peer.sharing_screen);
      const stopThisTick = this.screenStopThisTick.has(peer.user_id);
      const graceUntil = this.screenStopGraceUntil.get(peer.user_id) ?? 0;
      const inStopGrace = now < graceUntil;
      const sharing = mergeSharingFromPoll(
        wasSharing,
        inStopGrace ? false : fromApi,
        this.screenStartThisTick.has(peer.user_id),
        stopThisTick || inStopGrace,
      );
      if (stopThisTick) {
        this.screenStopGraceUntil.set(peer.user_id, now + SCREEN_STOP_GRACE_MS);
      }
      if (sharing) {
        this.screenStopGraceUntil.delete(peer.user_id);
      }
      this.remoteScreenSharing.set(peer.user_id, sharing);
      if (peer.camera_on !== undefined) {
        this.remoteCameraOn.set(peer.user_id, coerceSharingFlag(peer.camera_on));
      }
      this.remoteForceMuted.set(peer.user_id, peer.force_muted === true);
      if (sharing !== wasSharing && this.peerConnections.has(peer.user_id)) {
        this.syncRemoteStreamFromReceivers(peer.user_id);
      }
    }

    await Promise.all(
      peers
        .filter((peer) => !this.peerConnections.has(peer.user_id))
        .map((peer) => this.connectToPeer(peer.user_id, this.shouldInitiate(peer.user_id))),
    );
    if (newcomers.length > 0) {
      void playCallChime('join', this.outputDeviceId());
    }

    for (const userId of [...this.peerConnections.keys()]) {
      if (!activeIds.has(userId)) {
        this.removePeer(userId);
      }
    }

    this.refreshParticipants();
  }

  private async connectToPeer(remoteUserId: number, createOffer: boolean): Promise<void> {
    if (this.peerConnections.has(remoteUserId) || !this.cameraStream || !this.channelId) {
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
    });
    this.peerConnections.set(remoteUserId, pc);
    this.pendingIce.set(remoteUserId, []);

    pc.ontrack = (event) => {
      this.tuneReceiverLatency(event.receiver);
      this.mergeRemoteTrack(remoteUserId, event);
      this.updateLinkStatus();
    };

    pc.onicecandidate = (event) => {
      if (!this.channelId) {
        return;
      }
      if (!event.candidate) {
        this.flushIce(remoteUserId);
        return;
      }
      this.queueIce(remoteUserId, event.candidate.toJSON());
    };

    pc.oniceconnectionstatechange = () => {
      this.updateLinkStatus();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.syncRemoteStreamFromReceivers(remoteUserId);
        this.refreshParticipants();
      }
      if (pc.connectionState === 'failed') {
        void this.restartIce(remoteUserId, pc);
      }
      if (pc.connectionState === 'closed') {
        this.removePeer(remoteUserId);
      }
      this.updateLinkStatus();
    };

    if (createOffer) {
      await this.attachOutboundMedia(remoteUserId, pc);
      this.makingOffer.add(remoteUserId);
      try {
        const offer = await pc.createOffer();
        await this.setLocalSdp(pc, offer, remoteUserId);
        await this.sendSdp(remoteUserId, 'offer', pc.localDescription);
        this.scheduleOfferRetry(remoteUserId, pc);
      } finally {
        this.makingOffer.delete(remoteUserId);
      }
    }

    if (this.sharingScreen() || !this.videoMuted()) {
      void this.broadcastMediaState();
    }
  }

  private async attachOutboundMedia(remoteUserId: number, pc: RTCPeerConnection): Promise<void> {
    const transceivers = pc.getTransceivers();
    const existingVideo = transceivers.find((entry) => entry.receiver.track?.kind === 'video');
    const existingAudios = transceivers.filter((entry) => entry.receiver.track?.kind === 'audio');

    const outboundTrack = this.outboundVideoTrack();
    const videoStream = this.videoSendStreams.get(remoteUserId) ?? new MediaStream();
    if (!videoStream.getVideoTracks().includes(outboundTrack)) {
      videoStream.getVideoTracks().forEach((track) => videoStream.removeTrack(track));
      videoStream.addTrack(outboundTrack);
    }
    this.videoSendStreams.set(remoteUserId, videoStream);

    const videoTransceiver =
      existingVideo ?? pc.addTransceiver('video', { direction: 'sendrecv', streams: [videoStream] });
    this.videoTransceivers.set(remoteUserId, videoTransceiver);
    this.preferRealtimeScreenCodecs(videoTransceiver);
    await videoTransceiver.sender.replaceTrack(outboundTrack);
    videoTransceiver.direction = 'sendrecv';
    void this.applyVideoSenderParams(videoTransceiver.sender);

    const mic = this.outboundMicTrack();
    const audioOf = (): RTCRtpTransceiver[] =>
      pc.getTransceivers().filter((entry) => entry.receiver.track?.kind === 'audio');

    let micTransceiver = existingAudios[0] ?? audioOf()[0];
    if (!micTransceiver) {
      micTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    }
    if (mic) {
      await micTransceiver.sender.replaceTrack(mic);
      micTransceiver.direction = 'sendrecv';
    }

    const screenAudio = audioOf()[1] ?? pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.screenAudioTransceivers.set(remoteUserId, screenAudio);
    await screenAudio.sender.replaceTrack(this.outboundScreenAudioTrack());
    screenAudio.direction = 'sendrecv';
    void applyScreenAudioSenderParams(screenAudio.sender);
    this.tuneAllReceivers(pc);
  }

  private tuneAllReceivers(pc: RTCPeerConnection): void {
    for (const receiver of pc.getReceivers()) {
      this.tuneReceiverLatency(receiver);
    }
  }

  /** jitterBufferTarget em ms; playoutDelayHint legado em segundos. 0 = menor buffer que o Chrome aceitar. */
  private tuneReceiverLatency(receiver: RTCRtpReceiver | undefined): void {
    if (!receiver) {
      return;
    }
    const hint = receiver as RTCRtpReceiver & {
      jitterBufferTarget?: number | null;
      playoutDelayHint?: number;
    };
    try {
      hint.jitterBufferTarget = 0;
    } catch {
      try {
        hint.jitterBufferTarget = 50;
      } catch {
        /* API ausente ou fora da faixa */
      }
    }
    try {
      hint.playoutDelayHint = 0;
    } catch {
      /* Chrome antigo / outro motor */
    }
  }

  private applyForceMute(): void {
    this.forceMuted.set(true);
    this.audioMuted.set(true);
    this.cameraStream?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    if (this.filteredMicTrack) {
      this.filteredMicTrack.enabled = false;
    }
    this.refreshParticipants();
  }

  private async handleModeration(signal: VoiceSignal): Promise<void> {
    const action = String(signal.payload['action'] ?? '');
    if (action === 'kick') {
      if (this.leavingAfterKick || !this.inCall()) {
        return;
      }
      this.leavingAfterKick = true;
      this.error.set('Você foi expulso da chamada.');
      await this.leave();
      return;
    }
    if (action === 'mute') {
      this.applyForceMute();
      return;
    }
    if (action === 'unmute' && !this.restrictions.denyVoice) {
      this.forceMuted.set(false);
    }
  }

  private async handleSignal(signal: VoiceSignal): Promise<void> {
    const remoteUserId = signal.from_user_id;
    if (!this.channelId) {
      return;
    }

    if (signal.type === 'moderation') {
      await this.handleModeration(signal);
      return;
    }

    if (signal.type === 'screen') {
      if ('sharing' in signal.payload) {
        const sharing = coerceSharingFlag(signal.payload['sharing']);
        this.remoteScreenSharing.set(remoteUserId, sharing);
        if (sharing) {
          this.screenStopGraceUntil.delete(remoteUserId);
        } else {
          this.screenStopGraceUntil.set(remoteUserId, Date.now() + SCREEN_STOP_GRACE_MS);
        }
      }
      if ('camera' in signal.payload) {
        this.remoteCameraOn.set(remoteUserId, coerceSharingFlag(signal.payload['camera']));
      }
      this.syncRemoteStreamFromReceivers(remoteUserId);
      this.refreshParticipants();
      return;
    }

    let pc = this.peerConnections.get(remoteUserId);

    if (signal.type === 'offer') {
      if (!pc) {
        await this.connectToPeer(remoteUserId, false);
        pc = this.peerConnections.get(remoteUserId);
      }
      if (!pc) {
        return;
      }

      const accept = shouldAcceptRemoteOffer({
        polite: this.isPolite(remoteUserId),
        makingOffer: this.makingOffer.has(remoteUserId),
        signalingState: pc.signalingState,
      });
      if (!accept) {
        return;
      }

      let rolledBack = false;
      if (pc.signalingState === 'have-local-offer') {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
          rolledBack = true;
          this.makingOffer.delete(remoteUserId);
        } catch {
          return;
        }
      }

      const offer = this.readSdp(signal.payload, signal.type);
      if (!offer) {
        return;
      }
      if (pc.remoteDescription?.type === 'offer' && pc.remoteDescription.sdp === offer.sdp) {
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await this.flushPendingIce(remoteUserId, pc);
      try {
        await this.attachOutboundMedia(remoteUserId, pc);
      } catch {
        /* transceiver já negociado */
      }

      const answer = await pc.createAnswer();
      await this.setLocalSdp(pc, answer, remoteUserId);
      await this.sendSdp(remoteUserId, 'answer', pc.localDescription);
      this.syncRemoteStreamFromReceivers(remoteUserId);
      this.refreshParticipants();
      this.updateLinkStatus();
      if (rolledBack) {
        void this.renegotiatePeer(remoteUserId);
      }
      return;
    }

    if (!pc) {
      return;
    }

    if (signal.type === 'answer') {
      if (pc.signalingState !== 'have-local-offer') {
        return;
      }
      const answer = this.readSdp(signal.payload, signal.type);
      if (!answer) {
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await this.flushPendingIce(remoteUserId, pc);
      this.syncRemoteStreamFromReceivers(remoteUserId);
      this.refreshParticipants();
      this.updateLinkStatus();
      return;
    }

    if (signal.type === 'ice') {
      const many = signal.payload['candidates'];
      const list = (Array.isArray(many) ? many : [signal.payload['candidate']])
        .filter((candidate): candidate is RTCIceCandidateInit => !!candidate);
      if (!list.length) {
        return;
      }
      for (const candidate of list) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          this.pendingIce.get(remoteUserId)?.push(candidate);
        }
      }
    }
  }

  private queueIce(remoteUserId: number, candidate: RTCIceCandidateInit): void {
    let box = this.iceOutbox.get(remoteUserId);
    if (!box) {
      box = { candidates: [], timer: null };
      this.iceOutbox.set(remoteUserId, box);
    }
    box.candidates.push(candidate);
    if (box.timer) {
      return;
    }
    box.timer = setTimeout(() => this.flushIce(remoteUserId), 40);
  }

  private flushIce(remoteUserId: number): void {
    const box = this.iceOutbox.get(remoteUserId);
    if (!box || !this.channelId) {
      return;
    }
    if (box.timer) {
      clearTimeout(box.timer);
      box.timer = null;
    }
    const list = box.candidates.splice(0);
    if (!list.length) {
      return;
    }
    void firstValueFrom(
      this.signaling.sendSignal(this.channelId, remoteUserId, 'ice', {
        candidate: list[0],
        candidates: list,
      }),
    ).then(() => this.kickPoll());
  }

  private dropIceOutbox(remoteUserId: number): void {
    const box = this.iceOutbox.get(remoteUserId);
    if (box?.timer) {
      clearTimeout(box.timer);
    }
    this.iceOutbox.delete(remoteUserId);
  }

  private clearIceOutbox(): void {
    for (const userId of [...this.iceOutbox.keys()]) {
      this.dropIceOutbox(userId);
    }
  }

  private async flushPendingIce(userId: number, pc: RTCPeerConnection): Promise<void> {
    const queued = this.pendingIce.get(userId) ?? [];
    this.pendingIce.set(userId, []);
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  private mergeRemoteTrack(remoteUserId: number, event: RTCTrackEvent): void {
    this.syncRemoteStreamFromReceivers(remoteUserId, event);
    this.refreshParticipants();
    this.syncSpeakingTracks();
  }

  private syncRemoteStreamFromReceivers(remoteUserId: number, event?: RTCTrackEvent): void {
    const pc = this.peerConnections.get(remoteUserId);
    if (!pc) {
      return;
    }

    const sharing = this.remoteScreenSharing.get(remoteUserId) ?? false;

    let voice = this.remoteVoiceStreams.get(remoteUserId);
    if (!voice) {
      voice = new MediaStream();
      this.remoteVoiceStreams.set(remoteUserId, voice);
    }

    let screen = this.remoteScreenStreams.get(remoteUserId);
    if (!screen) {
      screen = new MediaStream();
      this.remoteScreenStreams.set(remoteUserId, screen);
    }

    this.remoteStreams.set(remoteUserId, voice);

    const voiceTracks: MediaStreamTrack[] = [];
    const screenTracks: MediaStreamTrack[] = [];

    const screenAudioReceiver = this.screenAudioTransceivers.get(remoteUserId)?.receiver;
    const videoReceiver =
      this.videoTransceivers.get(remoteUserId)?.receiver ??
      pc.getReceivers().find((receiver) => receiver.track?.kind === 'video' && receiver.track.readyState !== 'ended');
    const audioReceivers = pc
      .getReceivers()
      .filter((receiver) => receiver.track?.kind === 'audio' && receiver.track.readyState !== 'ended');
    const micReceiver =
      audioReceivers.find((receiver) => receiver !== screenAudioReceiver) ?? audioReceivers[0] ?? null;

    if (videoReceiver?.track && videoReceiver.track.readyState !== 'ended') {
      this.bindTrackEvents(remoteUserId, videoReceiver.track);
      if (sharing) {
        screenTracks.push(videoReceiver.track);
      } else {
        voiceTracks.push(videoReceiver.track);
      }
    }

    for (const receiver of audioReceivers) {
      const track = receiver.track;
      if (!track) {
        continue;
      }
      this.bindTrackEvents(remoteUserId, track);
      const mappedAsScreen = screenAudioReceiver != null && receiver === screenAudioReceiver;
      const fallbackScreen =
        sharing && screenAudioReceiver == null && audioReceivers.length > 1 && receiver !== micReceiver;
      if (mappedAsScreen || fallbackScreen) {
        screenTracks.push(track);
      } else {
        voiceTracks.push(track);
      }
    }

    if (event?.track && event.track.readyState !== 'ended') {
      this.bindTrackEvents(remoteUserId, event.track);
    }

    const inbound = usesInboundRnnoise(this.noiseFilterMode());
    const rawVoiceAudio = voiceTracks.find((track) => track.kind === 'audio') ?? null;
    this.setStreamTracks(
      voice,
      voicePlaybackTracks(voiceTracks, inbound, this.inboundRnnoise.currentOutput(remoteUserId)),
    );
    this.setStreamTracks(screen, screenTracks);
    this.tuneAllReceivers(pc);
    void this.syncInboundVoiceFilter(remoteUserId, rawVoiceAudio);
  }

  private async syncInboundVoiceFilters(): Promise<void> {
    const enabled = usesInboundRnnoise(this.noiseFilterMode());
    if (!enabled) {
      this.inboundRnnoise.destroy();
      for (const userId of this.peerConnections.keys()) {
        this.syncRemoteStreamFromReceivers(userId);
      }
      return;
    }
    await Promise.all(
      [...this.peerConnections.keys()].map((userId) => this.syncInboundVoiceFilter(userId)),
    );
  }

  private inboundRawVoiceTrack(userId: number): MediaStreamTrack | null {
    const pc = this.peerConnections.get(userId);
    if (!pc) {
      return null;
    }
    const screenReceiver = this.screenAudioTransceivers.get(userId)?.receiver;
    const micReceiver =
      pc
        .getReceivers()
        .find(
          (receiver) =>
            receiver.track?.kind === 'audio' &&
            receiver !== screenReceiver &&
            receiver.track.readyState !== 'ended',
        ) ?? null;
    return micReceiver?.track ?? null;
  }

  private async syncInboundVoiceFilter(
    userId: number,
    rawVoiceAudio = this.inboundRawVoiceTrack(userId),
  ): Promise<void> {
    const stream = this.remoteVoiceStreams.get(userId);
    if (!stream) {
      this.inboundRnnoise.drop(userId);
      return;
    }
    await this.inboundRnnoise.applyToVoiceStream(
      userId,
      stream,
      rawVoiceAudio,
      usesInboundRnnoise(this.noiseFilterMode()),
    );
  }

  private setStreamTracks(stream: MediaStream, tracks: MediaStreamTrack[]): void {
    const wanted = new Set(tracks.map((track) => track.id));
    for (const existing of stream.getTracks()) {
      if (!wanted.has(existing.id)) {
        stream.removeTrack(existing);
      }
    }
    for (const track of tracks) {
      if (!stream.getTracks().some((existing) => existing.id === track.id)) {
        stream.addTrack(track);
      }
    }
  }

  private bindTrackEvents(remoteUserId: number, track: MediaStreamTrack): void {
    track.onended = () => {
      this.syncRemoteStreamFromReceivers(remoteUserId);
      this.refreshParticipants();
    };
    track.onmute = () => this.refreshParticipants();
    track.onunmute = () => {
      this.syncRemoteStreamFromReceivers(remoteUserId);
      this.refreshParticipants();
    };
  }

  private removePeer(userId: number): void {
    const pc = this.peerConnections.get(userId);
    const listener = this.renegotiateListeners.get(userId);
    if (pc && listener) {
      pc.removeEventListener('signalingstatechange', listener);
    }
    pc?.close();
    this.peerConnections.delete(userId);
    this.videoTransceivers.delete(userId);
    this.screenAudioTransceivers.delete(userId);
    this.videoSendStreams.delete(userId);
    this.remoteStreams.delete(userId);
    this.remoteVoiceStreams.delete(userId);
    this.inboundRnnoise.drop(userId);
    this.remoteScreenStreams.delete(userId);
    this.remoteScreenSharing.delete(userId);
    this.remoteCameraOn.delete(userId);
    this.remoteForceMuted.delete(userId);
    this.pendingIce.delete(userId);
    this.dropIceOutbox(userId);
    this.makingOffer.delete(userId);
    this.renegotiateQueued.delete(userId);
    this.renegotiateListeners.delete(userId);
    this.offerRetries.delete(userId);
    this.activePeerIds.delete(userId);
    if (this.chimesArmed && this.inCall()) {
      void playCallChime('leave', this.outputDeviceId());
    }
    this.refreshParticipants();
    this.syncSpeakingTracks();
    this.updateLinkStatus();
  }

  private updateLinkStatus(): void {
    const next = deriveVoiceLinkStatus({
      inCall: this.inCall(),
      alreadyJoined: this.selfJoinChimed || this.linkStatus() === 'connected',
      remotes: [...this.peerConnections.values()].map((pc) => ({
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
      })),
    });

    if (next === 'connected') {
      this.setConnected();
      return;
    }

    this.linkStatus.set(next);
    this.connecting.set(next === 'connecting' || next === 'reconnecting');
  }

  private setConnected(): void {
    const first = !this.selfJoinChimed;
    this.linkStatus.set('connected');
    this.connecting.set(false);
    this.chimesArmed = true;
    if (first) {
      this.selfJoinChimed = true;
      void playCallChime('join', this.outputDeviceId());
    }
  }

  private refreshParticipants(): void {
    const user = this.auth.user();
    const list: VoiceParticipant[] = [];
    const added = new Set<number>();

    if (user && this.cameraStream) {
      list.push(this.buildLocalParticipant(user.id, user.name));
      added.add(user.id);
    }

    for (const [userId, stream] of this.remoteStreams.entries()) {
      list.push(this.buildRemoteParticipant(userId, stream));
      added.add(userId);
    }

    for (const userId of this.activePeerIds) {
      if (added.has(userId)) {
        continue;
      }

      const sharing = this.remoteScreenSharing.get(userId) ?? false;
      list.push({
        userId,
        name: this.peerNames.get(userId) ?? `Usuário ${userId}`,
        isLocal: false,
        sharingScreen: sharing,
        audioMuted: false,
        forceMuted: this.remoteForceMuted.get(userId) === true,
        videoMuted: true,
        cameraStream: null,
        screenStream: null,
      });
    }

    this.participants.set(list);
    this.syncSpeakingTracks();
  }

  private buildLocalParticipant(userId: number, name: string): VoiceParticipant {
    return {
      userId,
      name,
      isLocal: true,
      sharingScreen: this.sharingScreen(),
      audioMuted: this.audioMuted(),
      forceMuted: this.forceMuted(),
      videoMuted: this.videoMuted(),
      cameraStream: this.cameraStream,
      screenStream: this.sharingScreen() ? this.screenStream : null,
    };
  }

  private buildRemoteParticipant(userId: number, _stream: MediaStream): VoiceParticipant {
    const sharing = this.remoteScreenSharing.get(userId) ?? false;
    const voice = this.remoteVoiceStreams.get(userId) ?? _stream;
    const screen = this.remoteScreenStreams.get(userId) ?? null;
    const cameraOn = this.remoteCameraOn.get(userId) === true;
    const screenTrack = screen?.getVideoTracks()[0];
    const hasScreenVideo = !!screenTrack && screenTrack.readyState !== 'ended';

    return {
      userId,
      name: this.peerNames.get(userId) ?? `Usuário ${userId}`,
      isLocal: false,
      sharingScreen: sharing,
      audioMuted: false,
      forceMuted: this.remoteForceMuted.get(userId) === true,
      videoMuted: !cameraOn,
      cameraStream: voice.getTracks().length > 0 ? voice : null,
      screenStream: sharing ? screen : hasScreenVideo ? screen : null,
    };
  }

  private stripMicrophoneFromScreenStream(): void {
    if (!this.screenStream) {
      return;
    }
    const mic = this.cameraStream?.getAudioTracks()[0] ?? null;
    for (const audio of [...this.screenStream.getAudioTracks()]) {
      if (isLikelyMicrophoneAudioTrack(audio, mic)) {
        this.screenStream.removeTrack(audio);
        audio.stop();
      }
    }
  }

  private outboundScreenAudioTrack(): MediaStreamTrack | null {
    if (!this.sharingScreen() || !this.screenStream || !this.screenAudioSent) {
      return null;
    }
    return pickScreenShareAudioTrack(
      this.screenStream,
      this.cameraStream?.getAudioTracks()[0] ?? null,
    );
  }

  isSpeaking(userId: number): boolean {
    return this.speakingUserIds().includes(userId);
  }

  private syncSpeakingTracks(): void {
    if (!this.inCall()) {
      return;
    }
    const sources = new Map<number, SpeakingSource>();
    const localId = this.auth.user()?.id ?? null;
    if (localId != null && !this.audioMuted()) {
      sources.set(localId, { track: this.outboundMicTrack() });
    }
    for (const [userId, stream] of this.remoteVoiceStreams.entries()) {
      const pc = this.peerConnections.get(userId);
      const screenReceiver = this.screenAudioTransceivers.get(userId)?.receiver;
      const micReceiver =
        pc
          ?.getReceivers()
          .find((receiver) => receiver.track?.kind === 'audio' && receiver !== screenReceiver) ?? null;
      const voice =
        stream.getAudioTracks().find((track) => track.readyState === 'live') ??
        (micReceiver?.track?.readyState === 'live' ? micReceiver.track : null);
      sources.set(userId, { track: voice, receiver: micReceiver });
    }
    this.speaking.sync(sources, localId);
  }

  private ensureVideoPump(): OutboundVideoPump {
    if (!this.videoPump) {
      this.videoPump = new OutboundVideoPump();
    }
    return this.videoPump;
  }

  private installDebugHook(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const w = window as Window & {
      __hicallVoice?: () => Record<string, unknown>;
      __hicallVoiceStats?: () => Promise<Record<string, unknown>>;
      __hicallVoiceProbe?: (seconds?: number) => Promise<Record<string, unknown>>;
    };
    w.__hicallVoice = () => this.debugSnapshot();
    w.__hicallVoiceStats = () => this.debugPeerStats();
    w.__hicallVoiceProbe = (seconds = 10) => this.debugProbe(seconds);
  }

  private async debugProbe(seconds = 10): Promise<Record<string, unknown>> {
    const ticks: ProbeTick[] = [];
    const started = performance.now();
    const total = Math.max(2, Math.min(30, Math.round(seconds) + 1));
    for (let i = 0; i < total; i++) {
      ticks.push(await this.collectProbeTick(performance.now() - started));
      if (i < total - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return { ...summarizeProbe(ticks), ticks, sharing: this.sharingScreen(), cameraOn: !this.videoMuted() };
  }

  private async collectProbeTick(t: number): Promise<ProbeTick> {
    const capture = this.captureLayer();
    const pump = this.pumpLayer();
    const videos = [...document.querySelectorAll('video')].map((video) => ({
      w: video.videoWidth,
      h: video.videoHeight,
    }));

    let inbound = inboundFromRow(null);
    let outbound = outboundFromRow(null);
    let mediaSource = mediaSourceFromRow(null);

    for (const [id, pc] of this.peerConnections.entries()) {
      const rows = statsReportToRows(await pc.getStats());
      const encodings = this.videoTransceivers.get(id)?.sender.getParameters().encodings?.[0] ?? null;
      inbound = inboundFromRow(pickVideoRtp(rows, 'inbound-rtp'));
      outbound = outboundFromRow(pickVideoRtp(rows, 'outbound-rtp'), encodings);
      mediaSource = mediaSourceFromRow(pickMediaSource(rows));
      if (this.sharingScreen() ? outbound.framesSent > 0 : inbound.framesDecoded > 0) {
        break;
      }
    }

    return { t, capture, pump, mediaSource, outbound, inbound, videos };
  }

  private captureLayer(): CaptureLayer {
    const track = this.screenStream?.getVideoTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    return {
      width: typeof settings.width === 'number' ? settings.width : 0,
      height: typeof settings.height === 'number' ? settings.height : 0,
      frameRate: typeof settings.frameRate === 'number' ? settings.frameRate : null,
      displaySurface: typeof settings.displaySurface === 'string' ? settings.displaySurface : null,
      contentHint: track?.contentHint ?? '',
    };
  }

  private pumpLayer(): PumpLayer {
    const diagnostics = this.videoPump?.diagnostics;
    if (!diagnostics) {
      return emptyPump();
    }
    return {
      canvasWidth: diagnostics.canvasWidth,
      canvasHeight: diagnostics.canvasHeight,
      sourceWidth: diagnostics.sourceWidth,
      sourceHeight: diagnostics.sourceHeight,
      paintCount: diagnostics.paintCount,
      sourceFrameCount: diagnostics.sourceFrameCount,
      outboundWidth: diagnostics.outboundWidth,
      outboundHeight: diagnostics.outboundHeight,
      outboundFrameRate: diagnostics.outboundFrameRate,
    };
  }

  private async debugPeerStats(): Promise<Record<string, unknown>> {
    const peers: Record<string, unknown>[] = [];
    for (const [id, pc] of this.peerConnections.entries()) {
      const stats = await pc.getStats();
      let inbound: Record<string, unknown> | null = null;
      let outbound: Record<string, unknown> | null = null;
      let pair: Record<string, unknown> | null = null;
      const pairs: Record<string, unknown>[] = [];
      const inboundAny: Record<string, unknown>[] = [];
      const outboundAudio: Record<string, unknown>[] = [];
      const iceHosts: Record<string, string> = {};
      stats.forEach((report) => {
        const kind = report.kind ?? report.mediaType;
        if (report.type === 'inbound-rtp' && kind === 'video') {
          inbound = {
            bytesReceived: report.bytesReceived,
            framesDecoded: report.framesDecoded,
            framesReceived: report.framesReceived,
            framesDropped: report.framesDropped,
            framesPerSecond: report.framesPerSecond,
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
            packetsLost: report.packetsLost,
            jitterBufferDelay: report.jitterBufferDelay,
            jitterBufferEmittedCount: report.jitterBufferEmittedCount,
          };
        }
        if (report.type === 'outbound-rtp' && kind === 'video') {
          outbound = {
            bytesSent: report.bytesSent,
            framesSent: report.framesSent,
            framesEncoded: report.framesEncoded,
            framesPerSecond: report.framesPerSecond,
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
            qualityLimitationReason: report.qualityLimitationReason,
            encoderImplementation: report.encoderImplementation,
            mimeType: report.mimeType,
          };
        }
        if (report.type === 'outbound-rtp' && kind === 'audio') {
          outboundAudio.push({
            bytesSent: report.bytesSent,
            packetsSent: report.packetsSent,
            targetBitrate: report.targetBitrate,
            mid: report.mid,
          });
        }
        if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
          iceHosts[report.id] = `${report.address}:${report.port}/${report.candidateType}`;
        }
        if (report.type === 'candidate-pair') {
          const row = {
            bytesReceived: report.bytesReceived,
            bytesSent: report.bytesSent,
            nominated: report.nominated,
            selected: report.selected ?? false,
            state: report.state,
            local: iceHosts[report.localCandidateId] ?? report.localCandidateId,
            remote: iceHosts[report.remoteCandidateId] ?? report.remoteCandidateId,
          };
          pairs.push(row);
          if (report.nominated || report.selected) {
            pair = row;
          }
        }
        if (report.type === 'inbound-rtp') {
          inboundAny.push({
            kind: report.kind ?? report.mediaType,
            bytes: report.bytesReceived,
            frames: report.framesDecoded,
            fps: report.framesPerSecond,
            jitterBufferDelay: report.jitterBufferDelay,
            jitterBufferEmittedCount: report.jitterBufferEmittedCount,
          });
        }
      });
      const recv = this.videoTransceivers.get(id)?.receiver.track;
      const encodings = this.videoTransceivers.get(id)?.sender.getParameters().encodings?.[0] ?? null;
      const rows = statsReportToRows(stats);
      const mediaSource = mediaSourceFromRow(pickMediaSource(rows));
      peers.push({
        id,
        conn: pc.connectionState,
        ice: pc.iceConnectionState,
        inbound,
        outbound,
        mediaSource,
        encodings: encodings
          ? {
              maxBitrate: encodings.maxBitrate,
              maxFramerate: encodings.maxFramerate,
              scaleResolutionDownBy: encodings.scaleResolutionDownBy,
              active: encodings.active,
            }
          : null,
        pair,
        pairs,
        inboundAny,
        outboundAudio,
        screenAudioMid: this.screenAudioTransceivers.get(id)?.mid ?? null,
        sdp: {
          localSetup: (pc.localDescription?.sdp ?? '').match(/a=setup:.*/)?.[0] ?? null,
          remoteSetup: (pc.remoteDescription?.sdp ?? '').match(/a=setup:.*/)?.[0] ?? null,
          bundle: /a=group:BUNDLE/.test(pc.localDescription?.sdp ?? ''),
          candidates: (pc.localDescription?.sdp ?? '')
            .split('\n')
            .filter((line) => line.startsWith('a=candidate:'))
            .slice(0, 6),
        },
        recv: recv
          ? { muted: recv.muted, live: recv.readyState, enabled: recv.enabled, id: recv.id }
          : null,
      });
    }
    return { ...this.debugSnapshot(), stats: peers };
  }

  private debugSnapshot(): Record<string, unknown> {
    const videos = [...document.querySelectorAll('video')].map((video) => ({
      w: video.videoWidth,
      h: video.videoHeight,
      ready: video.readyState,
      paused: video.paused,
      muted: video.muted,
    }));
    const peers = [...this.peerConnections.entries()].map(([id, pc]) => ({
      id,
      conn: pc.connectionState,
      ice: pc.iceConnectionState,
      signaling: pc.signalingState,
      sharing: this.remoteScreenSharing.get(id) ?? false,
      camera: this.remoteCameraOn.get(id) ?? false,
    }));
    return {
      bundle: [...document.querySelectorAll('script[src]')]
        .map((el) => (el as HTMLScriptElement).src)
        .find((src) => src.includes('main')) ?? location.href,
      sharing: this.sharingScreen(),
      cameraOn: !this.videoMuted(),
      videoPath: this.outboundVideoPath(),
      capture: this.captureLayer(),
      screenSettings: (this.screenStream?.getVideoTracks()[0]?.getSettings?.() ??
        {}) as Record<string, unknown>,
      screenAudio: (this.screenStream?.getAudioTracks() ?? []).map((track) => ({
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        ready: track.readyState,
        hint: track.contentHint,
      })),
      outboundScreenAudio: (() => {
        const track = this.outboundScreenAudioTrack();
        return track
          ? {
              label: track.label,
              enabled: track.enabled,
              muted: track.muted,
              ready: track.readyState,
            }
          : null;
      })(),
      screenAudioPolicy: {
        kind: this.screenAudioPolicy?.kind ?? 'none',
        deviceId: this.screenAudioPolicy?.deviceId ?? '',
        label: this.screenAudioPolicy?.label ?? '',
        sent: this.screenAudioSent,
      },
      pump: {
        w: this.videoPump?.sourceWidth ?? 0,
        h: this.videoPump?.sourceHeight ?? 0,
        enabled: this.videoPump?.track.enabled ?? false,
        ...this.pumpLayer(),
      },
      peers,
      videos,
      tiles: this.participants().map((p) => ({
        id: p.userId,
        name: p.name,
        sharing: p.sharingScreen,
        videoMuted: p.videoMuted,
        screenTracks: p.screenStream?.getVideoTracks().length ?? 0,
        screenAudioTracks: p.screenStream?.getAudioTracks().length ?? 0,
        cameraTracks: p.cameraStream?.getVideoTracks().length ?? 0,
        voiceAudioTracks: p.cameraStream?.getAudioTracks().length ?? 0,
      })),
    };
  }

  private shouldInitiate(remoteUserId: number): boolean {
    const myId = this.auth.user()?.id ?? 0;
    return myId < remoteUserId;
  }

  private isPolite(remoteUserId: number): boolean {
    const myId = this.auth.user()?.id ?? 0;
    return myId > remoteUserId;
  }

  private readError(err: unknown): string {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return 'Permissão de câmera/microfone negada.';
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'Não foi possível entrar na chamada.';
  }
}
