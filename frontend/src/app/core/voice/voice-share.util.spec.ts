import {
  coerceSharingFlag,
  deriveVoiceLinkStatus,
  mergeSharingFromPoll,
  shouldAcceptRemoteOffer,
} from './voice-share.util';

describe('voice-share.util', () => {
  describe('coerceSharingFlag', () => {
    it('aceita true, 1 e "true"', () => {
      expect(coerceSharingFlag(true)).toBeTrue();
      expect(coerceSharingFlag(1)).toBeTrue();
      expect(coerceSharingFlag('1')).toBeTrue();
      expect(coerceSharingFlag('true')).toBeTrue();
    });

    it('rejeita false, 0, undefined e lixo', () => {
      expect(coerceSharingFlag(false)).toBeFalse();
      expect(coerceSharingFlag(0)).toBeFalse();
      expect(coerceSharingFlag('0')).toBeFalse();
      expect(coerceSharingFlag(undefined)).toBeFalse();
      expect(coerceSharingFlag(null)).toBeFalse();
      expect(coerceSharingFlag('no')).toBeFalse();
    });
  });

  describe('mergeSharingFromPoll', () => {
    it('mantém true local até chegar um stop (API false sozinha não apaga na hora do sinal)', () => {
      expect(mergeSharingFromPoll(true, false, true)).toBeTrue();
      expect(mergeSharingFromPoll(true, false, false)).toBeTrue();
      expect(mergeSharingFromPoll(false, true, false)).toBeTrue();
      expect(mergeSharingFromPoll(false, false, false)).toBeFalse();
    });

    it('sinal de stop vence API atrasada e o sticky local', () => {
      expect(mergeSharingFromPoll(true, true, false, true)).toBeFalse();
      expect(mergeSharingFromPoll(true, false, false, true)).toBeFalse();
    });
  });

  describe('shouldAcceptRemoteOffer', () => {
    it('aceita offer remota quando o signaling está estável', () => {
      expect(
        shouldAcceptRemoteOffer({
          polite: false,
          makingOffer: false,
          signalingState: 'stable',
        }),
      ).toBeTrue();
    });

    it('em glare, o peer educado aceita a offer de tela em vez de descartá-la', () => {
      expect(
        shouldAcceptRemoteOffer({
          polite: true,
          makingOffer: true,
          signalingState: 'have-local-offer',
        }),
      ).toBeTrue();
    });

    it('em glare, o peer não educado recusa a offer remota', () => {
      expect(
        shouldAcceptRemoteOffer({
          polite: false,
          makingOffer: false,
          signalingState: 'have-local-offer',
        }),
      ).toBeFalse();
    });
  });

  describe('deriveVoiceLinkStatus', () => {
    it('sala vazia fica connected', () => {
      expect(deriveVoiceLinkStatus({ inCall: true, alreadyJoined: false, remotes: [] })).toBe('connected');
    });

    it('quem entra espera ICE do primeiro peer', () => {
      expect(
        deriveVoiceLinkStatus({
          inCall: true,
          alreadyJoined: false,
          remotes: [{ connectionState: 'connecting', iceConnectionState: 'checking' }],
        }),
      ).toBe('connecting');
    });

    it('um peer com ICE ok basta — não espera todo mundo', () => {
      expect(
        deriveVoiceLinkStatus({
          inCall: true,
          alreadyJoined: false,
          remotes: [
            { connectionState: 'connected', iceConnectionState: 'connected' },
            { connectionState: 'connecting', iceConnectionState: 'checking' },
          ],
        }),
      ).toBe('connected');
    });

    it('quem já estava na call não volta para conectando quando chega mais gente', () => {
      expect(
        deriveVoiceLinkStatus({
          inCall: true,
          alreadyJoined: true,
          remotes: [{ connectionState: 'new', iceConnectionState: 'new' }],
        }),
      ).toBe('connected');
    });

    it('reconecta só se todos os PCs caíram', () => {
      expect(
        deriveVoiceLinkStatus({
          inCall: true,
          alreadyJoined: true,
          remotes: [{ connectionState: 'failed', iceConnectionState: 'failed' }],
        }),
      ).toBe('reconnecting');
    });
  });
});
