import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { User, UserRole } from '../models/user.model';

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
}

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<User[]>(`${environment.apiUrl}/admin/users`);
  }

  create(payload: CreateUserPayload) {
    return this.http.post<User>(`${environment.apiUrl}/admin/users`, payload);
  }

  update(userId: number, payload: UpdateUserPayload) {
    return this.http.put<User>(`${environment.apiUrl}/admin/users/${userId}`, payload);
  }

  ban(userId: number) {
    return this.http.post<User>(`${environment.apiUrl}/admin/users/${userId}/ban`, {});
  }

  unban(userId: number) {
    return this.http.post<User>(`${environment.apiUrl}/admin/users/${userId}/unban`, {});
  }
}
