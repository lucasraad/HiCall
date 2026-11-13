import { Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminUserService, CreateUserPayload, UpdateUserPayload } from '../../core/services/admin-user.service';
import { AuthService } from '../../core/services/auth.service';
import { RoleService } from '../../core/services/role.service';
import { ServerService } from '../../core/services/server.service';
import { PwaInstallService } from '../../core/services/pwa-install.service';
import { User } from '../../core/models/user.model';
import { Server, ServerMember } from '../../core/models/server.model';
import {
  emptyRolePayload,
  ROLE_DENY_FLAGS,
  ROLE_FLAG_LABELS,
  ROLE_POWER_FLAGS,
  RoleFlag,
  ServerRole,
} from '../../core/models/role.model';
import { extractErrorMessage } from '../../core/utils/http-error';
import { PasswordInputComponent } from '../../shared/components/password-input.component';
import { LucideDownload, LucideLogOut, LucideSettings } from '../../shared/icons/app-icons';
import { DESKTOP_SETUP_URL } from '../../core/desktop/desktop-download';
import { isHicallDesktop } from '../../core/desktop/hicall-desktop';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [RouterLink, PasswordInputComponent, LucideSettings, LucideDownload, LucideLogOut],
  template: `
    <div
      class="flex min-h-0 flex-col overflow-hidden bg-zinc-900 text-zinc-200"
      [class.h-dvh]="!asOverlay()"
      [class.h-full]="asOverlay()"
    >
      <header class="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
            HC
          </div>
          <div>
            <p class="text-sm font-semibold text-zinc-100">HiCall Admin</p>
            <p class="text-xs text-zinc-500">Configurações e usuários</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          @if (asOverlay()) {
            <button
              class="rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
              type="button"
              (click)="closeOverlay.emit()"
            >
              Voltar ao app
            </button>
          } @else {
            <a
              class="rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
              routerLink="/app"
            >
              Voltar ao app
            </a>
          }
          <button
            class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
            type="button"
            (click)="auth.logout()"
          >
            <svg lucideLogOut class="h-4 w-4"></svg>
            Sair
          </button>
        </div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-5xl space-y-8 px-4 py-8">
          <section class="rounded-lg border border-zinc-700 bg-zinc-800/80">
            <div class="flex items-center gap-2 border-b border-zinc-700 px-4 py-3">
              <svg lucideSettings class="h-4 w-4 text-zinc-400"></svg>
              <h2 class="text-sm font-semibold text-zinc-100">Configurações do app</h2>
            </div>

            <div class="space-y-4 p-4">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-sm font-medium text-zinc-200">Instalar HiCall (PWA)</p>
                  <p class="mt-1 text-sm text-zinc-400">
                    @if (pwa.isStandalone()) {
                      O app já está instalado neste dispositivo.
                    } @else if (pwa.canInstall()) {
                      Instale como aplicativo para acesso rápido pela área de trabalho.
                    } @else if (pwa.isIos()) {
                      No Safari, toque em Compartilhar → Adicionar à Tela de Início.
                    } @else {
                      Use Chrome ou Edge em HTTPS para instalar. Em produção, o botão aparece automaticamente.
                    }
                  </p>
                </div>

                @if (!pwa.isStandalone()) {
                  <button
                    class="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    [disabled]="!pwa.canInstall() || installingPwa()"
                    (click)="installPwa()"
                  >
                    <svg lucideDownload class="h-4 w-4"></svg>
                    {{ installingPwa() ? 'Instalando...' : 'Baixar app' }}
                  </button>
                }
              </div>

              @if (pwaMessage()) {
                <p class="text-sm" [class.text-green-400]="pwaSuccess()" [class.text-amber-400]="!pwaSuccess()">
                  {{ pwaMessage() }}
                </p>
              }

              <div class="flex flex-col gap-4 border-t border-zinc-700 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-sm font-medium text-zinc-200">App desktop Windows</p>
                  <p class="mt-1 text-sm text-zinc-400">
                    @if (isDesktop) {
                      Você já está no aplicativo desktop. Compartilhar tela usa janela/monitor, sem a barra de aba do Chrome.
                    } @else {
                      Use o app para transmitir janelas (ex.: YouTube em tela cheia) sem a faixa “A partilhar este separador”.
                    }
                  </p>
                </div>
                @if (!isDesktop) {
                  <a
                    class="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-brand hover:bg-zinc-900"
                    [href]="desktopUrl"
                  >
                    <svg lucideDownload class="h-4 w-4"></svg>
                    Baixar HiCall.exe
                  </a>
                }
              </div>

            </div>
          </section>

          <section class="rounded-lg border border-zinc-700 bg-zinc-800/80">
            <div class="border-b border-zinc-700 px-4 py-3">
              <h2 class="text-sm font-semibold text-zinc-100">Cargos por servidor</h2>
              <p class="mt-1 text-xs text-zinc-400">
                Admin da plataforma pode criar cargos e atribuí-los a outros membros. Ninguém atribui cargo a si mesmo.
              </p>
            </div>
            <div class="space-y-4 p-4">
              <label class="block">
                <span class="mb-1 block text-sm text-zinc-300">Servidor</span>
                <select
                  class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  [value]="adminServerId() ?? ''"
                  (change)="selectAdminServer($any($event.target).value)"
                >
                  <option value="">Selecione</option>
                  @for (server of adminServers(); track server.id) {
                    <option [value]="server.id">{{ server.name }}</option>
                  }
                </select>
              </label>

              @if (adminServerId()) {
                <div>
                  <p class="mb-2 text-sm font-medium text-zinc-200">Cargos</p>
                  <ul class="space-y-2">
                    @for (role of adminRoles(); track role.id) {
                      <li class="flex items-center justify-between rounded bg-zinc-900 px-3 py-2 text-sm">
                        <span class="text-zinc-200">{{ role.name }}</span>
                        <button class="text-xs text-red-400 hover:underline" type="button" (click)="deleteAdminRole(role.id)">
                          Excluir
                        </button>
                      </li>
                    } @empty {
                      <li class="text-xs text-zinc-500">Nenhum cargo neste servidor.</li>
                    }
                  </ul>
                  <form class="mt-3 flex flex-wrap gap-2" (submit)="createAdminRole($event)">
                    <input
                      class="min-w-[10rem] flex-1 rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                      placeholder="Nome do cargo"
                      required
                      [value]="adminRoleName()"
                      (input)="adminRoleName.set($any($event.target).value)"
                    />
                  <label class="block text-xs text-zinc-300">Nível (1 a 1000)<input type="number" min="1" max="1000" class="ml-2 w-20 rounded bg-zinc-900 p-1" [value]="adminRolePosition()" (input)="adminRolePosition.set(+$any($event.target).value)" /></label>
                    <button class="rounded-md bg-brand px-3 py-1.5 text-sm text-white" type="submit">Criar</button>
                  </form>
                  <div class="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    @for (flag of roleFlags; track flag) {
                      <label class="flex items-center gap-2 text-xs text-zinc-300">
                        <input type="checkbox" [checked]="!!adminRoleFlags()[flag]" (change)="toggleAdminRoleFlag(flag)" />
                        {{ roleFlagLabels[flag] }}
                      </label>
                    }
                  </div>
                </div>

                <div>
                  <p class="mb-2 text-sm font-medium text-zinc-200">Atribuir a membros</p>
                  <ul class="space-y-2">
                    @for (member of adminMembers(); track member.id) {
                      <li class="flex flex-wrap items-center justify-between gap-2 rounded bg-zinc-900 px-3 py-2 text-sm">
                        <span class="text-zinc-200">{{ member.user.name }}</span>
                        @if (member.role !== 'owner' && member.user.id !== auth.user()?.id) {
                          <select
                            class="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                            [value]="member.role_id ?? ''"
                            (change)="assignAdminRole(member.user.id, $any($event.target).value)"
                          >
                            <option value="">Sem cargo</option>
                            @for (role of adminRoles(); track role.id) {
                              <option [value]="role.id">{{ role.name }}</option>
                            }
                          </select>
                        } @else {
                          <span class="text-xs text-zinc-500">{{ member.role === 'owner' ? 'Dono' : 'Você' }}</span>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          </section>

          <section>
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-zinc-100">Usuários</h2>
              <button
                class="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
                type="button"
                (click)="openCreate()"
              >
                Novo usuário
              </button>
            </div>

            @if (error()) {
              <p class="mb-4 text-sm text-red-400">{{ error() }}</p>
            }

            <div class="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800/80">
              <table class="min-w-full text-sm">
                <thead class="border-b border-zinc-700 bg-zinc-900/60 text-left text-zinc-400">
                  <tr>
                    <th class="px-4 py-3 font-medium">Nome</th>
                    <th class="px-4 py-3 font-medium">E-mail</th>
                    <th class="px-4 py-3 font-medium">Cargo</th>
                    <th class="px-4 py-3 font-medium">Status</th>
                    <th class="px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  @for (user of users(); track user.id) {
                    <tr class="border-b border-zinc-700/70 last:border-0">
                      <td class="px-4 py-3 text-zinc-200">{{ user.name }}</td>
                      <td class="px-4 py-3 text-zinc-300">{{ user.email }}</td>
                      <td class="px-4 py-3 text-zinc-300">{{ user.role === 'admin' ? 'Admin' : 'Usuário' }}</td>
                      <td class="px-4 py-3">
                        @if (user.is_banned) {
                          <span class="rounded-full bg-red-900/50 px-2 py-0.5 text-xs text-red-300">Banido</span>
                        } @else {
                          <span class="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Ativo</span>
                        }
                      </td>
                      <td class="px-4 py-3">
                        <div class="flex flex-wrap gap-2">
                          <button class="text-brand hover:underline" type="button" (click)="openEdit(user)">
                            Editar
                          </button>
                          @if (!user.is_banned && user.role !== 'admin') {
                            <button class="text-red-400 hover:underline" type="button" (click)="banUser(user)">
                              Banir
                            </button>
                          }
                          @if (user.is_banned) {
                            <button class="text-brand hover:underline" type="button" (click)="unbanUser(user)">
                              Desbanir
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>

    @if (showForm()) {
      <div class="fixed inset-0 z-10 flex items-center justify-center bg-black/60 px-4">
        <form
          class="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-800 p-6 shadow-xl"
          (submit)="saveUser($event)"
        >
          <h2 class="text-base font-medium text-zinc-100">
            {{ editingUser() ? 'Editar usuário' : 'Novo usuário' }}
          </h2>

          <label class="mt-4 block">
            <span class="mb-1 block text-sm text-zinc-300">Nome</span>
            <input
              class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand"
              required
              [value]="formName()"
              (input)="formName.set($any($event.target).value)"
            />
          </label>

          <label class="mt-4 block">
            <span class="mb-1 block text-sm text-zinc-300">E-mail</span>
            <input
              class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand"
              type="email"
              required
              [value]="formEmail()"
              (input)="formEmail.set($any($event.target).value)"
            />
          </label>

          <div class="mt-4">
            <app-password-input
              [label]="editingUser() ? 'Nova senha (opcional)' : 'Senha'"
              variant="dark"
              [required]="!editingUser()"
              [value]="formPassword()"
              (valueChange)="formPassword.set($event)"
            />
          </div>

          <label class="mt-4 block">
            <span class="mb-1 block text-sm text-zinc-300">Cargo</span>
            <select
              class="w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand"
              [value]="formRole()"
              (change)="formRole.set($any($event.target).value)"
            >
              <option value="user">Usuário</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <div class="mt-6 flex justify-end gap-2">
            <button
              class="rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              type="button"
              (click)="closeForm()"
            >
              Cancelar
            </button>
            <button
              class="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              type="submit"
              [disabled]="loading()"
            >
              {{ loading() ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class AdminUsersComponent {
  readonly auth = inject(AuthService);
  readonly pwa = inject(PwaInstallService);
  readonly asOverlay = input(false);
  readonly closeOverlay = output<void>();
  private readonly adminUsers = inject(AdminUserService);
  private readonly serversApi = inject(ServerService);
  private readonly rolesApi = inject(RoleService);

  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly editingUser = signal<User | null>(null);
  readonly formName = signal('');
  readonly formEmail = signal('');
  readonly formPassword = signal('');
  readonly formRole = signal<'admin' | 'user'>('user');
  readonly installingPwa = signal(false);
  readonly pwaMessage = signal<string | null>(null);
  readonly pwaSuccess = signal(false);
  readonly isDesktop = isHicallDesktop();
  readonly desktopUrl = DESKTOP_SETUP_URL;
  readonly adminServers = signal<Server[]>([]);
  readonly adminServerId = signal<number | null>(null);
  readonly adminRoles = signal<ServerRole[]>([]);
  readonly adminMembers = signal<ServerMember[]>([]);
  readonly adminRoleName = signal('');
  readonly adminRolePosition = signal(1);
  readonly adminRoleFlags = signal<Record<string, boolean>>({});
  readonly roleFlags = [...ROLE_POWER_FLAGS, ...ROLE_DENY_FLAGS];
  readonly roleFlagLabels = ROLE_FLAG_LABELS;

  constructor() {
    this.loadUsers();
    this.loadAdminServers();
  }

  async installPwa(): Promise<void> {
    this.pwaMessage.set(null);
    this.installingPwa.set(true);

    const outcome = await this.pwa.install();
    this.installingPwa.set(false);

    if (outcome === 'accepted') {
      this.pwaSuccess.set(true);
      this.pwaMessage.set('App instalado com sucesso.');
      return;
    }

    if (outcome === 'dismissed') {
      this.pwaSuccess.set(false);
      this.pwaMessage.set('Instalação cancelada.');
      return;
    }

    this.pwaSuccess.set(false);
    this.pwaMessage.set('Instalação indisponível neste navegador. Use Chrome/Edge em HTTPS.');
  }

  loadAdminServers(): void {
    this.serversApi.adminList().subscribe({
      next: (servers) => this.adminServers.set(servers),
      error: () => this.adminServers.set([]),
    });
  }

  selectAdminServer(rawId: string): void {
    const id = rawId ? Number(rawId) : null;
    this.adminServerId.set(id);
    this.adminRoles.set([]);
    this.adminMembers.set([]);
    if (id) {
      this.loadAdminRoles(id);
      this.loadAdminMembers(id);
    }
  }

  loadAdminRoles(serverId: number): void {
    this.rolesApi.list(serverId).subscribe({
      next: (roles) => this.adminRoles.set(roles),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao carregar cargos.')),
    });
  }

  loadAdminMembers(serverId: number): void {
    this.serversApi.members(serverId).subscribe({
      next: (members) => this.adminMembers.set(members),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao carregar membros.')),
    });
  }

  toggleAdminRoleFlag(flag: RoleFlag): void {
    this.adminRoleFlags.update((current) => ({ ...current, [flag]: !current[flag] }));
  }

  createAdminRole(event: Event): void {
    event.preventDefault();
    const serverId = this.adminServerId();
    if (!serverId) {
      return;
    }

    this.rolesApi.create(serverId, { ...emptyRolePayload(this.adminRoleName()), position: this.adminRolePosition(), ...this.adminRoleFlags() }).subscribe({
      next: () => {
        this.adminRoleName.set('');
        this.adminRoleFlags.set({});
        this.loadAdminRoles(serverId);
      },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao criar cargo.')),
    });
  }

  deleteAdminRole(roleId: number): void {
    const serverId = this.adminServerId();
    this.rolesApi.delete(roleId).subscribe({
      next: () => {
        if (serverId) {
          this.loadAdminRoles(serverId);
          this.loadAdminMembers(serverId);
        }
      },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao excluir cargo.')),
    });
  }

  assignAdminRole(userId: number, rawRoleId: string): void {
    const serverId = this.adminServerId();
    if (!serverId) {
      return;
    }

    const roleId = rawRoleId === '' ? null : Number(rawRoleId);
    this.rolesApi.assign(serverId, userId, roleId).subscribe({
      next: () => this.loadAdminMembers(serverId),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao atribuir cargo.')),
    });
  }

  loadUsers(): void {
    this.adminUsers.list().subscribe({
      next: (users) => this.users.set(users),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao carregar usuários.')),
    });
  }

  openCreate(): void {
    this.editingUser.set(null);
    this.formName.set('');
    this.formEmail.set('');
    this.formPassword.set('');
    this.formRole.set('user');
    this.showForm.set(true);
  }

  openEdit(user: User): void {
    this.editingUser.set(user);
    this.formName.set(user.name);
    this.formEmail.set(user.email);
    this.formPassword.set('');
    this.formRole.set(user.role);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingUser.set(null);
  }

  saveUser(event: Event): void {
    event.preventDefault();
    this.loading.set(true);
    this.error.set(null);

    const editing = this.editingUser();
    if (editing) {
      const payload: UpdateUserPayload = {
        name: this.formName(),
        email: this.formEmail(),
        role: this.formRole(),
      };
      if (this.formPassword()) {
        payload.password = this.formPassword();
      }
      this.adminUsers.update(editing.id, payload).subscribe({
        next: () => {
          this.loading.set(false);
          this.closeForm();
          this.loadUsers();
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(extractErrorMessage(err, 'Erro ao atualizar usuário.'));
        },
      });
      return;
    }

    const payload: CreateUserPayload = {
      name: this.formName(),
      email: this.formEmail(),
      password: this.formPassword(),
      role: this.formRole(),
    };

    this.adminUsers.create(payload).subscribe({
      next: () => {
        this.loading.set(false);
        this.closeForm();
        this.loadUsers();
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, 'Erro ao criar usuário.'));
      },
    });
  }

  banUser(user: User): void {
    this.adminUsers.ban(user.id).subscribe({
      next: () => this.loadUsers(),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao banir usuário.')),
    });
  }

  unbanUser(user: User): void {
    this.adminUsers.unban(user.id).subscribe({
      next: () => this.loadUsers(),
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao desbanir usuário.')),
    });
  }
}
