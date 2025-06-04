import { Component, Output, EventEmitter, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core'; // ChangeDetectionStrategy, ChangeDetectorRef hinzugefügt
import { CommonModule } from '@angular/common';
import { ValidationStatus } from '../offer-process/offer-process.component'; // Korrekter Import
import { ContactDataComponent } from '../contact-data/contact-data.component';

@Component({
  selector: 'app-summary-step',
  standalone: true,
  imports: [CommonModule, ContactDataComponent],
  templateUrl: './summary-step.component.html',
  styleUrls: ['./summary-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush // Hinzugefügt für Konsistenz und geringe Performance-Verbesserung
})
export class SummaryStepComponent implements OnInit {
  @Output() prevStepRequest = new EventEmitter<void>();
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  // Beispiel: Daten, die von einem Service geladen werden könnten
  // public summaryData: any = null; // Initialisieren mit null oder einem passenden Typ

  constructor(
    private cdr: ChangeDetectorRef
    // private dataService: MyDataService // Beispiel für einen Datenservice
  ) {}

  ngOnInit() {
    // Der Summary-Schritt ist oft standardmäßig valide, sobald er angezeigt wird,
    // oder seine Validität hängt von geladenen Daten ab.
    // Hier wird 'valid' emittiert, was bedeutet, dass der Schritt als bereit zum Fortfahren gilt.
    this.validationChange.emit('valid');

    // Beispiel: Lade hier die Daten für die Zusammenfassung
    // this.dataService.getSummary().subscribe(data => {
    //   this.summaryData = data;
    //   this.cdr.markForCheck(); // UI aktualisieren, nachdem Daten geladen wurden
    //   // Ggf. Validierungsstatus basierend auf den Daten neu setzen:
    //   // this.validationChange.emit(this.calculateValidationBasedOnData(data));
    // });
    this.cdr.markForCheck(); // Sicherstellen, dass initiale Bindings aktualisiert werden
  }

  goBack(): void {
    this.prevStepRequest.emit();
  }

  proceedToNextStep(): void {
    // Hier könnte Logik zum Absenden der Bestellung/Offerte stehen.
    // Zum Beispiel: Aufruf eines Service, der die Daten an ein Backend sendet.
    console.log('Order/Offer submitted (simulated)!');
    // this.someOrderService.submitOrder(this.summaryData).subscribe({
    //   next: () => this.nextStepRequest.emit(),
    //   error: (err) => console.error('Failed to submit order', err)
    // });
    this.nextStepRequest.emit(); // Signalisiert den Abschluss des Prozesses oder den Übergang zum nächsten Schritt (z.B. Danke-Seite)
  }
}
