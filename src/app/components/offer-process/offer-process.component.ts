import { Component, ViewChild, ChangeDetectorRef, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbNavModule, NgbNav, NgbNavChangeEvent } from '@ng-bootstrap/ng-bootstrap';
import { Router } from '@angular/router';

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

  @Input() stadtname: string | undefined;
  initialStadtnameForDistribution: string | undefined;

  activeStepId = 1;
  stepValidationStatus: { [key: number]: ValidationStatus } = {
    1: 'neutral',
    2: 'neutral',
    3: 'neutral',
  };

  private userLogin = "lidolee";

  private get logPrefix() {
    return `[${new Date().toISOString()}][${this.userLogin}] [OfferProcessComponent]`;
  }

  constructor(private cdr: ChangeDetectorRef, private router: Router) {
    console.log(`${this.logPrefix} Constructor. Aktueller Router-Pfad: ${this.router.url}, @Input stadtname (initial): ${this.stadtname}`);
  }

  ngOnInit(): void {
    console.log(`${this.logPrefix} ngOnInit. Aktueller Router-Pfad: ${this.router.url}, @Input stadtname (nach init): ${this.stadtname}`);
    this.updateInitialStadtForDistributionStep();
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log(`${this.logPrefix} ngOnChanges. Aktueller Router-Pfad: ${this.router.url}, @Input stadtname (bei OnChanges): ${this.stadtname}, Änderungen:`, changes);
    if (changes['stadtname']) {
      console.log(`${this.logPrefix} ngOnChanges: 'stadtname' Input spezifisch geändert. Neuer Wert: ${changes['stadtname'].currentValue}, Vorheriger Wert: ${changes['stadtname'].previousValue}, Ist erste Änderung: ${changes['stadtname'].firstChange}`);
      this.updateInitialStadtForDistributionStep();
    }
  }

  private updateInitialStadtForDistributionStep(): void {
    this.initialStadtnameForDistribution = this.stadtname;
    console.log(`${this.logPrefix} updateInitialStadtForDistributionStep. Setze initialStadtnameForDistribution zu: '${this.initialStadtnameForDistribution}'`);
    this.cdr.markForCheck();
  }

  navigateToStep(stepId: number): void {
    console.log(`${this.logPrefix} navigateToStep - Ziel stepId: ${stepId}`);
    if (this.navInstance && this.activeStepId !== stepId && stepId >= 1 && stepId <= 3) {
      this.navInstance.select(stepId);
    } else if (stepId === 4 && this.activeStepId === 3 && this.stepValidationStatus[3] === 'valid') {
      console.log(`${this.logPrefix} Logik für Schritt 4 (Abschluss) hier einfügen.`);
      // z.B. this.router.navigate(['/danke']);
    }
  }

  updateValidationStatus(stepId: number, status: ValidationStatus): void {
    console.log(`${this.logPrefix} updateValidationStatus - stepId: ${stepId}, Status: ${status}`);
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
    console.log(`${this.logPrefix} onNavChange - activeId: ${event.activeId}, nextId: ${event.nextId}.`);
    this.activeStepId = event.nextId;
    this.cdr.markForCheck();
  }
}
