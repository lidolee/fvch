import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

// Import der Komponenten
import { ContactdataComponent } from '../components/contactdata/contactdata.component';
import { ServicesComponent } from '../components/services/services.component';
import { ConfirmationComponent } from '../components/confirmation/confirmation.component';
import { CalculatorComponent } from '../components/calculator/calculator.component';

@Component({
  selector: 'app-offerte',
  standalone: true,
  imports: [
    CommonModule,
    ContactdataComponent,
    ServicesComponent,
    ConfirmationComponent,
    CalculatorComponent
  ],
  templateUrl: './offerte.component.html',
  styleUrl: './offerte.component.scss'
})
export class OfferteComponent {
}
