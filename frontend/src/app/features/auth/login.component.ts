import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DESKTOP_SETUP_URL } from '../../core/desktop/desktop-download';
import { isHicallDesktop } from '../../core/desktop/hicall-desktop';
import { AuthService } from '../../core/services/auth.service';
import { extractErrorMessage } from '../../core/utils/http-error';
import { PasswordInputComponent } from '../../shared/components/password-input.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [PasswordInputComponent],
  template: `
    <main class="flex min-h-screen items-center justify-center bg-zinc-900 px-4">
      <section class="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 p-8 shadow-xl">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
            HC
          </div>
          <div>
            <h1 class="text-xl font-semibold tracking-tight text-zinc-100">HiCall</h1>
            <p class="text-sm text-zinc-400">Entre para acessar seus servidores</p>
          </div>
        </div>

        <form class="mt-6 space-y-4" (submit)="onSubmit($event)">
          <label class="block">
            <span class="mb-1 block text-sm text-zinc-300">E-mail</span>
            <input
              class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-brand"
              type="email"
              name="email"
              autocomplete="email"
              required
              placeholder="seu@email.com"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
            />
          </label>

          <app-password-input
            label="Senha"
            name="password"
            autocomplete="current-password"
            variant="dark"
            [value]="password()"
            (valueChange)="password.set($event)"
          />

          @if (error()) {
            <p class="text-sm text-red-400">{{ error() }}</p>
          }

          <button
            class="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            type="submit"
            [disabled]="loading()"
          >
            {{ loading() ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>

        @if (!isDesktop) {
          <p class="mt-4 text-center text-xs text-zinc-500">
            Para compartilhar YouTube em tela cheia sem a barra do Chrome,
            <a class="text-zinc-300 underline decoration-zinc-600 hover:text-white" [href]="desktopUrl">
              baixe o app Windows
            </a>.
          </p>
        }
      </section>
    </main>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isDesktop = isHicallDesktop();
  readonly desktopUrl = DESKTOP_SETUP_URL;

  onSubmit(event: Event): void {
    event.preventDefault();
    this.error.set(null);
    this.loading.set(true);

    this.auth.login(this.email(), this.password()).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl('/');
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, 'Não foi possível entrar.'));
      },
    });
  }
}
