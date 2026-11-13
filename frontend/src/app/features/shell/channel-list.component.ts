import { Component, input, output } from '@angular/core';
import { Channel } from '../../core/models/channel.model';
import { Server } from '../../core/models/server.model';
import { VoicePeer } from '../../core/models/voice.model';
import { LucidePlus, LucideVolume2 } from '../../shared/icons/app-icons';

const AVATAR_COLORS = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#3ba55c', '#23a559', '#f26522'];

@Component({
  selector: 'app-channel-list',
  standalone: true,
  imports: [LucideVolume2, LucidePlus],
  host: { class: 'flex h-full shrink-0' },
  template: `
    @if (server(); as srv) {
      <aside class="flex h-full w-60 flex-col bg-zinc-800">
        <header class="flex h-12 shrink-0 items-center border-b border-zinc-900 px-4 shadow-sm">
          <h2 class="truncate text-sm font-semibold text-white">{{ srv.name }}</h2>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <p class="px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Canais de voz</p>
          <div class="mt-1">
            @for (channel of channels(); track channel.id) {
              @let people = occupantsOf(channel.id);
              <div class="rounded">
                <button
                  class="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-700"
                  [class.bg-zinc-700]="selectedChannelId() === channel.id"
                  [class.text-white]="selectedChannelId() === channel.id"
                  [class.text-zinc-300]="selectedChannelId() !== channel.id"
                  type="button"
                  (click)="selectChannel.emit(channel)"
                >
                  <svg
                    lucideVolume2
                    class="h-4 w-4 shrink-0"
                    [class.text-[#23a559]]="people.length > 0"
                    [class.text-zinc-400]="people.length === 0"
                  ></svg>
                  <span class="truncate">{{ channel.name }}</span>
                </button>

                @if (people.length > 0) {
                  <ul class="mb-1 ml-6 mt-0.5 space-y-0.5">
                    @for (peer of people; track peer.user_id) {
                      <li class="flex items-center gap-2 rounded px-1.5 py-1">
                        <span
                          class="occupant-avatar flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                          [class.occupant-avatar--speaking]="isSpeaking(peer.user_id)"
                          [style.background]="avatarColor(peer.user.name)"
                        >
                          {{ initial(peer.user.name) }}
                        </span>
                        <span class="truncate text-sm text-zinc-300">{{ peer.user.name }}</span>
                      </li>
                    }
                  </ul>
                }
              </div>
            }
          </div>

          @if (srv.permissions?.can_create_channels || srv.is_owner) {
            <button
              class="mt-2 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              type="button"
              (click)="createChannel.emit()"
            >
              <svg lucidePlus class="h-3.5 w-3.5"></svg>
              Criar canal
            </button>
          }
        </div>

        @if (srv.permissions?.can_manage_roles || srv.permissions?.can_kick_server || srv.permissions?.can_ban_server || srv.is_owner) {
          <footer class="shrink-0 border-t border-zinc-900 p-2">
            <button
              class="w-full rounded px-2 py-1.5 text-left text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              type="button"
              (click)="manageServer.emit()"
            >
              Gerenciar servidor
            </button>
          </footer>
        }
      </aside>
    } @else {
      <aside class="flex h-full w-60 flex-col bg-zinc-800">
        <div class="flex flex-1 items-center justify-center p-4 text-center text-sm text-zinc-400">
          Selecione um servidor
        </div>
      </aside>
    }
  `,
})
export class ChannelListComponent {
  readonly server = input<Server | null>(null);
  readonly channels = input<Channel[]>([]);
  readonly selectedChannelId = input<number | null>(null);
  readonly occupantsByChannel = input<Record<number, VoicePeer[]>>({});
  readonly speakingUserIds = input<number[]>([]);

  readonly selectChannel = output<Channel>();
  readonly createChannel = output<void>();
  readonly manageServer = output<void>();

  occupantsOf(channelId: number): VoicePeer[] {
    return this.occupantsByChannel()[channelId] ?? [];
  }

  isSpeaking(userId: number): boolean {
    return this.speakingUserIds().includes(userId);
  }

  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }
}
