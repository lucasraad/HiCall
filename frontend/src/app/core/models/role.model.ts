export const ROLE_POWER_FLAGS = [
  'can_create_channels',
  'can_kick_call',
  'can_kick_server',
  'can_ban_server',
  'can_mute_call',
] as const;

export const ROLE_DENY_FLAGS = [
  'deny_screen',
  'deny_camera',
  'deny_voice',
  'deny_chat',
] as const;

export type RolePowerFlag = (typeof ROLE_POWER_FLAGS)[number];
export type RoleDenyFlag = (typeof ROLE_DENY_FLAGS)[number];
export type RoleFlag = RolePowerFlag | RoleDenyFlag;

export interface ServerPermissions {
  can_create_channels: boolean;
  can_kick_call: boolean;
  can_kick_server: boolean;
  can_ban_server: boolean;
  can_mute_call: boolean;
  deny_screen: boolean;
  deny_camera: boolean;
  deny_voice: boolean;
  deny_chat: boolean;
  can_manage_roles: boolean;
  can_manage_server: boolean;
}

export interface ServerRole {
  id: number;
  server_id: number;
  name: string;
  position?: number;
  can_create_channels: boolean;
  can_kick_call: boolean;
  can_kick_server: boolean;
  can_ban_server: boolean;
  can_mute_call: boolean;
  deny_screen: boolean;
  deny_camera: boolean;
  deny_voice: boolean;
  deny_chat: boolean;
  created_at: string | null;
}

export type RolePayload = {
  name: string;
  position?: number;
} & Partial<Record<RoleFlag, boolean>>;

export const EMPTY_PERMISSIONS: ServerPermissions = {
  can_create_channels: false,
  can_kick_call: false,
  can_kick_server: false,
  can_ban_server: false,
  can_mute_call: false,
  deny_screen: false,
  deny_camera: false,
  deny_voice: false,
  deny_chat: false,
  can_manage_roles: false,
  can_manage_server: false,
};

export const ROLE_FLAG_LABELS: Record<RoleFlag, string> = {
  can_create_channels: 'Criar canais',
  can_kick_call: 'Expulsar da chamada',
  can_kick_server: 'Expulsar do servidor',
  can_ban_server: 'Banir do servidor',
  can_mute_call: 'Mutar na chamada',
  deny_screen: 'Bloquear transmissão de tela',
  deny_camera: 'Bloquear câmera',
  deny_voice: 'Bloquear microfone',
  deny_chat: 'Bloquear chat',
};

export function emptyRolePayload(name = ''): RolePayload {
  return {
    name,
    can_create_channels: false,
    can_kick_call: false,
    can_kick_server: false,
    can_ban_server: false,
    can_mute_call: false,
    deny_screen: false,
    deny_camera: false,
    deny_voice: false,
    deny_chat: false,
  };
}

export function permissionsOf(server: { permissions?: ServerPermissions } | null | undefined): ServerPermissions {
  return server?.permissions ?? EMPTY_PERMISSIONS;
}
