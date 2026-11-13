import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DESKTOP_SETUP_URL } from '../../core/desktop/desktop-download';
import { LandingComponent } from './landing.component';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LandingComponent], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
  });

  it('apresenta o produto sem iniciar mídia e oferece os acessos reais', () => {
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toContain('A conversa');
    expect(page.querySelectorAll('audio, video, iframe').length).toBe(0);
    expect(page.querySelectorAll('a[href="/app"]').length).toBe(3);
    expect(page.querySelectorAll(`a[href="${DESKTOP_SETUP_URL}"]`).length).toBe(2);
    expect(getComputedStyle(page).overflowY).toBe('auto');
  });

  it('permite explorar tela e mute ilustrativos, sem mudar a sessão do aplicativo', () => {
    const page = fixture.nativeElement as HTMLElement;
    const sceneButtons = page.querySelectorAll<HTMLButtonElement>('.scene-picker button');
    sceneButtons[1].click();
    fixture.detectChanges();
    expect(page.querySelector('.shared-screen')).not.toBeNull();
    expect(sceneButtons[1].getAttribute('aria-pressed')).toBe('true');
    sceneButtons[2].click();
    fixture.detectChanges();
    const mute = page.querySelector<HTMLButtonElement>('.demo-audio button')!;
    mute.click();
    fixture.detectChanges();
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(mute.textContent).toContain('Ativar som');
    mute.click();
    fixture.detectChanges();
    expect(mute.getAttribute('aria-pressed')).toBe('false');
  });

  it('oferece pausa e retomada de todas as animações da demonstração', () => {
    const page = fixture.nativeElement as HTMLElement;
    const pause = page.querySelector<HTMLButtonElement>('.motion-toggle')!;
    pause.click();
    fixture.detectChanges();
    expect(page.querySelector('.demo-area')?.classList.contains('motion-paused')).toBeTrue();
    expect(pause.getAttribute('aria-label')).toBe('Retomar animações');
    pause.click();
    fixture.detectChanges();
    expect(pause.getAttribute('aria-label')).toBe('Pausar animações');
  });
});
