import { Component, ViewChild, ChangeDetectorRef, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbNavModule, NgbNav, NgbNavChangeEvent } from '@ng-bootstrap/ng-bootstrap';
import { Router } from '@angular/router'; // Router is imported but not used in the original logic, kept for structural integrity

import { DistributionStepComponent } from '../distribution-step/distribution-step.component';
import { DesignPrintStepComponent } from '../design-print-step/design-print-step.component';
import { SummaryStepComponent } from '../summary-step/summary-step.component';
import { CalculatorComponent } from '../calculator/calculator.component';

export type ValidationStatus = 'valid' | 'invalid' | 'pending' | 'neutral';

@Component({
  selector: 'app-offer-process',
  standalone: true,
  imports: [
    CommonModule,
    NgbNavModule,
    DistributionStepComponent,
    DesignPrintStepComponent,
    SummaryStepComponent,
    CalculatorComponent
  ],
  templateUrl: './offer-process.component.html',
  styleUrls: ['./offer-process.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OfferProcessComponent implements OnInit, OnChanges {
  @ViewChild('nav') navInstance: NgbNav | undefined;

  @Input() stadtname: string | undefined; // This is the input from the parent
  initialStadtnameForDistribution: string | undefined;

  activeStepId = 1;
  stepValidationStatus: { [key: number]: ValidationStatus } = {
    1: 'neutral',
    2: 'neutral',
    3: 'neutral',
  };

  constructor(private cdr: ChangeDetectorRef, private router: Router) {
    // Constructor logic, logs removed
  }

  ngOnInit(): void {
    this.updateInitialStadtForDistributionStep();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['stadtname']) {
      this.updateInitialStadtForDistributionStep();
    }
  }

  private updateInitialStadtForDistributionStep(): void {
    let newInitialStadtValue: string | undefined;

    if (this.stadtname && this.stadtname.trim() !== '' && this.stadtname.toLowerCase() !== 'undefined') {
      // If stadtname is a non-empty string and not literally "undefined" (case-insensitive)
      newInitialStadtValue = this.stadtname;
    } else {
      // Otherwise, treat as no city specified
      newInitialStadtValue = undefined;
    }

    // Only update and trigger change detection if the actual value for the child component changes
    if (this.initialStadtnameForDistribution !== newInitialStadtValue) {
      this.initialStadtnameForDistribution = newInitialStadtValue;
      this.cdr.markForCheck();
    }
  }

  navigateToStep(stepId: number): void {
    if (this.navInstance && this.activeStepId !== stepId && stepId >= 1 && stepId <= 3) {
      this.navInstance.select(stepId);
    } else if (stepId === 4 && this.activeStepId === 3 && this.stepValidationStatus[3] === 'valid') {
      // Logic for step 4 (completion)
      // e.g. this.router.navigate(['/danke']);
    }
  }

  updateValidationStatus(stepId: number, status: ValidationStatus): void {
    if (this.stepValidationStatus[stepId] !== status) {
      this.stepValidationStatus[stepId] = status;
      this.cdr.markForCheck();
    }
  }

  getValidationIconClass(stepId: number): string {
    const status = this.stepValidationStatus[stepId];
    switch (status) {
      case 'valid': return 'mdi-check-circle text-success';
      case 'invalid': return 'mdi-alert-circle text-danger';
      case 'pending': return 'mdi-timer-sand text-warning';
      default: return 'mdi-circle-outline text-secondary';
    }
  }

  onNavChange(event: NgbNavChangeEvent<number>): void {
    this.activeStepId = event.nextId;
    this.cdr.markForCheck();
  }
}
