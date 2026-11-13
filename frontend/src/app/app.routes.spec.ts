import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { AppShellComponent } from './features/shell/app-shell.component';

@Component({ standalone: true, template: 'Aplicativo HiCall' })
class ShellProbeComponent {}

describe('Rotas públicas e aplicativo', () => {
  let authenticated: boolean;

  beforeEach(() => {
    authenticated = false;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter(routes.map(route => route.component === AppShellComponent ? { ...route, component: ShellProbeComponent } : route)),
        { provide: AuthService, useValue: { isAuthenticated: () => authenticated, isAdmin: () => false } },
      ],
    });
  });

  it('abre a apresentação sem exigir login', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('A conversa');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('mantém o aplicativo protegido em /app', async () => {
    const harness = await RouterTestingHarness.create('/app');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.textContent).toContain('Entre para acessar');
  });

  it('encaminha quem já está conectado de /login para /app', async () => {
    authenticated = true;
    const harness = await RouterTestingHarness.create('/login');
    expect(TestBed.inject(Router).url).toBe('/app');
    expect(harness.routeNativeElement?.textContent).toBe('Aplicativo HiCall');
  });

  it('preserva os links diretos existentes de servidores e canais', async () => {
    authenticated = true;
    const harness = await RouterTestingHarness.create('/servidor/12/canal/34');
    expect(TestBed.inject(Router).url).toBe('/servidor/12/canal/34');
    expect(harness.routeNativeElement?.textContent).toBe('Aplicativo HiCall');
  });

  it('mantém a entrada de instaladores desktop antigos que abrem a raiz', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'hicallDesktop');
    Object.defineProperty(window, 'hicallDesktop', { configurable: true, value: { isDesktop: true } });
    authenticated = true;
    try {
      await RouterTestingHarness.create('/');
      expect(TestBed.inject(Router).url).toBe('/app');
    } finally {
      if (original) Object.defineProperty(window, 'hicallDesktop', original);
      else delete window.hicallDesktop;
    }
  });
});
