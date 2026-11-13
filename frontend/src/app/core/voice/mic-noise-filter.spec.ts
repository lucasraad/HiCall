import {
  micCaptureConstraints,
  parseNoiseFilterMode,
  usesInboundRnnoise,
  usesOutboundRnnoise,
  voicePlaybackTracks,
} from './mic-noise-filter';

describe('mic-noise-filter', () => {
  it('default inválido vira Padrão e permite desligar o redutor', () => {
    expect(parseNoiseFilterMode(null)).toBe('standard');
    expect(parseNoiseFilterMode('nope')).toBe('standard');
    expect(parseNoiseFilterMode('off')).toBe('off');
    expect(micCaptureConstraints(undefined, 'off').noiseSuppression).toBeFalse();
    expect(usesOutboundRnnoise('off')).toBeFalse();
    expect(usesInboundRnnoise('off')).toBeFalse();
  });

  it('aceita Padrão, Alto e Pós-processamento', () => {
    expect(parseNoiseFilterMode('standard')).toBe('standard');
    expect(parseNoiseFilterMode('high')).toBe('high');
    expect(parseNoiseFilterMode('post')).toBe('post');
  });

  it('Padrão liga noiseSuppression/echoCancellation/autoGainControl', () => {
    const constraints = micCaptureConstraints('mic-1', 'standard', true);
    expect(constraints.deviceId).toEqual({ exact: 'mic-1' });
    expect(constraints.noiseSuppression).toBeTrue();
    expect(constraints.echoCancellation).toBeTrue();
    expect(constraints.autoGainControl).toBeTrue();
  });

  it('Alto deixa AEC/AGC e desliga NS do browser (RNNoise no worklet)', () => {
    const constraints = micCaptureConstraints('mic-1', 'high');
    expect(constraints.noiseSuppression).toBeFalse();
    expect(constraints.echoCancellation).toBeTrue();
    expect(constraints.autoGainControl).toBeTrue();
  });

  it('Pós-processamento usa as mesmas constraints de captura do Alto', () => {
    const high = micCaptureConstraints('mic-1', 'high', true);
    const post = micCaptureConstraints('mic-1', 'post', true);
    expect(post).toEqual(high);
    expect(usesOutboundRnnoise('high')).toBeTrue();
    expect(usesOutboundRnnoise('post')).toBeTrue();
    expect(usesOutboundRnnoise('standard')).toBeFalse();
    expect(usesInboundRnnoise('post')).toBeTrue();
    expect(usesInboundRnnoise('high')).toBeFalse();
  });

  it('no pós-processamento o playback não mistura faixa crua com a processada', () => {
    const raw = { id: 'raw', kind: 'audio', readyState: 'live' } as MediaStreamTrack;
    const video = { id: 'cam', kind: 'video', readyState: 'live' } as MediaStreamTrack;
    const processed = { id: 'rnnoise', kind: 'audio', readyState: 'live' } as MediaStreamTrack;
    expect(voicePlaybackTracks([video, raw], false)).toEqual([video, raw]);
    expect(voicePlaybackTracks([video, raw], true)).toEqual([video]);
    expect(voicePlaybackTracks([video, raw], true, processed)).toEqual([video, processed]);
  });
});
