import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { RolePayload, ServerRole } from '../models/role.model';
import { ServerMember } from '../models/server.model';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly http = inject(HttpClient);

  list(serverId: number) {
    return this.http.get<ServerRole[]>(`${environment.apiUrl}/servers/${serverId}/roles`);
  }

  create(serverId: number, payload: RolePayload) {
    return this.http.post<ServerRole>(`${environment.apiUrl}/servers/${serverId}/roles`, payload);
  }

  update(roleId: number, payload: RolePayload) {
    return this.http.put<ServerRole>(`${environment.apiUrl}/roles/${roleId}`, payload);
  }

  delete(roleId: number) {
    return this.http.delete<void>(`${environment.apiUrl}/roles/${roleId}`);
  }

  assign(serverId: number, userId: number, roleId: number | null) {
    return this.http.put<ServerMember>(`${environment.apiUrl}/servers/${serverId}/members/${userId}/role`, {
      role_id: roleId,
    });
  }
}
