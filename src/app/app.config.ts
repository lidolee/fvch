import { ApplicationConfig, isDevMode, PLATFORM_ID } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { APP_BASE_HREF, isPlatformBrowser } from '@angular/common';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes,
      withComponentInputBinding(),
      withViewTransitions(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    ),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    {
      provide: APP_BASE_HREF,
      useFactory: (platformId: Object) => {
        if (isPlatformBrowser(platformId)) {
          // Browser: Dev '/', Prod '/offerte/'
          return isDevMode() ? '/' : '/offerte/';
        }
        // SSR (Server): Dev '/', Prod '/offerte/'
        // Die angular.json steuert den baseHref für den Build.
        // Dieser Provider stellt sicher, dass der Angular Router intern den korrekten Basiswert kennt.
        return isDevMode() ? '/' : '/offerte/';
      },
      deps: [PLATFORM_ID]
    }
  ]
};
