import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { map, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { NgbNavModule, NgbNavChangeEvent } from '@ng-bootstrap/ng-bootstrap';
import { OrderDataService } from '../../services/order-data.service';
import { ZielgruppeOption, VerteilgebietDataState, StepValidationStatus } from '../../services/order-data.types';
import { DistributionStepComponent, DistributionStepValidationState } from '../distribution-step/distribution-step.component';
import { DesignPrintStepComponent } from '../design-print-step/design-print-step.component';
import { ContactDataComponent } from '../contact-data/contact-data.component';
import { CalculatorComponent } from '../calculator/calculator.component';

export type InternalStepValidationStatus = 'valid' | 'invalid' | 'pending';

type StepHtmlIdentifier = 'verteilgebiet' | number;

@Component({
  selector: 'app-offer-process',
  standalone: true,
  imports: [
    CommonModule,
    NgbNavModule,
    DistributionStepComponent,
    DesignPrintStepComponent,
    ContactDataComponent,
    CalculatorComponent
  ],
  templateUrl: './offer-process.component.html',
  styleUrls: ['./offer-process.component.scss']
})
export class OfferProcessComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  public activeStepId: number = 1;
  public initialStadtUrlParam$: Observable<string | null>;
  public zielgruppe: ZielgruppeOption = 'Alle Haushalte';
  public calculatorCurrentStepIsValid: boolean = false;
  private stepSpecificValidationStates: Map<number, InternalStepValidationStatus> = new Map([
    [1, 'pending'],
    [2, 'pending'],
    [3, 'pending']
  ]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {
    this.initialStadtUrlParam$ = this.route.queryParamMap.pipe(
      map(params => params.get('stadt')),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    );
    console.log(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] Constructor - User: ${"lidolee"}`);
  }

  ngOnInit(): void {
    console.log(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] ngOnInit - User: ${"lidolee"}`);
    this.orderDataService.verteilgebiet$.pipe(
      map((verteilgebiet: VerteilgebietDataState) => verteilgebiet.zielgruppe),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(zg => {
      if (this.zielgruppe !== zg) {
        this.zielgruppe = zg;
        this.cdr.markForCheck();
      }
    });

    this.orderDataService.validierungsStatus$.pipe(takeUntil(this.destroy$)).subscribe(
      (status: StepValidationStatus) => {
        console.log(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] Received validation status from OrderDataService:`, status);
        this.updateLocalStepValidationState(1, status.isStep1Valid ? 'valid' : 'invalid');
        this.updateLocalStepValidationState(2, status.isStep2Valid ? 'valid' : 'invalid');
        this.updateLocalStepValidationState(3, status.isStep3Valid ? 'valid' : 'invalid');
      }
    );
    this.updateCalculatorValidationFlag();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    console.log(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] ngOnDestroy - User: ${"lidolee"}`);
  }

  public onNavChange(event: NgbNavChangeEvent): void {
    console.log(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] NavChange - From ID: ${event.activeId}, To ID: ${event.nextId}`);

    if (event.nextId > event.activeId) {
      for (let i = 1; i < event.nextId; i++) {
        if (!this.isStepInternallyValid(i)) {
          console.warn(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] Prevented navigation from step ${event.activeId} to ${event.nextId} because step ${i} is invalid.`);
          event.preventDefault();
          alert(`Bitte vervollständigen Sie Schritt ${i}, bevor Sie zu Schritt ${event.nextId} fortfahren.`);

          if (this.activeStepId !== i) {
            this.activeStepId = i;
            this.cdr.detectChanges();
          }
          return;
        }
      }
    }
    this.activeStepId = event.nextId;
    this.updateCalculatorValidationFlag();
    this.cdr.markForCheck();
  }

  public onStepValidationChange(stepIdentifier: StepHtmlIdentifier, statusEvent: DistributionStepValidationState | boolean): void {
    let stepNumber: number;
    let newStatus: InternalStepValidationStatus;

    if (stepIdentifier === 'verteilgebiet') {
      stepNumber = 1;

      if (statusEvent === 'valid' || statusEvent === 'invalid' || statusEvent === 'pending') {
        newStatus = statusEvent;
      } else {
        console.error(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] Invalid status from DistributionStep:`, statusEvent);
        newStatus = 'invalid';
      }
    } else if ((stepIdentifier === 2 || stepIdentifier === 3)) {
      stepNumber = stepIdentifier;

      if (typeof statusEvent === 'boolean') {
        newStatus = statusEvent ? 'valid' : 'invalid';
      } else {

        console.error(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] Invalid status type from Step ${stepNumber} (expected boolean, got ${typeof statusEvent}):`, statusEvent);
        newStatus = 'invalid';
      }
    } else {
      console.error(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] Unknown or invalid step identifier from HTML:`, stepIdentifier);
      return;
    }
    this.updateLocalStepValidationState(stepNumber, newStatus);
  }

  private updateLocalStepValidationState(stepNumber: number, status: InternalStepValidationStatus): void {
    if (this.stepSpecificValidationStates.get(stepNumber) !== status) {
      this.stepSpecificValidationStates.set(stepNumber, status);
      console.log(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] Local validation for step ${stepNumber} set to: ${status}`);
      this.updateCalculatorValidationFlag();
      this.cdr.markForCheck();
    }
  }

  public onZielgruppeUpdateFromStep(neueZielgruppe: ZielgruppeOption): void {
    if (this.zielgruppe !== neueZielgruppe) {
      this.orderDataService.updateZielgruppe(neueZielgruppe);

    }
  }

  public getValidationIconClass(stepNumber: number): string {
    const status = this.stepSpecificValidationStates.get(stepNumber);
    switch (status) {
      case 'valid': return 'mdi-check-circle text-success';
      case 'invalid': return 'mdi-alert-circle text-danger';
      default: return 'mdi-progress-question text-muted';
    }
  }

  private isStepInternallyValid(stepNumber: number): boolean {
    return this.stepSpecificValidationStates.get(stepNumber) === 'valid';
  }

  private updateCalculatorValidationFlag(): void {
    const isValid = this.isStepInternallyValid(this.activeStepId);
    if (this.calculatorCurrentStepIsValid !== isValid) {
      this.calculatorCurrentStepIsValid = isValid;
      this.cdr.markForCheck();
    }
  }

  public onCalculatorPrevious(): void {
    if (this.activeStepId > 1) {
      this.activeStepId--;
    }
  }

  public onCalculatorNext(): void {
    if (this.isStepInternallyValid(this.activeStepId)) {
      if (this.activeStepId < 3) {
        this.activeStepId++;
      } else {
        this.onCalculatorSubmit();
      }
    } else {
      alert(`Bitte vervollständigen Sie Schritt ${this.activeStepId}, um fortzufahren.`);
    }
  }

  public onCalculatorSubmit(): void {
    for (let i = 1; i <= 3; i++) {
      if (!this.isStepInternallyValid(i)) {
        this.activeStepId = i;
        this.cdr.markForCheck();
        alert(`Die Bestellung kann nicht abgeschickt werden. Bitte korrigieren Sie die Eingaben in Schritt ${i}.`);
        return;
      }
    }
    console.log(`[${"2025-06-07 21:27:02"}] [OfferProcessComponent] All steps valid. Submitting order...`);
    alert("Bestellung wird abgeschickt! (TODO: Logik hier implementieren)");
  }
}
