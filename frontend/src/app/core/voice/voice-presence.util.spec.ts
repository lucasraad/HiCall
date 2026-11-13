import { VoiceParticipant, VoicePeer } from '../models/voice.model';
import { mergeLiveCallOccupants } from './voice-presence.util';

function peer(id: number, name: string): VoicePeer {
  return {
    user_id: id,
    sharing_screen: false,
    last_seen_at: '2026-10-03T12:00:00Z',
    user: { id, name, email: `${name}@test` },
  };
}

function participant(userId: number, name: string): VoiceParticipant {
  return {
    userId,
    name,
    isLocal: false,
    sharingScreen: false,
    audioMuted: false,
    videoMuted: true,
    cameraStream: null,
    screenStream: null,
  };
}

describe('mergeLiveCallOccupants', () => {
  it('no canal da call troca a lista pelo que está ao vivo e tira quem saiu', () => {
    const presence = {
      1: [peer(10, 'Ana'), peer(11, 'Beto')],
      2: [peer(12, 'Caio')],
    };
    const merged = mergeLiveCallOccupants(presence, 1, [participant(10, 'Ana'), participant(13, 'Duda')]);

    expect(merged[1].map((entry) => entry.user_id)).toEqual([10, 13]);
    expect(merged[1][0].user.email).toBe('Ana@test');
    expect(merged[1][1].user.name).toBe('Duda');
    expect(merged[2]).toEqual(presence[2]);
  });

  it('sem gente na call mantém o presence dos outros canais', () => {
    const presence = { 4: [peer(1, 'Ana')] };
    expect(mergeLiveCallOccupants(presence, 4, [])).toBe(presence);
    expect(mergeLiveCallOccupants(presence, null, [participant(1, 'Ana')])).toBe(presence);
  });
});