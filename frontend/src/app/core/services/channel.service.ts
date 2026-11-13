import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Channel } from '../models/channel.model';

@Injectable({ providedIn: 'root' })
export class ChannelService {
  private readonly http = inject(HttpClient);

  list(serverId: number) {
    return this.http.get<Channel[]>(`${environment.apiUrl}/servers/${serverId}/channels`);
  }

  create(serverId: number, name: string) {
    return this.http.post<Channel>(`${environment.apiUrl}/servers/${serverId}/channels`, { name });
  }

  update(channelId: number, name: string) {
    return this.http.put<Channel>(`${environment.apiUrl}/channels/${channelId}`, { name });
  }

  delete(channelId: number) {
    return this.http.delete<void>(`${environment.apiUrl}/channels/${channelId}`);
  }
}
