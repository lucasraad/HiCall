import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return next(req.clone({ setHeaders: headers })).pipe(
    catchError((err: unknown) => {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      const url = req.url;
      if (status === 401 && !url.includes('/login') && !url.includes('/logout')) {
        auth.expireSession();
      }
      return throwError(() => err);
    }),
  );
};
