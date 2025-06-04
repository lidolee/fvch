import { Component, Output, EventEmitter, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ValidationStatus } from '../offer-process/offer-process.component';
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

  currentAnlieferung: AnlieferungOption = '';
  currentFormat: FormatOption = '';

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
          if (this.druckAuflage !== count) {
            this.druckAuflage = count;
            this.cdr.markForCheck();
            // Validierung wird durch onSelectionChange getriggert, wenn sich relevante Felder ändern
          }
        }
      });
    this.determineAndEmitValidationStatus();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Wird für Design-Paket, Druckoption und (ngModelChange) von druckReserve aufgerufen
  onSelectionChange(): void {
    if (this.selectedPrintOption === 'service') {
      if (!this.isDruckAuflageManuallySet) {
        const currentTotalFlyers = this.orderDataService.getCurrentTotalFlyersCount();
        if (this.druckAuflage !== currentTotalFlyers) {
          this.druckAuflage = currentTotalFlyers;
        }
      }
    }
    // Keine Notwendigkeit, PrintServiceDetails hier zu resetten,
    // da die Felder für 'anliefern' und 'service' getrennt sind und
    // die Sichtbarkeit durch *ngIf im Template gesteuert wird.
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }

  // Wird für Änderungen an Druckdetails (Format, Grammatur etc.) aufgerufen, wenn Druck-Service gewählt ist
  onPrintServiceDetailChange(): void {
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }

  onDruckAuflageChange(): void {
    if (this.selectedPrintOption === 'service') {
      this.isDruckAuflageManuallySet = true;
    }
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }

  // Wieder hinzugefügt, da im Template verwendet
  setAnlieferung(anlieferung: AnlieferungOption): void {
    if (this.currentAnlieferung !== anlieferung) {
      this.currentAnlieferung = anlieferung;
      this.onSelectionChange(); // Ruft Validierung und markForCheck
    }
  }

  // Wieder hinzugefügt, da im Template verwendet
  setFormat(format: FormatOption): void {
    if (this.currentFormat !== format) {
      this.currentFormat = format;
      // Wenn currentFormat über Klick gesetzt wird und auch (ngModelChange) auf onSelectionChange() hört,
      // könnte onSelectionChange doppelt aufgerufen werden. Hier ist es aber ein (click)-Handler.
      // Wir rufen onSelectionChange, um die Logik zu zentralisieren.
      this.onSelectionChange(); // Ruft Validierung und markForCheck
    }
  }

  private determineAndEmitValidationStatus(): void {
    let isValid = true;

    if (!this.selectedDesignPackage) {
      isValid = false;
    }
    if (!this.selectedPrintOption) {
      isValid = false;
    }

    if (this.selectedPrintOption === 'anliefern') {
      if (!this.currentAnlieferung) {
        isValid = false;
      }
      if (!this.currentFormat) {
        isValid = false;
      }
    } else if (this.selectedPrintOption === 'service') {
      if (!this.druckFormat || !this.druckGrammatur || !this.druckArt || !this.druckAusfuehrung) {
        isValid = false;
      }
      if (this.druckAuflage <= 0) {
        isValid = false;
      }
    }

    const newStatus = isValid ? 'valid' : 'pending';
    if (this.currentStatus !== newStatus) {
      this.currentStatus = newStatus;
      this.validationChange.emit(this.currentStatus);
    }
    this.cdr.markForCheck();
  }

  goBack(): void {
    this.prevStepRequest.emit();
  }

  proceedToNextStep(): void {
    this.determineAndEmitValidationStatus(); // Letzte Validierung

    if (this.currentStatus === 'valid') {
      this.nextStepRequest.emit();
    } else {
      let message = "Bitte füllen Sie alle erforderlichen Felder aus.";
      const missingFields: string[] = [];
      if (!this.selectedDesignPackage) missingFields.push("Design-Paket");
      if (!this.selectedPrintOption) missingFields.push("Druckoption");

      if (this.selectedPrintOption === 'anliefern') {
        if (!this.currentAnlieferung) missingFields.push("Anlieferung der Flyer");
        if (!this.currentFormat) missingFields.push("Flyer Format (Anlieferung)");
      } else if (this.selectedPrintOption === 'service') {
        if (!this.druckFormat) missingFields.push("Druckformat");
        if (!this.druckGrammatur) missingFields.push("Grammatur");
        if (!this.druckArt) missingFields.push("Druckart");
        if (!this.druckAusfuehrung) missingFields.push("Ausführung");
        if (this.druckAuflage <= 0) missingFields.push("Auflage (muss > 0 sein)");
      }

      if (missingFields.length > 0) {
        message = `Bitte vervollständigen Sie die folgenden Angaben: ${missingFields.join(', ')}.`;
      }
      if (typeof alert !== 'undefined') alert(message);
    }
  }

  setExampleStatus(status: ValidationStatus): void {
    this.currentStatus = status;
    this.validationChange.emit(this.currentStatus);
    this.cdr.markForCheck();
  }
}
