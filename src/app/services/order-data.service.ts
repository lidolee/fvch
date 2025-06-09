import { Injectable } from '@angular/core';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged, tap, shareReplay, filter } from 'rxjs/operators';
import {
  AllOrderDataState, VerteilgebietDataState, ProduktionDataState, KontaktDetailsState,
  KostenState, StepValidationStatus, DesignPackageType, PrintOptionType,
  AnlieferDetails, PrintServiceDetails, PlzSelectionDetail, ZielgruppeOption
} from './order-data.types';
import { CalculatorService, AppPrices } from './calculator.service';
import { SelectionService } from './selection.service';
import { PlzEntry } from './plz-data.service';

@Injectable({
  providedIn: 'root'
})
export class OrderDataService {

  private initialKostenState: KostenState = {
    selectedPlzEntriesLength: 0,
    expressZuschlagApplicable: false, fahrzeugGpsApplicable: true, zuschlagFormatAnzeigeText: '',
    totalFlyersForDistribution: 0, flyerAbholungApplicable: false, subTotalDistribution: 0,
    verteilungTotal: 0, selectedPrintOption: null, selectedDesignPackageName: 'Kein Designpaket', designPackageCost: 0,
    subTotalNetto: 0, taxRatePercent: 0, taxAmount: 0, grandTotalCalculated: 0,
    mindestbestellwertHinweis: '', distributionHeadline: '', distributionCostItems: [], expressZuschlagPrice: 0,
    fahrzeugGpsPrice: 0, zuschlagFormatPrice: 0, isAnderesFormatSelected: false,
    flyerAbholungPrice: 0, ausgleichKleinauftragPrice: 0, printServiceName: 'Kein Druckservice', printServiceCost: 0,
    mindestbestellwert: 0
  };

  private readonly verteilgebietStateSubject = new BehaviorSubject<Omit<VerteilgebietDataState, 'selectedPlzEntries' | 'totalFlyersCount'>>({
    verteilungStartdatum: null,
    expressConfirmed: false,
    zielgruppe: 'Alle Haushalte'
  });

  private readonly produktionStateSubject = new BehaviorSubject<ProduktionDataState>({
    designPackage: null,
    printOption: null,
    anlieferDetails: { format: null, anlieferung: null },
    printServiceDetails: { format: null, grammatur: null, art: null, ausfuehrung: null, auflage: 0, reserve: 0 }
  });

  private readonly kontaktDetailsSubject = new BehaviorSubject<KontaktDetailsState>({
    salutation: null, firstName: null, lastName: null, email: null, phone: null, company: null, address: null, zip: null, city: null, notes: null
  });

  public readonly verteilgebiet$: Observable<VerteilgebietDataState>;
  public readonly produktion$: Observable<ProduktionDataState> = this.produktionStateSubject.asObservable();
  public readonly kontaktDetails$: Observable<KontaktDetailsState> = this.kontaktDetailsSubject.asObservable();
  public readonly kosten$: Observable<KostenState>;
  public readonly validierungsStatus$: Observable<StepValidationStatus>;
  public readonly state$: Observable<AllOrderDataState>;

  constructor(
    private calculatorService: CalculatorService,
    private selectionService: SelectionService
  ) {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Constructor - Initializing...`);

    this.verteilgebiet$ = combineLatest([
      this.selectionService.selectedEntries$,
      this.verteilgebietStateSubject
    ]).pipe(
      map(([selectedPlzEntries, verteilgebietState]) => {
        const typedSelectedEntries: PlzSelectionDetail[] = selectedPlzEntries.map((entry: PlzEntry) => {
          const manualMfh = entry.manual_flyer_count_mfh ?? null;
          const manualEfh = entry.manual_flyer_count_efh ?? null;
          const selected_flyer_count_mfh = manualMfh !== null ? manualMfh : (entry.mfh ?? 0);
          const selected_flyer_count_efh = manualEfh !== null ? manualEfh : (entry.efh ?? 0);
          let anzahl = 0;
          switch (verteilgebietState.zielgruppe) {
            case 'Alle Haushalte': anzahl = entry.all ?? 0; break;
            case 'Mehrfamilienhäuser': anzahl = selected_flyer_count_mfh; break;
            case 'Ein- und Zweifamilienhäuser': anzahl = selected_flyer_count_efh; break;
          }
          return { ...entry, manual_flyer_count_mfh: manualMfh, manual_flyer_count_efh: manualEfh, selected_flyer_count_mfh, selected_flyer_count_efh, anzahl, zielgruppe: verteilgebietState.zielgruppe };
        });
        const totalFlyersCount = typedSelectedEntries.reduce((acc, curr) => acc + curr.anzahl, 0);
        return {
          ...verteilgebietState,
          selectedPlzEntries: typedSelectedEntries,
          totalFlyersCount,
        };
      }),
      shareReplay(1)
    );

    const kostenAndValidation$ = combineLatest([
      this.verteilgebiet$,
      this.produktion$,
      this.calculatorService.prices$.pipe(filter((p): p is AppPrices => !!p))
    ]).pipe(
      map(([verteilgebiet, produktion, appPrices]) => {
        const kosten = this.calculateAllCosts(verteilgebiet, produktion, appPrices);
        const validierung = this.validateAllSteps(verteilgebiet, produktion, this.kontaktDetailsSubject.getValue(), kosten);
        return { kosten, validierung };
      }),
      shareReplay(1)
    );

    this.kosten$ = kostenAndValidation$.pipe(map(r => r.kosten), distinctUntilChanged((p, c) => JSON.stringify(p) === JSON.stringify(c)));
    this.validierungsStatus$ = kostenAndValidation$.pipe(map(r => r.validierung), distinctUntilChanged((p, c) => JSON.stringify(p) === JSON.stringify(c)));

    this.state$ = combineLatest({
      verteilgebiet: this.verteilgebiet$,
      produktion: this.produktion$,
      kontaktDetails: this.kontaktDetails$,
      kosten: this.kosten$,
      validierungsStatus: this.validierungsStatus$,
    }).pipe(
      tap(newState => console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Global state$ emitting...`)),
      shareReplay(1)
    );

    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Constructor - Initialization complete.`);
  }

  private getCurrentTimestamp(): string { return new Date().toISOString(); }

  private calculateAllCosts(verteilgebiet: VerteilgebietDataState, produktion: ProduktionDataState, appPrices: AppPrices): KostenState {
    const calcFormat = produktion.printOption === 'service' ? produktion.printServiceDetails.format : produktion.anlieferDetails.format;
    const distribution = this.calculatorService.calculateDistributionCost(verteilgebiet.selectedPlzEntries, appPrices);
    const mindestVerteilung = this.calculatorService.getSurcharge('mindestbestellwert', appPrices);
    let ausgleichKleinauftragPrice = 0;
    if (distribution.total > 0 && distribution.total < mindestVerteilung) {
      ausgleichKleinauftragPrice = this.calculatorService.roundCurrency(mindestVerteilung - distribution.total);
    }
    const expressZuschlagApplicable = verteilgebiet.expressConfirmed && distribution.total > 0;
    const expressZuschlagPrice = expressZuschlagApplicable ? this.calculatorService.roundCurrency((distribution.total + ausgleichKleinauftragPrice) * this.calculatorService.getSurcharge('express', appPrices)) : 0;
    const fahrzeugGpsApplicable = true;
    const fahrzeugGpsPrice = fahrzeugGpsApplicable ? this.calculatorService.getSurcharge('fahrzeugGPS', appPrices) : 0;
    const flyerAbholungApplicable = produktion.anlieferDetails.anlieferung === 'abholung';
    const flyerAbholungPrice = flyerAbholungApplicable ? this.calculatorService.getSurcharge('abholungFlyer', appPrices) : 0;
    const verteilzuschlag = this.calculatorService.calculateVerteilzuschlag(calcFormat, verteilgebiet.totalFlyersCount, appPrices);
    const subTotalDistribution = this.calculatorService.roundCurrency(distribution.total + ausgleichKleinauftragPrice + expressZuschlagPrice + fahrzeugGpsPrice + flyerAbholungPrice + verteilzuschlag.price);
    const designPackageCost = this.calculatorService.calculateDesignPackagePrice(produktion.designPackage, appPrices.design);
    const selectedDesignPackageName = this.calculatorService.getDesignPackageName(produktion.designPackage, designPackageCost);
    const printService = this.calculatorService.calculatePrintServiceCost(produktion.printServiceDetails);
    const subTotalNetto = this.calculatorService.roundCurrency(subTotalDistribution + designPackageCost + printService.cost);
    const taxRate = appPrices.tax["vat-ch"] || 0;
    const taxAmount = this.calculatorService.roundCurrency(subTotalNetto * taxRate);
    const grandTotalCalculated = this.calculatorService.roundCurrency(subTotalNetto + taxAmount);
    let distributionHeadline = '';
    if (distribution.items.length > 0) {
      switch (verteilgebiet.zielgruppe) {
        case 'Alle Haushalte': distributionHeadline = 'Verteilung Alle Haushalte'; break;
        case 'Mehrfamilienhäuser': distributionHeadline = 'Verteilung Mehrfamilienhäuser'; break;
        case 'Ein- und Zweifamilienhäuser': distributionHeadline = 'Verteilung Ein- und Zweifamilienhäuser'; break;
      }
    }
    return {
      selectedPlzEntriesLength: verteilgebiet.selectedPlzEntries.length, expressZuschlagApplicable, fahrzeugGpsApplicable,
      zuschlagFormatAnzeigeText: verteilzuschlag.anzeigeText, totalFlyersForDistribution: verteilgebiet.totalFlyersCount,
      flyerAbholungApplicable, subTotalDistribution, verteilungTotal: distribution.total, selectedPrintOption: produktion.printOption, selectedDesignPackageName,
      designPackageCost, subTotalNetto, taxRatePercent: taxRate * 100, taxAmount, grandTotalCalculated, mindestbestellwertHinweis: '',
      distributionHeadline, distributionCostItems: distribution.items, expressZuschlagPrice, fahrzeugGpsPrice,
      zuschlagFormatPrice: verteilzuschlag.price, isAnderesFormatSelected: verteilzuschlag.isAnderes, flyerAbholungPrice,
      ausgleichKleinauftragPrice, printServiceName: printService.name, printServiceCost: printService.cost,
      mindestbestellwert: mindestVerteilung + fahrzeugGpsPrice
    };
  }

  private validateAllSteps(verteilgebiet: VerteilgebietDataState, produktion: ProduktionDataState, kontakt: KontaktDetailsState, kosten: KostenState): StepValidationStatus {
    const isStep1Valid = verteilgebiet.selectedPlzEntries.length > 0 && verteilgebiet.totalFlyersCount > 0 && !!verteilgebiet.verteilungStartdatum && (!kosten.expressZuschlagApplicable || verteilgebiet.expressConfirmed);
    let isStep2Valid = false;
    const designSelected = produktion.designPackage !== null;
    const printSelected = produktion.printOption !== null;
    if (!designSelected && !printSelected) {
      isStep2Valid = true;
    } else {
      let designPartValid = !designSelected || !!produktion.designPackage;
      let printPartValid = true;
      if (printSelected) {
        if (produktion.printOption === 'anliefern' || produktion.printOption === 'eigenes') {
          printPartValid = !!produktion.anlieferDetails.format && !!produktion.anlieferDetails.anlieferung;
        } else if (produktion.printOption === 'service') {
          printPartValid = !!produktion.printServiceDetails.format && !!produktion.printServiceDetails.grammatur && !!produktion.printServiceDetails.art && !!produktion.printServiceDetails.ausfuehrung && (produktion.printServiceDetails.auflage ?? 0) > 0;
        } else {
          printPartValid = produktion.printOption === null;
        }
      }
      isStep2Valid = designPartValid && printPartValid;
    }
    const isStep3Valid = !!kontakt.salutation && !!kontakt.firstName && !!kontakt.lastName && !!kontakt.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kontakt.email);
    return { isStep1Valid, isStep2Valid, isStep3Valid, isOrderProcessValid: isStep1Valid && isStep2Valid && isStep3Valid };
  }

  public updateVerteilungStartdatum(date: Date | null): void {
    const current = this.verteilgebietStateSubject.getValue();
    this.verteilgebietStateSubject.next({ ...current, verteilungStartdatum: date, expressConfirmed: false });
  }

  public updateExpressConfirmed(confirmed: boolean): void {
    const current = this.verteilgebietStateSubject.getValue();
    this.verteilgebietStateSubject.next({ ...current, expressConfirmed: confirmed });
  }

  public updateZielgruppe(zielgruppe: ZielgruppeOption): void {
    const current = this.verteilgebietStateSubject.getValue();
    if (current.zielgruppe !== zielgruppe) {
      this.verteilgebietStateSubject.next({ ...current, zielgruppe: zielgruppe });
    }
  }

  public updateDesignPackage(pkg: DesignPackageType | null): void {
    const current = this.produktionStateSubject.getValue();
    this.produktionStateSubject.next({ ...current, designPackage: pkg });
  }

  public updatePrintOption(option: PrintOptionType | null): void {
    const current = this.produktionStateSubject.getValue();
    this.produktionStateSubject.next({ ...current, printOption: option });
  }

  public updateAnlieferDetails(details: Partial<AnlieferDetails>): void {
    const current = this.produktionStateSubject.getValue();
    this.produktionStateSubject.next({ ...current, anlieferDetails: { ...current.anlieferDetails, ...details } });
  }

  public updatePrintServiceDetails(details: Partial<PrintServiceDetails>): void {
    const current = this.produktionStateSubject.getValue();
    this.produktionStateSubject.next({ ...current, printServiceDetails: { ...current.printServiceDetails, ...details } });
  }

  public updateKontaktDetails(details: Partial<KontaktDetailsState>): void {
    const current = this.kontaktDetailsSubject.getValue();
    this.kontaktDetailsSubject.next({ ...current, ...details });
  }
}
