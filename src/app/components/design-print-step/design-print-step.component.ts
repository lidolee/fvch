import { Component, Output, EventEmitter, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ValidationStatus } from '../offer-process/offer-process.component';
import { OrderDataService, VerteilzuschlagFormatKey } from '../../services/order-data.service';

// Typdefinitionen
// 'export' hinzugefügt
export type DesignPackage = 'basis' | 'plus' | 'premium' | 'eigenes' | '';
export type PrintOption = 'anliefern' | 'service' | '';
export type DruckFormat = 'A6' | 'A5' | 'A4' | 'A3' | 'DIN-Lang' | 'anderes' | '';
export type DruckGrammatur = '90' | '115' | '130' | '170' | '250' | '300' | '';
export type DruckArt = 'einseitig' | 'zweiseitig' | '';
export type DruckAusfuehrung = 'glaenzend' | 'matt' | '';
export type AnlieferungOption = 'selbst' | 'abholung' | '';
export type AnlieferungFormatOption = 'A6' | 'A5' | 'A4' | 'A3' | 'DIN-Lang' | 'anderes' | '';

@Component({
  selector: 'app-design-print-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-print-step.component.html',
  styleUrls: ['./design-print-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
// 'export' hinzugefügt
export class DesignPrintStepComponent implements OnInit, OnDestroy {
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  selectedDesignPackage: DesignPackage = '';
  selectedPrintOption: PrintOption = '';

  druckFormat: DruckFormat = '';
  druckGrammatur: DruckGrammatur = '';
  druckArt: DruckArt = '';
  druckAusfuehrung: DruckAusfuehrung = '';
  druckAuflage: number = 0;
  druckReserve: number = 0;

  currentFormat: AnlieferungFormatOption = '';
  currentAnlieferung: AnlieferungOption = '';

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

  public setFormat(format: AnlieferungFormatOption): void {
    if (this.currentFormat !== format) {
      this.currentFormat = format;
      this.onAnlieferungDetailChange();
    }
  }

  public setAnlieferung(anlieferung: AnlieferungOption): void {
    if (this.currentAnlieferung !== anlieferung) {
      this.currentAnlieferung = anlieferung;
      this.onAnlieferungDetailChange();
    }
  }

  onSelectionChange(): void {
    if (this.selectedPrintOption === 'anliefern') {
      this.druckFormat = ''; this.druckGrammatur = ''; this.druckArt = '';
      this.druckAusfuehrung = ''; this.isDruckAuflageManuallySet = false; this.druckAuflage = 0;
    } else if (this.selectedPrintOption === 'service') {
      this.currentAnlieferung = ''; this.currentFormat = '';
      if (!this.isDruckAuflageManuallySet) {
        this.druckAuflage = this.orderDataService.getCurrentTotalFlyersCount();
      }
    }

    this.updateOrderDataService();
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }

  onPrintServiceDetailChange(): void {
    this.updateOrderDataService();
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }

  private onAnlieferungDetailChange(): void {
    this.updateOrderDataService();
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }

  onDruckAuflageChange(): void {
    if (this.selectedPrintOption === 'service') {
      this.isDruckAuflageManuallySet = true;
    }
    this.updateOrderDataService();
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }

  private updateOrderDataService(): void {
    this.orderDataService.updateDesignPackage(this.selectedDesignPackage);

    let finalFormatForSurchargeKey: VerteilzuschlagFormatKey = '';
    if (this.selectedPrintOption === 'service' && this.druckFormat) {
      if (this.druckFormat === 'DIN-Lang') finalFormatForSurchargeKey = 'Lang';
      else if (this.druckFormat === 'A3' || this.druckFormat === 'A4') {
        finalFormatForSurchargeKey = this.druckFormat;
      }
    } else if (this.selectedPrintOption === 'anliefern' && this.currentFormat) {
      if (this.currentFormat === 'DIN-Lang') finalFormatForSurchargeKey = 'Lang';
      else if (this.currentFormat === 'A3' || this.currentFormat === 'A4') {
        finalFormatForSurchargeKey = this.currentFormat;
      }
    }
    this.orderDataService.updateFinalFlyerFormat(finalFormatForSurchargeKey);

    if (this.selectedPrintOption === 'anliefern') {
      this.orderDataService.updateAnlieferungOption(this.currentAnlieferung);
    } else {
      this.orderDataService.updateAnlieferungOption('');
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
      if (!this.currentAnlieferung || !this.currentFormat) {
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
  }

  public triggerValidationDisplay(): void {
    this.determineAndEmitValidationStatus();
    this.cdr.markForCheck();
  }
}
