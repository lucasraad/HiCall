import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, landingGuard } from './core/guards/auth.guard';
import { AdminUsersComponent } from './features/admin/admin-users.component';
import { LoginComponent } from './features/auth/login.component';
import { AppShellComponent } from './features/shell/app-shell.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [landingGuard], loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent), title: 'HiCall — a conversa começa com um hi' },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'admin', component: AdminUsersComponent, canActivate: [authGuard, adminGuard] },
  { path: 'app', component: AppShellComponent, canActivate: [authGuard], title: 'HiCall — seus servidores' },
  { path: 'servidor/:serverId', component: AppShellComponent, canActivate: [authGuard] },
  { path: 'servidor/:serverId/canal/:channelId', component: AppShellComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
