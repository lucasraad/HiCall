import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should render three-column shell layout', () => {
    httpMock.expectOne(`${environment.apiUrl}/servers`).flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-server-rail')).toBeTruthy();
    expect(el.querySelector('app-channel-list')).toBeTruthy();
    expect(el.querySelector('app-channel-view')).toBeTruthy();
  });

  it('abre o drawer mobile pelo botão de menu', () => {
    httpMock.expectOne(`${environment.apiUrl}/servers`).flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('[data-testid="mobile-nav-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();
    expect(el.querySelector('.hicall-sidebar--open')).toBeFalsy();

    toggle!.click();
    fixture.detectChanges();

    expect(el.querySelector('.hicall-sidebar--open')).toBeTruthy();
    expect(toggle!.getAttribute('aria-expanded')).toBe('true');
  });
});
