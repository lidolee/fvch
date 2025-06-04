import { ServerRoute, RenderMode } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '', // Muss exakt dem Client-Pfad '' entsprechen
    renderMode: RenderMode.Server
  },
  {
    path: ':stadtname', // Muss exakt dem Client-Pfad ':stadtname' entsprechen
    renderMode: RenderMode.Server
  },
  {
    path: '**', // Muss exakt dem Client-Pfad '**' entsprechen
    renderMode: RenderMode.Server // oder RenderMode.Hybrid, je nach Strategie für Fallbacks
  }
];
