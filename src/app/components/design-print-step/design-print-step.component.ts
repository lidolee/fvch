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
          }
        }
      });
    this.determineAndEmitValidationStatus();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSelectionChange(): void {
    if (this.selectedPrintOption === 'service') {
      if (!this.isDruckAuflageManuallySet) {
        const currentTotalFlyers = this.orderDataService.getCurrentTotalFlyersCount();
        if (this.druckAuflage !== currentTotalFlyers) {
          this.druckAuflage = currentTotalFlyers;
        }
      }
    }
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }

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

  setAnlieferung(anlieferung: AnlieferungOption): void {
    if (this.currentAnlieferung !== anlieferung) {
      this.currentAnlieferung = anlieferung;
      this.onSelectionChange();
    }
  }

  setFormat(format: FormatOption): void {
    if (this.currentFormat !== format) {
      this.currentFormat = format;
      this.onSelectionChange();
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
      if (this.druckAuflage <= 0) { // Auflage muss größer 0 sein
        isValid = false;
      }
    }

    const newStatus = isValid ? 'valid' : 'pending'; // Or 'invalid' if you want immediate red
    if (this.currentStatus !== newStatus) {
      this.currentStatus = newStatus;
      this.validationChange.emit(this.currentStatus);
    }
    this.cdr.markForCheck();
  }

  // This method can be called by the parent to force UI updates for validation
  public triggerValidationDisplay(): void {
    // For template-driven forms, re-emitting the status might be enough
    // if the UI relies on `currentStatus` for error messages.
    // If using reactive forms, you might mark controls as touched here.
    this.determineAndEmitValidationStatus(); // Re-check and emit
    this.cdr.markForCheck();
  }


  // Example method for testing, can be removed
  setExampleStatus(status: ValidationStatus): void {
    this.currentStatus = status;
    this.validationChange.emit(this.currentStatus);
    this.cdr.markForCheck();
  }
}
