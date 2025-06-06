import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// 1. Locale für Schweiz importieren und registrieren:
import { registerLocaleData } from '@angular/common';
import localeDeCh from '@angular/common/locales/de-CH';
import { LOCALE_ID } from '@angular/core';

registerLocaleData(localeDeCh);

// 2. Provider für LOCALE_ID ergänzen:
bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    ...(appConfig.providers || []),
    { provide: LOCALE_ID, useValue: 'de-CH' }
  ]
}).catch(err => console.error(err));
