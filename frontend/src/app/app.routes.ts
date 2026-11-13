import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards/auth.guard';
import { AdminUsersComponent } from './features/admin/admin-users.component';
import { LoginComponent } from './features/auth/login.component';
import { AppShellComponent } from './features/shell/app-shell.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'admin', component: AdminUsersComponent, canActivate: [authGuard, adminGuard] },
  { path: '', component: AppShellComponent, canActivate: [authGuard] },
  { path: 'servidor/:serverId', component: AppShellComponent, canActivate: [authGuard] },
  { path: 'servidor/:serverId/canal/:channelId', component: AppShellComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
