import { Component, input, output, signal } from '@angular/core';
import { Channel } from '../../core/models/channel.model';
import { Server } from '../../core/models/server.model';
import { ChatPanelComponent } from '../channel/chat-panel.component';
import { VoicePanelComponent } from '../channel/voice-panel.component';

@Component({
  selector: 'app-channel-view',
  standalone: true,
  imports: [VoicePanelComponent, ChatPanelComponent],
  host: { class: 'flex min-w-0 flex-1 h-full overflow-hidden' },
  template: `
    @if (server() && channel(); as ch) {
      <div class="relative flex h-full min-w-0 flex-1 overflow-hidden">
        <app-voice-panel
          [server]="server()!"
          [channel]="ch"
          [chatOpen]="chatOpen()"
          (openChat)="openChat()"
        />
        @if (chatOpen()) {
          <app-chat-panel [server]="server()" [channel]="ch" (closeChat)="closeChat()" />
        }
      </div>
    } @else {
      <div class="flex h-full w-full flex-1 items-center justify-center bg-zinc-900">
        <p class="text-sm text-zinc-400">Selecione um canal para começar</p>
      </div>
    }
  `,
})
export class ChannelViewComponent {
  readonly server = input<Server | null>(null);
  readonly channel = input<Channel | null>(null);

  readonly chatOpen = signal(false);

  openChat(): void {
    this.chatOpen.set(true);
  }

  closeChat(): void {
    this.chatOpen.set(false);
  }
}
