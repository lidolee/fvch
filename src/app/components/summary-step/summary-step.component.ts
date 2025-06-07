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
  @Output() public nextStepRequest = new EventEmitter<void>();

  @ViewChild(ContactDataComponent) public contactDataComponent!: ContactDataComponent;

  public orderSummary: AllOrderDataState | null = null;
  private contactDataStatus: ValidationStatus = 'unchecked';
  private destroy$ = new Subject<void>();

  constructor(
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.orderDataService.getAllOrderDataObservable().pipe(
      takeUntil(this.destroy$)
    ).subscribe((data: AllOrderDataState) => {
      this.orderSummary = data;
      this.cdr.markForCheck();
    });
    this.validateStep();
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
      this.contactDataComponent.finalizeOrder();
    }
  }

  public onContactDataSubmitRequest(): void {
    this.validateStep();
  }

  private validateStep(): void {
    const newStatus = this.contactDataStatus;
    this.validationChange.emit(newStatus);
    this.cdr.markForCheck();
  }

  public triggerValidationDisplay(): void {
    if (this.contactDataComponent) {
      this.contactDataComponent.triggerValidationDisplay();
    }
    this.validateStep();
  }

  public getDistributionSummary(): string {
    const verteilgebiet: VerteilgebietDataState | undefined = this.orderSummary?.verteilgebiet;
    if (!verteilgebiet?.selectedPlzEntries || verteilgebiet.selectedPlzEntries.length === 0) return 'Kein Verteilgebiet ausgewählt.';
    const count = verteilgebiet.selectedPlzEntries.length;
    const startDate = verteilgebiet.verteilungStartdatum ? new Date(verteilgebiet.verteilungStartdatum).toLocaleDateString('de-CH') : 'N/A';
    return `${count} PLZ-Gebiete, Start: ${startDate}`;
  }

  public getDesignSummary(): string {
    const produktion: ProduktionDataState | undefined = this.orderSummary?.produktion;
    if (!produktion) return 'Keine Produktionsauswahl.';
    let summary = `Design: ${produktion.designPackage || 'N/A'}. `;
    if (produktion.printOption === 'anliefern') {
      summary += `Anlieferung: Format ${produktion.anlieferDetails?.format || 'N/A'}, ${produktion.anlieferDetails?.anlieferung || 'N/A'}.`;
    } else if (produktion.printOption === 'service') {
      summary += `Druckservice: Format ${produktion.printServiceDetails?.format || 'N/A'}.`;
    } else {
      summary += 'Keine Druckoption gewählt.';
    }
    return summary;
  }

  public getContactSummary(): string {
    const kontakt: KontaktDetailsState | null | undefined = this.orderSummary?.kontaktDetails;
    if (kontakt?.firstName && kontakt?.lastName) {
      return `${kontakt.salutation || ''} ${kontakt.firstName} ${kontakt.lastName}, ${kontakt.email}`;
    }
    return 'Noch nicht erfasst';
  }
}
