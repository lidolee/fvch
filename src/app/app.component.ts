import { Component, ViewChild, ChangeDetectorRef, AfterContentChecked } from '@angular/core'; // ChangeDetectorRef und AfterContentChecked importieren
import { CommonModule } from '@angular/common';
import { NgbNavModule, NgbNav, NgbNavChangeEvent } from '@ng-bootstrap/ng-bootstrap'; // NgbNavChangeEvent importieren

import { DistributionStepComponent } from './components/distribution-step/distribution-step.component';
import { DesignPrintStepComponent } from './components/design-print-step/design-print-step.component';
import { SummaryStepComponent } from './components/summary-step/summary-step.component';
import { CalculatorComponent } from './components/calculator/calculator.component';

export type ValidationStatus = 'valid' | 'invalid' | 'pending' | 'neutral';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    NgbNavModule,
    DistributionStepComponent,
    DesignPrintStepComponent,
    SummaryStepComponent,
    CalculatorComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterContentChecked { // AfterContentChecked implementieren
  @ViewChild('nav') navInstance: NgbNav | undefined;

  activeStepId = 1;

  stepValidationStatus: { [key: number]: ValidationStatus } = {
    1: 'neutral',
    2: 'neutral',
    3: 'neutral',
    // 4: 'neutral', // Schritt 4 existiert nicht in deiner Tab-Navigation
  };

  constructor(private cdr: ChangeDetectorRef) {} // ChangeDetectorRef injizieren

  // Manchmal hilft es, die manuelle Auslösung der Change Detection zu vermeiden,
  // indem man sicherstellt, dass Änderungen im richtigen Moment passieren.
  // Wenn die Kindkomponente (z.B. DistributionStep) ihren Status ändert und ein Event auslöst,
  // sollte Angular das normalerweise automatisch erkennen.

  // Diese Methode wird verwendet, um den Fehler ExpressionChangedAfterItHasBeenChecked zu vermeiden.
  // Sie wird nach jeder Change Detection der Kindkomponenten aufgerufen.
  ngAfterContentChecked(): void {
    this.cdr.detectChanges();
  }


  navigateToStep(stepId: number) {
    if (this.navInstance && this.activeStepId !== stepId) { // Nur navigieren, wenn es ein neues Ziel ist
      this.navInstance.select(stepId);
      // activeStepId wird durch onNavChange gesetzt
    }
  }

  updateValidationStatus(stepId: number, status: ValidationStatus) {
    // Um "ExpressionChangedAfterItHasBeenCheckedError" zu vermeiden,
    // kann man die Änderung in einen Microtask verschieben.
    Promise.resolve().then(() => {
      if (this.stepValidationStatus[stepId] !== status) {
        this.stepValidationStatus[stepId] = status;
        // Manuelle Change Detection ist hier oft nicht nötig, wenn die Quelle der Änderung (Kind-Event) korrekt ist.
        // Falls doch, this.cdr.detectChanges(); hier oder in ngAfterContentChecked.
      }
    });
  }

  getValidationIconClass(stepId: number): string {
    const status = this.stepValidationStatus[stepId];
    switch (status) {
      case 'valid':
        return 'mdi-check-circle text-success';
      case 'invalid':
        return 'mdi-alert-circle text-danger';
      case 'pending':
        return 'mdi-alert-circle text-warning';
      default:
        return 'mdi-circle-outline text-secondary';
    }
  }

  // Typ für event expliziter machen
  onNavChange(event: NgbNavChangeEvent<number>) { // Typ NgbNavChangeEvent verwenden
    // event.activeId ist der aktuelle Tab, event.nextId ist der Ziel-Tab
    // event.preventDefault() kann hier aufgerufen werden, um die Navigation zu verhindern
    this.activeStepId = event.nextId;
  }
}
