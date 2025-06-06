import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

// Locale-Import und Registrierung HINZUFÜGEN:
import { registerLocaleData } from '@angular/common';
import localeDeCh from '@angular/common/locales/de-CH';
registerLocaleData(localeDeCh);

const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;
