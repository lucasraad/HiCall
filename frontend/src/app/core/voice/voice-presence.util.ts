import { VoiceParticipant, VoicePeer } from '../models/voice.model';

/** No canal da call, a lista ao vivo substitui o presence HTTP (entra e sai na hora). */
export function mergeLiveCallOccupants(
  presence: Record<number, VoicePeer[]>,
  channelId: number | null,
  participants: VoiceParticipant[],
): Record<number, VoicePeer[]> {
  if (channelId == null || participants.length === 0) {
    return presence;
  }

  const previous = presence[channelId] ?? [];
  const byId = new Map(previous.map((peer) => [peer.user_id, peer]));
  const peers = participants.map((participant) => {
    const existing = byId.get(participant.userId);
    return {
      user_id: participant.userId,
      sharing_screen: participant.sharingScreen,
      camera_on: !participant.videoMuted,
      force_muted: participant.forceMuted === true,
      last_seen_at: existing?.last_seen_at ?? null,
      user: existing?.user ?? {
        id: participant.userId,
        name: participant.name,
        email: '',
      },
    };
  });

  return { ...presence, [channelId]: peers };
}
