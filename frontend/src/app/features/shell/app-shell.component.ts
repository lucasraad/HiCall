import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, EMPTY, exhaustMap, interval, startWith } from 'rxjs';
import { Channel } from '../../core/models/channel.model';
import { emptyRolePayload, permissionsOf, ROLE_DENY_FLAGS, ROLE_FLAG_LABELS, ROLE_POWER_FLAGS, RoleFlag, ServerRole } from '../../core/models/role.model';
import { Server, ServerMember } from '../../core/models/server.model';
import { VoiceChannelPresence, VoicePeer } from '../../core/models/voice.model';
import { AuthService } from '../../core/services/auth.service';
import { ChannelService } from '../../core/services/channel.service';
import { RoleService } from '../../core/services/role.service';
import { ServerCredentialsStore } from '../../core/services/server-credentials.store';
import { ServerService } from '../../core/services/server.service';
import { VoiceSignalingService } from '../../core/services/voice-signaling.service';
import { extractErrorMessage } from '../../core/utils/http-error';
import { LucideMenu } from '../../shared/icons/app-icons';
import { PasswordInputComponent } from '../../shared/components/password-input.component';
import { ChannelListComponent } from './channel-list.component';
import { ChannelViewComponent } from '../channel/channel-view.component';
import { ServerRailComponent } from './server-rail.component';
import { AdminUsersComponent } from '../admin/admin-users.component';
import { VoiceRtcService } from '../../core/services/voice-rtc.service';
import { mergeLiveCallOccupants } from '../../core/voice/voice-presence.util';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    ServerRailComponent,
    ChannelListComponent,
    ChannelViewComponent,
    PasswordInputComponent,
    LucideMenu,
    AdminUsersComponent,
  ],
  template: `
    <div class="flex h-dvh w-full min-w-0 overflow-hidden bg-zinc-900">
      @if (mobileNavOpen()) {
        <button
          class="fixed inset-0 z-30 bg-black/60 md:hidden"
          type="button"
          aria-label="Fechar menu de servidores"
          (click)="closeMobileNav()"
        ></button>
      }

      <div class="hicall-sidebar z-40 flex h-full shrink-0" [class.hicall-sidebar--open]="mobileNavOpen()">
        <app-server-rail
          [servers]="servers()"
          [selectedServerId]="selectedServer()?.id ?? null"
          (selectServer)="onSelectServer($event)"
          (createServer)="openCreateServer()"
          (joinServer)="openJoinServer()"
          (openAdmin)="adminOpen.set(true)"
        />

        <app-channel-list
          [server]="selectedServer()"
          [channels]="channels()"
          [selectedChannelId]="selectedChannel()?.id ?? null"
          [occupantsByChannel]="occupantsByChannel()"
          [speakingUserIds]="voice.speakingUserIds()"
          (selectChannel)="onSelectChannel($event)"
          (createChannel)="openCreateChannel()"
          (manageServer)="openManageServer()"
        />
      </div>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header class="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-2 md:hidden">
          <button
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-200 hover:bg-zinc-800"
            type="button"
            data-testid="mobile-nav-toggle"
            [attr.aria-expanded]="mobileNavOpen()"
            aria-label="Abrir servidores e canais"
            (click)="toggleMobileNav()"
          >
            <svg lucideMenu class="h-5 w-5"></svg>
          </button>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-zinc-100">
              {{ selectedChannel()?.name ?? selectedServer()?.name ?? 'HiCall' }}
            </p>
            @if (selectedChannel() && selectedServer()) {
              <p class="truncate text-[11px] text-zinc-400">{{ selectedServer()!.name }}</p>
            }
          </div>
        </header>

        <app-channel-view
          class="min-h-0 flex-1"
          [server]="selectedServer()"
          [channel]="selectedChannel()"
        />
      </div>
    </div>

    @if (adminOpen()) {
      <div class="fixed inset-0 z-[60] bg-zinc-900">
        <app-admin-users [asOverlay]="true" (closeOverlay)="adminOpen.set(false)" />
      </div>
    }

    @if (error()) {
      <p class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded bg-red-900 px-4 py-2 text-sm text-red-100">
        {{ error() }}
      </p>
    }

    @if (showCreateServer()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <form class="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 p-6" (submit)="createServer($event)">
          <h2 class="text-base font-medium text-white">Novo servidor</h2>
          <label class="mt-4 block">
            <span class="mb-1 block text-sm text-zinc-300">Nome</span>
            <input
              class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
              required
              [value]="createServerName()"
              (input)="createServerName.set($any($event.target).value)"
            />
          </label>
          <div class="mt-4">
            <app-password-input label="Senha" [minlength]="4" [value]="createServerPassword()" (valueChange)="createServerPassword.set($event)" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button class="rounded-md px-3 py-2 text-sm text-zinc-400" type="button" (click)="closeModals()">Cancelar</button>
            <button class="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white" type="submit" [disabled]="loading()">
              {{ loading() ? 'Criando...' : 'Criar' }}
            </button>
          </div>
        </form>
      </div>
    }

    @if (showJoinServer()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <form class="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 p-6" (submit)="joinServer($event)">
          <h2 class="text-base font-medium text-white">Entrar em um servidor</h2>
          <label class="mt-4 block">
            <span class="mb-1 block text-sm text-zinc-300">Código</span>
            <input
              class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm uppercase text-white outline-none focus:border-brand"
              required
              [value]="joinCode()"
              (input)="joinCode.set($any($event.target).value)"
            />
          </label>
          <div class="mt-4">
            <app-password-input label="Senha" [value]="joinPassword()" (valueChange)="joinPassword.set($event)" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button class="rounded-md px-3 py-2 text-sm text-zinc-400" type="button" (click)="closeModals()">Cancelar</button>
            <button class="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white" type="submit" [disabled]="loading()">
              {{ loading() ? 'Validando...' : 'Entrar' }}
            </button>
          </div>
        </form>
      </div>
    }

    @if (showCreateChannel()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <form class="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 p-6" (submit)="createChannel($event)">
          <h2 class="text-base font-medium text-white">Novo canal</h2>
          <label class="mt-4 block">
            <span class="mb-1 block text-sm text-zinc-300">Nome</span>
            <input
              class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
              required
              [value]="createChannelName()"
              (input)="createChannelName.set($any($event.target).value)"
            />
          </label>
          <div class="mt-6 flex justify-end gap-2">
            <button class="rounded-md px-3 py-2 text-sm text-zinc-400" type="button" (click)="closeModals()">Cancelar</button>
            <button class="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white" type="submit" [disabled]="loading()">
              {{ loading() ? 'Criando...' : 'Criar' }}
            </button>
          </div>
        </form>
      </div>
    }

    @if (showManageServer()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div class="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          <h2 class="text-base font-medium text-white">Gerenciar servidor</h2>

          @if (selectedServer(); as srv) {
            <dl class="mt-4 space-y-2 text-sm">
              <div>
                <dt class="text-zinc-400">Código</dt>
                <dd class="font-medium text-zinc-200">{{ srv.invite_code }}</dd>
              </div>
              <div>
                <dt class="text-zinc-400">Membros</dt>
                <dd class="font-medium text-zinc-200">{{ srv.member_count ?? 1 }}</dd>
              </div>
            </dl>

            @if (canManageServer()) {
              <div class="mt-4 flex flex-wrap gap-2">
                <button
                  class="rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:border-brand"
                  type="button"
                  (click)="copyCredentials()"
                >
                  {{ copyFeedback() ?? 'Copiar código + senha' }}
                </button>
                <button
                  class="rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:border-brand"
                  type="button"
                  (click)="openEditServer()"
                >
                  Editar servidor
                </button>
              </div>
            }

            @if (canManageRoles()) {
              <section class="mt-5 border-t border-zinc-700 pt-4">
                <h3 class="text-sm font-medium text-zinc-100">Cargos</h3>
                <p class="mt-1 text-xs text-zinc-400">Níveis maiores podem moderar níveis menores. Cargos iguais não se moderam; sem cargo é nível 0. Dono e admin são protegidos.</p>

                <ul class="mt-3 space-y-2">
                  @for (role of roles(); track role.id) {
                    <li class="rounded-md border border-zinc-700 bg-zinc-900 p-3">
                      @if (editingRoleId() === role.id) {
                        <input
                          class="w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-white"
                          [value]="roleDraftName()"
                          (input)="roleDraftName.set($any($event.target).value)"
                        />
                        <label class="mt-2 block text-xs text-zinc-300">Nível (1 a 1000)
                          <input type="number" min="1" max="1000" class="ml-2 w-20 rounded bg-zinc-800 p-1" [value]="roleDraftPosition()" (input)="roleDraftPosition.set(+$any($event.target).value)" />
                        </label>
                        <div class="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                          @for (flag of roleFlags; track flag) {
                            <label class="flex items-center gap-2 text-xs text-zinc-300">
                              <input
                                type="checkbox"
                                [checked]="!!roleDraftFlags()[flag]"
                                (change)="toggleRoleDraftFlag(flag)"
                              />
                              {{ roleFlagLabels[flag] }}
                            </label>
                          }
                        </div>
                        <div class="mt-2 flex gap-2">
                          <button class="text-xs text-brand hover:underline" type="button" (click)="saveRole(role.id)">Salvar</button>
                          <button class="text-xs text-zinc-400 hover:underline" type="button" (click)="editingRoleId.set(null)">Cancelar</button>
                        </div>
                      } @else {
                        <div class="flex items-start justify-between gap-2">
                          <div>
                            <p class="text-sm text-zinc-100">{{ role.name }} · nível {{ role.position ?? 1 }}</p>
                            <p class="mt-0.5 text-xs text-zinc-500">{{ roleSummary(role) }}</p>
                          </div>
                          <div class="flex gap-2">
                            <button class="text-xs text-zinc-300 hover:text-white" type="button" (click)="startEditRole(role)">Editar</button>
                            <button class="text-xs text-red-400 hover:text-red-300" type="button" (click)="deleteRole(role.id)">Excluir</button>
                          </div>
                        </div>
                      }
                    </li>
                  } @empty {
                    <li class="text-xs text-zinc-500">Nenhum cargo ainda.</li>
                  }
                </ul>

                <form class="mt-3 rounded-md border border-dashed border-zinc-600 p-3" (submit)="createRole($event)">
                  <p class="text-xs font-medium text-zinc-300">Novo cargo</p>
                  <input
                    class="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                    placeholder="Nome"
                    required
                    [value]="newRoleName()"
                    (input)="newRoleName.set($any($event.target).value)"
                  />
                  <label class="mt-2 block text-xs text-zinc-300">Nível (1 a 1000)
                    <input type="number" min="1" max="1000" class="ml-2 w-20 rounded bg-zinc-900 p-1" [value]="newRolePosition()" (input)="newRolePosition.set(+$any($event.target).value)" />
                  </label>
                  <div class="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    @for (flag of roleFlags; track flag) {
                      <label class="flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          [checked]="!!newRoleFlags()[flag]"
                          (change)="toggleNewRoleFlag(flag)"
                        />
                        {{ roleFlagLabels[flag] }}
                      </label>
                    }
                  </div>
                  <button class="mt-3 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white" type="submit" [disabled]="loading()">
                    Criar cargo
                  </button>
                </form>
              </section>
            }

            <section class="mt-5 border-t border-zinc-700 pt-4">
              <h3 class="text-sm font-medium text-zinc-100">Membros</h3>
              <ul class="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                @for (member of members(); track member.id) {
                  <li class="flex flex-col gap-2 rounded bg-zinc-900 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span class="text-zinc-200">
                      {{ member.user.name }}
                      <span class="ml-1 text-xs text-zinc-500">{{ member.role === 'owner' ? 'dono' : (member.assigned_role?.name ?? 'membro') }}</span>
                    </span>
                    <div class="flex flex-wrap items-center gap-2">
                      @if (canManageRoles() && member.role !== 'owner' && member.user.id !== currentUserId()) {
                        <select
                          class="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                          [value]="member.role_id ?? ''"
                          (change)="assignRole(member.user.id, $any($event.target).value)"
                        >
                          <option value="">Sem cargo</option>
                          @for (role of roles(); track role.id) {
                            <option [value]="role.id">{{ role.name }}</option>
                          }
                        </select>
                      }
                      @if (canKickServer() && member.role !== 'owner' && member.user.id !== currentUserId()) {
                        <button class="text-xs text-red-400 hover:text-red-300" type="button" (click)="kickMember(member.user.id)">
                          Expulsar do servidor
                        </button>
                      }
                      @if (canBanServer() && member.role !== 'owner' && member.user.id !== currentUserId()) {
                        <button class="text-xs text-red-400 hover:text-red-300" type="button" (click)="banMember(member.user.id)">Banir do servidor</button>
                      }
                    </div>
                  </li>
                }
              </ul>
            </section>
          }

          <div class="mt-6 flex justify-end">
            <button class="rounded-md px-3 py-2 text-sm text-zinc-400" type="button" (click)="closeModals()">Fechar</button>
          </div>
        </div>
      </div>
    }

    @if (showEditServer()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <form class="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-800 p-6" (submit)="saveServer($event)">
          <h2 class="text-base font-medium text-white">Editar servidor</h2>
          <label class="mt-4 block">
            <span class="mb-1 block text-sm text-zinc-300">Nome</span>
            <input
              class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
              required
              [value]="editServerName()"
              (input)="editServerName.set($any($event.target).value)"
            />
          </label>
          <div class="mt-4">
            <app-password-input label="Nova senha (opcional)" [required]="false" [value]="editServerPassword()" (valueChange)="editServerPassword.set($event)" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button class="rounded-md px-3 py-2 text-sm text-zinc-400" type="button" (click)="showEditServer.set(false)">Cancelar</button>
            <button class="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white" type="submit" [disabled]="loading()">
              {{ loading() ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class AppShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly serversApi = inject(ServerService);
  private readonly channelsApi = inject(ChannelService);
  private readonly rolesApi = inject(RoleService);
  private readonly credentialsStore = inject(ServerCredentialsStore);
  private readonly signaling = inject(VoiceSignalingService);
  readonly voice = inject(VoiceRtcService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly servers = signal<Server[]>([]);
  readonly channels = signal<Channel[]>([]);
  readonly selectedServer = signal<Server | null>(null);
  readonly selectedChannel = signal<Channel | null>(null);
  readonly presenceByChannel = signal<Record<number, VoicePeer[]>>({});
  readonly occupantsByChannel = computed(() =>
    mergeLiveCallOccupants(
      this.presenceByChannel(),
      this.voice.joinedChannelId(),
      this.voice.inCall() ? this.voice.participants() : [],
    ),
  );
  readonly members = signal<ServerMember[]>([]);
  readonly roles = signal<ServerRole[]>([]);
  readonly editingRoleId = signal<number | null>(null);
  readonly roleDraftName = signal('');
  readonly roleDraftFlags = signal<Record<string, boolean>>({});
  readonly newRoleName = signal('');
  readonly newRolePosition = signal(1);
  readonly roleDraftPosition = signal(1);
  readonly newRoleFlags = signal<Record<string, boolean>>({});
  readonly roleFlags = [...ROLE_POWER_FLAGS, ...ROLE_DENY_FLAGS];
  readonly roleFlagLabels = ROLE_FLAG_LABELS;

  readonly showCreateServer = signal(false);
  readonly showJoinServer = signal(false);
  readonly showCreateChannel = signal(false);
  readonly showManageServer = signal(false);
  readonly showEditServer = signal(false);
  readonly adminOpen = signal(false);

  readonly createServerName = signal('');
  readonly createServerPassword = signal('');
  readonly joinCode = signal('');
  readonly joinPassword = signal('');
  readonly createChannelName = signal('');
  readonly editServerName = signal('');
  readonly editServerPassword = signal('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly copyFeedback = signal<string | null>(null);
  readonly mobileNavOpen = signal(false);
  readonly currentUserId = computed(() => this.auth.user()?.id ?? 0);
  readonly canManageRoles = computed(() => permissionsOf(this.selectedServer()).can_manage_roles);
  readonly canManageServer = computed(() => permissionsOf(this.selectedServer()).can_manage_server || !!this.selectedServer()?.is_owner);
  readonly canBanServer = computed(() => permissionsOf(this.selectedServer()).can_ban_server);
  readonly canKickServer = computed(() => permissionsOf(this.selectedServer()).can_kick_server);

  readonly serverPassword = computed(() => {
    const server = this.selectedServer();
    if (!server) {
      return '';
    }
    return this.credentialsStore.get(server.id)?.password ?? '';
  });

  constructor() {
    effect((onCleanup) => {
      const server = this.selectedServer();
      if (!server) {
        this.presenceByChannel.set({});
        return;
      }

      const sub = interval(3000)
        .pipe(
          startWith(0),
          exhaustMap(() => this.signaling.presence(server.id).pipe(catchError(() => EMPTY))),
        )
        .subscribe((rows) => this.presenceByChannel.set(this.toOccupantsMap(rows)));

      onCleanup(() => sub.unsubscribe());
    });
  }

  ngOnInit(): void {
    this.loadServers();

    this.route.paramMap.subscribe((params) => {
      const serverId = params.get('serverId');
      const channelId = params.get('channelId');

      if (serverId && this.servers().length > 0) {
        const server = this.servers().find((s) => s.id === +serverId);
        if (server) {
          this.selectServerInternal(server, channelId ? +channelId : null);
        }
      }
    });
  }

  loadServers(): void {
    this.serversApi.list().subscribe({
      next: (servers) => {
        this.servers.set(servers);

        const serverId = this.route.snapshot.paramMap.get('serverId');
        const channelId = this.route.snapshot.paramMap.get('channelId');

        if (serverId) {
          const server = servers.find((s) => s.id === +serverId);
          if (server) {
            this.selectServerInternal(server, channelId ? +channelId : null);
          }
        } else if (servers.length > 0 && !this.selectedServer()) {
          this.onSelectServer(servers[0]);
        }
      },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao carregar servidores.')),
    });
  }

  onSelectServer(server: Server): void {
    this.selectServerInternal(server, null);
    void this.router.navigate(['/servidor', server.id]);
  }

  onSelectChannel(channel: Channel): void {
    const server = this.selectedServer();
    if (!server) {
      return;
    }
    this.selectedChannel.set(channel);
    this.closeMobileNav();
    void this.router.navigate(['/servidor', server.id, 'canal', channel.id]);
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.update((open) => !open);
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileNavOpen()) {
      this.closeMobileNav();
    }
  }

  openCreateServer(): void {
    this.closeModals();
    this.showCreateServer.set(true);
  }

  openJoinServer(): void {
    this.closeModals();
    this.showJoinServer.set(true);
  }

  openCreateChannel(): void {
    this.closeModals();
    this.showCreateChannel.set(true);
  }

  openManageServer(): void {
    this.closeModals();
    this.showManageServer.set(true);
    this.loadMembers();
    if (this.canManageRoles()) {
      this.loadRoles();
    }
  }

  openEditServer(): void {
    const server = this.selectedServer();
    if (!server) {
      return;
    }
    this.editServerName.set(server.name);
    this.editServerPassword.set('');
    this.showEditServer.set(true);
  }

  closeModals(): void {
    this.showCreateServer.set(false);
    this.showJoinServer.set(false);
    this.showCreateChannel.set(false);
    this.showManageServer.set(false);
    this.showEditServer.set(false);
    this.editingRoleId.set(null);
    this.error.set(null);
    this.closeMobileNav();
  }

  createServer(event: Event): void {
    event.preventDefault();
    this.loading.set(true);

    const password = this.createServerPassword();
    this.serversApi.create(this.createServerName(), password).subscribe({
      next: (server) => {
        this.credentialsStore.save(server.id, server.invite_code, password);
        this.loading.set(false);
        this.closeModals();
        this.loadServers();
        if (server.channels?.[0]) {
          this.selectServerInternal(server, server.channels[0].id);
          void this.router.navigate(['/servidor', server.id, 'canal', server.channels[0].id]);
        } else {
          this.onSelectServer(server);
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, 'Não foi possível criar o servidor.'));
      },
    });
  }

  joinServer(event: Event): void {
    event.preventDefault();
    this.loading.set(true);

    const code = this.joinCode().trim().toUpperCase();
    const password = this.joinPassword();

    this.serversApi.verify(code, password).subscribe({
      next: (server) => {
        this.credentialsStore.save(server.id, server.invite_code, password);
        this.loading.set(false);
        this.closeModals();
        this.loadServers();
        const firstChannel = server.channels?.[0];
        if (firstChannel) {
          this.selectServerInternal(server, firstChannel.id);
          void this.router.navigate(['/servidor', server.id, 'canal', firstChannel.id]);
        } else {
          this.onSelectServer(server);
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, 'Código ou senha inválidos.'));
      },
    });
  }

  createChannel(event: Event): void {
    event.preventDefault();
    const server = this.selectedServer();
    if (!server) {
      return;
    }

    this.loading.set(true);
    this.channelsApi.create(server.id, this.createChannelName()).subscribe({
      next: (channel) => {
        this.loading.set(false);
        this.closeModals();
        this.loadChannels(server.id);
        this.onSelectChannel(channel);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, 'Erro ao criar canal.'));
      },
    });
  }

  saveServer(event: Event): void {
    event.preventDefault();
    const server = this.selectedServer();
    if (!server) {
      return;
    }

    this.loading.set(true);
    const payload: { name?: string; password?: string } = { name: this.editServerName() };
    if (this.editServerPassword()) {
      payload.password = this.editServerPassword();
    }

    this.serversApi.update(server.id, payload).subscribe({
      next: (updated) => {
        const password = this.editServerPassword() || this.credentialsStore.get(server.id)?.password || '';
        if (password) {
          this.credentialsStore.save(updated.id, updated.invite_code, password, updated.credentials_rotated_at);
        }
        this.loading.set(false);
        this.showEditServer.set(false);
        this.loadServers();
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, 'Erro ao editar servidor.'));
      },
    });
  }

  loadMembers(): void {
    const server = this.selectedServer();
    if (!server) {
      return;
    }

    this.serversApi.members(server.id).subscribe({
      next: (members) => this.members.set(members),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao carregar membros.')),
    });
  }

  loadRoles(): void {
    const server = this.selectedServer();
    if (!server) {
      return;
    }

    this.rolesApi.list(server.id).subscribe({
      next: (roles) => this.roles.set(roles),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao carregar cargos.')),
    });
  }

  toggleNewRoleFlag(flag: RoleFlag): void {
    this.newRoleFlags.update((current) => ({ ...current, [flag]: !current[flag] }));
  }

  toggleRoleDraftFlag(flag: RoleFlag): void {
    this.roleDraftFlags.update((current) => ({ ...current, [flag]: !current[flag] }));
  }

  createRole(event: Event): void {
    event.preventDefault();
    const server = this.selectedServer();
    if (!server) {
      return;
    }

    this.loading.set(true);
    this.rolesApi.create(server.id, { ...emptyRolePayload(this.newRoleName()), position: this.newRolePosition(), ...this.newRoleFlags() }).subscribe({
      next: () => {
        this.loading.set(false);
        this.newRoleName.set('');
        this.newRoleFlags.set({});
        this.loadRoles();
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, 'Erro ao criar cargo.'));
      },
    });
  }

  startEditRole(role: ServerRole): void {
    this.editingRoleId.set(role.id);
    this.roleDraftName.set(role.name);
    this.roleDraftPosition.set(role.position ?? 1);
    this.roleDraftFlags.set({
      can_create_channels: role.can_create_channels,
      can_kick_call: role.can_kick_call,
      can_kick_server: role.can_kick_server,
      can_ban_server: role.can_ban_server,
      can_mute_call: role.can_mute_call,
      deny_screen: role.deny_screen,
      deny_camera: role.deny_camera,
      deny_voice: role.deny_voice,
      deny_chat: role.deny_chat,
    });
  }

  saveRole(roleId: number): void {
    this.rolesApi.update(roleId, { name: this.roleDraftName(), position: this.roleDraftPosition(), ...this.roleDraftFlags() }).subscribe({
      next: () => {
        this.editingRoleId.set(null);
        this.loadRoles();
        this.loadMembers();
      },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao salvar cargo.')),
    });
  }

  deleteRole(roleId: number): void {
    this.rolesApi.delete(roleId).subscribe({
      next: () => {
        this.loadRoles();
        this.loadMembers();
      },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao excluir cargo.')),
    });
  }

  assignRole(userId: number, rawRoleId: string): void {
    const server = this.selectedServer();
    if (!server) {
      return;
    }

    const roleId = rawRoleId === '' ? null : Number(rawRoleId);
    this.rolesApi.assign(server.id, userId, roleId).subscribe({
      next: () => this.loadMembers(),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao atribuir cargo.')),
    });
  }

  roleSummary(role: ServerRole): string {
    const active = this.roleFlags.filter((flag) => role[flag]).map((flag) => ROLE_FLAG_LABELS[flag]);
    return active.length > 0 ? active.join(' · ') : 'Sem flags';
  }

  kickMember(userId: number): void {
    const server = this.selectedServer();
    if (!server) {
      return;
    }

    this.serversApi.kick(server.id, userId).subscribe({
      next: () => { this.loadMembers(); this.loadServers(); },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao expulsar membro.')),
    });
  }

  banMember(userId: number): void {
    const server = this.selectedServer();
    if (!server || !confirm('Banir este membro? Ele perderá acesso e o convite do servidor será alterado.')) return;
    this.serversApi.ban(server.id, userId).subscribe({
      next: (response) => {
        const updated = response.server;
        this.credentialsStore.save(updated.id, updated.invite_code, updated.password, updated.credentials_rotated_at);
        this.loadMembers();
        this.loadServers();
        this.copyFeedback.set('Credenciais alteradas');
      },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao expulsar membro.')),
    });
  }

  async copyCredentials(): Promise<void> {
    const server = this.selectedServer();
    if (!server) {
      return;
    }

    const stored = this.credentialsStore.get(server.id);
    if (!stored) {
      this.error.set('Senha não encontrada localmente.');
      return;
    }

    const text = `Código: ${stored.inviteCode}\nSenha: ${stored.password}`;
    try {
      await navigator.clipboard.writeText(text);
      this.copyFeedback.set('Copiado!');
    } catch {
      this.copyFeedback.set('Erro ao copiar');
    }
  }

  private toOccupantsMap(rows: VoiceChannelPresence[]): Record<number, VoicePeer[]> {
    const map: Record<number, VoicePeer[]> = {};
    for (const row of rows) {
      map[row.channel_id] = row.peers;
    }
    return map;
  }

  private selectServerInternal(server: Server, channelId: number | null): void {
    this.selectedServer.set(server);
    this.loadChannels(server.id, channelId);
  }

  private loadChannels(serverId: number, selectChannelId: number | null = null): void {
    this.channelsApi.list(serverId).subscribe({
      next: (channels) => {
        this.channels.set(channels);
        if (selectChannelId) {
          const channel = channels.find((c) => c.id === selectChannelId) ?? channels[0] ?? null;
          this.selectedChannel.set(channel);
        } else if (!this.selectedChannel() || this.selectedChannel()?.server_id !== serverId) {
          this.selectedChannel.set(channels[0] ?? null);
        }
      },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao carregar canais.')),
    });
  }
}
