export type NoiseFilterMode = 'off' | 'standard' | 'high' | 'post';

export const NOISE_FILTER_STORAGE_KEY = 'hicall.noiseFilter';

export function parseNoiseFilterMode(raw: string | null | undefined): NoiseFilterMode {
  if (raw === 'off' || raw === 'standard' || raw === 'high' || raw === 'post') {
    return raw;
  }
  return 'standard';
}

export function usesOutboundRnnoise(mode: NoiseFilterMode): boolean {
  return mode === 'high' || mode === 'post';
}

export function usesInboundRnnoise(mode: NoiseFilterMode): boolean {
  return mode === 'post';
}

/** No pós-processamento o stream da UI não pode levar a faixa crua — senão o <audio> toca original + RNNoise. */
export function voicePlaybackTracks(
  tracks: MediaStreamTrack[],
  inboundRnnoise: boolean,
  processedAudio: MediaStreamTrack | null = null,
): MediaStreamTrack[] {
  if (!inboundRnnoise) {
    return tracks;
  }
  const playback = tracks.filter((track) => track.kind !== 'audio');
  if (processedAudio && processedAudio.readyState !== 'ended') {
    playback.push(processedAudio);
  }
  return playback;
}

export function readStoredNoiseFilterMode(): NoiseFilterMode {
  try {
    return parseNoiseFilterMode(localStorage.getItem(NOISE_FILTER_STORAGE_KEY));
  } catch {
    return 'standard';
  }
}

export function writeStoredNoiseFilterMode(mode: NoiseFilterMode): void {
  try {
    localStorage.setItem(NOISE_FILTER_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Constraints só do microfone da call — nunca do loopback da tela.
 * Padrão = NS/AEC/AGC do Chromium. Alto/Pós = AEC/AGC nativos + RNNoise no worklet.
 */
export function micCaptureConstraints(
  deviceId: string | undefined,
  mode: NoiseFilterMode,
  exact = false,
): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {};
  if (deviceId) {
    constraints.deviceId = exact ? { exact: deviceId } : { ideal: deviceId };
  }
  constraints.echoCancellation = true;
  constraints.noiseSuppression = mode === 'standard';
  constraints.autoGainControl = true;
  return constraints;
}

const RNNOISE_WASM = '/rnnoise/rnnoise.wasm';
const RNNOISE_WASM_SIMD = '/rnnoise/rnnoise_simd.wasm';
const RNNOISE_WORKLET = '/rnnoise/rnnoiseWorklet.js';

type RnnoiseNode = AudioWorkletNode & { destroy?: () => void };

let sharedWasm: ArrayBuffer | null = null;
let sharedWasmPromise: Promise<ArrayBuffer> | null = null;

async function loadWasmBinary(): Promise<ArrayBuffer> {
  if (sharedWasm) {
    return sharedWasm.slice(0);
  }
  if (!sharedWasmPromise) {
    sharedWasmPromise = import('@sapphi-red/web-noise-suppressor').then(({ loadRnnoise }) =>
      loadRnnoise({
        url: RNNOISE_WASM,
        simdUrl: RNNOISE_WASM_SIMD,
      }),
    );
  }
  sharedWasm = await sharedWasmPromise;
  return sharedWasm.slice(0);
}

/**
 * Pipeline RNNoise no track de áudio (mic ou voz recebida), antes do PeerConnection / playback.
 * Se o WASM/worklet falhar, devolve o track original.
 */
export class MicRnnoisePipeline {
  constructor(private readonly silent = false) {}

  private context: AudioContext | null = null;
  private workletReady = false;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: RnnoiseNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private output: MediaStreamTrack | null = null;
  private input: MediaStreamTrack | null = null;
  private muteListener: (() => void) | null = null;

  inputTrackId(): string | null {
    return this.input?.id ?? null;
  }

  currentOutput(): MediaStreamTrack | null {
    return this.output;
  }

  async apply(rawTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    if (typeof AudioContext === 'undefined' || !rawTrack || rawTrack.kind !== 'audio') {
      return rawTrack;
    }
    if (
      this.input === rawTrack &&
      this.output &&
      this.output.readyState === 'live' &&
      this.context?.state !== 'closed'
    ) {
      this.syncMute(rawTrack, this.output);
      return this.output;
    }

    this.resetGraph();

    try {
      const context = await this.ensureContext();
      const { RnnoiseWorkletNode } = await import('@sapphi-red/web-noise-suppressor');
      if (!this.workletReady) {
        await context.audioWorklet.addModule(RNNOISE_WORKLET);
        this.workletReady = true;
      }

      const wasmBinary = await loadWasmBinary();
      const node = new RnnoiseWorkletNode(context, {
        wasmBinary,
        maxChannels: 1,
      }) as RnnoiseNode;
      const source = context.createMediaStreamSource(new MediaStream([rawTrack]));
      const destination = context.createMediaStreamDestination();
      source.connect(node);
      node.connect(destination);

      const processed = destination.stream.getAudioTracks()[0];
      if (!processed) {
        this.teardownGraph(source, node, destination);
        return rawTrack;
      }

      this.source = source;
      this.node = node;
      this.destination = destination;
      this.output = processed;
      this.input = rawTrack;
      this.bindMute(rawTrack, processed);
      return processed;
    } catch {
      this.resetGraph();
      return rawTrack;
    }
  }

  destroy(): void {
    this.resetGraph();
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.workletReady = false;
  }

  private async ensureContext(): Promise<AudioContext> {
    if (this.context && this.context.state !== 'closed') {
      if (this.context.state === 'suspended') {
        await this.context.resume().catch(() => undefined);
      }
      return this.context;
    }
    const base: AudioContextOptions = { sampleRate: 48000, latencyHint: 'interactive' };
    let context: AudioContext;
    if (this.silent) {
      try {
        context = new AudioContext({ ...base, sinkId: { type: 'none' } } as AudioContextOptions);
      } catch {
        context = new AudioContext(base);
      }
    } else {
      context = new AudioContext(base);
    }
    if (context.state === 'suspended') {
      await context.resume().catch(() => undefined);
    }
    this.context = context;
    this.workletReady = false;
    return context;
  }

  private bindMute(raw: MediaStreamTrack, processed: MediaStreamTrack): void {
    this.unbindMute();
    const sync = (): void => this.syncMute(raw, processed);
    raw.addEventListener('mute', sync);
    raw.addEventListener('unmute', sync);
    this.muteListener = () => {
      raw.removeEventListener('mute', sync);
      raw.removeEventListener('unmute', sync);
    };
    sync();
  }

  private unbindMute(): void {
    this.muteListener?.();
    this.muteListener = null;
  }

  private syncMute(raw: MediaStreamTrack, processed: MediaStreamTrack): void {
    processed.enabled = raw.enabled;
  }

  private resetGraph(): void {
    this.unbindMute();
    this.teardownGraph(this.source, this.node, this.destination);
    this.source = null;
    this.node = null;
    this.destination = null;
    this.output = null;
    this.input = null;
  }

  private teardownGraph(
    source: MediaStreamAudioSourceNode | null,
    node: RnnoiseNode | null,
    destination: MediaStreamAudioDestinationNode | null,
  ): void {
    try {
      source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      node?.disconnect();
      node?.destroy?.();
    } catch {
      /* ignore */
    }
    try {
      destination?.disconnect();
    } catch {
      /* ignore */
    }
    destination?.stream.getTracks().forEach((track) => track.stop());
  }
}

function replaceStreamAudio(stream: MediaStream, audio: MediaStreamTrack): void {
  for (const track of [...stream.getAudioTracks()]) {
    if (track.id !== audio.id) {
      stream.removeTrack(track);
    }
  }
  if (!stream.getAudioTracks().some((track) => track.id === audio.id)) {
    stream.addTrack(audio);
  }
}

/** Um pipeline RNNoise por peer, só na voz recebida (não na tela). */
export class InboundRnnoiseBank {
  private readonly pipelines = new Map<number, MicRnnoisePipeline>();
  private readonly generations = new Map<number, number>();
  private readonly locks = new Map<number, Promise<void>>();

  currentOutput(userId: number): MediaStreamTrack | null {
    return this.pipelines.get(userId)?.currentOutput() ?? null;
  }

  applyToVoiceStream(
    userId: number,
    playback: MediaStream,
    rawTrack: MediaStreamTrack | null,
    enabled: boolean,
  ): Promise<void> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.applyToVoiceStreamLocked(userId, playback, rawTrack, enabled));
    this.locks.set(userId, next);
    return next;
  }

  private async applyToVoiceStreamLocked(
    userId: number,
    playback: MediaStream,
    rawTrack: MediaStreamTrack | null,
    enabled: boolean,
  ): Promise<void> {
    const generation = (this.generations.get(userId) ?? 0) + 1;
    this.generations.set(userId, generation);
    if (!enabled) {
      this.drop(userId);
      return;
    }

    const raw = rawTrack && rawTrack.kind === 'audio' && rawTrack.readyState !== 'ended' ? rawTrack : null;
    if (!raw) {
      this.drop(userId);
      return;
    }

    let pipe = this.pipelines.get(userId);
    if (!pipe) {
      pipe = new MicRnnoisePipeline(true);
      this.pipelines.set(userId, pipe);
    }

    const processed = await pipe.apply(raw);
    if (this.generations.get(userId) !== generation) {
      return;
    }
    if (processed !== raw) {
      replaceStreamAudio(playback, processed);
      return;
    }
    replaceStreamAudio(playback, raw);
  }

  drop(userId: number): void {
    this.generations.set(userId, (this.generations.get(userId) ?? 0) + 1);
    const pipe = this.pipelines.get(userId);
    pipe?.destroy();
    this.pipelines.delete(userId);
  }

  destroy(): void {
    for (const userId of [...this.pipelines.keys()]) {
      this.drop(userId);
    }
    this.pipelines.clear();
    this.generations.clear();
  }
}
