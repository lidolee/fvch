import { Routes } from '@angular/router';
import { OfferProcessComponent } from './components/offer-process/offer-process.component';

export const routes: Routes = [
  {
    path: '',
    component: OfferProcessComponent
  },
  {
    path: ':stadtname',
    component: OfferProcessComponent
  },
  { path: '**', redirectTo: '', pathMatch: 'full' } // Kann wieder aktiviert werden
];
