import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
// *** Hinzugefügt: HttpClient importieren ***
import { HttpClient } from '@angular/common/http';
// *** Hinzugefügt: firstValueFrom importieren ***
import { Observable, Subject, firstValueFrom } from 'rxjs';
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
    [1, 'invalid'],
    [2, 'invalid'],
    [3, 'invalid']
  ]);

  // *** Hinzugefügt: Ladezustand für den Submit-Button ***
  public isSubmitting = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef,
    // *** Hinzugefügt: HttpClient im Konstruktor injizieren ***
    private http: HttpClient
  ) {
    this.initialStadtUrlParam$ = this.route.queryParamMap.pipe(
      map(params => params.get('stadt')),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    );
    //console.log(`[${"2025-10-04 15:03:11"}] [OfferProcessComponent] Constructor`);
  }

  ngOnInit(): void {
    //console.log(`[${"2025-10-04 15:03:11"}] [OfferProcessComponent] ngOnInit`);
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

    this.updateCalculatorValidationFlag();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    //console.log(`[${"2025-10-04 15:03:11"}] [OfferProcessComponent] ngOnDestroy`);
  }

  public areAllStepsValid(): boolean {
    const allValid = Array.from(this.stepSpecificValidationStates.values()).every(status => status === 'valid');
    //console.log(`[${new Date().toISOString()}] [OfferProcessComponent] areAllStepsValid check. Result: ${allValid}`);
    return allValid;
  }

  public onNavChange(event: NgbNavChangeEvent): void {
    //console.log(`[${new Date().toISOString()}] [OfferProcessComponent] NavChange - From ID: ${event.activeId}, To ID: ${event.nextId}`);

    if (event.nextId > event.activeId) {
      for (let i = 1; i < event.nextId; i++) {
        if (!this.isStepInternallyValid(i)) {
          console.warn(`[${new Date().toISOString()}] [OfferProcessComponent] Prevented navigation from step ${event.activeId} to ${event.nextId} because step ${i} is invalid.`);
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

    this.stepSpecificValidationStates.set(event.nextId, 'invalid');
    //console.log(`[${new Date().toISOString()}] [OfferProcessComponent] Proactively set step ${event.nextId} validation to 'invalid'.`);

    this.activeStepId = event.nextId;
    this.updateCalculatorValidationFlag();
    this.cdr.markForCheck();
  }

  public onStepValidationChange(stepIdentifier: StepHtmlIdentifier, statusEvent: DistributionStepValidationState | boolean): void {
    let stepNumber: number;
    let newStatus: InternalStepValidationStatus;

    if (stepIdentifier === 'verteilgebiet') {
      stepNumber = 1;
      newStatus = statusEvent as InternalStepValidationStatus;
    } else if ((stepIdentifier === 2 || stepIdentifier === 3) && typeof statusEvent === 'boolean') {
      stepNumber = stepIdentifier;
      newStatus = statusEvent ? 'valid' : 'invalid';
    } else {
      console.error(`[${new Date().toISOString()}] [OfferProcessComponent] Invalid status event or identifier:`, {stepIdentifier, statusEvent});
      return;
    }

    //console.log(`[${new Date().toISOString()}] [OfferProcessComponent] Received validationChange from step ${stepNumber}. New status: ${newStatus}`);
    this.updateLocalStepValidationState(stepNumber, newStatus);
  }

  private updateLocalStepValidationState(stepNumber: number, status: InternalStepValidationStatus): void {
    if (this.stepSpecificValidationStates.get(stepNumber) !== status) {
      this.stepSpecificValidationStates.set(stepNumber, status);
      //console.log(`[${new Date().toISOString()}] [OfferProcessComponent] Local validation for step ${stepNumber} set to: ${status}`);
      this.updateCalculatorValidationFlag();
      this.cdr.detectChanges();
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
    const isValid = this.stepSpecificValidationStates.get(stepNumber) === 'valid';
    //console.log(`[${new Date().toISOString()}] [OfferProcessComponent] isStepInternallyValid check for step ${stepNumber}. Result: ${isValid}`);
    return isValid;
  }

  private updateCalculatorValidationFlag(): void {
    const isValid = this.isStepInternallyValid(this.activeStepId);
    //console.log(`[${new Date().toISOString()}] [OfferProcessComponent] Updating calculator validation flag for active step ${this.activeStepId}. New value: ${isValid}`);
    if (this.calculatorCurrentStepIsValid !== isValid) {
      this.calculatorCurrentStepIsValid = isValid;
    }
  }

  public onCalculatorPrevious(): void {
    if (this.activeStepId > 1) {
      this.activeStepId--;
      this.updateCalculatorValidationFlag();
    }
  }

  public onCalculatorNext(): void {
    if (this.isStepInternallyValid(this.activeStepId)) {
      if (this.activeStepId < 3) {
        this.activeStepId++;
        this.updateCalculatorValidationFlag();
      } else {
        this.onCalculatorSubmit();
      }
    } else {
      alert(`Bitte vervollständigen Sie Schritt ${this.activeStepId}, um fortzufahren.`);
    }
  }

  // *** onCalculatorSubmit ist jetzt eine async Methode für den AJAX-Request ***
  public async onCalculatorSubmit(): Promise<void> {
    if (!this.areAllStepsValid()) {
      for (let i = 1; i <= 3; i++) {
        if (!this.isStepInternallyValid(i)) {
          this.activeStepId = i;
          this.cdr.markForCheck();
          alert(`Die Bestellung kann nicht abgeschickt werden. Bitte korrigieren Sie die Eingaben in Schritt ${i}.`);
          return;
        }
      }
      return;
    }

    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.cdr.detectChanges();

    try {
      // Alle Daten aus dem Service holen
      const verteilgebiet = await firstValueFrom(this.orderDataService.verteilgebiet$);
      const produktion = await firstValueFrom(this.orderDataService.produktion$);
      const kontakt = await firstValueFrom(this.orderDataService.kontaktDetails$);
      const kosten = await firstValueFrom(this.orderDataService.kosten$);

      const payload = {
        verteilgebiet,
        produktion,
        kontakt,
        kosten
      };

      //console.log(`[${"2025-10-04 15:03:11"}] [OfferProcessComponent] All steps valid. Submitting AJAX POST to /offerte/dispatch.php`, payload);

      // AJAX POST Request
      await firstValueFrom(this.http.post('/offerte/dispatch.php', payload));

      alert("Ihre Anfrage wurde erfolgreich versendet! Sie erhalten in Kürze eine Bestätigung per E-Mail.");
      // Optional: Formular zurücksetzen oder weiterleiten
      // this.orderDataService.resetAll();
      // this.router.navigate(['/danke']);

    } catch (error) {
      console.error('Fehler beim Senden der Offertanfrage via AJAX:', error);
      alert('Beim Senden Ihrer Anfrage ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut oder kontaktieren Sie uns direkt.');
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }
}
