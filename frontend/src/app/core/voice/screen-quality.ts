export type ScreenQualityId =
  | 'auto'
  | '720p30'
  | '1080p30'
  | '1080p60'
  | '1440p60'
  | '2160p30'
  | '2160p60';

export type GpuEncodeClass = 'weak' | 'typical' | 'strong';

export interface ResolvedScreenQuality {
  id: Exclude<ScreenQualityId, 'auto'>;
  label: string;
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
}

export interface ScreenQualityOption {
  id: ScreenQualityId;
  label: string;
}

export interface ScreenEncodeCaps {
  gpuClass: GpuEncodeClass;
  renderer: string;
  hasH264: boolean;
  hasAv1: boolean;
  allow1440p60: boolean;
  allow2160p30: boolean;
  allow2160p60: boolean;
}

export const SCREEN_QUALITY_STORAGE_KEY = 'hicall.screenQuality';
const SCREEN_QUALITY_MIGRATION_KEY = 'hicall.screenQuality.migrate';
const SCREEN_QUALITY_MIGRATION = 'v2-4k60';

const PRESETS: Record<Exclude<ScreenQualityId, 'auto'>, ResolvedScreenQuality> = {
  '720p30': {
    id: '720p30',
    label: '720p 30',
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 2_500_000,
  },
  '1080p30': {
    id: '1080p30',
    label: '1080p 30',
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 6_000_000,
  },
  '1080p60': {
    id: '1080p60',
    label: '1080p 60',
    width: 1920,
    height: 1080,
    frameRate: 60,
    maxBitrate: 14_000_000,
  },
  '1440p60': {
    id: '1440p60',
    label: '1440p 60',
    width: 2560,
    height: 1440,
    frameRate: 60,
    maxBitrate: 18_000_000,
  },
  '2160p30': {
    id: '2160p30',
    label: '4K 30',
    width: 3840,
    height: 2160,
    frameRate: 30,
    maxBitrate: 20_000_000,
  },
  '2160p60': {
    id: '2160p60',
    label: '4K 60',
    width: 3840,
    height: 2160,
    frameRate: 60,
    maxBitrate: 35_000_000,
  },
};

/** Padrão da tela: 4K60. Câmera continua 1080p no canvas. */
export const DEFAULT_SCREEN_QUALITY: ResolvedScreenQuality = PRESETS['2160p60'];
export const DEFAULT_SCREEN_QUALITY_ID: ScreenQualityId = '2160p60';

const ALWAYS_VISIBLE: ScreenQualityOption[] = [
  { id: 'auto', label: 'Automático' },
  { id: '720p30', label: '720p 30' },
  { id: '1080p30', label: '1080p 30' },
  { id: '1080p60', label: '1080p 60' },
  { id: '1440p60', label: '1440p 60' },
  { id: '2160p30', label: '4K 30' },
  { id: '2160p60', label: '4K 60' },
];

export function screenQualityPreset(id: Exclude<ScreenQualityId, 'auto'>): ResolvedScreenQuality {
  return PRESETS[id];
}

export function parseScreenQualityId(raw: string | null | undefined): ScreenQualityId {
  switch (raw) {
    case 'auto':
    case '720p30':
    case '1080p30':
    case '1080p60':
    case '1440p60':
    case '2160p30':
    case '2160p60':
      return raw;
    default:
      return DEFAULT_SCREEN_QUALITY_ID;
  }
}

export function readStoredScreenQualityId(): ScreenQualityId {
  try {
    if (localStorage.getItem(SCREEN_QUALITY_MIGRATION_KEY) !== SCREEN_QUALITY_MIGRATION) {
      localStorage.setItem(SCREEN_QUALITY_STORAGE_KEY, DEFAULT_SCREEN_QUALITY_ID);
      localStorage.setItem(SCREEN_QUALITY_MIGRATION_KEY, SCREEN_QUALITY_MIGRATION);
      return DEFAULT_SCREEN_QUALITY_ID;
    }
    const stored = localStorage.getItem(SCREEN_QUALITY_STORAGE_KEY);
    return stored ? parseScreenQualityId(stored) : DEFAULT_SCREEN_QUALITY_ID;
  } catch {
    return DEFAULT_SCREEN_QUALITY_ID;
  }
}

export function writeStoredScreenQualityId(id: ScreenQualityId): void {
  try {
    localStorage.setItem(SCREEN_QUALITY_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function classifyGpuRenderer(renderer: string): GpuEncodeClass {
  const text = renderer.toLowerCase();
  if (!text) {
    return 'typical';
  }
  if (/swiftshader|llvmpipe|microsoft basic render|softpipe/.test(text)) {
    return 'weak';
  }
  if (
    /rtx\s*(20|30|40|50)/.test(text) ||
    /geforce\s*rtx/.test(text) ||
    /quadro\s*rtx/.test(text) ||
    /radeon\s*rx\s*(6|7|9)\d/.test(text) ||
    /radeon\s*rx\s*7\d{3}/.test(text) ||
    /arc\s*(a|b)\d/.test(text)
  ) {
    return 'strong';
  }
  if (/intel.*(uhd|hd graphics|iris xe)/.test(text) && !/arc/.test(text)) {
    return 'weak';
  }
  return 'typical';
}

export function readGpuRenderer(): string {
  if (typeof document === 'undefined') {
    return '';
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      return '';
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) {
      return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
    }
    return String(gl.getParameter(gl.RENDERER) ?? '');
  } catch {
    return '';
  }
}

export function listVideoSenderCodecs(): string[] {
  try {
    return (RTCRtpSender.getCapabilities?.('video')?.codecs ?? []).map((codec) =>
      codec.mimeType.toLowerCase(),
    );
  } catch {
    return [];
  }
}

async function encodingLooksOk(
  width: number,
  height: number,
  framerate: number,
  bitrate: number,
): Promise<boolean> {
  const mediaCapabilities = (
    navigator as Navigator & {
      mediaCapabilities?: {
        encodingInfo?: (config: unknown) => Promise<{ supported?: boolean; smooth?: boolean; powerEfficient?: boolean }>;
      };
    }
  ).mediaCapabilities;
  if (!mediaCapabilities?.encodingInfo) {
    return false;
  }
  try {
    const info = await mediaCapabilities.encodingInfo({
      type: 'webrtc',
      video: {
        contentType: 'video/H264; codecs="avc1.4d401f"',
        width,
        height,
        bitrate,
        framerate,
      },
    });
    return !!info.supported && (!!info.smooth || !!info.powerEfficient);
  } catch {
    return false;
  }
}

export async function probeScreenEncodeCaps(renderer = readGpuRenderer()): Promise<ScreenEncodeCaps> {
  const gpuClass = classifyGpuRenderer(renderer);
  const codecs = listVideoSenderCodecs();
  const hasH264 = codecs.some((mime) => mime === 'video/h264');
  const hasAv1 = codecs.some((mime) => mime === 'video/av1');
  const [ok1440, ok4k30, ok4k60] = await Promise.all([
    encodingLooksOk(2560, 1440, 60, 18_000_000),
    encodingLooksOk(3840, 2160, 30, 20_000_000),
    encodingLooksOk(3840, 2160, 60, 35_000_000),
  ]);

  const allow1440p60 = gpuClass !== 'weak' || ok1440;
  const allow2160p30 = gpuClass === 'strong' || ok4k30;
  const allow2160p60 = gpuClass === 'strong' || ok4k60;

  return {
    gpuClass,
    renderer,
    hasH264,
    hasAv1,
    allow1440p60,
    allow2160p30,
    allow2160p60,
  };
}

export function visibleScreenQualityOptions(_caps?: ScreenEncodeCaps): ScreenQualityOption[] {
  return [...ALWAYS_VISIBLE];
}

export function resolveScreenQuality(
  id: ScreenQualityId,
  caps: ScreenEncodeCaps | null = null,
): ResolvedScreenQuality {
  if (id !== 'auto' && PRESETS[id]) {
    if (id === '2160p60' && caps && !caps.allow2160p60) {
      return resolveScreenQuality(caps.allow2160p30 ? '2160p30' : '1080p60', caps);
    }
    if (id === '2160p30' && caps && !caps.allow2160p30) {
      return PRESETS['1080p60'];
    }
    if (id === '1440p60' && caps && !caps.allow1440p60) {
      return PRESETS['1080p60'];
    }
    return PRESETS[id];
  }

  if (caps?.gpuClass === 'weak') {
    return PRESETS['1080p30'];
  }
  return DEFAULT_SCREEN_QUALITY;
}

export function fallbackScreenEncodeCaps(): ScreenEncodeCaps {
  return {
    gpuClass: 'typical',
    renderer: '',
    hasH264: true,
    hasAv1: false,
    allow1440p60: true,
    allow2160p30: true,
    allow2160p60: true,
  };
}
