import { Component, Output, EventEmitter, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ValidationStatus } from '../offer-process/offer-process.component';
import { OrderDataService, VerteilzuschlagFormatKey } from '../../services/order-data.service';

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
          this.druckAuflage = count;
          this.cdr.markForCheck();
        }
      });
    this.determineAndEmitValidationStatus();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDesignPackageSelect(pkg: DesignPackage): void {
    this.selectedDesignPackage = pkg;
    this.orderDataService.updateDesignPackage(pkg);
    this.determineAndEmitValidationStatus();
  }

  onPrintOptionSelect(opt: PrintOption): void {
    this.selectedPrintOption = opt;
    this.orderDataService.updatePrintOption(opt);
    this.updateFinalFlyerFormat();
    this.updateAnlieferungOption();
    this.determineAndEmitValidationStatus();
  }

  onFormatSelect(format: FormatOption | DruckFormat, isDruckService: boolean): void {
    if (isDruckService) {
      this.druckFormat = format as DruckFormat;
    } else {
      this.currentFormat = format as FormatOption;
    }
    this.updateFinalFlyerFormat();
    this.determineAndEmitValidationStatus();
  }

  onAnlieferungSelect(anlieferung: AnlieferungOption): void {
    this.currentAnlieferung = anlieferung;
    this.updateAnlieferungOption();
    this.determineAndEmitValidationStatus();
  }

  onPrintServiceDetailChange(): void {
    this.determineAndEmitValidationStatus();
  }

  onDruckAuflageChange(): void {
    this.isDruckAuflageManuallySet = true;
    this.determineAndEmitValidationStatus();
  }

  private updateFinalFlyerFormat(): void {
    let finalFormat: FormatOption | DruckFormat = '';
    if (this.selectedPrintOption === 'anliefern') {
      finalFormat = this.currentFormat;
    } else if (this.selectedPrintOption === 'service') {
      finalFormat = this.druckFormat;
    }

    let serviceFormat: VerteilzuschlagFormatKey = '';
    if (finalFormat === 'DIN-Lang') {
      serviceFormat = 'Lang';
    } else if (finalFormat === 'A4' || finalFormat === 'A3' || finalFormat === 'anderes') {
      serviceFormat = finalFormat;
    }

    this.orderDataService.updateFinalFlyerFormat(serviceFormat);
  }

  private updateAnlieferungOption(): void {
    if (this.selectedPrintOption === 'anliefern') {
      this.orderDataService.updateAnlieferungOption(this.currentAnlieferung);
    } else {
      this.orderDataService.updateAnlieferungOption('');
    }
  }

  private determineAndEmitValidationStatus(): void {
    let isValid = true;
    if (!this.selectedDesignPackage) isValid = false;
    if (!this.selectedPrintOption) isValid = false;

    if (this.selectedPrintOption === 'anliefern') {
      if (!this.currentAnlieferung) isValid = false;
      if (!this.currentFormat) isValid = false;
    } else if (this.selectedPrintOption === 'service') {
      if (!this.druckFormat || !this.druckGrammatur || !this.druckArt || !this.druckAusfuehrung) isValid = false;
      if (this.druckAuflage <= 0) isValid = false;
    }

    const newStatus = isValid ? 'valid' : 'pending';
    if (this.currentStatus !== newStatus) {
      this.currentStatus = newStatus;
      this.validationChange.emit(this.currentStatus);
    }
  }
}
