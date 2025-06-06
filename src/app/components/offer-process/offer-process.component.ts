import { Component, ViewChild, ChangeDetectorRef, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, AfterViewInit, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NgbNavModule, NgbNav, NgbNavChangeEvent } from '@ng-bootstrap/ng-bootstrap';
import { Router } from '@angular/router';

import { DistributionStepComponent, ZielgruppeOption } from '../distribution-step/distribution-step.component';
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
export class OfferProcessComponent implements OnInit, OnChanges, AfterViewInit {
  @ViewChild('nav') navInstance!: NgbNav;
  @ViewChild(DistributionStepComponent) distributionStepComponent?: DistributionStepComponent;
  @ViewChild(DesignPrintStepComponent) designPrintStepComponent?: DesignPrintStepComponent;
  @ViewChild(SummaryStepComponent) summaryStepComponent?: SummaryStepComponent;

  @Input() stadtname: string | undefined;
  initialStadtnameForDistribution: string | undefined;

  activeStepId = 1;
  stepValidationStatus: { [key: number]: ValidationStatus } = {
    1: 'pending',
    2: 'pending',
    3: 'pending',
  };

  // NEU: Zielgruppe State zentral im OfferProcess
  zielgruppe: ZielgruppeOption = 'Alle Haushalte';

  private readonly isBrowser: boolean;

  constructor(
    private cdr: ChangeDetectorRef,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.updateInitialStadtForDistributionStep();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['stadtname']) {
      this.updateInitialStadtForDistributionStep();
    }
  }

  ngAfterViewInit(): void {
    if (this.activeStepId === 1 && this.distributionStepComponent) {
      // Potentially trigger a re-validation or status check if needed
    }
    this.cdr.detectChanges();
  }

  private updateInitialStadtForDistributionStep(): void {
    let newInitialStadtValue: string | undefined;

    if (this.stadtname && this.stadtname.trim() !== '' && this.stadtname.toLowerCase() !== 'undefined') {
      newInitialStadtValue = this.stadtname;
    } else {
      newInitialStadtValue = undefined;
    }

    if (this.initialStadtnameForDistribution !== newInitialStadtValue) {
      this.initialStadtnameForDistribution = newInitialStadtValue;
      this.cdr.markForCheck();
    }
  }

  navigateToStep(stepId: number): void {
    if (this.navInstance && this.activeStepId !== stepId && stepId >= 1 && stepId <= 3) {
      this.activeStepId = stepId;
      this.navInstance.select(stepId);
      this.cdr.markForCheck();
    } else if (stepId === 4 && this.activeStepId === 3 && this.stepValidationStatus[3] === 'valid') {
      // this.router.navigate(['/danke']); // Example completion navigation
      this.scrollToTop(); // Scroll on final step completion
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
      default: return 'mdi-circle-outline text-secondary';
    }
  }

  onNavChange(event: NgbNavChangeEvent<number>): void {
    if (event.activeId < event.nextId && this.stepValidationStatus[event.activeId] !== 'valid') {
      event.preventDefault();
      this.triggerStepValidationFeedback(event.activeId);
      return;
    }
    this.activeStepId = event.nextId;
    this.cdr.markForCheck();
    this.scrollToTop(); // Scroll whenever a tab navigation occurs
  }

  private triggerStepValidationFeedback(stepId: number): void {
    const componentInstance = this.getActiveStepComponentInstance(stepId);
    if (componentInstance && typeof componentInstance.triggerValidationDisplay === 'function') {
      componentInstance.triggerValidationDisplay();
    } else if (componentInstance && stepId === 3 && componentInstance instanceof SummaryStepComponent) {
      componentInstance.triggerFinalizeOrder();
    }
  }

  onCalculatorPrevious(): void {
    if (this.activeStepId > 1) {
      this.navigateToStep(this.activeStepId - 1);
      this.scrollToTop(); // Scroll on previous step navigation
    }
  }

  onCalculatorNext(): void {
    if (this.stepValidationStatus[this.activeStepId] === 'valid') {
      if (this.activeStepId < 3) {
        const nextStepId = this.activeStepId + 1;
        this.navigateToStep(nextStepId);
        this.scrollToTop(); // Scroll on next step navigation
      }
    } else {
      this.triggerStepValidationFeedback(this.activeStepId);
    }
  }

  onCalculatorSubmit(): void {
    if (this.activeStepId === 3) {
      if (this.stepValidationStatus[3] === 'valid') {
        const summaryComp = this.summaryStepComponent;
        if (summaryComp) {
          summaryComp.triggerFinalizeOrder(); // This eventually calls navigateToStep(4) via events
        }
      } else {
        this.triggerStepValidationFeedback(this.activeStepId);
      }
    }
  }

  // NEU: Zielgruppenwechsel annehmen
  onZielgruppeChange(zielgruppe: ZielgruppeOption) {
    if (this.zielgruppe !== zielgruppe) {
      this.zielgruppe = zielgruppe;
      this.cdr.markForCheck();
    }
  }

  private getActiveStepComponentInstance(stepId: number): any {
    switch (stepId) {
      case 1: return this.distributionStepComponent;
      case 2: return this.designPrintStepComponent;
      case 3: return this.summaryStepComponent;
      default: return null;
    }
  }

  private scrollToTop(): void {
    if (this.isBrowser) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
