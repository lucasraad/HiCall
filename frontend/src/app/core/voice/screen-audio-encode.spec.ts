import { SCREEN_AUDIO_MAX_BITRATE, applyScreenAudioSenderParams, screenAudioFmtpFlags, tuneScreenAudioSdp } from './screen-audio-encode';

const OFFER = [
  'v=0',
  'o=- 0 0 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0 1 2',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=mid:0',
  'a=rtpmap:96 H264/90000',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=mid:1',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=mid:2',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  '',
].join('\r\n');

describe('tuneScreenAudioSdp', () => {
  it('só mexe no m=audio da tela; mic e vídeo ficam iguais', () => {
    const tuned = tuneScreenAudioSdp(OFFER, '2');
    expect(tuned).toContain('a=mid:1\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n');
    expect(tuned).toContain(`maxaveragebitrate=${SCREEN_AUDIO_MAX_BITRATE}`);
    expect(tuned).toContain('stereo=1');
    expect(screenAudioFmtpFlags(tuned, '2').stereo).toBeTrue();
    expect(screenAudioFmtpFlags(tuned, '2').maxaveragebitrate).toBe(SCREEN_AUDIO_MAX_BITRATE);
    expect(screenAudioFmtpFlags(tuned, '1').stereo).toBeFalse();
    expect(tuned.includes('\r\n\r\n')).toBeFalse();
  });

  it('não mexe em offer só com mic', () => {
    const micOnly = [
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=mid:0',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;useinbandfec=1',
      '',
    ].join('\n');
    expect(tuneScreenAudioSdp(micOnly, null)).toBe(micOnly);
  });
});

describe('applyScreenAudioSenderParams', () => {
  it('prioriza o áudio da tela para o vídeo não derrubar o Opus', async () => {
    const encodings: RTCRtpEncodingParameters[] = [{ active: false, maxBitrate: 1 }];
    const setParameters = jasmine.createSpy('setParameters').and.resolveTo(undefined);
    const sender = {
      getParameters: () => ({ encodings }),
      setParameters,
    } as unknown as RTCRtpSender;

    await applyScreenAudioSenderParams(sender);

    expect(encodings[0].active).toBeTrue();
    expect(encodings[0].maxBitrate).toBe(SCREEN_AUDIO_MAX_BITRATE);
    expect(encodings[0].priority).toBe('high');
    expect(encodings[0].networkPriority).toBe('high');
    expect(setParameters).toHaveBeenCalled();
  });
});
