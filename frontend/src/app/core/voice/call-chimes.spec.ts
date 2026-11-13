import { playCallChime } from './call-chimes';

describe('playCallChime', () => {
  it('não lança em join e leave', async () => {
    await expectAsync(playCallChime('join')).toBeResolved();
    await expectAsync(playCallChime('leave')).toBeResolved();
  });
});
