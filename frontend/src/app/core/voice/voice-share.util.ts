export function coerceSharingFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function mergeSharingFromPoll(
  local: boolean,
  fromApi: boolean,
  screenStartThisTick: boolean,
  screenStopThisTick = false,
): boolean {
  if (screenStopThisTick) {
    return false;
  }
  if (screenStartThisTick || fromApi) {
    return true;
  }
  return local;
}

export function shouldAcceptRemoteOffer(options: {
  polite: boolean;
  makingOffer: boolean;
  signalingState: string;
}): boolean {
  const colliding = options.makingOffer || options.signalingState !== 'stable';
  if (!colliding) {
    return true;
  }
  return options.polite;
}

export type VoiceLinkStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function isPeerConnectionUp(state: {
  connectionState: string;
  iceConnectionState: string;
}): boolean {
  return (
    state.connectionState === 'connected' ||
    state.iceConnectionState === 'connected' ||
    state.iceConnectionState === 'completed'
  );
}

export function isPeerConnectionDown(state: { connectionState: string }): boolean {
  return state.connectionState === 'failed' || state.connectionState === 'disconnected';
}

/**
 * Quem já entrou não volta para "conectando" quando chega mais gente.
 * Conectado = sala vazia ou pelo menos um PC com ICE ok.
 */
export function deriveVoiceLinkStatus(options: {
  inCall: boolean;
  alreadyJoined: boolean;
  remotes: Array<{ connectionState: string; iceConnectionState: string }>;
}): VoiceLinkStatus {
  if (!options.inCall) {
    return 'idle';
  }

  const remotes = options.remotes.filter((state) => state.connectionState !== 'closed');
  if (remotes.length === 0 || remotes.some(isPeerConnectionUp)) {
    return 'connected';
  }
  if (options.alreadyJoined && remotes.every(isPeerConnectionDown)) {
    return 'reconnecting';
  }
  if (options.alreadyJoined) {
    return 'connected';
  }
  return 'connecting';
}
