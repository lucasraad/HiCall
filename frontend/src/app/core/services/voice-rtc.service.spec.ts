import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { VoiceRtcService } from './voice-rtc.service';
import { VoiceSignalingService } from './voice-signaling.service';
import { VoicePeer, VoiceSignal } from '../models/voice.model';
import { User } from '../models/user.model';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function peerOf(id: number, name: string): VoicePeer {
  return {
    user_id: id,
    sharing_screen: false,
    camera_on: false,
    force_muted: false,
    last_seen_at: new Date().toISOString(),
    user: { id, name, email: `${name}@test.local` },
  };
}

describe('VoiceRtcService', () => {
  let voice: VoiceRtcService;
  let signaling: jasmine.SpyObj<VoiceSignalingService>;
  let liveTracks: MediaStreamTrack[] = [];
  let audioContexts: AudioContext[] = [];

  const user: User = {
    id: 1,
    name: 'Admin',
    email: 'admin@test.local',
    role: 'admin',
    is_banned: false,
    banned_at: null,
  };

  function snapshot(): Record<string, unknown> {
    return (window as Window & { __hicallVoice?: () => Record<string, unknown> }).__hicallVoice?.() ?? {};
  }

  async function micStream(): Promise<MediaStream> {
    const ctx = new AudioContext();
    audioContexts.push(ctx);
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    osc.connect(dest);
    osc.start();
    const stream = dest.stream;
    liveTracks.push(...stream.getTracks());
    return stream;
  }

  function screenStream(deviceId: string, displaySurface = 'monitor'): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const stream = canvas.captureStream(5);
    const video = stream.getVideoTracks()[0];
    spyOn(video, 'getSettings').and.returnValue({ displaySurface, width: 64, height: 64, deviceId: 'video' });
    const ctx = new AudioContext();
    audioContexts.push(ctx);
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    osc.connect(dest);
    osc.start();
    const audio = dest.stream.getAudioTracks()[0];
    spyOn(audio, 'getSettings').and.returnValue({ deviceId });
    stream.addTrack(audio);
    liveTracks.push(...stream.getTracks());
    return stream;
  }

  beforeEach(() => {
    liveTracks = [];
    audioContexts = [];
    try {
      localStorage.removeItem('hicall.noiseFilter');
    } catch {
      /* ignore */
    }
    signaling = jasmine.createSpyObj<VoiceSignalingService>('VoiceSignalingService', [
      'join',
      'leave',
      'heartbeat',
      'peers',
      'pollSignals',
      'setScreenSharing',
      'setMediaState',
      'sendSignal',
    ]);
    signaling.join.and.returnValue(of([]));
    signaling.leave.and.returnValue(of(undefined as void));
    signaling.heartbeat.and.returnValue(of({ ok: true }));
    signaling.peers.and.returnValue(of([]));
    signaling.pollSignals.and.returnValue(of([]));
    signaling.setScreenSharing.and.returnValue(of({ ok: true }));
    signaling.setMediaState.and.returnValue(of({ ok: true }));
    signaling.sendSignal.and.returnValue(of({ id: 1 } as VoiceSignal));

    TestBed.configureTestingModule({
      providers: [
        VoiceRtcService,
        { provide: VoiceSignalingService, useValue: signaling },
        {
          provide: AuthService,
          useValue: {
            user: signal(user),
            isAuthenticated: () => true,
          },
        },
      ],
    });
    voice = TestBed.inject(VoiceRtcService);
    spyOn(navigator.mediaDevices, 'enumerateDevices').and.resolveTo([]);
  });

  afterEach(async () => {
    await voice.leave();
    liveTracks.forEach((track) => track.stop());
    await Promise.all(audioContexts.map((ctx) => ctx.close().catch(() => undefined)));
  });

  it('mantém áudio da transmissão fora da voz antes da presença chegar e ao reiniciar', async () => {
    const mic = (await micStream()).getAudioTracks()[0];
    const screen = (await micStream()).getAudioTracks()[0];
    const micReceiver = { track: mic } as RTCRtpReceiver;
    const screenReceiver = { track: screen } as RTCRtpReceiver;
    const pc = { getReceivers: () => [micReceiver, screenReceiver] } as unknown as RTCPeerConnection;
    const state = voice as unknown as {
      peerConnections: Map<number, RTCPeerConnection>;
      screenAudioTransceivers: Map<number, RTCRtpTransceiver>;
      remoteScreenSharing: Map<number, boolean>;
      remoteVoiceStreams: Map<number, MediaStream>;
      remoteScreenStreams: Map<number, MediaStream>;
      syncRemoteStreamFromReceivers(id: number): void;
      tuneAllReceivers(pc: RTCPeerConnection): void;
    };
    spyOn(state, 'tuneAllReceivers');
    state.peerConnections.set(2, pc);
    state.screenAudioTransceivers.set(2, { receiver: screenReceiver } as RTCRtpTransceiver);
    voice.noiseFilterMode.set('standard');
    for (const sharing of [false, true, false, true]) {
      state.remoteScreenSharing.set(2, sharing);
      state.syncRemoteStreamFromReceivers(2);
      expect(state.remoteVoiceStreams.get(2)!.getAudioTracks()).toEqual([mic]);
      expect(state.remoteScreenStreams.get(2)!.getAudioTracks()).toEqual([screen]);
    }
    state.peerConnections.delete(2);
  });

  it('join com NotAllowedError mostra erro', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.rejectWith(
      new DOMException('denied', 'NotAllowedError'),
    );
    await voice.join(1);
    expect(voice.inCall()).toBeFalse();
    expect(voice.error()).toContain('Permissão');
  });

  it('join com HTTP 500 mostra erro', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    signaling.join.and.returnValue(throwError(() => ({ status: 500 })));
    await voice.join(1);
    expect(voice.inCall()).toBeFalse();
    expect(voice.error()).toBeTruthy();
  });

  it('tela NotAllowedError não mostra erro', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    await voice.join(1);
    voice.error.set(null);
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.rejectWith(
      new DOMException('denied', 'NotAllowedError'),
    );
    await voice.toggleScreenShare();
    expect(voice.sharingScreen()).toBeFalse();
    expect(voice.error()).toBeNull();
  });

  it('tela NotFoundError mostra erro', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    await voice.join(1);
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.rejectWith(
      new DOMException('missing', 'NotFoundError'),
    );
    await voice.toggleScreenShare();
    expect(voice.sharingScreen()).toBeFalse();
    expect(voice.error()).toBeTruthy();
  });

  it('system-leaky não envia e peer novo na retenção não recebe a faixa', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    await voice.join(1);
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.resolveTo(screenStream('loopback'));
    await voice.toggleScreenShare();
    expect(voice.sharingScreen()).toBeTrue();
    expect(voice.screenAudioHint()).toBe('leaky');
    const held = snapshot();
    expect(held['outboundScreenAudio']).toBeNull();
    expect((held['screenAudioPolicy'] as { sent: boolean }).sent).toBeFalse();
    expect((held['screenAudio'] as unknown[]).length).toBeGreaterThan(0);

    signaling.peers.and.returnValue(of([peerOf(2, 'Viewer')]));
    await wait(450);
    const duringHold = snapshot();
    expect(duringHold['outboundScreenAudio']).toBeNull();
    expect(((duringHold['peers'] as { id: number }[]) ?? []).some((peer) => peer.id === 2)).toBeTrue();

    voice.sendHeldScreenAudio();
    await wait(50);
    const sent = snapshot();
    expect(sent['outboundScreenAudio']).toBeTruthy();
    expect((sent['screenAudioPolicy'] as { sent: boolean }).sent).toBeTrue();
    expect(voice.screenAudioHint()).toBeNull();

    signaling.peers.and.returnValue(of([peerOf(2, 'Viewer'), peerOf(3, 'Viewer2')]));
    await wait(450);
    const afterJoin = snapshot();
    expect(afterJoin['outboundScreenAudio']).toBeTruthy();
    expect((afterJoin['screenAudioPolicy'] as { sent: boolean }).sent).toBeTrue();
  });

  it('vídeo ended encerra a transmissão', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    await voice.join(1);
    const stream = screenStream('loopbackWithoutChrome', 'monitor');
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.resolveTo(stream);
    await voice.toggleScreenShare();
    expect(voice.sharingScreen()).toBeTrue();
    stream.getVideoTracks()[0].stop();
    stream.getVideoTracks()[0].dispatchEvent(new Event('ended'));
    await wait(50);
    expect(voice.sharingScreen()).toBeFalse();
  });

  it('onended do áudio limpa senders e o aviso', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    await voice.join(1);
    const stream = screenStream('loopback');
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.resolveTo(stream);
    await voice.toggleScreenShare();
    expect(voice.screenAudioHint()).toBe('leaky');
    stream.getAudioTracks()[0].stop();
    stream.getAudioTracks()[0].dispatchEvent(new Event('ended'));
    await wait(50);
    expect(voice.screenAudioHint()).toBeNull();
    expect(snapshot()['outboundScreenAudio']).toBeNull();
  });

  it('setNoiseFilterMode volta ao modo anterior se getUserMedia falhar', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    await voice.join(1);
    const previous = voice.noiseFilterMode();
    (navigator.mediaDevices.getUserMedia as jasmine.Spy).and.rejectWith(
      new DOMException('denied', 'NotAllowedError'),
    );
    await voice.setNoiseFilterMode('high');
    expect(voice.noiseFilterMode()).toBe(previous);
    expect(voice.error()).toBeTruthy();
  });

  it('setNoiseFilterMode(post) volta ao modo anterior se getUserMedia falhar', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    await voice.join(1);
    const previous = voice.noiseFilterMode();
    (navigator.mediaDevices.getUserMedia as jasmine.Spy).and.rejectWith(
      new DOMException('denied', 'NotAllowedError'),
    );
    await voice.setNoiseFilterMode('post');
    expect(voice.noiseFilterMode()).toBe(previous);
    expect(voice.error()).toBeTruthy();
  });

  it('alterna Desligado e Padrão reaplicando a supressão do navegador', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    voice.noiseFilterMode.set('standard');
    await voice.join(1);
    await voice.setNoiseFilterMode('off');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: jasmine.objectContaining({ noiseSuppression: false }), video: false,
    });
    await voice.setNoiseFilterMode('standard');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: jasmine.objectContaining({ noiseSuppression: true }), video: false,
    });
    expect(voice.inCall()).toBeTrue();
  });

  it('setInputDevice restaura o anterior se a captura falhar', async () => {
    spyOn(navigator.mediaDevices, 'getUserMedia').and.callFake(() => micStream());
    await voice.join(1);
    const previous = voice.inputDeviceId();
    (navigator.mediaDevices.getUserMedia as jasmine.Spy).and.rejectWith(
      new DOMException('denied', 'NotAllowedError'),
    );
    await voice.setInputDevice('other-mic');
    expect(voice.inputDeviceId()).toBe(previous);
    expect(voice.error()).toBeTruthy();
  });
});
