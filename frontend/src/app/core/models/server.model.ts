import { Channel } from './channel.model';
import { ServerPermissions, ServerRole } from './role.model';

export interface Server {
  id: number;
  name: string;
  invite_code: string;
  owner_id: number;
  membership_role?: string;
  is_owner: boolean;
  permissions?: ServerPermissions;
  assigned_role?: ServerRole | null;
  member_count?: number;
  credentials_rotated_at: string | null;
  created_at: string | null;
  password?: string;
  channels?: Channel[];
}

export interface ServerMember {
  id: number;
  role: string;
  role_id?: number | null;
  joined_at: string | null;
  assigned_role?: ServerRole | null;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

export interface KickServerResponse {
  message: string;
  server: Server & { password: string; invite_code: string };
}
