import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe, CurrencyPipe } from '@angular/common';
import { ValidationStatus } from '../offer-process/offer-process.component';
import { SelectionService } from '../../services/selection.service';
import { PlzEntry } from '../../services/plz-data.service';
import { OrderDataService, VerteilzuschlagFormatKey } from '../../services/order-data.service';
import { CalculatorService, AppPrices } from '../../services/calculator.service';
import { DesignPackage, PrintOption, AnlieferungOption } from '../design-print-step/design-print-step.component';
import { ZielgruppeOption } from '../distribution-step/distribution-step.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface DisplayCostItem {
  label: string;
  flyers?: number;
  price: number;
  isSurcharge?: boolean;
}

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule, DecimalPipe, CurrencyPipe],
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalculatorComponent implements OnInit, OnDestroy {
  @Input() zielgruppe: ZielgruppeOption = 'Alle Haushalte'; // <- DAS MUSS DEKLARIERT SEIN!
  @Input() activeStep: number = 1;
  @Input() currentStepValidationStatus: ValidationStatus = 'pending';

  @Output() requestPreviousStep = new EventEmitter<void>();
  @Output() requestNextStep = new EventEmitter<void>();
  @Output() requestSubmit = new EventEmitter<void>();

  public selectedPlzEntries: PlzEntry[] = [];
  public distributionCostItems: DisplayCostItem[] = [];
  public totalFlyersForDistribution: number = 0;
  public zwischensummeVerteilung: number = 0;

  public selectedDesignPackageKey: DesignPackage | '' = '';
  public selectedDesignPackageName: string = '';
  public designPackagePrice: number = 0;

  public selectedPrintOption: PrintOption | '' = '';

  public overallTotalPrice: number = 0;

  public zuschlagFormatAnzeige: VerteilzuschlagFormatKey | null = null;
  public zuschlagFormatPrice: number = 0;
  public isAnderesFormatSelected: boolean = false;

  public flyerAbholungApplicable: boolean = false;
  public flyerAbholungPrice: number = 0;
  public expressZuschlagApplicable: boolean = false;
  public expressZuschlagPrice: number = 0;
  public mindestAbnahmePauschaleApplicable: boolean = false;
  public mindestAbnahmePauschalePrice: number = 0;

  public fahrzeugGpsApplicable: boolean = false;
  public fahrzeugGpsPrice: number = 0;

  private destroy$ = new Subject<void>();
  private prices: AppPrices | null = null;
  private calculationTrigger = new Subject<void>();

  private currentFinalFlyerFormat: VerteilzuschlagFormatKey = '';
  private currentAnlieferungOption: AnlieferungOption | '' = '';
  private isExpressConfirmed: boolean = false;

  constructor(
    private selectionService: SelectionService,
    private orderDataService: OrderDataService,
    private calculatorService: CalculatorService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.calculatorService.getPricesObservable().pipe(takeUntil(this.destroy$)).subscribe(p => {
      this.prices = p;
      this.triggerRecalculation();
    });

    this.selectionService.selectedEntries$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        this.selectedPlzEntries = entries;
        this.triggerRecalculation();
      });

    this.orderDataService.designPackage$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pkgKey: DesignPackage | '') => {
        this.selectedDesignPackageKey = pkgKey;
        this.updateDesignPackageDetails();
      });

    this.orderDataService.printOption$
      .pipe(takeUntil(this.destroy$))
      .subscribe(option => {
        this.selectedPrintOption = option;
        this.triggerRecalculation();
      });

    this.orderDataService.finalFlyerFormat$
      .pipe(takeUntil(this.destroy$))
      .subscribe(format => {
        this.currentFinalFlyerFormat = format;
        this.triggerRecalculation();
      });

    this.orderDataService.anlieferungOption$
      .pipe(takeUntil(this.destroy$))
      .subscribe(option => {
        this.currentAnlieferungOption = option;
        this.triggerRecalculation();
      });

    this.orderDataService.expressConfirmed$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isConfirmed => {
        this.isExpressConfirmed = isConfirmed;
        this.triggerRecalculation();
      });

    this.triggerRecalculation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(): void {
    this.triggerRecalculation(); // Zielgruppe-Änderung
  }

  private triggerRecalculation(): void {
    this.calculationTrigger.next();
    this.recalculateAllCostsLogic();
  }

  private updateDesignPackageDetails(): void {
    if (this.selectedDesignPackageKey && this.prices?.designPackages) {
      this.selectedDesignPackageName = this.getUIDesignPackageName(this.selectedDesignPackageKey);
      this.designPackagePrice = this.prices.designPackages[this.selectedDesignPackageKey] ?? 0;
    } else {
      this.selectedDesignPackageName = '';
      this.designPackagePrice = 0;
    }
    this.recalculateOverallTotalPrice();
  }

  private recalculateAllCostsLogic(): void {
    if (!this.prices) return;

    const tempDistributionItems: DisplayCostItem[] = [];
    this.totalFlyersForDistribution = this.selectedPlzEntries.reduce(
      (sum, entry) => sum + (entry.selected_display_flyer_count || 0), 0
    );

    let summeGrundverteilung = 0;
    this.selectedPlzEntries.forEach(entry => {
      const price = this.calculatorService.calculateDistributionCostForEntry(
        entry,
        this.zielgruppe,
        this.prices!
      );
      summeGrundverteilung += price;

      tempDistributionItems.push({
        label: `${entry.plz4} ${entry.ort}`,
        flyers: entry.selected_display_flyer_count || 0,
        price: price,
        isSurcharge: false
      });
    });

    let aktuelleZwischensummeVerteilung = summeGrundverteilung;

    this.fahrzeugGpsPrice = 0;
    this.fahrzeugGpsApplicable = false;
    if (this.selectedPlzEntries.length > 0) {
      this.fahrzeugGpsPrice = this.calculatorService.getGpsSurcharge(this.prices!);
      this.fahrzeugGpsApplicable = this.fahrzeugGpsPrice > 0;
      if (this.fahrzeugGpsApplicable) {
        aktuelleZwischensummeVerteilung += this.fahrzeugGpsPrice;
      }
    }

    this.zuschlagFormatAnzeige = null;
    this.zuschlagFormatPrice = 0;
    this.isAnderesFormatSelected = false;

    if (this.currentFinalFlyerFormat === 'anderes') {
      this.zuschlagFormatAnzeige = 'anderes';
      this.isAnderesFormatSelected = true;
    } else if (this.currentFinalFlyerFormat && this.totalFlyersForDistribution > 0) {
      if (this.currentFinalFlyerFormat === 'Lang' || this.currentFinalFlyerFormat === 'A4' || this.currentFinalFlyerFormat === 'A3') {
        const zuschlagPro1000 = this.calculatorService.getVerteilungZuschlagFormatPro1000(this.currentFinalFlyerFormat, this.prices!);
        if (zuschlagPro1000 > 0) {
          this.zuschlagFormatPrice = (this.totalFlyersForDistribution / 1000) * zuschlagPro1000;
          this.zuschlagFormatAnzeige = this.currentFinalFlyerFormat;
          aktuelleZwischensummeVerteilung += this.zuschlagFormatPrice;
        }
      }
    }

    this.flyerAbholungPrice = 0;
    this.flyerAbholungApplicable = false;
    if (this.currentAnlieferungOption === 'abholung') {
      this.flyerAbholungPrice = this.calculatorService.getSurchargeValue('abholungFlyer', this.prices!);
      if (this.flyerAbholungPrice > 0) {
        this.flyerAbholungApplicable = true;
        aktuelleZwischensummeVerteilung += this.flyerAbholungPrice;
      }
    }

    this.expressZuschlagPrice = 0;
    this.expressZuschlagApplicable = false;
    if (this.isExpressConfirmed) {
      const basisExpress = summeGrundverteilung + (this.currentFinalFlyerFormat !== 'anderes' ? this.zuschlagFormatPrice : 0);
      if (basisExpress > 0) {
        const expressFactor = this.calculatorService.getExpressSurchargeFactor(this.prices!);
        if (expressFactor > 0) {
          this.expressZuschlagPrice = basisExpress * expressFactor;
          this.expressZuschlagApplicable = true;
          aktuelleZwischensummeVerteilung += this.expressZuschlagPrice;
        }
      }
    }

    this.mindestAbnahmePauschalePrice = 0;
    this.mindestAbnahmePauschaleApplicable = false;
    if (aktuelleZwischensummeVerteilung > 0) {
      this.mindestAbnahmePauschalePrice = this.calculatorService.calculateMinimumOrderSurcharge(aktuelleZwischensummeVerteilung, this.prices!);
      if (this.mindestAbnahmePauschalePrice > 0) {
        this.mindestAbnahmePauschaleApplicable = true;
        aktuelleZwischensummeVerteilung += this.mindestAbnahmePauschalePrice;
      }
    }

    this.distributionCostItems = tempDistributionItems;
    this.zwischensummeVerteilung = aktuelleZwischensummeVerteilung;
    this.recalculateOverallTotalPrice();

    this.cdr.markForCheck();
  }

  private recalculateOverallTotalPrice(): void {
    this.overallTotalPrice = this.zwischensummeVerteilung + this.designPackagePrice;
    this.cdr.markForCheck();
  }

  private getUIDesignPackageName(pkgKey: DesignPackage | string): string {
    switch(pkgKey) {
      case 'basis': return 'Basis Paket';
      case 'plus': return 'Plus Paket';
      case 'premium': return 'Premium Paket';
      case 'eigenes': return 'Eigenes Design angeliefert';
      default: return '';
    }
  }

  public getFlyerAmountForPlz(entry: PlzEntry): number {
    return entry.selected_display_flyer_count || 0;
  }

  public getDistributionPriceForPlz(entry: PlzEntry): number {
    if(!this.prices) return 0;
    return this.calculatorService.calculateDistributionCostForEntry(
      entry,
      this.zielgruppe,
      this.prices
    );
  }

  onRequestPrevious(): void {
    this.requestPreviousStep.emit();
  }

  onRequestNext(): void {
    this.requestNextStep.emit();
  }

  onRequestSubmit(): void {
    this.requestSubmit.emit();
  }
}
