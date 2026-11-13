import { Component, inject, input, output } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { Server } from '../../core/models/server.model';
import {
  LucideLogIn,
  LucideLogOut,
  LucidePlus,
  LucideSettings,
} from '../../shared/icons/app-icons';

@Component({
  selector: 'app-server-rail',
  standalone: true,
  imports: [LucidePlus, LucideLogIn, LucideSettings, LucideLogOut],
  host: { class: 'flex h-full shrink-0' },
  template: `
    <aside class="flex h-full w-[72px] flex-col items-center gap-2 bg-zinc-900 py-3">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
        title="HiCall"
      >
        HC
      </div>

      <div class="my-1 h-px w-8 bg-zinc-700"></div>

      @for (server of servers(); track server.id) {
        <button
          class="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold transition-all"
          [class.bg-brand]="selectedServerId() === server.id"
          [class.text-white]="selectedServerId() === server.id"
          [class.rounded-2xl]="selectedServerId() === server.id"
          [class.bg-zinc-700]="selectedServerId() !== server.id"
          [class.text-zinc-200]="selectedServerId() !== server.id"
          [class.hover:bg-brand]="selectedServerId() !== server.id"
          [class.hover:rounded-2xl]="selectedServerId() !== server.id"
          [title]="server.name"
          type="button"
          (click)="selectServer.emit(server)"
        >
          {{ serverInitial(server.name) }}
        </button>
      }

      <button
        class="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-green-400 transition-colors hover:bg-green-600 hover:text-white"
        title="Criar servidor"
        type="button"
        (click)="createServer.emit()"
      >
        <svg lucidePlus class="h-5 w-5" strokeWidth="2.5"></svg>
      </button>

      <button
        class="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-green-400 transition-colors hover:bg-green-600 hover:text-white"
        title="Entrar com código"
        type="button"
        (click)="joinServer.emit()"
      >
        <svg lucideLogIn class="h-5 w-5" strokeWidth="2.5"></svg>
      </button>

      <div class="mt-auto flex flex-col items-center gap-3 pb-2">
        @if (auth.isAdmin()) {
          <button class="text-zinc-400 hover:text-white" type="button" title="Admin" (click)="openAdmin.emit()">
            <svg lucideSettings class="h-5 w-5"></svg>
          </button>
        }
        <button class="text-zinc-400 hover:text-white" type="button" (click)="auth.logout()" title="Sair">
          <svg lucideLogOut class="h-5 w-5"></svg>
        </button>
      </div>
    </aside>
  `,
})
export class ServerRailComponent {
  readonly auth = inject(AuthService);

  readonly servers = input.required<Server[]>();
  readonly selectedServerId = input<number | null>(null);

  readonly selectServer = output<Server>();
  readonly createServer = output<void>();
  readonly joinServer = output<void>();
  readonly openAdmin = output<void>();

  serverInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }
}
