import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe, CurrencyPipe } from '@angular/common';
import { ValidationStatus } from '../offer-process/offer-process.component';
import { SelectionService } from '../../services/selection.service';
import { PlzEntry } from '../../services/plz-data.service';
import { OrderDataService, VerteilzuschlagFormatKey } from '../../services/order-data.service';
import { CalculatorService, AppPrices } from '../../services/calculator.service';
import { DesignPackage, PrintOption } from '../design-print-step/design-print-step.component';
import { ZielgruppeOption } from '../distribution-step/distribution-step.component';
import { Subject, combineLatest } from 'rxjs'; // HIER IST DIE KORREKTUR
import { takeUntil, tap } from 'rxjs/operators';

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule, DecimalPipe, CurrencyPipe],
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalculatorComponent implements OnInit, OnDestroy {
  @Input() activeStep: number = 1;
  @Input() currentStepValidationStatus: ValidationStatus = 'pending';

  @Output() requestPreviousStep = new EventEmitter<void>();
  @Output() requestNextStep = new EventEmitter<void>();
  @Output() requestSubmit = new EventEmitter<void>();

  public selectedPlzEntries: PlzEntry[] = [];
  public distributionCostItems: any[] = [];
  public totalFlyersForDistribution: number = 0;
  public zwischensummeVerteilung: number = 0;

  public selectedDesignPackageKey: DesignPackage | '' = '';
  public selectedDesignPackageName: string = '';
  public designPackagePrice: number = 0;

  public selectedPrintOption: PrintOption | '' = '';

  public overallTotalPrice: number = 0;

  public zuschlagFormatAnzeige: VerteilzuschlagFormatKey | string | null = null;
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
  private currentZielgruppeState: ZielgruppeOption = 'Alle Haushalte';

  constructor(
    private selectionService: SelectionService,
    private orderDataService: OrderDataService,
    private calculatorService: CalculatorService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const allObservables$ = combineLatest([
      this.selectionService.selectedEntries$,
      this.orderDataService.designPackage$,
      this.orderDataService.printOption$,
      this.orderDataService.finalFlyerFormat$,
      this.orderDataService.anlieferungOption$,
      this.orderDataService.expressConfirmed$,
      this.calculatorService.getPricesObservable()
    ]);

    allObservables$.pipe(
      takeUntil(this.destroy$),
      tap(() => this.recalculateAll())
    ).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private recalculateAll(): void {
    this.prices = this.calculatorService.getPricesValue();
    if (!this.prices) {
      return;
    }

    this.selectedPlzEntries = this.selectionService.getSelectedEntries();
    this.selectedDesignPackageKey = this.orderDataService.getCurrentDesignPackage();
    this.selectedPrintOption = this.orderDataService.getCurrentPrintOption();

    const prices = this.prices;
    const entries = this.selectedPlzEntries;

    this.designPackagePrice = 0;
    this.selectedDesignPackageName = '';
    if (this.selectedDesignPackageKey) {
      this.selectedDesignPackageName = this.getUIDesignPackageName(this.selectedDesignPackageKey);
      this.designPackagePrice = prices.designPackages[this.selectedDesignPackageKey] ?? 0;
    }

    this.totalFlyersForDistribution = entries.reduce((sum, entry) => sum + (entry.selected_display_flyer_count || 0), 0);
    let summeGrundverteilung = entries.reduce((sum, entry) => {
      const ratePer1000 = this.calculatorService.getDistributionRatePer1000(entry, this.currentZielgruppeState, prices);
      return sum + ((entry.selected_display_flyer_count || 0) / 1000 * ratePer1000);
    }, 0);

    let zwischensumme = summeGrundverteilung;

    this.fahrzeugGpsPrice = 0;
    this.fahrzeugGpsApplicable = false;
    if (entries.length > 0) {
      this.fahrzeugGpsPrice = prices.distribution.surcharges.fahrzeugGPS ?? 0;
      this.fahrzeugGpsApplicable = this.fahrzeugGpsPrice > 0;
      if (this.fahrzeugGpsApplicable) {
        zwischensumme += this.fahrzeugGpsPrice;
      }
    }

    const format = this.orderDataService.getCurrentFinalFlyerFormat();
    this.zuschlagFormatPrice = 0;
    this.zuschlagFormatAnzeige = null;
    this.isAnderesFormatSelected = false;
    if (format === 'anderes') {
      this.zuschlagFormatAnzeige = "Zuschlag Anderes Format: Individuelle Berechnung<sup>1</sup>";
      this.isAnderesFormatSelected = true;
    } else if (format && this.totalFlyersForDistribution > 0) {
      const zuschlagPro1000 = prices.distribution.verteilungZuschlagFormat[format as 'Lang' | 'A4' | 'A3'] ?? 0;
      this.zuschlagFormatPrice = (this.totalFlyersForDistribution / 1000) * zuschlagPro1000;
      if(this.zuschlagFormatPrice > 0){
        const displayFormat = format === 'Lang' ? 'DIN Lang' : `DIN ${format}`;
        this.zuschlagFormatAnzeige = `Zuschlag Format ${displayFormat}`;
        zwischensumme += this.zuschlagFormatPrice;
      }
    }

    const basisExpress = summeGrundverteilung + (format !== 'anderes' ? this.zuschlagFormatPrice : 0);
    const anlieferung = this.orderDataService.getCurrentAnlieferungOption();
    this.flyerAbholungPrice = 0;
    this.flyerAbholungApplicable = false;
    if (anlieferung === 'abholung') {
      this.flyerAbholungPrice = prices.distribution.surcharges.abholungFlyer ?? 0;
      this.flyerAbholungApplicable = this.flyerAbholungPrice > 0;
      if (this.flyerAbholungApplicable) zwischensumme += this.flyerAbholungPrice;
    }

    const isExpress = this.orderDataService.getCurrentExpressConfirmed();
    this.expressZuschlagPrice = 0;
    this.expressZuschlagApplicable = false;
    if (isExpress && basisExpress > 0) {
      const expressFactor = prices.distribution.surcharges.express ?? 0;
      this.expressZuschlagPrice = basisExpress * expressFactor;
      this.expressZuschlagApplicable = this.expressZuschlagPrice > 0;
      if (this.expressZuschlagApplicable) zwischensumme += this.expressZuschlagPrice;
    }

    this.mindestAbnahmePauschalePrice = 0;
    this.mindestAbnahmePauschaleApplicable = false;
    const mindestbestellwert = prices.distribution.surcharges.mindestbestellwert ?? 0;
    if (mindestbestellwert > 0 && zwischensumme > 0 && zwischensumme < mindestbestellwert) {
      this.mindestAbnahmePauschalePrice = mindestbestellwert - zwischensumme;
      this.mindestAbnahmePauschaleApplicable = true;
      zwischensumme += this.mindestAbnahmePauschalePrice;
    }

    this.zwischensummeVerteilung = zwischensumme;
    this.overallTotalPrice = this.zwischensummeVerteilung + this.designPackagePrice;

    this.distributionCostItems = entries.map(entry => ({
      label: `${entry.plz4} ${entry.ort}`,
      flyers: entry.selected_display_flyer_count || 0,
      price: ((entry.selected_display_flyer_count || 0) / 1000) * this.calculatorService.getDistributionRatePer1000(entry, this.currentZielgruppeState, prices)
    }));

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

  onRequestPrevious(): void { this.requestPreviousStep.emit(); }
  onRequestNext(): void { this.requestNextStep.emit(); }
  onRequestSubmit(): void { this.requestSubmit.emit(); }
}
