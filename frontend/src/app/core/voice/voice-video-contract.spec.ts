import {
  classifyGpuRenderer,
  parseScreenQualityId,
  resolveScreenQuality,
  screenQualityPreset,
  visibleScreenQualityOptions,
  type ScreenEncodeCaps,
} from './screen-quality';
import {
  CAMERA_MAX_BITRATE,
  CAMERA_MAX_FRAMERATE,
  OUTBOUND_VIDEO_FPS,
  OUTBOUND_VIDEO_HEIGHT,
  OUTBOUND_VIDEO_WIDTH,
  SCREEN_CAPTURE_FPS,
  SCREEN_CONTENT_HINT,
  SCREEN_ENCODE_FPS,
  SCREEN_MAX_BITRATE,
  isContractResolution,
  isPlaceholderResolution,
  outboundVideoEncodings,
  outboundVideoEncodingsForTrack,
  screenCaptureVideoConstraints,
  screenTrackApplyConstraints,
} from './voice-video-contract';

describe('voice-video-contract 1080p câmera; tela default 4K60', () => {
  it('fixa câmera em 1920×1080 30; tela default 4K 60', () => {
    expect(OUTBOUND_VIDEO_WIDTH).toBe(1920);
    expect(OUTBOUND_VIDEO_HEIGHT).toBe(1080);
    expect(OUTBOUND_VIDEO_FPS).toBe(30);
    expect(SCREEN_CAPTURE_FPS).toBe(60);
    expect(SCREEN_ENCODE_FPS).toBe(60);
    expect(isContractResolution(1920, 1080)).toBeTrue();
    expect(isContractResolution(16, 16)).toBeFalse();
  });

  it('rejeita placeholder 16×16 que trava o encoder do Chrome', () => {
    expect(isPlaceholderResolution(16, 16)).toBeTrue();
    expect(isPlaceholderResolution(64, 64)).toBeTrue();
    expect(isPlaceholderResolution(1920, 1080)).toBeFalse();
  });

  it('tela default: 35 Mbps e 60 fps; câmera: 1.5 Mbps e 30 fps', () => {
    expect(outboundVideoEncodings(true)).toEqual({
      maxBitrate: 35_000_000,
      maxFramerate: 60,
      scaleResolutionDownBy: 1,
    });
    expect(SCREEN_MAX_BITRATE).toBe(35_000_000);
    expect(outboundVideoEncodings(false)).toEqual({
      maxBitrate: CAMERA_MAX_BITRATE,
      maxFramerate: CAMERA_MAX_FRAMERATE,
      scaleResolutionDownBy: 1,
    });
    expect(CAMERA_MAX_BITRATE).toBe(1_500_000);
    expect(CAMERA_MAX_FRAMERATE).toBe(30);
  });

  it('captura nativa 4K60 com contentHint motion para jogos', () => {
    const capture = screenCaptureVideoConstraints();
    const apply = screenTrackApplyConstraints();
    expect(capture.width).toEqual({ ideal: 3840 });
    expect(capture.height).toEqual({ ideal: 2160 });
    expect(capture.frameRate).toEqual({ ideal: 60, max: 60 });
    expect(apply.width).toEqual({ ideal: 3840 });
    expect(apply.height).toEqual({ ideal: 2160 });
    expect(apply.frameRate).toEqual({ ideal: 60, max: 60 });
    expect(SCREEN_CONTENT_HINT).toBe('motion');
  });

  it('preset 720p30 muda width/height/frameRate e bitrate', () => {
    const quality = screenQualityPreset('720p30');
    const capture = screenCaptureVideoConstraints(quality);
    const apply = screenTrackApplyConstraints(quality);
    expect(capture.width).toEqual({ ideal: 1280 });
    expect(capture.height).toEqual({ ideal: 720 });
    expect(capture.frameRate).toEqual({ ideal: 30, max: 30 });
    expect(apply.width).toEqual({ ideal: 1280 });
    expect(apply.height).toEqual({ ideal: 720 });
    expect(apply.frameRate).toEqual({ ideal: 30, max: 30 });
    expect(outboundVideoEncodings(true, quality)).toEqual({
      maxBitrate: 2_500_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    });
  });

  it('preset 1080p60 vs 4K30 muda teto de encode', () => {
    expect(outboundVideoEncodings(true, screenQualityPreset('1080p60')).maxFramerate).toBe(60);
    expect(outboundVideoEncodings(true, screenQualityPreset('1080p60')).maxBitrate).toBe(14_000_000);
    const uhd = outboundVideoEncodings(true, screenQualityPreset('2160p30'));
    expect(uhd.maxFramerate).toBe(30);
    expect(uhd.maxBitrate).toBe(20_000_000);
    expect(screenCaptureVideoConstraints(screenQualityPreset('2160p30')).width).toEqual({
      ideal: 3840,
    });
    expect(screenCaptureVideoConstraints(screenQualityPreset('2160p60')).frameRate).toEqual({
      ideal: 60,
      max: 60,
    });
  });

  it('scaleResolutionDownBy quando o track nativo fica maior que o preset', () => {
    const track = {
      getSettings: () => ({ width: 3840, height: 2160 }),
    } as MediaStreamTrack;
    expect(
      outboundVideoEncodingsForTrack(true, screenQualityPreset('1080p60'), track).scaleResolutionDownBy,
    ).toBe(2);
  });
});

describe('screen-quality GPU', () => {
  it('RTX 4080 Super é strong e libera 4K60', () => {
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER Direct3D11 vs_5_0)')).toBe(
      'strong',
    );
    const caps: ScreenEncodeCaps = {
      gpuClass: 'strong',
      renderer: 'RTX 4080 SUPER',
      hasH264: true,
      hasAv1: true,
      allow1440p60: true,
      allow2160p30: true,
      allow2160p60: true,
    };
    const ids = visibleScreenQualityOptions(caps).map((option) => option.id);
    expect(ids).toContain('2160p30');
    expect(ids).toContain('2160p60');
    expect(resolveScreenQuality('auto', caps).id).toBe('2160p60');
    expect(resolveScreenQuality('2160p60', caps).id).toBe('2160p60');
  });

  it('Intel UHD é weak: Auto vira 1080p30; 4K60 cai para 1080p60', () => {
    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11)')).toBe('weak');
    const caps: ScreenEncodeCaps = {
      gpuClass: 'weak',
      renderer: 'UHD 630',
      hasH264: true,
      hasAv1: false,
      allow1440p60: false,
      allow2160p30: false,
      allow2160p60: false,
    };
    expect(resolveScreenQuality('auto', caps).id).toBe('1080p30');
    expect(resolveScreenQuality('2160p60', caps).id).toBe('1080p60');
    expect(visibleScreenQualityOptions(caps).map((option) => option.id)).toContain('2160p60');
  });

  it('parse ignorante volta para 4K60', () => {
    expect(parseScreenQualityId('nope')).toBe('2160p60');
    expect(parseScreenQualityId('2160p60')).toBe('2160p60');
  });
});
