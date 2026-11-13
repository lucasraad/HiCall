export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_banned: boolean;
  banned_at: string | null;
}

export interface AuthResponse {
  user: User;
  token: string;
}
