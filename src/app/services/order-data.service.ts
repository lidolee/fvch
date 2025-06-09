import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, distinctUntilChanged, tap, shareReplay, startWith, filter } from 'rxjs/operators';
import {
  AllOrderDataState, VerteilgebietDataState, ProduktionDataState, KontaktDetailsState,
  KostenState, StepValidationStatus, DesignPackageType, PrintOptionType,
  AnlieferDetails, PrintServiceDetails, PlzSelectionDetail, ZielgruppeOption
} from './order-data.types';
import { CalculatorService, AppPrices } from './calculator.service';
import { SelectionService } from './selection.service';

@Injectable({
  providedIn: 'root'
})
export class OrderDataService {

  private initialVerteilgebietState: VerteilgebietDataState = {
    selectedPlzEntries: [],
    verteilungStartdatum: null,
    expressConfirmed: false,
    totalFlyersCount: 0,
    zielgruppe: 'Alle Haushalte'
  };

  private initialProduktionState: ProduktionDataState = {
    designPackage: null,
    printOption: null,
    anlieferDetails: { format: null, anlieferung: null },
    printServiceDetails: { format: null, grammatur: null, art: null, ausfuehrung: null, auflage: 0, reserve: 0 }
  };

  private initialKontaktDetailsState: KontaktDetailsState = {
    salutation: null, firstName: null, lastName: null, email: null,
    phone: null, company: null,
    address: null,
    zip: null,
    city: null,
    notes: null
  };

  private initialKostenState: KostenState = {
    selectedPlzEntriesLength: 0,
    expressZuschlagApplicable: false, fahrzeugGpsApplicable: true, zuschlagFormatAnzeigeText: '',
    totalFlyersForDistribution: 0, flyerAbholungApplicable: false, subTotalDistribution: 0,
    selectedPrintOption: null, selectedDesignPackageName: 'Kein Designpaket', designPackageCost: 0,
    subTotalNetto: 0, taxRatePercent: 0, taxAmount: 0, grandTotalCalculated: 0,
    mindestbestellwertHinweis: '', distributionCostItems: [], expressZuschlagPrice: 0,
    fahrzeugGpsPrice: 0, zuschlagFormatPrice: 0, isAnderesFormatSelected: false,
    flyerAbholungPrice: 0, printServiceName: 'Kein Druckservice', printServiceCost: 0,
    mindestbestellwert: 0
  };

  private initialValidierungsStatus: StepValidationStatus = {
    isStep1Valid: false, isStep2Valid: false, isStep3Valid: false, isOrderProcessValid: false
  };

  private stateParts = {
    verteilgebiet: new BehaviorSubject<VerteilgebietDataState>({ ...this.initialVerteilgebietState }),
    produktion: new BehaviorSubject<ProduktionDataState>({ ...this.initialProduktionState }),
    kontaktDetails: new BehaviorSubject<KontaktDetailsState>({ ...this.initialKontaktDetailsState }),
    kosten: new BehaviorSubject<KostenState>({ ...this.initialKostenState }),
    validierungsStatus: new BehaviorSubject<StepValidationStatus>({ ...this.initialValidierungsStatus })
  };

  public readonly state$: Observable<AllOrderDataState>;
  public readonly verteilgebiet$: Observable<VerteilgebietDataState>;
  public readonly produktion$: Observable<ProduktionDataState>;
  public readonly kontaktDetails$: Observable<KontaktDetailsState>;
  public readonly kosten$: Observable<KostenState>;
  public readonly validierungsStatus$: Observable<StepValidationStatus>;

  constructor(
    private calculatorService: CalculatorService,
    private selectionService: SelectionService
  ) {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Constructor - Initializing...`);

    const zielgruppe$ = this.stateParts.verteilgebiet.pipe(
      map(v => v.zielgruppe),
      distinctUntilChanged()
    );

    combineLatest([this.selectionService.selectedEntries$, zielgruppe$]).pipe(
      map(([selectedPlzEntriesFromService, currentZielgruppe]) => {
        console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Re-calculating verteilgebiet state for zielgruppe: ${currentZielgruppe}`);
        let totalFlyers = 0;

        const typedSelectedEntries: PlzSelectionDetail[] = selectedPlzEntriesFromService.map(entry => {
          let definitiveCount: number;

          switch (currentZielgruppe) {
            case 'Mehrfamilienhäuser':
              definitiveCount = (typeof entry.manual_flyer_count_mfh === 'number') ? entry.manual_flyer_count_mfh : (entry.mfh ?? 0);
              break;
            case 'Ein- und Zweifamilienhäuser':
              definitiveCount = (typeof entry.manual_flyer_count_efh === 'number') ? entry.manual_flyer_count_efh : (entry.efh ?? 0);
              break;
            default:
              definitiveCount = entry.all ?? 0;
              break;
          }

          totalFlyers += definitiveCount;

          return {
            id: entry.id,
            plz6: entry.plz6,
            plz4: entry.plz4,
            ort: entry.ort,
            kt: entry.kt,
            preisKategorie: entry.preisKategorie,
            all: entry.all,
            mfh: entry.mfh,
            efh: entry.efh,
            isSelected: entry.isSelected,
            isHighlighted: entry.isHighlighted,
            is_manual_count: entry.is_manual_count,
            manual_flyer_count_efh: entry.manual_flyer_count_efh,
            manual_flyer_count_mfh: entry.manual_flyer_count_mfh,
            anzahl: definitiveCount,
            zielgruppe: currentZielgruppe,
            selected_display_flyer_count: definitiveCount
          };
        });

        const currentState = this.stateParts.verteilgebiet.getValue();
        return {
          ...currentState,
          selectedPlzEntries: typedSelectedEntries,
          totalFlyersCount: totalFlyers,
          zielgruppe: currentZielgruppe
        };
      }),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
    ).subscribe(newVerteilgebietState => {
      console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Pushing new Verteilgebiet state:`, JSON.parse(JSON.stringify(newVerteilgebietState)));
      this.stateParts.verteilgebiet.next(newVerteilgebietState);
    });

    combineLatest([
      this.stateParts.verteilgebiet,
      this.stateParts.produktion,
      this.stateParts.kontaktDetails,
      this.calculatorService.prices$.pipe(startWith(null as AppPrices | null))
    ]).pipe(
      filter((data): data is [VerteilgebietDataState, ProduktionDataState, KontaktDetailsState, AppPrices] => {
        const prices = data[3];
        const isValid = prices !== null && !!prices.design && !!prices.tax && !!prices.distribution;
        if (!isValid) console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Cost/Validation Pipeline: Prices not (fully) loaded or invalid. Skipping calculation.`);
        return isValid;
      }),
      map(([verteilgebiet, produktion, kontaktDetails, appPrices]) => {
        const newKosten = this.calculateAllCosts(verteilgebiet, produktion, appPrices);
        const newValidierung = this.validateAllSteps(verteilgebiet, produktion, kontaktDetails, newKosten);
        return { kosten: newKosten, validierung: newValidierung };
      }),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
    ).subscribe(({ kosten, validierung }) => {
      console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Cost/Validation Pipeline calculated. Kosten changed: ${JSON.stringify(this.stateParts.kosten.getValue()) !== JSON.stringify(kosten)}. Validierung changed: ${JSON.stringify(this.stateParts.validierungsStatus.getValue()) !== JSON.stringify(validierung)}`);
      this.stateParts.kosten.next(kosten);
      this.stateParts.validierungsStatus.next(validierung);
    });

    this.state$ = combineLatest({
      verteilgebiet: this.stateParts.verteilgebiet,
      produktion: this.stateParts.produktion,
      kontaktDetails: this.stateParts.kontaktDetails,
      kosten: this.stateParts.kosten,
      validierungsStatus: this.stateParts.validierungsStatus,
    }).pipe(
      map(allParts => ({ ...allParts })),
      tap(newState => console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Global state$ emitting:`, JSON.parse(JSON.stringify(newState)))),
      shareReplay(1)
    );

    this.verteilgebiet$ = this.state$.pipe(map(s => s.verteilgebiet), distinctUntilChanged((p,c)=>JSON.stringify(p) === JSON.stringify(c)), shareReplay(1));
    this.produktion$ = this.state$.pipe(map(s => s.produktion), distinctUntilChanged((p,c)=>JSON.stringify(p) === JSON.stringify(c)), shareReplay(1));
    this.kontaktDetails$ = this.state$.pipe(map(s => s.kontaktDetails), distinctUntilChanged((p,c)=>JSON.stringify(p) === JSON.stringify(c)), shareReplay(1));
    this.kosten$ = this.state$.pipe(map(s => s.kosten), distinctUntilChanged((p,c)=>JSON.stringify(p) === JSON.stringify(c)), shareReplay(1));
    this.validierungsStatus$ = this.state$.pipe(map(s => s.validierungsStatus), distinctUntilChanged((p,c)=>JSON.stringify(p) === JSON.stringify(c)), shareReplay(1));

    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Constructor - Initialization complete.`);
  }

  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  private calculateAllCosts(
    verteilgebiet: VerteilgebietDataState,
    produktion: ProduktionDataState,
    appPrices: AppPrices
  ): KostenState {
    const calcFormat = produktion.printOption === 'service'
      ? produktion.printServiceDetails.format
      : produktion.anlieferDetails.format;
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] calculateAllCosts called. Effective format: ${calcFormat}, PLZ Count: ${verteilgebiet.selectedPlzEntries.length}`);

    const designPackageCost = this.calculatorService.calculateDesignPackagePrice(produktion.designPackage, appPrices.design);
    const selectedDesignPackageName = this.calculatorService.getDesignPackageName(produktion.designPackage, designPackageCost);
    const printService = this.calculatorService.calculatePrintServiceCost(produktion.printServiceDetails);
    const verteilzuschlag = this.calculatorService.calculateVerteilzuschlag(calcFormat, verteilgebiet.totalFlyersCount, appPrices);
    const distribution = this.calculatorService.calculateDistributionCost(verteilgebiet.selectedPlzEntries, verteilgebiet.zielgruppe, appPrices);

    const expressZuschlagApplicable = verteilgebiet.expressConfirmed && distribution.total > 0;
    const expressZuschlagPrice = expressZuschlagApplicable
      ? this.calculatorService.roundCurrency(distribution.total * this.calculatorService.getSurcharge('express', appPrices))
      : 0;

    const fahrzeugGpsApplicable = true;
    const fahrzeugGpsPrice = fahrzeugGpsApplicable ? this.calculatorService.getSurcharge('fahrzeugGPS', appPrices) : 0;

    const flyerAbholungApplicable = produktion.anlieferDetails.anlieferung === 'abholung';
    const flyerAbholungPrice = flyerAbholungApplicable
      ? this.calculatorService.getSurcharge('abholungFlyer', appPrices)
      : 0;

    const subTotalNetto = this.calculatorService.roundCurrency(
      distribution.total + expressZuschlagPrice + fahrzeugGpsPrice + flyerAbholungPrice +
      designPackageCost + printService.cost + verteilzuschlag.price
    );

    const taxRate = appPrices.tax["vat-ch"] || 0;
    const taxAmount = this.calculatorService.roundCurrency(subTotalNetto * taxRate);
    let grandTotalCalculated = this.calculatorService.roundCurrency(subTotalNetto + taxAmount);

    const mindestbestellwert = this.calculatorService.getSurcharge('mindestbestellwert', appPrices);
    let mindestbestellwertHinweis = '';
    if (verteilgebiet.totalFlyersCount > 0 && grandTotalCalculated < mindestbestellwert) {
      mindestbestellwertHinweis = `Der Mindestbestellwert von CHF ${mindestbestellwert.toFixed(2)} wurde nicht erreicht. Die Differenz wird aufgerechnet.`;
      grandTotalCalculated = mindestbestellwert;
    }

    return {
      selectedPlzEntriesLength: verteilgebiet.selectedPlzEntries.length,
      expressZuschlagApplicable,
      fahrzeugGpsApplicable,
      zuschlagFormatAnzeigeText: verteilzuschlag.anzeigeText,
      totalFlyersForDistribution: verteilgebiet.totalFlyersCount,
      flyerAbholungApplicable,
      subTotalDistribution: distribution.total,
      selectedPrintOption: produktion.printOption,
      selectedDesignPackageName,
      designPackageCost,
      subTotalNetto,
      taxRatePercent: taxRate * 100,
      taxAmount,
      grandTotalCalculated,
      mindestbestellwertHinweis,
      distributionCostItems: distribution.items,
      expressZuschlagPrice,
      fahrzeugGpsPrice,
      zuschlagFormatPrice: verteilzuschlag.price,
      isAnderesFormatSelected: verteilzuschlag.isAnderes,
      flyerAbholungPrice,
      printServiceName: printService.name,
      printServiceCost: printService.cost,
      mindestbestellwert
    };
  }

  private validateAllSteps(
    verteilgebiet: VerteilgebietDataState,
    produktion: ProduktionDataState,
    kontakt: KontaktDetailsState,
    kosten: KostenState
  ): StepValidationStatus {
    const isStep1Valid = verteilgebiet.selectedPlzEntries.length > 0 &&
      verteilgebiet.totalFlyersCount >= 0 &&
      !!verteilgebiet.verteilungStartdatum &&
      (!kosten.expressZuschlagApplicable || verteilgebiet.expressConfirmed);

    let isStep2Valid = false;
    const designSelected = produktion.designPackage !== null;
    const printSelected = produktion.printOption !== null;

    if (!designSelected && !printSelected) {
      isStep2Valid = true;
    } else {
      let designPartValid = true;
      if (designSelected && !produktion.designPackage) {
        designPartValid = false;
      }

      let printPartValid = true;
      if (printSelected) {
        if (produktion.printOption === 'anliefern' || produktion.printOption === 'eigenes') {
          printPartValid = !!produktion.anlieferDetails.format && !!produktion.anlieferDetails.anlieferung;
        } else if (produktion.printOption === 'service') {
          printPartValid = !!produktion.printServiceDetails.format &&
            !!produktion.printServiceDetails.grammatur &&
            !!produktion.printServiceDetails.art &&
            !!produktion.printServiceDetails.ausfuehrung &&
            (produktion.printServiceDetails.auflage ?? 0) > 0;
        } else printPartValid = produktion.printOption === null;
      }
      isStep2Valid = designPartValid && printPartValid;
    }

    const isStep3Valid = !!kontakt.salutation && !!kontakt.firstName && !!kontakt.lastName &&
      !!kontakt.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kontakt.email);

    return {
      isStep1Valid, isStep2Valid, isStep3Valid,
      isOrderProcessValid: isStep1Valid && isStep2Valid && isStep3Valid
    };
  }

  public updateVerteilungStartdatum(date: Date | null): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateVerteilungStartdatum called with:`, date);
    const current = this.stateParts.verteilgebiet.getValue();
    this.stateParts.verteilgebiet.next({ ...current, verteilungStartdatum: date });
  }

  public updateExpressConfirmed(confirmed: boolean): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateExpressConfirmed called with:`, confirmed);
    const current = this.stateParts.verteilgebiet.getValue();
    this.stateParts.verteilgebiet.next({ ...current, expressConfirmed: confirmed });
  }

  public updateZielgruppe(zielgruppe: ZielgruppeOption): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateZielgruppe called with:`, zielgruppe);
    const current = this.stateParts.verteilgebiet.getValue();
    if (current.zielgruppe !== zielgruppe) {
      this.stateParts.verteilgebiet.next({ ...current, zielgruppe: zielgruppe });
    }
  }

  public updateDesignPackage(pkg: DesignPackageType | null): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateDesignPackage called with:`, pkg);
    const current = this.stateParts.produktion.getValue();
    this.stateParts.produktion.next({ ...current, designPackage: pkg });
  }

  public updatePrintOption(option: PrintOptionType | null): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updatePrintOption called with:`, option);
    const current = this.stateParts.produktion.getValue();
    this.stateParts.produktion.next({ ...current, printOption: option });
  }

  public updateAnlieferDetails(details: Partial<AnlieferDetails>): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateAnlieferDetails called with:`, details);
    const current = this.stateParts.produktion.getValue();
    this.stateParts.produktion.next({ ...current, anlieferDetails: { ...current.anlieferDetails, ...details } });
  }

  public updatePrintServiceDetails(details: Partial<PrintServiceDetails>): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updatePrintServiceDetails called with:`, details);
    const current = this.stateParts.produktion.getValue();
    this.stateParts.produktion.next({ ...current, printServiceDetails: { ...current.printServiceDetails, ...details } });
  }

  public updateKontaktDetails(details: Partial<KontaktDetailsState>): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateKontaktDetails called with:`, details);
    const current = this.stateParts.kontaktDetails.getValue();
    this.stateParts.kontaktDetails.next({ ...current, ...details });
  }
}
