import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValidationStatus } from '../../app.component'; // Pfad anpassen
// Importiere ggf. Services, um Daten für die Zusammenfassung zu laden

@Component({
  selector: 'app-summary-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './summary-step.component.html',
  styleUrls: ['./summary-step.component.scss']
})
export class SummaryStepComponent implements OnInit {
  @Output() prevStepRequest = new EventEmitter<void>();
  @Output() submitRequest = new EventEmitter<void>();
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

  finalizeOrder() {
    // Logik zum Absenden der Bestellung/Offerte
    console.log('Order submitted!');
    this.submitRequest.emit(); // Signalisiert den Abschluss
  }
}
