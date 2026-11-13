export interface VoiceChannelPresence {
  channel_id: number;
  peers: VoicePeer[];
}

export interface VoicePeer {
  user_id: number;
  sharing_screen: boolean;
  camera_on?: boolean;
  force_muted?: boolean;
  last_seen_at: string | null;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

export interface VoiceSignal {
  id: number;
  from_user_id: number;
  to_user_id: number;
  type: 'offer' | 'answer' | 'ice' | 'screen' | 'moderation';
  payload: Record<string, unknown>;
  created_at: string | null;
}

export interface VoiceParticipant {
  userId: number;
  name: string;
  isLocal: boolean;
  sharingScreen: boolean;
  audioMuted: boolean;
  /** Mutado por moderação (force_muted), distinto do mute local do mic. */
  forceMuted?: boolean;
  videoMuted: boolean;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
}

export type VoiceTileKind = 'participant' | 'screen';

export interface VoiceGridTile {
  key: string;
  kind: VoiceTileKind;
  userId: number;
  name: string;
  stream: MediaStream | null;
  showVideo: boolean;
  audioMuted: boolean;
  forceMuted?: boolean;
  videoMuted: boolean;
  isLocal: boolean;
  sharingScreen: boolean;
}
