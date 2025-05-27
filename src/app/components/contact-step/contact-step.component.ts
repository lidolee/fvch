import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Falls du Template-Driven Forms verwendest
// import { ReactiveFormsModule } from '@angular/forms'; // Falls du Reactive Forms verwendest
import { ValidationStatus } from '../../app.component'; // Pfad anpassen

@Component({
  selector: 'app-contact-step',
  standalone: true,
  imports: [CommonModule, FormsModule /* oder ReactiveFormsModule */],
  templateUrl: './contact-step.component.html',
  styleUrls: ['./contact-step.component.scss']
})
export class ContactStepComponent {
  @Output() prevStepRequest = new EventEmitter<void>();
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  // Beispiel für Template-Driven Forms
  contactData = {
    email: '',
    name: ''
  };
  private currentStatus: ValidationStatus = 'invalid'; // Form ist oft initial ungültig

  constructor() {
    // Sende initialen Status, da Formulare oft required Felder haben
    // this.validationChange.emit(this.currentStatus);
  }

  // Diese Methode würde aufgerufen, wenn sich Formularwerte ändern
  // (z.B. durch (ngModelChange) oder Wertänderungen in Reactive Forms)
  validateForm() {
    // Deine Validierungslogik für das Formular
    if (this.contactData.email && this.contactData.email.includes('@') && this.contactData.name) {
      this.currentStatus = 'valid';
    } else if (this.contactData.email || this.contactData.name) {
      this.currentStatus = 'pending'; // Teilweise ausgefüllt
    } else {
      this.currentStatus = 'invalid';
    }
    this.validationChange.emit(this.currentStatus);
  }

  goBack() {
    this.prevStepRequest.emit();
  }

  // Wird aufgerufen, wenn das Formular (im Template) gesendet wird
  submitForm() {
    this.validateForm(); // Stelle sicher, dass der Status aktuell ist
    if (this.currentStatus === 'valid') {
      this.nextStepRequest.emit();
    } else {
      console.warn('Contact step: Form is not valid.');
      // Optional: Markiere Formularfelder als "touched", um Fehler anzuzeigen
    }
  }
}
