import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { EMPTY_PERMISSIONS } from '../../core/models/role.model';
import { Channel } from '../../core/models/channel.model';
import { Server } from '../../core/models/server.model';
import { ChatPanelComponent } from './chat-panel.component';

describe('ChatPanelComponent', () => {
  let fixture: ComponentFixture<ChatPanelComponent>;
  let httpMock: HttpTestingController;

  const channel: Channel = { id: 2, server_id: 1, name: 'geral', position: 0, created_at: null };
  const server: Server = {
    id: 1,
    name: 'Sala',
    invite_code: 'ABC',
    owner_id: 1,
    is_owner: false,
    credentials_rotated_at: null,
    created_at: null,
    permissions: { ...EMPTY_PERMISSIONS, deny_chat: true },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ChatPanelComponent);
    fixture.componentRef.setInput('channel', channel);
    fixture.componentRef.setInput('server', server);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/channels/2/messages`).flush([]);
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('bloqueia envio e mostra erro quando deny_chat está ativo', () => {
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBeTrue();
    expect(input.placeholder).toContain('bloqueado');

    fixture.componentInstance.sendMessage(new Event('submit'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Você não tem permissão para falar no chat deste servidor.',
    );
  });
});
