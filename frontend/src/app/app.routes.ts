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
  // Les pages /rules/* et les pages « jouer » localisées ne sont plus des
  // routes Angular : ce sont des fichiers HTML statiques générés par
  // content/build.mjs et servis directement (voir src/staticwebapp.config.json).
  // Elles doivent rester lisibles sans JavaScript pour les moteurs de réponse
  // IA, ce qu'un rendu côté client ne permet pas.
  {
    path: 'delete-account',
    loadComponent: () => import('./delete-account/delete-account.page').then(m => m.DeleteAccountPage)
  },
];
