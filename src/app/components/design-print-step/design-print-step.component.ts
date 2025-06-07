import { Component, OnInit, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import { DesignPackageType, PrintOptionType, FlyerFormatType, AnlieferungType, DruckGrammaturType, DruckArtType, DruckAusfuehrungType } from '../../services/order-data.types';
import { ValidationStatus } from '../offer-process/offer-process.component';

@Component({
  selector: 'app-design-print-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-print-step.component.html',
  styleUrls: ['./design-print-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignPrintStepComponent implements OnInit, OnDestroy {
  @Output() public validationChange = new EventEmitter<ValidationStatus>();

  public selectedDesignPackage: DesignPackageType | null = null;
  public selectedPrintOption: PrintOptionType | null = null;
  public currentFormat: FlyerFormatType | null = null;
  public currentAnlieferung: AnlieferungType | null = null;
  public druckFormat: FlyerFormatType | null = null;
  public druckGrammatur: DruckGrammaturType | null = null;
  public druckArt: DruckArtType | null = null;
  public druckAusfuehrung: DruckAusfuehrungType | null = null;
  public druckAuflage: number | null = null;
  public druckReserve: number = 0;
  public currentStatus: ValidationStatus = 'unchecked';
  private destroy$ = new Subject<void>();
  private totalFlyersFromDistribution: number = 0;

  constructor(
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadInitialData();
    this.orderDataService.totalFlyersCount$.pipe(takeUntil(this.destroy$)).subscribe(count => {
      this.totalFlyersFromDistribution = count;
      if (this.selectedPrintOption === 'service') {
        this.druckAuflage = count > 0 ? count : null;
        this.orderDataService.updatePrintServiceDetails({ auflage: this.druckAuflage });
      }
      this.validateStep();
    });
    this.validateStep(); // Initial validation
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadInitialData(): void {
    this.selectedDesignPackage = this.orderDataService.getCurrentDesignPackage();
    this.selectedPrintOption = this.orderDataService.getCurrentPrintOption();
    if (this.selectedPrintOption === 'anliefern') {
      const anlieferDetails = this.orderDataService.getCurrentAnlieferDetails();
      this.currentFormat = anlieferDetails?.format || null;
      this.currentAnlieferung = anlieferDetails?.anlieferung || null;
    } else if (this.selectedPrintOption === 'service') {
      const printDetails = this.orderDataService.getCurrentPrintServiceDetails();
      this.druckFormat = printDetails?.format || null;
      this.druckGrammatur = printDetails?.grammatur || null;
      this.druckArt = printDetails?.art || null;
      this.druckAusfuehrung = printDetails?.ausfuehrung || null;
      this.druckAuflage = printDetails?.auflage !== undefined && printDetails.auflage !== null ? printDetails.auflage : (this.totalFlyersFromDistribution > 0 ? this.totalFlyersFromDistribution : null);
      this.druckReserve = printDetails?.reserve || 0;
    }
  }

  public onDesignPackageSelect(paket: DesignPackageType): void {
    this.selectedDesignPackage = paket;
    this.orderDataService.updateDesignPackage(this.selectedDesignPackage);
    this.validateStep();
  }

  public onPrintOptionSelect(option: PrintOptionType): void {
    this.selectedPrintOption = option;
    this.orderDataService.updatePrintOption(this.selectedPrintOption);
    if (option === 'anliefern') {
      this.resetPrintServiceDetails();
      const anlieferDetails = this.orderDataService.getCurrentAnlieferDetails();
      this.currentFormat = anlieferDetails?.format || null;
      this.currentAnlieferung = anlieferDetails?.anlieferung || null;
    } else if (option === 'service') {
      this.resetAnlieferDetails();
      const printDetails = this.orderDataService.getCurrentPrintServiceDetails();
      this.druckFormat = printDetails?.format || null;
      this.druckGrammatur = printDetails?.grammatur || null;
      this.druckArt = printDetails?.art || null;
      this.druckAusfuehrung = printDetails?.ausfuehrung || null;
      this.druckAuflage = printDetails?.auflage !== undefined && printDetails.auflage !== null ? printDetails.auflage : (this.totalFlyersFromDistribution > 0 ? this.totalFlyersFromDistribution : null);
      this.druckReserve = printDetails?.reserve || 0;
      if (this.druckAuflage !== null) {
        this.orderDataService.updatePrintServiceDetails({ auflage: this.druckAuflage });
      }
    }
    this.validateStep();
  }

  public onFormatSelect(format: FlyerFormatType, isPrintService: boolean): void {
    if (isPrintService) {
      this.druckFormat = format;
      this.orderDataService.updatePrintServiceDetails({ format: this.druckFormat });
    } else {
      this.currentFormat = format;
      this.orderDataService.updateAnlieferDetails({ format: this.currentFormat });
    }
    this.validateStep();
  }

  public onAnlieferungSelect(anlieferung: AnlieferungType): void {
    this.currentAnlieferung = anlieferung;
    this.orderDataService.updateAnlieferDetails({ anlieferung: this.currentAnlieferung });
    this.validateStep();
  }

  public onPrintServiceDetailChange(): void {
    this.orderDataService.updatePrintServiceDetails({
      format: this.druckFormat, grammatur: this.druckGrammatur,
      art: this.druckArt, ausfuehrung: this.druckAusfuehrung, reserve: this.druckReserve
    });
    this.validateStep();
  }

  public onDruckAuflageChange(): void {
    if (this.druckAuflage === null || this.druckAuflage < 0) {
      this.druckAuflage = this.druckAuflage === null ? null : 0;
    }
    this.orderDataService.updatePrintServiceDetails({ auflage: this.druckAuflage });
    this.validateStep();
  }

  private resetAnlieferDetails(): void {
    this.currentFormat = null; this.currentAnlieferung = null;
    this.orderDataService.updateAnlieferDetails({ format: null, anlieferung: null });
  }

  private resetPrintServiceDetails(): void {
    this.druckFormat = null; this.druckGrammatur = null; this.druckArt = null;
    this.druckAusfuehrung = null; this.druckReserve = 0;
    this.orderDataService.updatePrintServiceDetails({
      format: null, grammatur: null, art: null, ausfuehrung: null, reserve: 0, auflage: null
    });
  }

  private validateStep(): void {
    let isValid = false;
    if (this.selectedDesignPackage) {
      if (this.selectedPrintOption === 'anliefern') {
        if (this.currentFormat && this.currentAnlieferung) {
          isValid = true;
        }
      } else if (this.selectedPrintOption === 'service') {
        if (
          this.druckFormat && this.druckGrammatur && this.druckArt &&
          this.druckAusfuehrung && this.druckAuflage !== null &&
          this.druckAuflage >= (this.totalFlyersFromDistribution || 1) // Auflage muss mindestens der Verteilmenge entsprechen
        ) {
          isValid = true;
        }
      }
    }
    const newStatus = isValid ? 'valid' : 'invalid';
    if (this.currentStatus !== newStatus) {
      this.currentStatus = newStatus;
      // Event asynchron senden, um NG0100 im Parent zu vermeiden
      Promise.resolve().then(() => { // oder setTimeout, wenn NgZone nicht verfügbar ist oder bevorzugt wird
        this.validationChange.emit(this.currentStatus);
      });
    }
    this.cdr.markForCheck();
  }

  public triggerValidationDisplay(): void {
    this.validateStep();
  }
}
