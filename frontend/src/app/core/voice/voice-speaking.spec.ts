import { rmsFromAnalyser, rmsToDbfs, VoiceSpeakingMonitor } from './voice-speaking';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeReceiver(level: number | null, ageMs = 0): RTCRtpReceiver {
  return {
    getSynchronizationSources: () => {
      if (level == null) {
        return [];
      }
      return [
        {
          timestamp: performance.timeOrigin + performance.now() - ageMs,
          audioLevel: level,
          source: 1,
        },
      ];
    },
  } as RTCRtpReceiver;
}

describe('voice-speaking', () => {
  it('RMS de silêncio (128) é ~0', () => {
    const analyser = {
      fftSize: 8,
      getByteTimeDomainData: (data: Uint8Array) => {
        data.fill(128);
      },
    } as AnalyserNode;
    expect(rmsFromAnalyser(analyser)).toBeLessThan(0.01);
  });

  it('−30 dBFS corresponde ao limiar de liga', () => {
    expect(rmsToDbfs(0.031622776)).toBeCloseTo(-30, 1);
  });

  it('troca de faixa descarta a anterior e anexa a nova', async () => {
    if (typeof AudioContext === 'undefined') {
      pending('AudioContext indisponível');
      return;
    }
    const ctx = new AudioContext();
    const destA = ctx.createMediaStreamDestination();
    const destB = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    osc.frequency.value = 1000;
    osc.connect(destA);
    osc.connect(destB);
    osc.start();
    const monitor = new VoiceSpeakingMonitor();
    const seen: number[][] = [];
    monitor.start((ids) => seen.push([...ids]));
    monitor.sync(new Map([[7, { track: destA.stream.getAudioTracks()[0] }]]), 7);
    await wait(80);
    monitor.sync(new Map([[7, { track: destB.stream.getAudioTracks()[0] }]]), 7);
    await wait(80);
    monitor.stop();
    osc.stop();
    await ctx.close();
    expect().nothing();
  });

  it('emite só quando o conjunto muda', async () => {
    const monitor = new VoiceSpeakingMonitor();
    const seen: number[][] = [];
    monitor.start((ids) => seen.push([...ids]));
    const receiver = fakeReceiver(0.2);
    const track = { kind: 'audio', id: 'r1', readyState: 'live' } as unknown as MediaStreamTrack;
    monitor.sync(new Map([[4, { track, receiver }]]));
    await wait(120);
    const afterSpeak = seen.length;
    expect(afterSpeak).toBeGreaterThan(0);
    await wait(120);
    expect(seen.length).toBe(afterSpeak);
    monitor.stop();
  });

  it('hangover mantém fala curta e apaga depois de 300 ms', async () => {
    const monitor = new VoiceSpeakingMonitor();
    let latest: number[] = [];
    let level = 0.2;
    const receiver = {
      getSynchronizationSources: () => [
        {
          timestamp: performance.timeOrigin + performance.now(),
          audioLevel: level,
          source: 1,
        },
      ],
    } as RTCRtpReceiver;
    const track = { kind: 'audio', id: 'r2', readyState: 'live' } as unknown as MediaStreamTrack;
    monitor.start((ids) => {
      latest = ids;
    });
    monitor.sync(new Map([[5, { track, receiver }]]));
    await wait(80);
    expect(latest).toContain(5);
    level = 0;
    await wait(80);
    expect(latest).toContain(5);
    await wait(320);
    expect(latest).not.toContain(5);
    monitor.stop();
  });

  it('nível remoto recente, velho e ausente', async () => {
    const monitor = new VoiceSpeakingMonitor();
    let latest: number[] = [];
    monitor.start((ids) => {
      latest = ids;
    });
    const track = { kind: 'audio', id: 'r3', readyState: 'live' } as unknown as MediaStreamTrack;

    monitor.sync(new Map([[8, { track, receiver: fakeReceiver(0.2, 0) }]]));
    await wait(80);
    expect(latest).toContain(8);

    monitor.sync(new Map([[8, { track, receiver: fakeReceiver(0.2, 400) }]]));
    await wait(400);
    expect(latest).not.toContain(8);

    monitor.sync(new Map([[8, { track, receiver: fakeReceiver(null) }]]));
    await wait(80);
    expect(latest).not.toContain(8);
    monitor.stop();
  });
});
