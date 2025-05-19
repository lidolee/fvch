/**
 * @file offerte.module.ts
 * @author lidolee
 * @date 2025-05-19 14:52:51
 * @description Offerte module for handling quote creation and management
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { OfferteComponent } from './offerte/offerte.component';
import { KontaktdatenComponent } from './components/kontaktdaten/kontaktdaten.component';
import { DienstleistungenComponent } from './components/dienstleistungen/dienstleistungen.component';
import { ZusammenfassungComponent } from './components/zusammenfassung/zusammenfassung.component';
import { KalkulationComponent } from './components/kalkulation/kalkulation.component';

@NgModule({
  declarations: [

  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgbModule,
    // FV Components
    OfferteComponent,
    KontaktdatenComponent,
    DienstleistungenComponent,
    ZusammenfassungComponent,
    KalkulationComponent
  ],
  exports: [
    OfferteComponent
  ]
})
export class OfferteModule { }
