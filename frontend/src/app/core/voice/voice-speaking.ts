const SPEAK_ON_DBFS = -30;
const SPEAK_OFF_DBFS = -36;
const HANGOVER_MS = 300;
const TICK_MS = 50;
const SSRC_STALE_MS = 250;
const LOCAL_FFT_SIZE = 2048;

export interface SpeakingSource {
  track: MediaStreamTrack | null;
  receiver?: RTCRtpReceiver | null;
}

interface SpeakState {
  trackId: string;
  analyser: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
  receiver: RTCRtpReceiver | null;
  local: boolean;
  speaking: boolean;
  hangoverUntil: number;
}

export function rmsFromAnalyser(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (const sample of data) {
    const n = (sample - 128) / 128;
    sum += n * n;
  }
  return Math.sqrt(sum / data.length);
}

export function rmsToDbfs(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return 20 * Math.log10(rms);
}

export function audioLevelToDbfs(level: number): number {
  return rmsToDbfs(level);
}

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((id, index) => id === right[index]);
}

function ssrcAgeMs(timestamp: number, nowMs = performance.now()): number {
  return performance.timeOrigin + nowMs - timestamp;
}

function remoteLevelDbfs(receiver: RTCRtpReceiver | null): number | null {
  if (!receiver?.getSynchronizationSources) {
    return null;
  }
  const sources = receiver.getSynchronizationSources();
  if (!sources.length) {
    return null;
  }
  let best: RTCRtpSynchronizationSource | null = null;
  for (const source of sources) {
    if (best == null || source.timestamp > best.timestamp) {
      best = source;
    }
  }
  if (!best || ssrcAgeMs(best.timestamp) > SSRC_STALE_MS) {
    return Number.NEGATIVE_INFINITY;
  }
  if (typeof best.audioLevel !== 'number') {
    return null;
  }
  return audioLevelToDbfs(best.audioLevel);
}

/** Níveis só de voz (mic / transceiver de voz). Não usar track de tela/loopback. */
export class VoiceSpeakingMonitor {
  private context: AudioContext | null = null;
  private states = new Map<number, SpeakState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private onChange: ((ids: number[]) => void) | null = null;
  private lastEmitted: number[] = [];

  start(onChange: (ids: number[]) => void): void {
    this.onChange = onChange;
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clear();
    this.emit([]);
    this.onChange = null;
    this.lastEmitted = [];
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
  }

  sync(sources: Map<number, SpeakingSource>, localUserId: number | null = null): void {
    const keep = new Set(sources.keys());
    for (const userId of [...this.states.keys()]) {
      if (!keep.has(userId) || !sources.get(userId)?.track) {
        this.drop(userId);
      }
    }
    for (const [userId, source] of sources) {
      const track = source.track;
      if (!track || track.kind !== 'audio' || track.readyState !== 'live') {
        this.drop(userId);
        continue;
      }
      const current = this.states.get(userId);
      if (current && current.trackId !== track.id) {
        this.drop(userId);
      }
      const existing = this.states.get(userId);
      if (existing) {
        existing.receiver = source.receiver ?? null;
        existing.local = localUserId != null && userId === localUserId;
        continue;
      }
      this.attach(userId, track, source.receiver ?? null, localUserId != null && userId === localUserId);
    }
  }

  /** Compatível com o sync antigo baseado só em faixas. */
  syncTracks(tracks: Map<number, MediaStreamTrack | null>, localUserId: number | null = null): void {
    const sources = new Map<number, SpeakingSource>();
    for (const [userId, track] of tracks) {
      sources.set(userId, { track });
    }
    this.sync(sources, localUserId);
  }

  private attach(
    userId: number,
    track: MediaStreamTrack,
    receiver: RTCRtpReceiver | null,
    local: boolean,
  ): void {
    try {
      let analyser: AnalyserNode | null = null;
      let source: MediaStreamAudioSourceNode | null = null;
      if (local || !receiver) {
        const context = this.ensureContext();
        if (!context) {
          return;
        }
        source = context.createMediaStreamSource(new MediaStream([track]));
        analyser = context.createAnalyser();
        analyser.fftSize = LOCAL_FFT_SIZE;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
      }
      this.states.set(userId, {
        trackId: track.id,
        analyser,
        source,
        receiver,
        local,
        speaking: false,
        hangoverUntil: 0,
      });
    } catch {
      /* AudioContext/track */
    }
  }

  private drop(userId: number): void {
    const state = this.states.get(userId);
    if (!state) {
      return;
    }
    try {
      state.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.states.delete(userId);
  }

  private clear(): void {
    for (const userId of [...this.states.keys()]) {
      this.drop(userId);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') {
      return null;
    }
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ latencyHint: 'interactive' });
    }
    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
    return this.context;
  }

  private levelDbfs(state: SpeakState): number {
    if (!state.local && state.receiver) {
      const remote = remoteLevelDbfs(state.receiver);
      if (remote != null) {
        return remote;
      }
    }
    if (!state.analyser) {
      return Number.NEGATIVE_INFINITY;
    }
    return rmsToDbfs(rmsFromAnalyser(state.analyser));
  }

  private tick(): void {
    const now = Date.now();
    const speaking: number[] = [];
    for (const [userId, state] of this.states) {
      const dbfs = this.levelDbfs(state);
      if (dbfs >= SPEAK_ON_DBFS) {
        state.speaking = true;
        state.hangoverUntil = now + HANGOVER_MS;
      } else if (state.speaking && (dbfs >= SPEAK_OFF_DBFS || now < state.hangoverUntil)) {
        state.speaking = true;
      } else {
        state.speaking = false;
      }
      if (state.speaking) {
        speaking.push(userId);
      }
    }
    this.emit(speaking);
  }

  private emit(ids: number[]): void {
    if (sameIdSet(ids, this.lastEmitted)) {
      return;
    }
    this.lastEmitted = [...ids];
    this.onChange?.(ids);
  }
}
