import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Message } from '../models/message.model';

@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly http = inject(HttpClient);

  list(channelId: number, afterId?: number): Observable<Message[]> {
    let params = new HttpParams();
    if (afterId) {
      params = params.set('after_id', afterId);
    }
    return this.http.get<Message[]>(`${environment.apiUrl}/channels/${channelId}/messages`, { params });
  }

  send(channelId: number, body: string): Observable<Message> {
    return this.http.post<Message>(`${environment.apiUrl}/channels/${channelId}/messages`, { body });
  }
}
