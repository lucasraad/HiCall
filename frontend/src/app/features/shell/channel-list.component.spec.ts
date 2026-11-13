import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY_PERMISSIONS } from '../../core/models/role.model';
import { Channel } from '../../core/models/channel.model';
import { Server } from '../../core/models/server.model';
import { ChannelListComponent } from './channel-list.component';

describe('ChannelListComponent', () => {
  let fixture: ComponentFixture<ChannelListComponent>;

  const channels: Channel[] = [{ id: 1, server_id: 1, name: 'geral', position: 0, created_at: null }];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChannelListComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChannelListComponent);
    fixture.componentRef.setInput('channels', channels);
    fixture.componentRef.setInput('selectedChannelId', 1);
  });

  it('esconde criar canal quando o membro não tem permissão', () => {
    fixture.componentRef.setInput('server', {
      id: 1,
      name: 'Sala',
      invite_code: 'ABC',
      owner_id: 9,
      is_owner: false,
      credentials_rotated_at: null,
      created_at: null,
      permissions: { ...EMPTY_PERMISSIONS },
    } satisfies Server);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Criar canal');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Gerenciar servidor');
  });

  it('permite abrir a moderação com apenas a permissão de banir', () => {
    fixture.componentRef.setInput('server', {
      id: 1, name: 'Sala', invite_code: 'ABC', owner_id: 9, is_owner: false,
      credentials_rotated_at: null, created_at: null,
      permissions: { ...EMPTY_PERMISSIONS, can_ban_server: true },
    } satisfies Server);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Gerenciar servidor');
  });

  it('mostra criar canal quando o cargo permite', () => {
    fixture.componentRef.setInput('server', {
      id: 1,
      name: 'Sala',
      invite_code: 'ABC',
      owner_id: 9,
      is_owner: false,
      credentials_rotated_at: null,
      created_at: null,
      permissions: { ...EMPTY_PERMISSIONS, can_create_channels: true },
    } satisfies Server);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Criar canal');
  });

  it('mostra ocupantes da call abaixo do canal de voz', () => {
    fixture.componentRef.setInput('server', {
      id: 1,
      name: 'Sala',
      invite_code: 'ABC',
      owner_id: 9,
      is_owner: true,
      credentials_rotated_at: null,
      created_at: null,
    } satisfies Server);
    fixture.componentRef.setInput('occupantsByChannel', {
      1: [
        {
          user_id: 7,
          sharing_screen: false,
          last_seen_at: null,
          user: { id: 7, name: 'Gugamer', email: 'guga@test.local' },
        },
      ],
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Gugamer');
    expect(el.querySelectorAll('svg').length).toBeGreaterThan(0);
  });
});
