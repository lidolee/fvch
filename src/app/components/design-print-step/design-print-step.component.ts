import { Component, Output, EventEmitter, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ValidationStatus } from '../../app.component';
import { OrderDataService } from '../../services/order-data.service';

export type DesignPackage = 'basis' | 'plus' | 'premium' | 'eigenes' | '';
export type PrintOption = 'anliefern' | 'service' | '';
export type DruckFormat = 'A6' | 'A5' | 'A4' | 'A3' | 'DIN-Lang' | 'anderes' | '';
export type DruckGrammatur = '90' | '115' | '130' | '170' | '250' | '300' | '';
export type DruckArt = 'einseitig' | 'zweiseitig' | '';
export type DruckAusfuehrung = 'glaenzend' | 'matt' | '';

export type AnlieferungOption = 'selbst' | 'abholung' | '';
export type FormatOption = 'A6' | 'A5' | 'A4' | 'A3' | 'DIN-Lang' | 'anderes' | '';

@Component({
  selector: 'app-design-print-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-print-step.component.html',
  styleUrls: ['./design-print-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignPrintStepComponent implements OnInit, OnDestroy {
  @Output() prevStepRequest = new EventEmitter<void>();
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  selectedDesignPackage: DesignPackage = '';
  selectedPrintOption: PrintOption = '';

  druckFormat: DruckFormat = '';
  druckGrammatur: DruckGrammatur = '';
  druckArt: DruckArt = '';
  druckAusfuehrung: DruckAusfuehrung = '';
  druckAuflage: number = 0;
  druckReserve: number = 1000;


  // Moved from distribution-step.component.ts
  currentAnlieferung: AnlieferungOption = ''; // Initialisiert mit Leerstring
  currentFormat: FormatOption = ''; // Initialisiert mit Leerstring


  public currentStatus: ValidationStatus = 'pending';
  private destroy$ = new Subject<void>();
  private isDruckAuflageManuallySet: boolean = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private orderDataService: OrderDataService
  ) {}

  ngOnInit() {
    this.orderDataService.totalFlyersCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        if (this.selectedPrintOption === 'service' && !this.isDruckAuflageManuallySet) {
          this.druckAuflage = count;
          this.cdr.markForCheck();
          this.determineAndEmitValidationStatus();
        }
      });
    this.determineAndEmitValidationStatus(); // Initial validation check
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSelectionChange() {
    if (this.selectedPrintOption === 'service') {
      if (!this.isDruckAuflageManuallySet) {
        this.druckAuflage = this.orderDataService.getCurrentTotalFlyersCount();
      }
    } else {
      this.resetPrintServiceDetails();
      this.isDruckAuflageManuallySet = false;
    }
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck(); // Ensure UI updates with new selections
  }

  onDruckAuflageChange() {
    this.isDruckAuflageManuallySet = true;
    this.determineAndEmitValidationStatus(); // Re-validate on change
  }

  // Moved from distribution-step.component.ts
  setAnlieferung(anlieferung: AnlieferungOption): void {
    if (this.currentAnlieferung !== anlieferung) {
      this.currentAnlieferung = anlieferung;
      this.determineAndEmitValidationStatus();
      this.cdr.markForCheck();
    }
  }

  // Moved from distribution-step.component.ts
  setFormat(format: FormatOption): void {
    if (this.currentFormat !== format) {
      this.currentFormat = format;
      this.determineAndEmitValidationStatus();
      this.cdr.markForCheck();
    }
  }

  private resetPrintServiceDetails() {
    this.druckFormat = '';
    this.druckGrammatur = '';
    this.druckArt = '';
    this.druckAusfuehrung = '';
    // this.druckAuflage = 0; // Nur zurücksetzen, wenn nicht 'service' oder manuell gesetzt
  }

  private determineAndEmitValidationStatus() {
    let isValid = true;

    if (!this.selectedDesignPackage) {
      isValid = false;
    }

    if (!this.selectedPrintOption) {
      isValid = false;
    }

    // Validierung für Anlieferung und Format (verschobene Logik)
    // Diese Felder sind nur relevant, wenn 'anliefern' ausgewählt ist.
    if (this.selectedPrintOption === 'anliefern') {
      if (!this.currentAnlieferung) {
        isValid = false;
      }
      if (!this.currentFormat) {
        isValid = false;
      }
    }


    if (this.selectedPrintOption === 'service') {
      if (!this.druckFormat || this.druckGrammatur === null || !this.druckArt || !this.druckAusfuehrung) {
        isValid = false;
      }
      // Die Auflage wird in proceedToNextStep geprüft, um eine spezifischere Meldung zu geben.
      // if (this.druckAuflage <= 0) {
      //   isValid = false;
      // }
    }

    this.currentStatus = isValid ? 'valid' : 'pending';
    this.validationChange.emit(this.currentStatus);
    this.cdr.markForCheck();
  }

  goBack() {
    this.prevStepRequest.emit();
  }

  proceedToNextStep() {
    this.determineAndEmitValidationStatus(); // Ensure status is up-to-date

    if (this.currentStatus === 'valid') {
      if (this.selectedPrintOption === 'service' && this.druckAuflage <= 0) {
        alert('Bitte geben Sie eine gültige Auflage für den Druck-Service an (größer als 0).');
        return;
      }
      this.nextStepRequest.emit();
    } else {
      // More specific alert messages can be constructed here if needed
      let message = "Bitte füllen Sie alle erforderlichen Felder aus.";
      const missingFields: string[] = [];
      if (!this.selectedDesignPackage) missingFields.push("Design-Paket");
      if (!this.selectedPrintOption) missingFields.push("Druckoption");

      if (this.selectedPrintOption === 'anliefern') {
        if (!this.currentAnlieferung) missingFields.push("Anlieferung der Flyer");
        if (!this.currentFormat) missingFields.push("Flyer Format (Anlieferung)");
      }

      if (this.selectedPrintOption === 'service') {
        if (!this.druckFormat) missingFields.push("Druckformat");
        if (this.druckGrammatur === null) missingFields.push("Grammatur");
        if (!this.druckArt) missingFields.push("Druckart");
        if (!this.druckAusfuehrung) missingFields.push("Ausführung");
        if (this.druckAuflage <= 0) missingFields.push("Auflage (muss > 0 sein)");
      }

      if (missingFields.length > 0) {
        message = `Bitte vervollständigen Sie die folgenden Angaben: ${missingFields.join(', ')}.`;
      }
      alert(message);
    }
  }

  setExampleStatus(status: ValidationStatus) {
    this.currentStatus = status;
    this.validationChange.emit(this.currentStatus);
    this.cdr.markForCheck();
  }
}
