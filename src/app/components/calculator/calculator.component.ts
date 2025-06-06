import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe, CurrencyPipe } from '@angular/common';
import { ValidationStatus } from '../offer-process/offer-process.component';
import { SelectionService } from '../../services/selection.service';
import { PlzEntry } from '../../services/plz-data.service';
import { OrderDataService, VerteilzuschlagFormatKey } from '../../services/order-data.service';
import { CalculatorService, AppPrices } from '../../services/calculator.service';
import { DesignPackage, AnlieferungOption as DesignPrintAnlieferungOption } from '../design-print-step/design-print-step.component';
import { ZielgruppeOption } from '../distribution-step/distribution-step.component';
import { Subject, Subscription } from 'rxjs';
import { takeUntil, tap, map } from 'rxjs/operators';

interface DisplayCostItem {
  label: string;
  flyers?: number | string;
  price: number;
  isSurcharge?: boolean;
}

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule, DecimalPipe, CurrencyPipe],
  templateUrl: './calculator.component.html', // Sollte calculator_component_html_final_v1 sein
  styleUrl: './calculator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalculatorComponent implements OnInit, OnDestroy {
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

  public overallTotalPrice: number = 0;

  public zuschlagFormatAnzeige: VerteilzuschlagFormatKey | null = null;
  public zuschlagFormatPrice: number = 0;

  public flyerAbholungApplicable: boolean = false;
  public flyerAbholungPrice: number = 0;

  public expressZuschlagApplicable: boolean = false;
  public expressZuschlagPrice: number = 0;

  public mindestAbnahmePauschaleApplicable: boolean = false;
  public mindestAbnahmePauschalePrice: number = 0; // Der Pauschalbetrag selbst (z.B. 50 CHF)

  private destroy$ = new Subject<void>();
  private prices: AppPrices | null = null;
  private calculationTrigger = new Subject<void>();

  private currentFinalFlyerFormat: VerteilzuschlagFormatKey = '';
  private currentAnlieferungOption: DesignPrintAnlieferungOption | '' = '';
  private isExpressConfirmed: boolean = false;
  private currentZielgruppeState: ZielgruppeOption = 'Alle Haushalte';


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
        // Annahme: Zielgruppe wird extern gesetzt, z.B. durch OrderDataService.
        // Für jetzt verwenden wir einen Default oder einen aus OrderDataService zu holenden Wert.
        // this.currentZielgruppeState = this.orderDataService.getCurrentZielgruppe();
        this.triggerRecalculation();
      });

    this.orderDataService.designPackage$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pkgKey: DesignPackage | '') => {
        this.selectedDesignPackageKey = pkgKey;
        this.updateDesignPackageDetails();
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

    this.calculationTrigger.pipe(
      takeUntil(this.destroy$),
    ).subscribe(() => {
      if (this.prices) {
        this.recalculateAllCostsLogic();
      }
    });

    this.triggerRecalculation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private triggerRecalculation(): void {
    this.calculationTrigger.next();
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

    this.totalFlyersForDistribution = this.selectedPlzEntries.reduce(
      (sum, entry) => sum + (entry.selected_display_flyer_count || 0), 0
    );

    const tempDistributionItems: DisplayCostItem[] = [];
    let summeGrundverteilung = 0;

    this.selectedPlzEntries.forEach(entry => {
      const flyerCount = entry.selected_display_flyer_count || 0;
      const ratePer1000 = this.calculatorService.getDistributionRatePer1000(entry, this.currentZielgruppeState, this.prices!);
      const price = flyerCount > 0 ? (flyerCount / 1000) * ratePer1000 : 0;
      summeGrundverteilung += price;
      tempDistributionItems.push({
        label: `${entry.plz4} ${entry.ort}`,
        flyers: flyerCount,
        price: price,
        isSurcharge: false
      });
    });

    let aktuelleZwischensummeVerteilung = summeGrundverteilung;

    // Formatzuschlag
    this.zuschlagFormatAnzeige = null;
    this.zuschlagFormatPrice = 0;
    if (this.currentFinalFlyerFormat && (this.currentFinalFlyerFormat === 'A3' || this.currentFinalFlyerFormat === 'A4' || this.currentFinalFlyerFormat === 'Lang') && this.totalFlyersForDistribution > 0) {
      const zuschlagPro1000 = this.calculatorService.getVerteilungZuschlagFormatPro1000(this.currentFinalFlyerFormat, this.prices!);
      if (zuschlagPro1000 > 0) {
        this.zuschlagFormatPrice = (this.totalFlyersForDistribution / 1000) * zuschlagPro1000;
        this.zuschlagFormatAnzeige = this.currentFinalFlyerFormat; // Für die Anzeige des spezifischen Formats
        if (this.zuschlagFormatPrice > 0) { // Nur hinzufügen, wenn tatsächlich ein Preis entsteht
          tempDistributionItems.push({ label: `Zuschlag Format ${this.zuschlagFormatAnzeige}`, flyers: this.totalFlyersForDistribution, price: this.zuschlagFormatPrice, isSurcharge: true });
          aktuelleZwischensummeVerteilung += this.zuschlagFormatPrice;
        }
      }
    }

    // Flyer Abholung
    this.flyerAbholungPrice = 0;
    this.flyerAbholungApplicable = false;
    if (this.currentAnlieferungOption === 'abholung') {
      this.flyerAbholungPrice = this.calculatorService.getSurchargeValue('abholungFlyer', this.prices!);
      if (this.flyerAbholungPrice > 0) {
        this.flyerAbholungApplicable = true;
        tempDistributionItems.push({ label: 'Flyer Abholung', price: this.flyerAbholungPrice, isSurcharge: true });
        aktuelleZwischensummeVerteilung += this.flyerAbholungPrice;
      }
    }

    // Express Zuschlag
    this.expressZuschlagPrice = 0;
    this.expressZuschlagApplicable = false;
    if (this.isExpressConfirmed && aktuelleZwischensummeVerteilung > 0) {
      const expressFactor = this.calculatorService.getExpressSurchargeFactor(this.prices!);
      if (expressFactor > 0) {
        this.expressZuschlagPrice = aktuelleZwischensummeVerteilung * expressFactor;
        this.expressZuschlagApplicable = true;
        tempDistributionItems.push({ label: `Express Zuschlag ${expressFactor * 100}%`, price: this.expressZuschlagPrice, isSurcharge: true });
        aktuelleZwischensummeVerteilung += this.expressZuschlagPrice;
      }
    }

    // Mindestabnahme Pauschale
    this.mindestAbnahmePauschalePrice = 0;
    this.mindestAbnahmePauschaleApplicable = false;
    const mindestbestellwert = this.calculatorService.getSurchargeValue('mindestbestellwert', this.prices!);
    if (mindestbestellwert > 0 && aktuelleZwischensummeVerteilung > 0 && aktuelleZwischensummeVerteilung < mindestbestellwert) {
      // Die Pauschale ist ein fester Betrag, der anfällt, wenn die Summe UNTER dem Mindestbestellwert liegt.
      // Gemäss HTML-Beispiel ist dies 50.00 CHF.
      // TODO: Den Pauschalbetrag (50.00) ggf. auch aus prices.json holen, falls er dort konfigurierbar sein soll.
      this.mindestAbnahmePauschalePrice = 50.00;
      this.mindestAbnahmePauschaleApplicable = true;
      tempDistributionItems.push({ label: 'Mindestabnahme Pauschale', price: this.mindestAbnahmePauschalePrice, isSurcharge: true });
      aktuelleZwischensummeVerteilung += this.mindestAbnahmePauschalePrice; // Addiert die Pauschale zur Summe
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

  // Wird im HTML nicht mehr direkt für die Zeilenpreise der PLZs verwendet,
  // da diese in distributionCostItems dynamisch generiert werden.
  // Könnte aber intern nützlich bleiben.
  public getDistributionPriceForPlz(entry: PlzEntry): number {
    if(!this.prices) return 0;
    const flyerCount = entry.selected_display_flyer_count || 0;
    const ratePer1000 = this.calculatorService.getDistributionRatePer1000(entry, this.currentZielgruppeState, this.prices);
    return flyerCount > 0 ? (flyerCount / 1000) * ratePer1000 : 0;
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
