import {
  classifyScreenAudio,
  effectiveDisplaySurface,
  isLegacyHicallElectron,
  leakyScreenAudioHint,
} from './screen-audio-policy';

function fakeTrack(
  kind: 'audio' | 'video',
  settings: Record<string, string> = {},
  readyState: MediaStreamTrackState = 'live',
  label = '',
): MediaStreamTrack {
  return {
    kind,
    label,
    readyState,
    id: `${kind}-${label || settings['deviceId'] || 'x'}`,
    getSettings: () => settings,
  } as unknown as MediaStreamTrack;
}

describe('classifyScreenAudio', () => {
  it('sem faixa ou faixa encerrada é none', () => {
    expect(classifyScreenAudio(null, null).kind).toBe('none');
    expect(
      classifyScreenAudio(fakeTrack('video'), fakeTrack('audio', { deviceId: 'loopback' }, 'ended')).kind,
    ).toBe('none');
  });

  it('superfície browser é tab mesmo com loopback', () => {
    const video = fakeTrack('video', { displaySurface: 'browser' });
    const audio = fakeTrack('audio', { deviceId: 'loopback' }, 'live', 'Tab audio');
    expect(classifyScreenAudio(video, audio).kind).toBe('tab');
  });

  it('loopbackWithoutChrome é system-clean', () => {
    const video = fakeTrack('video', { displaySurface: 'monitor' });
    const audio = fakeTrack('audio', { deviceId: 'loopbackWithoutChrome' });
    expect(classifyScreenAudio(video, audio).kind).toBe('system-clean');
  });

  it('família loopback* (exceto WithoutChrome) é leaky', () => {
    const video = fakeTrack('video', { displaySurface: 'monitor' });
    expect(classifyScreenAudio(video, fakeTrack('audio', { deviceId: 'loopback' })).kind).toBe('system-leaky');
    expect(classifyScreenAudio(video, fakeTrack('audio', { deviceId: 'loopbackWithMute' })).kind).toBe(
      'system-leaky',
    );
  });

  it('deviceId default ou vazio é leaky', () => {
    const video = fakeTrack('video', { displaySurface: 'monitor' });
    expect(classifyScreenAudio(video, fakeTrack('audio', { deviceId: 'default' })).kind).toBe('system-leaky');
    expect(classifyScreenAudio(video, fakeTrack('audio', { deviceId: '' })).kind).toBe('system-leaky');
    expect(classifyScreenAudio(video, fakeTrack('audio', {})).kind).toBe('system-leaky');
  });

  it('outro deviceId em janela é app', () => {
    const video = fakeTrack('video', { displaySurface: 'window' });
    const audio = fakeTrack('audio', { deviceId: 'hashed-app-audio' }, 'live', 'Application Audio');
    expect(classifyScreenAudio(video, audio).kind).toBe('app');
  });

  it('outro deviceId em monitor é leaky', () => {
    const video = fakeTrack('video', { displaySurface: 'monitor' });
    const audio = fakeTrack('audio', { deviceId: 'unknown-hash' });
    expect(classifyScreenAudio(video, audio).kind).toBe('system-leaky');
  });

  it('janela desktop sem displaySurface usa o tipo da fonte', () => {
    expect(effectiveDisplaySurface(fakeTrack('video', {}), 'window')).toBe('window');
    const audio = fakeTrack('audio', { deviceId: 'app-1' });
    expect(classifyScreenAudio(fakeTrack('video', {}), audio, 'window').kind).toBe('app');
  });
});

describe('isLegacyHicallElectron', () => {
  afterEach(() => {
    delete (window as Window & { hicallDesktop?: unknown }).hicallDesktop;
  });

  it('fora do app não é legado', () => {
    expect(isLegacyHicallElectron('Mozilla/5.0 Chrome/141')).toBeFalse();
  });

  it('Electron abaixo de 43 no app é legado', () => {
    window.hicallDesktop = {
      isDesktop: true,
      getSources: async () => [],
      prepareCapture: async () => ({ ok: true }),
    };
    expect(isLegacyHicallElectron('Mozilla/5.0 Electron/35.7.5')).toBeTrue();
    expect(leakyScreenAudioHint('Mozilla/5.0 Electron/35.7.5')).toBe('leaky-update-app');
  });

  it('Electron 44 no app não é legado', () => {
    window.hicallDesktop = {
      isDesktop: true,
      getSources: async () => [],
      prepareCapture: async () => ({ ok: true }),
    };
    expect(isLegacyHicallElectron('Mozilla/5.0 Electron/44.7.0')).toBeFalse();
    expect(leakyScreenAudioHint('Mozilla/5.0 Electron/44.7.0')).toBe('leaky');
  });
});
