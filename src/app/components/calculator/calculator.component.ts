import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import {
  ZielgruppeOption,
  PlzSelectionDetail,
  AllOrderDataState,
  ProduktionDataState,
  DesignPackageType,
  FlyerFormatType,
  PrintOptionType,
  DesignPackageService,
  VerteilzuschlagFormatKey,
  AnlieferungOptionService
} from '../../services/order-data.types';
import { CalculatorService, AppPrices } from '../../services/calculator.service';
import { ValidationStatus } from '../offer-process/offer-process.component';
import { PlzEntry } from '../../services/plz-data.service';

export interface CostItem {
  label: string;
  price: number;
  flyers: number;
  details?: string;
}

const deepCompare = (obj1: any, obj2: any): boolean => {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
};

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe],
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe, DecimalPipe]
})
export class CalculatorComponent implements OnInit, OnChanges, OnDestroy {
  @Input() public zielgruppe: ZielgruppeOption = 'Alle Haushalte';
  @Input() public activeStep: number = 1;
  @Input() public currentStepValidationStatus: ValidationStatus = 'unchecked';

  @Output() public requestPreviousStep = new EventEmitter<void>();
  @Output() public requestNextStep = new EventEmitter<void>();
  @Output() public requestSubmit = new EventEmitter<void>();

  public selectedPlzEntries: PlzSelectionDetail[] = [];
  public distributionCostItems: CostItem[] = [];
  public expressZuschlagApplicable: boolean = false;
  public expressZuschlagPrice: number = 0;
  public fahrzeugGpsApplicable: boolean = false;
  public fahrzeugGpsPrice: number = 0;
  public zuschlagFormatAnzeige: string | null = null;
  public isAnderesFormatSelected: boolean = false;
  public totalFlyersForDistribution: number = 0;
  public zuschlagFormatPrice: number = 0;
  public flyerAbholungApplicable: boolean = false;
  public flyerAbholungPrice: number = 0;
  public mindestAbnahmePauschaleApplicable: boolean = false;
  public mindestAbnahmePauschalePrice: number = 0;
  public zwischensummeVerteilung: number = 0;
  public selectedPrintOption: PrintOptionType | null = null;
  public selectedDesignPackageKey: DesignPackageType | null = null;
  public selectedDesignPackageName: string | null = null;
  public designPackagePrice: number = 0;
  public overallTotalPrice: number = 0;
  public mwstProzent: number = 0;
  public mwstBetrag: number = 0;
  public gesamtTotal: number = 0;

  private destroy$ = new Subject<void>();
  private currentOrderData: AllOrderDataState | null = null;
  private appPrices: AppPrices | null = null;

  constructor(
    private orderDataService: OrderDataService,
    private calculatorService: CalculatorService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.calculatorService.prices$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(loadedPrices => {
      if (loadedPrices) {
        this.appPrices = loadedPrices;
        this.mwstProzent = (this.appPrices.tax["vat-ch"] || 0) * 100;
        if (this.currentOrderData) {
          this.calculateAllCosts();
          this.cdr.markForCheck();
        }
      }
    });

    this.orderDataService.getAllOrderDataObservable().pipe(
      distinctUntilChanged(deepCompare),
      takeUntil(this.destroy$)
    ).subscribe(orderData => {
      this.currentOrderData = orderData;
      this.updatePropertiesFromOrderData(orderData);
      if (this.appPrices) {
        this.calculateAllCosts();
        this.cdr.markForCheck();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.appPrices && this.currentOrderData) {
      if (changes['zielgruppe'] || changes['activeStep'] || changes['currentStepValidationStatus']) {
        this.updatePropertiesFromOrderData(this.currentOrderData);
        this.calculateAllCosts();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updatePropertiesFromOrderData(orderData: AllOrderDataState): void {
    if (orderData.verteilgebiet) {
      this.selectedPlzEntries = orderData.verteilgebiet.selectedPlzEntries || [];
      this.totalFlyersForDistribution = orderData.verteilgebiet.totalFlyersCount || 0;
      this.expressZuschlagApplicable = orderData.verteilgebiet.expressConfirmed;
    } else {
      this.selectedPlzEntries = [];
      this.totalFlyersForDistribution = 0;
      this.expressZuschlagApplicable = false;
    }

    const produktionState: ProduktionDataState | null = orderData.produktion;
    if (produktionState) {
      this.selectedPrintOption = produktionState.printOption;
      this.selectedDesignPackageKey = produktionState.designPackage;
    } else {
      this.selectedPrintOption = null;
      this.selectedDesignPackageKey = null;
    }
  }

  private getDesignPackageName(packageKey: DesignPackageType | null): string | null {
    if (!packageKey) return null;
    switch (packageKey as DesignPackageService) {
      case 'basis': return 'Basis Paket';
      case 'plus': return 'Plus Paket';
      case 'premium': return 'Premium Paket';
      case 'eigenes': return 'Eigenes Design';
      default: return null;
    }
  }

  public calculateAllCosts(): void {
    if (!this.appPrices || !this.currentOrderData) {
      return;
    }

    this.distributionCostItems = [];
    let grundkostenVerteilung = 0;

    this.selectedPlzEntries.forEach(entry => {
      const preisKategorie = entry.preisKategorie || 'A';
      const efhPreisProTausend = this.appPrices!.distribution.efh[preisKategorie] || 0;
      const mfhPreisProTausend = this.appPrices!.distribution.mfh[preisKategorie] || 0;
      let flyersForCostItem = 0;
      let costForThisEntry = 0;

      if (this.zielgruppe === 'Alle Haushalte') {
        flyersForCostItem = entry.anzahl;
        const efhFlyers = entry.efh || 0;
        const mfhFlyers = entry.mfh || 0;
        costForThisEntry = (efhFlyers / 1000 * efhPreisProTausend) + (mfhFlyers / 1000 * mfhPreisProTausend);
      } else if (this.zielgruppe === 'Ein- und Zweifamilienhäuser') {
        flyersForCostItem = entry.selected_display_flyer_count;
        costForThisEntry = (flyersForCostItem / 1000) * efhPreisProTausend;
      } else if (this.zielgruppe === 'Mehrfamilienhäuser') {
        flyersForCostItem = entry.selected_display_flyer_count;
        costForThisEntry = (flyersForCostItem / 1000) * mfhPreisProTausend;
      }
      costForThisEntry = this.calculatorService.roundCurrency(costForThisEntry);
      if (flyersForCostItem > 0) {
        this.distributionCostItems.push({ label: `PLZ ${entry.plz4} ${entry.ort}`, price: costForThisEntry, flyers: flyersForCostItem });
        grundkostenVerteilung += costForThisEntry;
      }
    });
    grundkostenVerteilung = this.calculatorService.roundCurrency(grundkostenVerteilung);

    const produktionState = this.currentOrderData.produktion;
    let finalFlyerFormatForSurcharge: VerteilzuschlagFormatKey | null = null;
    let rawFlyerFormat: FlyerFormatType | null = null;

    if (produktionState.printOption === 'anliefern' && produktionState.anlieferDetails?.format) {
      rawFlyerFormat = produktionState.anlieferDetails.format;
    } else if (produktionState.printOption === 'service' && produktionState.printServiceDetails?.format) {
      rawFlyerFormat = produktionState.printServiceDetails.format;
    }

    if (rawFlyerFormat === 'DIN-Lang') finalFlyerFormatForSurcharge = 'Lang';
    else if (rawFlyerFormat === 'A4') finalFlyerFormatForSurcharge = 'A4';
    else if (rawFlyerFormat === 'A3') finalFlyerFormatForSurcharge = 'A3';
    else if (rawFlyerFormat === 'anderes') finalFlyerFormatForSurcharge = 'anderes';

    const anlieferOption = produktionState.anlieferDetails?.anlieferung as AnlieferungOptionService | null;
    const plzEntriesForService = this.selectedPlzEntries as PlzEntry[];

    const surchargeResults = this.calculatorService.recalculateAllCostsLogic(
      grundkostenVerteilung, this.totalFlyersForDistribution, finalFlyerFormatForSurcharge,
      anlieferOption, this.expressZuschlagApplicable, plzEntriesForService, this.appPrices
    );

    this.fahrzeugGpsPrice = surchargeResults.gps;
    this.zuschlagFormatPrice = surchargeResults.format;
    this.flyerAbholungPrice = surchargeResults.abhol;
    this.expressZuschlagPrice = surchargeResults.express;
    let currentCalculatedDistributionTotal: number;
    const basisMindestwert = this.appPrices.distribution.surcharges.mindestbestellwert;
    const gpsKostenFuerMindestwert = this.appPrices.distribution.surcharges.fahrzeugGPS;
    const effektiverMindestZielwert = (this.fahrzeugGpsPrice > 0) ? basisMindestwert + gpsKostenFuerMindestwert : basisMindestwert;
    const summeOhneMindestzuschlag = grundkostenVerteilung + this.fahrzeugGpsPrice + this.zuschlagFormatPrice + this.flyerAbholungPrice + this.expressZuschlagPrice;

    if (summeOhneMindestzuschlag < effektiverMindestZielwert) {
      this.mindestAbnahmePauschalePrice = this.calculatorService.roundCurrency(effektiverMindestZielwert - summeOhneMindestzuschlag);
      currentCalculatedDistributionTotal = effektiverMindestZielwert;
    } else {
      this.mindestAbnahmePauschalePrice = 0;
      currentCalculatedDistributionTotal = summeOhneMindestzuschlag;
    }
    this.zwischensummeVerteilung = currentCalculatedDistributionTotal;
    this.fahrzeugGpsApplicable = this.fahrzeugGpsPrice > 0;
    this.flyerAbholungApplicable = this.flyerAbholungPrice > 0;
    this.mindestAbnahmePauschaleApplicable = this.mindestAbnahmePauschalePrice > 0;

    if (finalFlyerFormatForSurcharge && finalFlyerFormatForSurcharge !== 'anderes' && this.zuschlagFormatPrice > 0) {
      this.zuschlagFormatAnzeige = finalFlyerFormatForSurcharge;
      this.isAnderesFormatSelected = false;
    } else if (finalFlyerFormatForSurcharge === 'anderes') {
      this.zuschlagFormatAnzeige = 'Anderes';
      this.isAnderesFormatSelected = true;
    } else {
      this.zuschlagFormatAnzeige = rawFlyerFormat;
      this.isAnderesFormatSelected = false;
    }

    this.selectedDesignPackageName = this.getDesignPackageName(this.selectedDesignPackageKey);
    if (this.selectedDesignPackageKey && this.appPrices.design) {
      const designKey = this.selectedDesignPackageKey as keyof typeof this.appPrices.design;
      this.designPackagePrice = this.appPrices.design[designKey] || 0;
    } else {
      this.designPackagePrice = 0;
    }

    this.overallTotalPrice = this.calculatorService.roundCurrency(this.zwischensummeVerteilung + this.designPackagePrice);
    this.mwstBetrag = this.calculatorService.roundCurrency(this.overallTotalPrice * this.appPrices.tax["vat-ch"]);
    this.gesamtTotal = this.calculatorService.roundCurrency(this.overallTotalPrice + this.mwstBetrag);
    this.cdr.markForCheck();
  }

  public onRequestPrevious(): void { this.requestPreviousStep.emit(); }
  public onRequestNext(): void { this.requestNextStep.emit(); }
  public onRequestSubmit(): void { this.requestSubmit.emit(); }
}
