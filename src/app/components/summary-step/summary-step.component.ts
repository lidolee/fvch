import { Component, OnInit, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import { AllOrderDataState, KontaktDetailsState, VerteilgebietDataState, ProduktionDataState } from '../../services/order-data.types';
import { ContactDataComponent } from '../contact-data/contact-data.component';
import { ValidationStatus } from '../offer-process/offer-process.component';

@Component({
  selector: 'app-summary-step',
  standalone: true,
  imports: [CommonModule, ContactDataComponent],
  templateUrl: './summary-step.component.html',
  styleUrls: ['./summary-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryStepComponent implements OnInit, OnDestroy {
  @Output() public validationChange = new EventEmitter<ValidationStatus>();
  // nextStepRequest is not used in the template or class logic based on provided code.
  // If it's intended for future use, it can remain. Otherwise, it could be removed.
  @Output() public nextStepRequest = new EventEmitter<void>();
  @Output() public requestStepChange = new EventEmitter<number>(); // Added based on offer-process.html

  @ViewChild(ContactDataComponent) public contactDataComponent!: ContactDataComponent;

  public orderSummary: AllOrderDataState | null = null;
  private contactDataStatus: ValidationStatus = 'unchecked';
  private destroy$ = new Subject<void>();

  constructor(
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.orderDataService.state$.pipe( // Changed from getAllOrderDataObservable()
      takeUntil(this.destroy$)
    ).subscribe((data: AllOrderDataState) => {
      this.orderSummary = data;
      // Re-validate when order summary data changes, as contact details might have been updated
      // which could affect overall step validation if contactDataStatus was already 'valid'.
      if (this.contactDataComponent) { // Ensure component is initialized
        this.contactDataStatus = this.contactDataComponent.currentStatus;
      }
      this.validateStep();
      this.cdr.markForCheck();
    });
    // Initial validation after view init might be better if contactDataComponent needs to be ready
    // Promise.resolve().then(() => this.validateStep());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public onContactDataValidationChange(status: ValidationStatus): void {
    this.contactDataStatus = status;
    this.validateStep();
  }

  public triggerContactFormSubmit(): void {
    if (this.contactDataComponent) {
      this.contactDataComponent.finalizeOrder(); // This will save data and emit validation
    }
  }

  // This method is called when ContactDataComponent emits submitRequest
  // which happens after its form is valid and data is saved.
  public onContactDataSubmitRequest(): void {
    // The validation status of contact data should already be 'valid' here.
    // We re-validate the summary step which depends on contactDataStatus.
    this.validateStep();
    // Potentially emit nextStepRequest if the overall summary step is now valid
    // and an automatic progression is desired.
    // if (this.contactDataStatus === 'valid') {
    //   this.nextStepRequest.emit();
    // }
  }

  private validateStep(): void {
    // The summary step's validation is primarily determined by the contact data form's validity
    const newStatus = this.contactDataStatus;
    this.validationChange.emit(newStatus);
    this.cdr.markForCheck();
  }

  public triggerValidationDisplay(): void {
    if (this.contactDataComponent) {
      this.contactDataComponent.triggerValidationDisplay();
    }
    // The validation status will be updated via onContactDataValidationChange
    // so, calling validateStep() here might be redundant if onContactDataValidationChange handles it.
    // However, to ensure the emission, it can be called.
    this.validateStep();
  }

  public getDistributionSummary(): string {
    const verteilgebiet: VerteilgebietDataState | undefined = this.orderSummary?.verteilgebiet;
    if (!verteilgebiet?.selectedPlzEntries || verteilgebiet.selectedPlzEntries.length === 0) return 'Kein Verteilgebiet ausgewählt.';
    const count = verteilgebiet.selectedPlzEntries.length;
    const startDate = verteilgebiet.verteilungStartdatum ? new Date(verteilgebiet.verteilungStartdatum).toLocaleDateString('de-CH') : 'N/A';
    return `${count} PLZ-Gebiete, Start: ${startDate}, ${verteilgebiet.totalFlyersCount} Flyer (${verteilgebiet.zielgruppe})`;
  }

  public getDesignSummary(): string {
    const produktion: ProduktionDataState | undefined = this.orderSummary?.produktion;
    if (!produktion) return 'Keine Produktionsauswahl.';
    let summary = `Design: ${produktion.designPackage ? produktion.designPackage.charAt(0).toUpperCase() + produktion.designPackage.slice(1) : 'Kein Paket'}. `;
    if (produktion.printOption === 'anliefern') {
      summary += `Anlieferung: Format ${produktion.anlieferDetails?.format || 'N/A'}, Typ: ${produktion.anlieferDetails?.anlieferung || 'N/A'}.`;
    } else if (produktion.printOption === 'service') {
      summary += `Druckservice: Format ${produktion.printServiceDetails?.format || 'N/A'}, ${produktion.printServiceDetails?.grammatur || 'N/A'}g, ${produktion.printServiceDetails?.art || 'N/A'}, ${produktion.printServiceDetails?.ausfuehrung || 'N/A'}. Auflage: ${produktion.printServiceDetails?.auflage || 0}.`;
    } else if (produktion.printOption === 'eigenes') {
      summary += 'Eigene Flyer werden verwendet.';
      if (produktion.anlieferDetails?.format) {
        summary += ` Format ${produktion.anlieferDetails.format}.`;
      }
    } else {
      summary += 'Keine Druckoption gewählt.';
    }
    return summary;
  }

  public getContactSummary(): string {
    const kontakt: KontaktDetailsState | null | undefined = this.orderSummary?.kontaktDetails;
    if (kontakt?.firstName && kontakt?.lastName && kontakt.email) {
      return `${kontakt.salutation || ''} ${kontakt.firstName} ${kontakt.lastName}, ${kontakt.email}`;
    }
    return 'Noch nicht erfasst';
  }

  // Method to allow navigation to other steps from summary, e.g. to edit a previous step.
  public editStep(stepNumber: number): void {
    this.requestStepChange.emit(stepNumber);
  }
}
