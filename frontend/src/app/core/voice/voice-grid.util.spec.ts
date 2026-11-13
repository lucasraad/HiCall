import { VoiceParticipant } from '../models/voice.model';
import { buildVoiceGridTiles, isRenderableVideoTrack, sharingLabel } from './voice-grid.util';

function participant(overrides: Partial<VoiceParticipant>): VoiceParticipant {
  return {
    userId: 7,
    name: 'Ana',
    isLocal: false,
    sharingScreen: false,
    audioMuted: false,
    videoMuted: true,
    cameraStream: null,
    screenStream: null,
    ...overrides,
  };
}

describe('voice-grid.util', () => {
  it('ignora faixa placeholder 16×16', () => {
    const track = { enabled: true, readyState: 'live', muted: false, getSettings: () => ({ width: 16 }) } as MediaStreamTrack;
    expect(isRenderableVideoTrack(track)).toBeFalse();
  });

  it('aceita faixa de câmera com resolução real', () => {
    const track = { enabled: true, readyState: 'live', muted: false, getSettings: () => ({ width: 1280 }) } as MediaStreamTrack;
    expect(isRenderableVideoTrack(track)).toBeTrue();
  });

  it('aceita faixa de tela 1080p30 e rejeita 16×16 no mesmo grid', () => {
    const screenTrack = {
      enabled: true,
      readyState: 'live',
      muted: false,
      getSettings: () => ({ width: 1920, height: 1080, frameRate: 30 }),
    } as MediaStreamTrack;
    const placeholder = {
      enabled: true,
      readyState: 'live',
      muted: false,
      getSettings: () => ({ width: 16, height: 16 }),
    } as MediaStreamTrack;
    expect(isRenderableVideoTrack(screenTrack)).toBeTrue();
    expect(isRenderableVideoTrack(placeholder)).toBeFalse();
  });

  it('mostra tile de tela e tile de câmera remota juntos', () => {
    const screenTrack = {
      enabled: true,
      readyState: 'live',
      muted: false,
      getSettings: () => ({ width: 1920, height: 1080, frameRate: 30 }),
    } as MediaStreamTrack;
    const cameraTrack = {
      enabled: true,
      readyState: 'live',
      muted: false,
      getSettings: () => ({ width: 1280, height: 720 }),
    } as MediaStreamTrack;
    const tiles = buildVoiceGridTiles([
      participant({
        sharingScreen: true,
        videoMuted: false,
        screenStream: { getVideoTracks: () => [screenTrack] } as unknown as MediaStream,
        cameraStream: { getVideoTracks: () => [cameraTrack] } as unknown as MediaStream,
      }),
    ]);

    const screen = tiles.find((tile) => tile.kind === 'screen');
    const camera = tiles.find((tile) => tile.kind === 'participant');
    expect(screen?.showVideo).toBeTrue();
    expect(camera?.showVideo).toBeTrue();
    expect(sharingLabel(screen!)).toBe('Tela — Ana');
  });

  it('gera tile de tela mesmo sem frames quando sharingScreen é true', () => {
    const tiles = buildVoiceGridTiles([
      participant({ sharingScreen: true, screenStream: null }),
    ]);

    const screen = tiles.find((tile) => tile.kind === 'screen');
    expect(screen).toBeTruthy();
    expect(screen?.audioMuted).toBeTrue();
    expect(screen?.userId).toBe(7);
    expect(sharingLabel(screen!)).toBe('Tela — Ana');
  });

  it('não gera tile de tela para peer só com áudio', () => {
    const tiles = buildVoiceGridTiles([participant({ sharingScreen: false })]);

    expect(tiles.length).toBe(1);
    expect(tiles[0].kind).toBe('participant');
    expect(tiles.some((tile) => tile.kind === 'screen')).toBeFalse();
  });

  it('associa o badge de transmissão ao userId que está compartilhando', () => {
    const tiles = buildVoiceGridTiles([
      participant({ userId: 7, name: 'Ana', sharingScreen: true }),
      participant({ userId: 8, name: 'Beto', sharingScreen: false }),
    ]);

    const ana = tiles.find((tile) => tile.kind === 'participant' && tile.userId === 7);
    const beto = tiles.find((tile) => tile.kind === 'participant' && tile.userId === 8);

    expect(ana?.sharingScreen).toBeTrue();
    expect(sharingLabel(ana!)).toContain('Transmitindo');
    expect(beto?.sharingScreen).toBeFalse();
    expect(sharingLabel(beto!)).toBe('Beto');
  });
});
