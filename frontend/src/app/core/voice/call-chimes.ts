export type CallChimeKind = 'join' | 'leave';

const VOLUME = 0.08;
const NOTE_MS = 0.17;
const GAP = 0.09;

/**
 * Toques curtos estilo Discord (não é sample do Discord).
 * Entrada sobe; saída desce. Volume baixo de propósito.
 */
export async function playCallChime(kind: CallChimeKind, outputDeviceId = ''): Promise<void> {
  if (typeof AudioContext === 'undefined') {
    return;
  }

  const context = new AudioContext();
  try {
    const withSink = context as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (outputDeviceId && typeof withSink.setSinkId === 'function') {
      await withSink.setSinkId(outputDeviceId).catch(() => undefined);
    }
    if (context.state === 'suspended') {
      await Promise.race([
        context.resume().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 80)),
      ]);
    }
    if (context.state === 'suspended') {
      return;
    }

    const notes = kind === 'join' ? [523.25, 659.25] : [659.25, 493.88];
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);

    for (const [index, freq] of notes.entries()) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + index * GAP;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(VOLUME, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_MS);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + NOTE_MS + 0.02);
    }

    await new Promise((resolve) => setTimeout(resolve, 380));
  } catch {
    /* ignore */
  } finally {
    await context.close().catch(() => undefined);
  }
}
