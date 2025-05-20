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
import { ContactdataComponent } from './components/contactdata/contactdata.component';
import { SolutionsComponent } from './components/solutions/solutions.component';
import { ConfirmationComponent } from './components/confirmation/confirmation.component';
import { CalculatorComponent } from './components/calculator/calculator.component';

@NgModule({
  declarations: [

  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgbModule,
    OfferteComponent,
    ContactdataComponent,
    SolutionsComponent,
    ConfirmationComponent,
    CalculatorComponent
  ],
  exports: [
    OfferteComponent
  ]
})
export class OfferteModule { }
