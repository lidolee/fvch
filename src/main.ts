import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http'; // Beispiel, falls HTTP später benötigt wird
// import { provideRouter } from '@angular/router'; // Beispiel, falls Routing später benötigt wird
// import { provideAnimations } from '@angular/platform-browser/animations'; // Falls Angular Animationen genutzt werden

import { AppComponent } from './app/app.component';

// Beispiel für App-Konfiguration, falls benötigt
const appConfig = {
  providers: [
    // provideRouter([]), // Leere Routen, falls Router-Outlet genutzt wird, aber keine Routen definiert sind
    // provideAnimations(),
    provideHttpClient(), // Für HTTP-Anfragen
    // Weitere globale Provider hier
  ]
};

bootstrapApplication(AppComponent, appConfig) // Hier wird AppComponent direkt gebootstrapped
  .catch(err => console.error(err));
