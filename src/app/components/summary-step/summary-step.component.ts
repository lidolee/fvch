import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValidationStatus } from '../../app.component';
import {ContactDataComponent} from '../contact-data/contact-data.component';

@Component({
  selector: 'app-summary-step',
  standalone: true,
  imports: [CommonModule, ContactDataComponent],
  templateUrl: './summary-step.component.html',
  styleUrls: ['./summary-step.component.scss']
})
export class SummaryStepComponent implements OnInit {
  @Output() prevStepRequest = new EventEmitter<void>();
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  // Daten für die Zusammenfassung, die du z.B. von einem Service lädst
  // summaryData: any;

  constructor(/* private dataService: MyDataService */) {}

  ngOnInit() {
    // Der Summary-Schritt ist oft standardmäßig valide zum Anzeigen
    this.validationChange.emit('valid');
    // Lade hier die Daten für die Zusammenfassung
    // this.summaryData = this.dataService.getSummary();
  }

  goBack() {
    this.prevStepRequest.emit();
  }

  proceedToNextStep() {
    // Logik zum Absenden der Bestellung/Offerte
    console.log('Order submitted!');
    this.nextStepRequest.emit(); // Signalisiert den Abschluss
  }
}
