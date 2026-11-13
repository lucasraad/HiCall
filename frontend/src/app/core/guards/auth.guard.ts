import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { isHicallDesktop } from '../desktop/hicall-desktop';

// Instaladores anteriores abrem a raiz; preserve a entrada direta no aplicativo.
export const landingGuard: CanActivateFn = () =>
  isHicallDesktop() ? inject(Router).createUrlTree(['/app']) : true;

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/app']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.isAdmin()) {
    return true;
  }

  return router.createUrlTree(['/app']);
};
