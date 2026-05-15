import { Routes } from '@angular/router';
import { gameGuard } from './game/game.guard';

export const routes: Routes = [
  {
    path: 'game',
    loadComponent: () => import('./game/game.page').then((m) => m.GamePage),
    canActivate: [gameGuard],
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage)
  },
  {
    path: 'leaderboard',
    loadComponent: () => import('./leaderboard/leaderboard.page').then(m => m.LeaderboardPage)
  },
  {
    path: 'profile/:id',
    loadComponent: () => import('./profile/profile.page').then(m => m.ProfilePage)
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy.page').then(m => m.PrivacyPage)
  },
  {
    path: 'delete-account',
    loadComponent: () => import('./delete-account/delete-account.page').then(m => m.DeleteAccountPage)
  },
];
