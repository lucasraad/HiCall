import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { VoiceChannelPresence, VoicePeer, VoiceSignal } from '../models/voice.model';

@Injectable({ providedIn: 'root' })
export class VoiceSignalingService {
  private readonly http = inject(HttpClient);

  join(channelId: number) {
    return this.http.post<VoicePeer[]>(`${environment.apiUrl}/channels/${channelId}/voice/join`, {});
  }

  leave(channelId: number) {
    return this.http.post<void>(`${environment.apiUrl}/channels/${channelId}/voice/leave`, {});
  }

  heartbeat(channelId: number) {
    return this.http.post<{ ok: boolean; force_muted?: boolean }>(
      `${environment.apiUrl}/channels/${channelId}/voice/heartbeat`,
      {},
    );
  }

  peers(channelId: number) {
    return this.http.get<VoicePeer[]>(`${environment.apiUrl}/channels/${channelId}/voice/peers`);
  }

  presence(serverId: number) {
    return this.http.get<VoiceChannelPresence[]>(`${environment.apiUrl}/servers/${serverId}/voice/presence`);
  }

  setScreenSharing(channelId: number, sharing: boolean) {
    return this.setMediaState(channelId, sharing);
  }

  setMediaState(channelId: number, sharing: boolean, cameraOn?: boolean) {
    const body: { sharing_screen: boolean; camera_on?: boolean } = { sharing_screen: sharing };
    if (cameraOn !== undefined) {
      body.camera_on = cameraOn;
    }
    return this.http.put<{ ok: boolean }>(`${environment.apiUrl}/channels/${channelId}/voice/screen`, body);
  }

  pollSignals(channelId: number, afterId?: number) {
    let params = new HttpParams();
    if (afterId !== undefined && afterId !== null) {
      params = params.set('after_id', String(afterId));
    }
    return this.http.get<VoiceSignal[]>(`${environment.apiUrl}/channels/${channelId}/voice/signals`, { params });
  }

  sendSignal(channelId: number, toUserId: number, type: VoiceSignal['type'], payload: Record<string, unknown>) {
    return this.http.post<VoiceSignal>(`${environment.apiUrl}/channels/${channelId}/voice/signals`, {
      to_user_id: toUserId,
      type,
      payload,
    });
  }

  kickFromCall(channelId: number, userId: number) {
    return this.http.post<{ ok: boolean }>(`${environment.apiUrl}/channels/${channelId}/voice/kick/${userId}`, {});
  }

  muteInCall(channelId: number, userId: number, muted: boolean) {
    return this.http.post<{ ok: boolean; force_muted: boolean }>(
      `${environment.apiUrl}/channels/${channelId}/voice/mute/${userId}`,
      { muted },
    );
  }
}
