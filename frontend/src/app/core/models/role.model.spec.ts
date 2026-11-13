import { EMPTY_PERMISSIONS, permissionsOf } from './role.model';

describe('permissionsOf', () => {
  it('returns empty permissions when server has none', () => {
    expect(permissionsOf(null)).toEqual(EMPTY_PERMISSIONS);
    expect(permissionsOf({}).can_create_channels).toBeFalse();
  });

  it('returns server permissions when present', () => {
    const permissions = { ...EMPTY_PERMISSIONS, can_kick_call: true, deny_chat: true };
    expect(permissionsOf({ permissions }).can_kick_call).toBeTrue();
    expect(permissionsOf({ permissions }).deny_chat).toBeTrue();
    expect(permissionsOf({ permissions }).can_manage_roles).toBeFalse();
  });
});
