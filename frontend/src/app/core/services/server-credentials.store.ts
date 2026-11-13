import { Injectable } from '@angular/core';

const STORAGE_KEY = 'hicall_server_credentials';

@Injectable({ providedIn: 'root' })
export class ServerCredentialsStore {
  save(serverId: number, inviteCode: string, password: string, rotatedAt: string | null = null): void {
    const all = this.readAll();
    all[String(serverId)] = { serverId, inviteCode, password, rotatedAt };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  get(serverId: number) {
    return this.readAll()[String(serverId)] ?? null;
  }

  getByCode(inviteCode: string) {
    const all = Object.values(this.readAll());
    return all.find((item) => item.inviteCode === inviteCode.toUpperCase()) ?? null;
  }

  remove(serverId: number): void {
    const all = this.readAll();
    delete all[String(serverId)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  private readAll(): Record<string, { serverId: number; inviteCode: string; password: string; rotatedAt: string | null }> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, { serverId: number; inviteCode: string; password: string; rotatedAt: string | null }>;
    } catch {
      return {};
    }
  }
}
