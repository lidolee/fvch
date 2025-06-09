import { Injectable } from '@angular/core';
import { Observable, combineLatest, ReplaySubject, firstValueFrom } from 'rxjs';
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
    mindestbestellwertHinweis: '', distributionHeadline: '', distributionCostItems: [], expressZuschlagPrice: 0,
    fahrzeugGpsPrice: 0, zuschlagFormatPrice: 0, isAnderesFormatSelected: false,
    flyerAbholungPrice: 0, ausgleichKleinauftragPrice: 0, printServiceName: 'Kein Druckservice', printServiceCost: 0,
    mindestbestellwert: 0
  };

  private initialValidierungsStatus: StepValidationStatus = {
    isStep1Valid: false, isStep2Valid: false, isStep3Valid: false, isOrderProcessValid: false
  };

  private readonly verteilgebietSubject = new ReplaySubject<VerteilgebietDataState>(1);
  private readonly produktionSubject = new ReplaySubject<ProduktionDataState>(1);
  private readonly kontaktDetailsSubject = new ReplaySubject<KontaktDetailsState>(1);

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

    this.verteilgebietSubject.next(this.initialVerteilgebietState);
    this.produktionSubject.next(this.initialProduktionState);
    this.kontaktDetailsSubject.next(this.initialKontaktDetailsState);

    const verteilgebietTransformed$ = combineLatest([
      this.selectionService.selectedEntries$,
      this.verteilgebietSubject.pipe(map(v => v.zielgruppe), distinctUntilChanged()),
      this.verteilgebietSubject.pipe(map(v => v.verteilungStartdatum), distinctUntilChanged()),
      this.verteilgebietSubject.pipe(map(v => v.expressConfirmed), distinctUntilChanged())
    ]).pipe(
      map(([selectedPlzEntriesFromService, zielgruppe, verteilungStartdatum, expressConfirmed]) => {
        console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Re-calculating Verteilgebiet state. Zielgruppe: ${zielgruppe}`);

        const typedSelectedEntries: PlzSelectionDetail[] = selectedPlzEntriesFromService.map((entry: PlzEntry) => {
          const manualMfh = entry.manual_flyer_count_mfh ?? null;
          const manualEfh = entry.manual_flyer_count_efh ?? null;
          const selected_flyer_count_mfh = manualMfh !== null ? manualMfh : (entry.mfh ?? 0);
          const selected_flyer_count_efh = manualEfh !== null ? manualEfh : (entry.efh ?? 0);

          let anzahl = 0;
          switch (zielgruppe) {
            case 'Alle Haushalte': anzahl = entry.all ?? 0; break;
            case 'Mehrfamilienhäuser': anzahl = selected_flyer_count_mfh; break;
            case 'Ein- und Zweifamilienhäuser': anzahl = selected_flyer_count_efh; break;
          }

          return {
            ...entry,
            manual_flyer_count_mfh: manualMfh,
            manual_flyer_count_efh: manualEfh,
            selected_flyer_count_mfh,
            selected_flyer_count_efh,
            anzahl,
            zielgruppe,
          };
        });

        const totalFlyersCount = typedSelectedEntries.reduce((acc, curr) => acc + curr.anzahl, 0);

        return {
          selectedPlzEntries: typedSelectedEntries,
          verteilungStartdatum,
          expressConfirmed,
          totalFlyersCount,
          zielgruppe
        };
      }),
      shareReplay(1)
    );

    const kostenAndValidation$ = combineLatest([
      verteilgebietTransformed$,
      this.produktionSubject,
      this.calculatorService.prices$.pipe(filter((p): p is AppPrices => !!p))
    ]).pipe(
      map(([verteilgebiet, produktion, appPrices]) => {
        const newKosten = this.calculateAllCosts(verteilgebiet, produktion, appPrices);
        return { verteilgebiet, produktion, kosten: newKosten };
      }),
      shareReplay(1)
    );

    this.verteilgebiet$ = verteilgebietTransformed$;
    this.produktion$ = this.produktionSubject.asObservable();
    this.kontaktDetails$ = this.kontaktDetailsSubject.asObservable();
    this.kosten$ = kostenAndValidation$.pipe(map(r => r.kosten));

    this.validierungsStatus$ = combineLatest([
      kostenAndValidation$,
      this.kontaktDetails$
    ]).pipe(
      map(([{ verteilgebiet, produktion, kosten }, kontaktDetails]) => {
        return this.validateAllSteps(verteilgebiet, produktion, kontaktDetails, kosten);
      })
    );

    this.state$ = combineLatest({
      verteilgebiet: this.verteilgebiet$,
      produktion: this.produktion$,
      kontaktDetails: this.kontaktDetails$,
      kosten: this.kosten$,
      validierungsStatus: this.validierungsStatus$,
    }).pipe(
      tap(newState => console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Global state$ emitting:`, JSON.parse(JSON.stringify(newState)))),
      shareReplay(1)
    );

    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Constructor - Initialization complete.`);
  }

  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  private async getCurrentState<T>(subject: ReplaySubject<T>): Promise<T> {
    return await firstValueFrom(subject);
  }

  private calculateAllCosts(
    verteilgebiet: VerteilgebietDataState,
    produktion: ProduktionDataState,
    appPrices: AppPrices
  ): KostenState {
    const calcFormat = produktion.printOption === 'service'
      ? produktion.printServiceDetails.format
      : produktion.anlieferDetails.format;

    // Core distribution costs
    const distribution = this.calculatorService.calculateDistributionCost(verteilgebiet.selectedPlzEntries, appPrices);
    const mindestVerteilung = this.calculatorService.getSurcharge('mindestbestellwert', appPrices);

    let ausgleichKleinauftragPrice = 0;
    if (distribution.total > 0 && distribution.total < mindestVerteilung) {
      ausgleichKleinauftragPrice = this.calculatorService.roundCurrency(mindestVerteilung - distribution.total);
    }

    const expressZuschlagApplicable = verteilgebiet.expressConfirmed && distribution.total > 0;
    const expressZuschlagPrice = expressZuschlagApplicable
      ? this.calculatorService.roundCurrency((distribution.total + ausgleichKleinauftragPrice) * this.calculatorService.getSurcharge('express', appPrices))
      : 0;

    const fahrzeugGpsApplicable = true;
    const fahrzeugGpsPrice = fahrzeugGpsApplicable ? this.calculatorService.getSurcharge('fahrzeugGPS', appPrices) : 0;

    const flyerAbholungApplicable = produktion.anlieferDetails.anlieferung === 'abholung';
    const flyerAbholungPrice = flyerAbholungApplicable ? this.calculatorService.getSurcharge('abholungFlyer', appPrices) : 0;

    const verteilzuschlag = this.calculatorService.calculateVerteilzuschlag(calcFormat, verteilgebiet.totalFlyersCount, appPrices);

    // Totals for distribution group
    const subTotalDistribution = this.calculatorService.roundCurrency(
      distribution.total +
      ausgleichKleinauftragPrice +
      expressZuschlagPrice +
      fahrzeugGpsPrice +
      flyerAbholungPrice +
      verteilzuschlag.price
    );

    // Production costs
    const designPackageCost = this.calculatorService.calculateDesignPackagePrice(produktion.designPackage, appPrices.design);
    const selectedDesignPackageName = this.calculatorService.getDesignPackageName(produktion.designPackage, designPackageCost);
    const printService = this.calculatorService.calculatePrintServiceCost(produktion.printServiceDetails);

    // Final totals
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
      selectedPlzEntriesLength: verteilgebiet.selectedPlzEntries.length,
      expressZuschlagApplicable,
      fahrzeugGpsApplicable,
      zuschlagFormatAnzeigeText: verteilzuschlag.anzeigeText,
      totalFlyersForDistribution: verteilgebiet.totalFlyersCount,
      flyerAbholungApplicable,
      subTotalDistribution,
      selectedPrintOption: produktion.printOption,
      selectedDesignPackageName,
      designPackageCost,
      subTotalNetto,
      taxRatePercent: taxRate * 100,
      taxAmount,
      grandTotalCalculated,
      mindestbestellwertHinweis: '',
      distributionHeadline,
      distributionCostItems: distribution.items,
      expressZuschlagPrice,
      fahrzeugGpsPrice,
      zuschlagFormatPrice: verteilzuschlag.price,
      isAnderesFormatSelected: verteilzuschlag.isAnderes,
      flyerAbholungPrice,
      ausgleichKleinauftragPrice,
      printServiceName: printService.name,
      printServiceCost: printService.cost,
      mindestbestellwert: mindestVerteilung + fahrzeugGpsPrice
    };
  }

  private validateAllSteps(
    verteilgebiet: VerteilgebietDataState,
    produktion: ProduktionDataState,
    kontakt: KontaktDetailsState,
    kosten: KostenState
  ): StepValidationStatus {
    const isStep1Valid = verteilgebiet.selectedPlzEntries.length > 0 &&
      verteilgebiet.totalFlyersCount > 0 &&
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

  public async updateVerteilungStartdatum(date: Date | null): Promise<void> {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateVerteilungStartdatum called with:`, date);
    const current = await this.getCurrentState(this.verteilgebietSubject);
    this.verteilgebietSubject.next({ ...current, verteilungStartdatum: date });
  }

  public async updateExpressConfirmed(confirmed: boolean): Promise<void> {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateExpressConfirmed called with:`, confirmed);
    const current = await this.getCurrentState(this.verteilgebietSubject);
    this.verteilgebietSubject.next({ ...current, expressConfirmed: confirmed });
  }

  public async updateZielgruppe(zielgruppe: ZielgruppeOption): Promise<void> {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateZielgruppe called with:`, zielgruppe);
    const current = await this.getCurrentState(this.verteilgebietSubject);
    if (current.zielgruppe !== zielgruppe) {
      this.verteilgebietSubject.next({ ...current, zielgruppe: zielgruppe });
    }
  }

  public async updateDesignPackage(pkg: DesignPackageType | null): Promise<void> {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateDesignPackage called with:`, pkg);
    const current = await this.getCurrentState(this.produktionSubject);
    this.produktionSubject.next({ ...current, designPackage: pkg });
  }

  public async updatePrintOption(option: PrintOptionType | null): Promise<void> {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updatePrintOption called with:`, option);
    const current = await this.getCurrentState(this.produktionSubject);
    this.produktionSubject.next({ ...current, printOption: option });
  }

  public async updateAnlieferDetails(details: Partial<AnlieferDetails>): Promise<void> {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateAnlieferDetails called with:`, details);
    const current = await this.getCurrentState(this.produktionSubject);
    this.produktionSubject.next({ ...current, anlieferDetails: { ...current.anlieferDetails, ...details } });
  }

  public async updatePrintServiceDetails(details: Partial<PrintServiceDetails>): Promise<void> {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updatePrintServiceDetails called with:`, details);
    const current = await this.getCurrentState(this.produktionSubject);
    this.produktionSubject.next({ ...current, printServiceDetails: { ...current.printServiceDetails, ...details } });
  }

  public async updateKontaktDetails(details: Partial<KontaktDetailsState>): Promise<void> {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] updateKontaktDetails called with:`, details);
    const current = await this.getCurrentState(this.kontaktDetailsSubject);
    this.kontaktDetailsSubject.next({ ...current, ...details });
  }
}
