import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VoiceControlsComponent } from './voice-controls.component';

describe('VoiceControlsComponent', () => {
  let fixture: ComponentFixture<VoiceControlsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoiceControlsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VoiceControlsComponent);
    fixture.detectChanges();
  });

  it('bloqueia câmera e tela com tooltip quando o cargo restringe', () => {
    fixture.componentRef.setInput('videoLocked', true);
    fixture.componentRef.setInput('screenLocked', true);
    fixture.componentRef.setInput('audioLocked', true);
    fixture.detectChanges();

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    const titles = [...buttons].map((button) => button.getAttribute('title') ?? '');
    expect(titles.some((title) => title.includes('não permite ligar a câmera'))).toBeTrue();
    expect(titles.some((title) => title.includes('não permite transmitir tela'))).toBeTrue();
    expect(titles.some((title) => title.includes('não permite falar'))).toBeTrue();
    expect([...buttons].some((button) => button.disabled && (button.title ?? '').includes('câmera'))).toBeTrue();
  });
});
