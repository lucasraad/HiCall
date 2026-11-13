import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { interval, switchMap } from 'rxjs';
import { Channel } from '../../core/models/channel.model';
import { Message } from '../../core/models/message.model';
import { Server } from '../../core/models/server.model';
import { permissionsOf } from '../../core/models/role.model';
import { MessageService } from '../../core/services/message.service';
import { extractErrorMessage } from '../../core/utils/http-error';
import { LucidePanelRightClose, LucideVolume2 } from '../../shared/icons/app-icons';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [LucideVolume2, LucidePanelRightClose],
  host: { class: 'hicall-chat-panel flex h-full w-80 shrink-0' },
  template: `
    <aside class="flex h-full w-full flex-col border-l border-zinc-700 bg-surface">
      <header class="flex h-12 shrink-0 items-center gap-1.5 border-b border-zinc-700 px-4">
        <svg lucideVolume2 class="h-4 w-4 shrink-0 text-zinc-400"></svg>
        <h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-200">{{ channel().name }}</h3>
        <button
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 md:h-8 md:w-8"
          type="button"
          title="Recolher chat"
          (click)="closeChat.emit()"
        >
          <svg lucidePanelRightClose class="h-4 w-4"></svg>
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        @for (message of messages(); track message.id) {
          <div class="mb-3">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-medium text-zinc-200">{{ message.user.name }}</span>
              <span class="text-xs text-zinc-500">{{ formatTime(message.created_at) }}</span>
            </div>
            <p class="mt-0.5 text-sm text-zinc-300">{{ message.body }}</p>
          </div>
        } @empty {
          <p class="text-center text-sm text-zinc-500">Nenhuma mensagem ainda.</p>
        }
      </div>

      @if (error()) {
        <p class="px-3 text-xs text-red-400">{{ error() }}</p>
      }

      <form class="shrink-0 border-t border-zinc-700 p-3" (submit)="sendMessage($event)">
        <input
          class="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
          [placeholder]="chatDenied() ? 'Chat bloqueado pelo seu cargo' : 'Enviar mensagem...'"
          [disabled]="sending() || chatDenied()"
          [title]="chatDenied() ? 'Você não tem permissão para falar no chat deste servidor.' : ''"
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
        />
      </form>
    </aside>
  `,
})
export class ChatPanelComponent {
  private readonly messagesApi = inject(MessageService);

  readonly channel = input.required<Channel>();
  readonly server = input<Server | null>(null);
  readonly closeChat = output<void>();

  readonly messages = signal<Message[]>([]);
  readonly draft = signal('');
  readonly error = signal<string | null>(null);
  readonly sending = signal(false);
  readonly chatDenied = computed(() => permissionsOf(this.server()).deny_chat);

  private lastMessageId = 0;

  constructor() {
    effect((onCleanup) => {
      const channelId = this.channel().id;
      this.lastMessageId = 0;
      this.messages.set([]);
      this.draft.set('');
      this.error.set(null);
      this.loadMessages();

      const poll = interval(3000)
        .pipe(switchMap(() => this.messagesApi.list(channelId, this.lastMessageId || undefined)))
        .subscribe({
          next: (newMessages) => {
            if (newMessages.length === 0) {
              return;
            }
            this.appendMessages(newMessages);
          },
          error: () => {},
        });

      onCleanup(() => poll.unsubscribe());
    });
  }

  sendMessage(event: Event): void {
    event.preventDefault();
    if (this.chatDenied()) {
      this.error.set('Você não tem permissão para falar no chat deste servidor.');
      return;
    }
    const body = this.draft().trim();
    if (!body || this.sending()) {
      return;
    }

    this.sending.set(true);
    this.error.set(null);

    this.messagesApi.send(this.channel().id, body).subscribe({
      next: (message) => {
        this.appendMessages([message]);
        this.draft.set('');
        this.sending.set(false);
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.error.set(extractErrorMessage(err, 'Erro ao enviar mensagem.'));
      },
    });
  }

  formatTime(iso: string | null): string {
    if (!iso) {
      return '';
    }
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  private loadMessages(): void {
    this.messagesApi.list(this.channel().id).subscribe({
      next: (messages) => {
        this.messages.set(messages);
        if (messages.length > 0) {
          this.lastMessageId = messages[messages.length - 1].id;
        }
      },
      error: (err: unknown) => this.error.set(extractErrorMessage(err, 'Erro ao carregar mensagens.')),
    });
  }

  private appendMessages(incoming: Message[]): void {
    if (incoming.length === 0) {
      return;
    }

    this.messages.update((current) => [...current, ...incoming]);
    this.lastMessageId = incoming[incoming.length - 1].id;
  }
}
