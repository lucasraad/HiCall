import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal, WritableSignal } from '@angular/core';
import { EMPTY_PERMISSIONS } from '../../core/models/role.model';
import { Channel } from '../../core/models/channel.model';
import { Server } from '../../core/models/server.model';
import { VoiceParticipant } from '../../core/models/voice.model';
import { VoiceRtcService } from '../../core/services/voice-rtc.service';
import { VoiceSignalingService } from '../../core/services/voice-signaling.service';
import { VoicePanelComponent } from './voice-panel.component';

describe('VoicePanelComponent', () => {
  let fixture: ComponentFixture<VoicePanelComponent>;
  let voiceRtc: jasmine.SpyObj<VoiceRtcService>;

  const server: Server = {
    id: 1,
    name: 'Test',
    invite_code: 'ABC12345',
    owner_id: 1,
    is_owner: true,
    permissions: { ...EMPTY_PERMISSIONS, can_manage_roles: true, can_manage_server: true, can_kick_call: true, can_mute_call: true, can_create_channels: true, can_kick_server: true },
    credentials_rotated_at: null,
    created_at: null,
  };

  const channel: Channel = {
    id: 2,
    server_id: 1,
    name: 'geral',
    position: 0,
    created_at: null,
  };

  beforeEach(async () => {
    voiceRtc = jasmine.createSpyObj<VoiceRtcService>('VoiceRtcService', [
      'join',
      'leave',
      'toggleAudio',
      'toggleVideo',
      'toggleScreenShare',
      'anyScreenSharing',
      'cancelDesktopPicker',
      'confirmDesktopSource',
      'setInputDevice',
      'setOutputDevice',
      'setScreenQuality',
      'setNoiseFilterMode',
      'refreshDevices',
      'setCallRestrictions',
      'isSpeaking',
      'sendHeldScreenAudio',
    ], {
      participants: signal([]),
      connecting: signal(false),
      inCall: signal(false),
      linkStatus: signal('idle'),
      error: signal(null),
      audioMuted: signal(false),
      videoMuted: signal(true),
      sharingScreen: signal(false),
      forceMuted: signal(false),
      pickerOpen: signal(false),
      pickerSources: signal([]),
      pickerLoading: signal(false),
      pickerError: signal(null),
      audioInputs: signal([]),
      audioOutputs: signal([]),
      inputDeviceId: signal(''),
      outputDeviceId: signal(''),
      screenQualityId: signal('2160p60'),
      availableScreenPresets: signal([
        { id: 'auto', label: 'Automático' },
        { id: '2160p60', label: '4K 60' },
      ]),
      noiseFilterMode: signal('standard'),
      speakingUserIds: signal([]),
      screenAudioHint: signal(null),
    });

    voiceRtc.join.and.returnValue(Promise.resolve());
    voiceRtc.leave.and.returnValue(Promise.resolve());
    voiceRtc.toggleScreenShare.and.returnValue(Promise.resolve(false));
    voiceRtc.anyScreenSharing.and.returnValue(false);
    voiceRtc.confirmDesktopSource.and.returnValue(Promise.resolve());
    voiceRtc.isSpeaking.and.returnValue(false);

    await TestBed.configureTestingModule({
      imports: [VoicePanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: VoiceRtcService, useValue: voiceRtc },
        VoiceSignalingService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VoicePanelComponent);
    fixture.componentRef.setInput('server', server);
    fixture.componentRef.setInput('channel', channel);
    fixture.detectChanges();
  });

  it('silencia a transmissão localmente, preserva a voz e reaplica após recriar o áudio', () => {
    const panel = fixture.componentInstance;
    const voiceAudio = document.createElement('audio');
    const firstScreenAudio = document.createElement('audio');
    panel.bindPeerAudio(voiceAudio, 9);
    panel.bindScreenAudio(firstScreenAudio, 9);
    const tile = { kind: 'screen', userId: 9 } as ReturnType<typeof panel.gridTiles>[number];
    const input = document.createElement('input');
    input.value = '0.7';
    panel.onTileVolumeInput({ target: input, stopPropagation() {} } as unknown as Event, tile);
    expect(firstScreenAudio.volume).toBe(0.7);
    input.value = '0';
    panel.onTileVolumeInput({ target: input, stopPropagation() {} } as unknown as Event, tile);
    expect(firstScreenAudio.muted).toBeTrue();
    expect(firstScreenAudio.volume).toBe(0);
    expect(voiceAudio.muted).toBeFalse();
    expect(voiceAudio.volume).toBe(1);
    const recreated = document.createElement('audio');
    panel.bindScreenAudio(recreated, 9);
    expect(recreated.muted).toBeTrue();
    expect(recreated.volume).toBe(0);
    input.value = '0.4';
    panel.onTileVolumeInput({ target: input, stopPropagation() {} } as unknown as Event, tile);
    expect(recreated.muted).toBeFalse();
    expect(recreated.volume).toBe(0.4);
    panel.toggleTileMute(tile);
    expect(recreated.muted).toBeTrue();
    panel.toggleTileMute(tile);
    expect(recreated.volume).toBe(0.4);
    expect(voiceAudio.volume).toBe(1);
  });

  it('should show pre-call state initially', () => {
    expect(voiceRtc.inCall()).toBeFalse();
  });

  it('should join native voice call', async () => {
    await fixture.componentInstance.joinCall();
    expect(voiceRtc.join).toHaveBeenCalledWith(2);
  });

  it('should leave call on hangup', async () => {
    (voiceRtc.inCall as WritableSignal<boolean>).set(true);
    await fixture.componentInstance.leaveCall();
    expect(voiceRtc.leave).toHaveBeenCalled();
  });

  it('não sai da call quando o painel é destruído (navegação admin)', () => {
    (voiceRtc.inCall as WritableSignal<boolean>).set(true);
    voiceRtc.leave.calls.reset();
    fixture.destroy();
    expect(voiceRtc.leave).not.toHaveBeenCalled();
  });

  it('mostra Tela e Transmitindo quando o peer está compartilhando sem frames', () => {
    (voiceRtc.inCall as WritableSignal<boolean>).set(true);
    const sharingPeer: VoiceParticipant = {
      userId: 9,
      name: 'Carla',
      isLocal: false,
      sharingScreen: true,
      audioMuted: false,
      videoMuted: true,
      cameraStream: null,
      screenStream: null,
    };
    (voiceRtc.participants as WritableSignal<VoiceParticipant[]>).set([sharingPeer]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Tela');
    expect(text).toContain('Transmitindo');
    expect(text).toContain('Carla');
    const volume = (fixture.nativeElement as HTMLElement).querySelector('input[title="Volume da transmissão"]') as HTMLInputElement | null;
    expect(volume).toBeTruthy();
    expect(volume!.value).toBe('0');
    const voiceVolume = (fixture.nativeElement as HTMLElement).querySelector('input[title="Volume da voz"]');
    expect(voiceVolume).toBeTruthy();
  });

  it('mostra tile de tela e câmera remota quando ambos têm stream', () => {
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      pending('canvas.captureStream indisponível');
      return;
    }

    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 1920;
    screenCanvas.height = 1080;
    screenCanvas.getContext('2d')!.fillRect(0, 0, 1920, 1080);
    const cameraCanvas = document.createElement('canvas');
    cameraCanvas.width = 1280;
    cameraCanvas.height = 720;
    cameraCanvas.getContext('2d')!.fillRect(0, 0, 1280, 720);
    const screenStream = screenCanvas.captureStream(30);
    const cameraStream = cameraCanvas.captureStream(30);

    (voiceRtc.inCall as WritableSignal<boolean>).set(true);
    const peer: VoiceParticipant = {
      userId: 10,
      name: 'Viewer',
      isLocal: false,
      sharingScreen: true,
      audioMuted: false,
      videoMuted: false,
      cameraStream,
      screenStream,
    };
    (voiceRtc.participants as WritableSignal<VoiceParticipant[]>).set([peer]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Tela');
    expect(text).toContain('Viewer');
    const videos = (fixture.nativeElement as HTMLElement).querySelectorAll('video');
    expect(videos.length).toBeGreaterThanOrEqual(1);

    screenStream.getTracks().forEach((track) => track.stop());
    cameraStream.getTracks().forEach((track) => track.stop());
  });

  function audibleMedia(root: HTMLElement): HTMLMediaElement[] {
    return [...root.querySelectorAll('audio, video')].filter((node) => {
      const el = node as HTMLMediaElement;
      return !el.muted && el.volume > 0;
    }) as HTMLMediaElement[];
  }

  it('um elemento audível por faixa remota, com e sem palco', () => {
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function' || typeof AudioContext === 'undefined') {
      pending('captureStream ou AudioContext indisponível');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvas.getContext('2d')!.fillRect(0, 0, 1280, 720);
    const cameraStream = canvas.captureStream(15);
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 1920;
    screenCanvas.height = 1080;
    screenCanvas.getContext('2d')!.fillRect(0, 0, 1920, 1080);
    const screenStream = screenCanvas.captureStream(15);
    const ctx = new AudioContext();
    const voiceDest = ctx.createMediaStreamDestination();
    const screenDest = ctx.createMediaStreamDestination();
    cameraStream.addTrack(voiceDest.stream.getAudioTracks()[0]);
    screenStream.addTrack(screenDest.stream.getAudioTracks()[0]);

    (voiceRtc.inCall as WritableSignal<boolean>).set(true);
    (voiceRtc.participants as WritableSignal<VoiceParticipant[]>).set([
      {
        userId: 11,
        name: 'Ana',
        isLocal: false,
        sharingScreen: true,
        audioMuted: false,
        videoMuted: false,
        cameraStream,
        screenStream,
      },
    ]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const screenSlider = host.querySelector('input[title="Volume da transmissão"]') as HTMLInputElement;
    screenSlider.value = '0.8';
    screenSlider.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const videos = [...host.querySelectorAll('video')] as HTMLVideoElement[];
    expect(videos.length).toBeGreaterThan(0);
    expect(videos.every((video) => video.muted)).toBeTrue();
    expect(audibleMedia(host).length).toBe(2);

    const screenTile = fixture.componentInstance.gridTiles().find((tile) => tile.kind === 'screen');
    expect(screenTile).toBeTruthy();
    fixture.componentInstance.selectTile(screenTile!);
    fixture.componentInstance.enterStage();
    fixture.detectChanges();
    expect(audibleMedia(host).length).toBe(2);
    const stageVideo = host.querySelector('#voice-stage-overlay video') as HTMLVideoElement | null;
    expect(stageVideo?.muted).toBeTrue();
    fixture.componentInstance.exitStage(false);

    cameraStream.getTracks().forEach((track) => track.stop());
    screenStream.getTracks().forEach((track) => track.stop());
    void ctx.close();
  });

  it('mostra aviso de microfone Bluetooth hands-free', () => {
    (voiceRtc.inCall as WritableSignal<boolean>).set(true);
    (voiceRtc.audioInputs as WritableSignal<MediaDeviceInfo[]>).set([
      {
        deviceId: 'bt-1',
        kind: 'audioinput',
        label: 'Headset (Hands-Free AG Audio)',
        groupId: 'g1',
        toJSON: () => ({}),
      } as MediaDeviceInfo,
    ]);
    (voiceRtc.inputDeviceId as WritableSignal<string>).set('bt-1');
    fixture.componentInstance.onToggleDevices();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Microfone de fone Bluetooth deixa todo o som abafado',
    );
  });

  it('mantém microfone, saída, qualidade e anti-ruído depois de escolher', () => {
    (voiceRtc.inCall as WritableSignal<boolean>).set(true);
    (voiceRtc.audioInputs as WritableSignal<MediaDeviceInfo[]>).set([
      fakeDevice('mic-a', 'audioinput', 'Mic A'),
      fakeDevice('mic-b', 'audioinput', 'Mic B'),
    ]);
    (voiceRtc.audioOutputs as WritableSignal<MediaDeviceInfo[]>).set([
      fakeDevice('out-a', 'audiooutput', 'Out A'),
      fakeDevice('out-b', 'audiooutput', 'Out B'),
    ]);
    (voiceRtc.inputDeviceId as WritableSignal<string>).set('mic-a');
    (voiceRtc.outputDeviceId as WritableSignal<string>).set('');
    voiceRtc.setInputDevice.and.callFake((id: string) => {
      (voiceRtc.inputDeviceId as WritableSignal<string>).set(id);
      return Promise.resolve();
    });
    voiceRtc.setOutputDevice.and.callFake((id: string) => {
      (voiceRtc.outputDeviceId as WritableSignal<string>).set(id);
    });
    voiceRtc.setScreenQuality.and.callFake((id) => {
      (voiceRtc.screenQualityId as WritableSignal<typeof id>).set(id);
      return Promise.resolve();
    });
    voiceRtc.setNoiseFilterMode.and.callFake((mode) => {
      (voiceRtc.noiseFilterMode as WritableSignal<typeof mode>).set(mode);
      return Promise.resolve();
    });

    fixture.componentInstance.onToggleDevices();
    fixture.detectChanges();

    const selects = (fixture.nativeElement as HTMLElement).querySelectorAll('select');
    expect(selects.length).toBe(4);
    changeSelect(selects[0], 'mic-b');
    changeSelect(selects[1], 'out-b');
    changeSelect(selects[2], 'auto');
    changeSelect(selects[3], 'high');
    fixture.detectChanges();

    expect(voiceRtc.setInputDevice).toHaveBeenCalledWith('mic-b');
    expect(voiceRtc.setOutputDevice).toHaveBeenCalledWith('out-b');
    expect(voiceRtc.setScreenQuality).toHaveBeenCalledWith('auto');
    expect(voiceRtc.setNoiseFilterMode).toHaveBeenCalledWith('high');
    expect(selects[0].value).toBe('mic-b');
    expect(selects[1].value).toBe('out-b');
    expect(selects[2].value).toBe('auto');
    expect(selects[3].value).toBe('high');

    const noiseLabels = [...selects[3].options].map((option) => option.textContent?.trim());
    expect(noiseLabels).toEqual(['Desligado', 'Padrão do dispositivo', 'HiCall — meu microfone', 'HiCall — meu microfone e vozes recebidas']);
    changeSelect(selects[3], 'post');
    fixture.detectChanges();
    expect(voiceRtc.setNoiseFilterMode).toHaveBeenCalledWith('post');
    expect(selects[3].value).toBe('post');
  });
});

function fakeDevice(deviceId: string, kind: MediaDeviceKind, label: string): MediaDeviceInfo {
  return { deviceId, kind, label, groupId: 'g', toJSON: () => ({}) } as MediaDeviceInfo;
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
