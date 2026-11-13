import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { adminGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('adminGuard', () => {
  it('should allow admin users', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => true,
            isAdmin: () => true,
          },
        },
        {
          provide: Router,
          useValue: {
            createUrlTree: jasmine.createSpy('createUrlTree'),
          },
        },
      ],
    });

    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
    expect(result).toBeTrue();
  });

  it('should redirect non-admin users', () => {
    const router = {
      createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue('/'),
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => true,
            isAdmin: () => false,
          },
        },
        { provide: Router, useValue: router },
      ],
    });

    TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
    expect(router.createUrlTree).toHaveBeenCalledWith(['/app']);
  });
});
