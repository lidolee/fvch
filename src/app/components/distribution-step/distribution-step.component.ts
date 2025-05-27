import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DistributionSummaryPayload } from '../../app.component';

@Component({
  selector: 'app-distribution-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './distribution-step.component.html',
  styleUrls: ['./distribution-step.component.scss']
})
export class DistributionStepComponent implements OnInit, OnDestroy {
  @Input() formGroup!: FormGroup;
  @Output() formValid = new EventEmitter<boolean>();
  @Output() next = new EventEmitter<void>();
  @Output() updateSummary = new EventEmitter<DistributionSummaryPayload>();

  private subscriptions = new Subscription();

  // Beispielhafte PLZ-Daten (könnten aus einem Service kommen)
  plzAreas = [
    { name: 'Zürich Stadt', households: 25000, costPerHousehold: 0.075 },
    { name: 'Winterthur', households: 60000, costPerHousehold: 0.070 },
    { name: 'Uster', households: 35000, costPerHousehold: 0.072 },
    { name: 'Region Genf', households: 150000, costPerHousehold: 0.080 },
    { name: 'Region Bern', households: 120000, costPerHousehold: 0.078 },
  ];

  constructor() {}

  ngOnInit(): void {
    if (!this.formGroup) {
      console.error("DistributionStepComponent: formGroup is not initialized!");
      // Notfall-Initialisierung, sollte aber durch AppComponent sichergestellt sein
      this.formGroup = new FormGroup({
        selectedAreas: new FormGroup(null, Validators.required),
        households: new FormGroup(0)
      });
    }

    // Status-Änderungen an Parent senden
    this.subscriptions.add(
      this.formGroup.statusChanges.subscribe(status => {
        this.formValid.emit(status === 'VALID');
      })
    );

    // Wert-Änderungen für Summary-Update und Haushalts-Logik
    this.subscriptions.add(
      this.formGroup.get('selectedAreas')?.valueChanges.pipe(
        distinctUntilChanged()
      ).subscribe(areaName => {
        const selectedArea = this.plzAreas.find(a => a.name === areaName);
        if (selectedArea) {
          this.formGroup.get('households')?.setValue(selectedArea.households, { emitEvent: false }); // emitEvent: false, um Schleife zu vermeiden
        } else {
          this.formGroup.get('households')?.setValue(0, { emitEvent: false });
        }
        this.triggerSummaryUpdate();
      })
    );
    // Manuelles Haushalt-Update auch berücksichtigen
    this.subscriptions.add(
      this.formGroup.get('households')?.valueChanges.pipe(
        debounceTime(300), // Kleine Verzögerung
        distinctUntilChanged()
      ).subscribe(() => {
        this.triggerSummaryUpdate();
      })
    );


    // Initiales Summary-Update, falls Werte schon gesetzt sind (z.B. durch AppComponent)
    if (this.formGroup.get('selectedAreas')?.value) {
      this.triggerSummaryUpdate();
    } else {
      // Standard-Summary, wenn nichts ausgewählt ist
      this.updateSummary.emit({
        details: 'Bitte Verteilgebiet auswählen',
        cost: 0
      });
    }
    this.formValid.emit(this.formGroup.valid); // Initialen Validierungsstatus senden
  }

  triggerSummaryUpdate(): void {
    const areaName = this.formGroup.get('selectedAreas')?.value;
    const households = this.formGroup.get('households')?.value || 0;
    let cost = 0;
    let details = 'Bitte Verteilgebiet auswählen';

    const selectedAreaData = this.plzAreas.find(a => a.name === areaName);

    if (selectedAreaData && households > 0) {
      // Nutze die Kosten pro Haushalt aus den Daten, wenn verfügbar, sonst Standardwert
      const costPerHousehold = selectedAreaData.costPerHousehold || 0.075;
      cost = households * costPerHousehold;
      details = `Gebiet: ${areaName}, ${households} HH`;
    } else if (areaName && households === 0) {
      details = `Gebiet: ${areaName}, keine Haushalte`;
    } else if (areaName) {
      details = `Gebiet: ${areaName}, Anzahl Haushalte prüfen`;
    }


    this.updateSummary.emit({ details, cost });
  }

  onNext(): void {
    if (this.formGroup.valid) {
      this.next.emit();
    } else {
      this.formGroup.markAllAsTouched(); // Zeige Validierungsfehler an
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
