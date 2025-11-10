import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/upload/upload').then(m => m.Upload)
  },
  {
    path: 'download/:id',
    loadComponent: () => import('./components/download/download').then(m => m.Download)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
