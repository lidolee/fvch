import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

// Import der Komponenten
import { KontaktdatenComponent } from '../components/kontaktdaten/kontaktdaten.component';
import { DienstleistungenComponent } from '../components/dienstleistungen/dienstleistungen.component';
import { ZusammenfassungComponent } from '../components/zusammenfassung/zusammenfassung.component';
import { KalkulationComponent } from '../components/kalkulation/kalkulation.component';

@Component({
  selector: 'app-offerte',
  standalone: true,
  imports: [
    CommonModule,
    KontaktdatenComponent,
    DienstleistungenComponent,
    ZusammenfassungComponent,
    KalkulationComponent
  ],
  templateUrl: './offerte.component.html',
  styleUrl: './offerte.component.scss'
})
export class OfferteComponent {
}
