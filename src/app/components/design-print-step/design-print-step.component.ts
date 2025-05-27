import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Hinzugefügt für ngModel
import { ValidationStatus } from '../../app.component'; // Pfad anpassen

@Component({
  selector: 'app-design-print-step',
  standalone: true,
  imports: [CommonModule, FormsModule], // FormsModule hinzugefügt
  templateUrl: './design-print-step.component.html',
  styleUrls: ['./design-print-step.component.scss']
})
export class DesignPrintStepComponent {
  @Output() prevStepRequest = new EventEmitter<void>();
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  selectedDesignOption: string = ''; // Um die Auswahl der Radio-Buttons zu speichern
  expressDruckSelected: boolean = false; // Um die Auswahl der Checkbox zu speichern

  private currentStatus: ValidationStatus = 'neutral';

  constructor() {
    // Initialen Status senden, wenn die Komponente geladen wird.
    // Da initial nichts ausgewählt ist, könnte es 'invalid' oder 'pending' sein,
    // je nach deinen Anforderungen.
    this.determineAndEmitValidationStatus();
  }

  // Diese Methode wird aufgerufen, wenn sich eine Auswahl ändert
  onSelectionChange() {
    this.determineAndEmitValidationStatus();
  }

  private determineAndEmitValidationStatus() {
    if (this.selectedDesignOption) {
      // Wenn eine Design-Option gewählt ist, ist es mindestens 'valid' oder 'pending'
      // (je nachdem, ob Express-Druck eine Bedingung für 'valid' ist, falls gewählt)
      this.currentStatus = 'valid'; // Vereinfacht: Sobald Design gewählt, ist es valide
    } else {
      // Wenn keine Design-Option gewählt ist
      this.currentStatus = 'pending'; // Oder 'invalid', wenn Design eine harte Anforderung ist
    }
    // Hier könntest du noch die Logik für expressDruckSelected einbauen,
    // falls das den Status weiter beeinflusst (z.B. wenn es Pflicht wäre, falls eine andere Option gewählt ist)
    this.validationChange.emit(this.currentStatus);
  }


  updateLocalValidationStatus(newStatus: ValidationStatus) {
    this.currentStatus = newStatus;
    this.validationChange.emit(this.currentStatus);
  }

  goBack() {
    this.prevStepRequest.emit();
  }

  proceedToNextStep() {
    this.determineAndEmitValidationStatus(); // Sicherstellen, dass der Status aktuell ist

    if (this.currentStatus === 'valid' || this.currentStatus === 'pending') { // Anpassen, falls 'pending' nicht erlaubt
      this.nextStepRequest.emit();
    } else {
      console.warn('Design & Print step: Validation failed.');
    }
  }

  // Nur für Testzwecke, kann entfernt werden
  setExampleStatus(status: ValidationStatus) {
    this.updateLocalValidationStatus(status);
  }
}
