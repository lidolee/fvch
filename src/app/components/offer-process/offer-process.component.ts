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
import { ZielgruppeOption, VerteilgebietDataState } from '../../services/order-data.types';
import { DistributionStepComponent, DistributionStepValidationState } from '../distribution-step/distribution-step.component';
import { DesignPrintStepComponent } from '../design-print-step/design-print-step.component';
import { ContactDataComponent } from '../contact-data/contact-data.component';
import { CalculatorComponent } from '../calculator/calculator.component';

// *** Hinzugefügt: Absolute URL für den API-Endpunkt ***
const API_ENDPOINT = 'https://www.flyer-verteilen.ch/offerte/api.php';

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
    [2, 'valid'], // Step 2 hat Standardwerte und ist initial gültig
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
  }

  ngOnInit(): void {
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
  }

  public areAllStepsValid(): boolean {
    const allValid = Array.from(this.stepSpecificValidationStates.values()).every(status => status === 'valid');
    return allValid;
  }

  public onNavChange(event: NgbNavChangeEvent): void {
    if (event.nextId > event.activeId) {
      for (let i = 1; i < event.nextId; i++) {
        if (!this.isStepInternallyValid(i)) {
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
      newStatus = statusEvent as InternalStepValidationStatus;
    } else if ((stepIdentifier === 2 || stepIdentifier === 3) && typeof statusEvent === 'boolean') {
      stepNumber = stepIdentifier;
      newStatus = statusEvent ? 'valid' : 'invalid';
    } else {
      return;
    }

    this.updateLocalStepValidationState(stepNumber, newStatus);
  }

  private updateLocalStepValidationState(stepNumber: number, status: InternalStepValidationStatus): void {
    if (this.stepSpecificValidationStates.get(stepNumber) !== status) {
      this.stepSpecificValidationStates.set(stepNumber, status);
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
      case 'valid': return 'mdi mdi-check-circle text-success';
      case 'invalid': return 'mdi mdi-alert-circle text-danger';
      default: return 'mdi mdi-progress-question text-muted';
    }
  }

  private isStepInternallyValid(stepNumber: number): boolean {
    return this.stepSpecificValidationStates.get(stepNumber) === 'valid';
  }

  private updateCalculatorValidationFlag(): void {
    const isValid = this.isStepInternallyValid(this.activeStepId);
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

      // Annahme: Die PHP-Antwort enthält { success: true, reference: '...' }
      const response = await firstValueFrom(this.http.post<any>(API_ENDPOINT, payload));

      // *** START DER ÄNDERUNG ***
      // Anstelle des Alerts leiten wir auf die Danke-Seite weiter.

      if (response && response.reference) {
        // Weiterleitung zur Danke-Seite mit Referenz als URL-Parameter
        window.location.href = `https://www.flyer-verteilen.ch/offerte/danke.html?ref=${response.reference}`;
      } else {
        // Fallback, falls die Antwort nicht das erwartete Format hat
        console.error('Antwort vom Server hat ein unerwartetes Format:', response);
        alert('Ihre Anfrage wurde versendet, aber die Referenznummer konnte nicht empfangen werden.');
      }
      // *** ENDE DER ÄNDERUNG ***

    } catch (error: any) {
      console.error('Fehler beim Senden der Offertanfrage via AJAX:', error);
      const errorMessage = error.error?.message || 'Beim Senden Ihrer Anfrage ist ein unbekannter Fehler aufgetreten.';
      alert(`Fehler: ${errorMessage}\n\nBitte versuchen Sie es später erneut oder kontaktieren Sie uns direkt.`);

      // Nur 'isSubmitting' zurücksetzen, wenn ein Fehler auftritt.
      // Bei Erfolg ist es nicht nötig, da die Seite sowieso weiterleitet.
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
    // 'finally'-Block entfernt, da 'isSubmitting' nur bei Fehler zurückgesetzt werden muss.
  }
}
