import {
  OUTBOUND_VIDEO_FPS,
  OUTBOUND_VIDEO_HEIGHT,
  OUTBOUND_VIDEO_WIDTH,
} from '../voice/voice-video-contract';
import {
  acquireDisplayMedia,
  isLikelyMicrophoneAudioTrack,
  pickScreenShareAudioTrack,
  screenShareMediaOptions,
} from './hicall-desktop';

describe('screenShareMediaOptions', () => {
  it('pede 4K60 na captura de tela (encode 60 no sender)', () => {
    const video = screenShareMediaOptions().video as MediaTrackConstraints;
    expect(video.width).toEqual({ ideal: 3840 });
    expect(video.height).toEqual({ ideal: 2160 });
    expect(video.frameRate).toEqual({ ideal: 60, max: 60 });
    expect(OUTBOUND_VIDEO_FPS).toBe(30);
    expect(OUTBOUND_VIDEO_WIDTH).toBe(1920);
    expect(OUTBOUND_VIDEO_HEIGHT).toBe(1080);
  });

  it('pede áudio do sistema no monitor e exclui a superfície do próprio HiCall', () => {
    const options = screenShareMediaOptions() as DisplayMediaStreamOptions & {
      systemAudio?: string;
      selfBrowserSurface?: string;
    };
    expect(options.audio).toBeTruthy();
    expect(options.systemAudio).toBe('include');
    expect(options.selfBrowserSurface).toBe('exclude');
    const audio = options.audio as MediaTrackConstraints;
    expect(audio.echoCancellation).toBeFalse();
    expect(audio.noiseSuppression).toBeFalse();
    expect(audio.autoGainControl).toBeFalse();
    expect(audio.channelCount).toBe(2);
    expect(audio.sampleRate).toBe(48000);
  });
});

describe('acquireDisplayMedia erros', () => {
  afterEach(() => {
    (navigator.mediaDevices.getDisplayMedia as jasmine.Spy | undefined)?.and?.stub?.();
  });

  it('NotAllowedError sobe sem retry', async () => {
    const getDisplayMedia = jasmine
      .createSpy('getDisplayMedia')
      .and.returnValue(Promise.reject(new DOMException('denied', 'NotAllowedError')));
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.callFake(getDisplayMedia);

    await expectAsync(acquireDisplayMedia()).toBeRejected();
    expect(getDisplayMedia.calls.count()).toBe(1);
  });

  it('NotFoundError sobe sem fallback', async () => {
    const getDisplayMedia = jasmine
      .createSpy('getDisplayMedia')
      .and.returnValue(Promise.reject(new DOMException('missing', 'NotFoundError')));
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.callFake(getDisplayMedia);

    await expectAsync(acquireDisplayMedia()).toBeRejected();
    expect(getDisplayMedia.calls.count()).toBe(1);
  });

  it('NotSupportedError sobe sem fallback', async () => {
    const getDisplayMedia = jasmine
      .createSpy('getDisplayMedia')
      .and.returnValue(Promise.reject(new DOMException('unsupported', 'NotSupportedError')));
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.callFake(getDisplayMedia);

    await expectAsync(acquireDisplayMedia()).toBeRejected();
    expect(getDisplayMedia.calls.count()).toBe(1);
  });

  it('NotReadableError faz um fallback audio:false', async () => {
    const stream = new MediaStream();
    const getDisplayMedia = jasmine.createSpy('getDisplayMedia').and.returnValues(
      Promise.reject(new DOMException('busy', 'NotReadableError')),
      Promise.resolve(stream),
    );
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.callFake(getDisplayMedia);

    const result = await acquireDisplayMedia();
    expect(result.stream).toBe(stream);
    expect(result.audioFailed).toBeTrue();
    expect(getDisplayMedia.calls.count()).toBe(2);
    expect(getDisplayMedia.calls.argsFor(1)[0]).toEqual(jasmine.objectContaining({ audio: false }));
  });

  it('AbortError faz um fallback audio:false', async () => {
    const stream = new MediaStream();
    const getDisplayMedia = jasmine.createSpy('getDisplayMedia').and.returnValues(
      Promise.reject(new DOMException('aborted', 'AbortError')),
      Promise.resolve(stream),
    );
    spyOn(navigator.mediaDevices, 'getDisplayMedia').and.callFake(getDisplayMedia);

    const result = await acquireDisplayMedia();
    expect(result.audioFailed).toBeTrue();
    expect(getDisplayMedia.calls.count()).toBe(2);
  });
});

describe('pickScreenShareAudioTrack', () => {
  it('ignora faixa de microfone e fica com o loopback', () => {
    const mic = { kind: 'audio', id: 'mic-1', label: 'Microfone (Headset)', readyState: 'live' } as unknown as MediaStreamTrack;
    const loopback = { kind: 'audio', id: 'sys-1', label: 'System Loopback', readyState: 'live' } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [mic, loopback],
    } as MediaStream;

    expect(isLikelyMicrophoneAudioTrack(mic, mic)).toBeTrue();
    expect(isLikelyMicrophoneAudioTrack(loopback, mic)).toBeFalse();
    expect(pickScreenShareAudioTrack(stream, mic)).toBe(loopback);
  });

  it('não envia o microfone da call como áudio da tela', () => {
    const mic = { kind: 'audio', id: 'mic-1', label: 'Microphone (Realtek)', readyState: 'live' } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [mic],
    } as MediaStream;

    expect(pickScreenShareAudioTrack(stream, mic)).toBeNull();
  });
});
