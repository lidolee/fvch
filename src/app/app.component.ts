import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbNavModule, NgbNav } from '@ng-bootstrap/ng-bootstrap';

import { DistributionStepComponent } from './components/distribution-step/distribution-step.component';
import { DesignPrintStepComponent } from './components/design-print-step/design-print-step.component';
import { ContactStepComponent } from './components/contact-step/contact-step.component';
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
    ContactStepComponent,
    SummaryStepComponent,
    CalculatorComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  @ViewChild('nav') navInstance: NgbNav | undefined;

  activeStepId = 1;

  stepValidationStatus: { [key: number]: ValidationStatus } = {
    1: 'neutral',
    2: 'neutral',
    3: 'neutral',
    4: 'neutral',
  };

  navigateToStep(stepId: number) {
    if (this.navInstance) {
      this.navInstance.select(stepId);
      this.activeStepId = stepId;
    }
  }

  updateValidationStatus(stepId: number, status: ValidationStatus) {
    this.stepValidationStatus[stepId] = status;
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

  onNavChange(event: { activeId: number, nextId: number, preventDefault: () => void }) {
    this.activeStepId = event.nextId;
  }
}
