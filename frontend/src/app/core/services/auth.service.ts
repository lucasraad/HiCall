import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthResponse, User } from '../models/user.model';

const TOKEN_KEY = 'hicall_token';
const USER_KEY = 'hicall_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(this.readUser());
  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly isAuthenticated = computed(() => !!this.token());
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/login`, { email, password })
      .pipe(tap((response) => this.persist(response)));
  }

  logout(): void {
    const token = this.token();
    if (token) {
      this.http.post(`${environment.apiUrl}/logout`, {}).subscribe({
        error: () => undefined,
      });
    }
    this.clear();
    void this.router.navigate(['/login']);
  }

  /** Token revogado (login noutro dispositivo) — sem POST /logout. */
  expireSession(): void {
    if (!this.token()) {
      return;
    }
    this.clear();
    void this.router.navigate(['/login']);
  }

  private persist(response: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this.token.set(response.token);
    this.user.set(response.user);
  }

  private clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
  }

  private readUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
}
