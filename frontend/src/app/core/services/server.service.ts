import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { KickServerResponse, Server, ServerMember } from '../models/server.model';

@Injectable({ providedIn: 'root' })
export class ServerService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<Server[]>(`${environment.apiUrl}/servers`);
  }

  create(name: string, password: string) {
    return this.http.post<Server>(`${environment.apiUrl}/servers`, { name, password });
  }

  update(serverId: number, payload: { name?: string; password?: string }) {
    return this.http.put<Server>(`${environment.apiUrl}/servers/${serverId}`, payload);
  }

  verify(inviteCode: string, password: string) {
    return this.http.post<Server>(`${environment.apiUrl}/servers/verify`, {
      invite_code: inviteCode,
      password,
    });
  }

  members(serverId: number) {
    return this.http.get<ServerMember[]>(`${environment.apiUrl}/servers/${serverId}/members`);
  }

  adminList() {
    return this.http.get<Server[]>(`${environment.apiUrl}/admin/servers`);
  }

  ban(serverId: number, userId: number) {
    return this.http.post<KickServerResponse>(`${environment.apiUrl}/servers/${serverId}/ban/${userId}`, {});
  }

  kick(serverId: number, userId: number) {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/servers/${serverId}/remove/${userId}`, {});
  }
}
