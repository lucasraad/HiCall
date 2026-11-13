import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';
import { AppShellComponent } from '../../features/shell/app-shell.component';

/**
 * Evita recriar o shell ao navegar entre /app, /servidor/:id e /servidor/:id/canal/:id.
 * Sem isso, cada clique destrói o componente e parece reload da página.
 */
export class AppShellReuseStrategy implements RouteReuseStrategy {
  shouldDetach(): boolean {
    return false;
  }

  store(): void {}

  shouldAttach(): boolean {
    return false;
  }

  retrieve(): DetachedRouteHandle | null {
    return null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    const futureComponent = future.routeConfig?.component;
    const currComponent = curr.routeConfig?.component;

    if (futureComponent === AppShellComponent && currComponent === AppShellComponent) {
      return true;
    }

    return future.routeConfig === curr.routeConfig;
  }
}
