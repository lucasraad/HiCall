import { VoiceGridTile, VoiceParticipant } from '../models/voice.model';

/** Placeholder 16×16 não conta como câmera; só faixa com resolução real. */
export function isRenderableVideoTrack(track: MediaStreamTrack | undefined | null): boolean {
  if (!track || !track.enabled || track.readyState !== 'live') {
    return false;
  }
  const width = track.getSettings?.().width ?? 0;
  if (width > 0 && width <= 64) {
    return false;
  }
  return !track.muted || width > 64;
}

export function buildVoiceGridTiles(participants: VoiceParticipant[]): VoiceGridTile[] {
  const tiles: VoiceGridTile[] = [];

  for (const participant of participants) {
    const hasCameraVideo =
      !participant.videoMuted &&
      (!!participant.cameraStream?.getVideoTracks().some((track) => isRenderableVideoTrack(track)) ||
        (!participant.isLocal && !!participant.cameraStream));

    tiles.push({
      key: `user-${participant.userId}`,
      kind: 'participant',
      userId: participant.userId,
      name: participant.name,
      stream: participant.cameraStream,
      showVideo: hasCameraVideo,
      audioMuted: participant.audioMuted,
      forceMuted: participant.forceMuted === true,
      videoMuted: participant.videoMuted,
      isLocal: participant.isLocal,
      sharingScreen: participant.sharingScreen,
    });

    if (participant.sharingScreen) {
      const screenStream = participant.screenStream;
      const screenTrack = screenStream?.getVideoTracks()[0];
      const hasScreenVideo = !!screenTrack && screenTrack.readyState !== 'ended';

      tiles.push({
        key: `screen-${participant.userId}`,
        kind: 'screen',
        userId: participant.userId,
        name: participant.name,
        stream: screenStream,
        showVideo: hasScreenVideo || !!screenStream,
        audioMuted: true,
        forceMuted: participant.forceMuted === true,
        videoMuted: true,
        isLocal: participant.isLocal,
        sharingScreen: true,
      });
    }
  }

  return tiles;
}

export function sharingLabel(tile: VoiceGridTile): string {
  if (tile.kind === 'screen') {
    return `Tela — ${tile.name}`;
  }
  if (tile.sharingScreen) {
    return `${tile.name} · Transmitindo`;
  }
  return tile.name;
}
