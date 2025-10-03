import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest} from 'rxjs';
import { map, shareReplay, filter, distinctUntilChanged, tap } from 'rxjs/operators';

import { CalculatorService } from './calculator.service';
import { SelectionService } from './selection.service';

const PRICES_JSON_PATH = 'assets/prices.json';

// --- START: Types from order-data.types.ts ---
export type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';
export type VerteilungTypOption = 'Nach PLZ' | 'Nach Perimeter';

// InternalPlzEntry is for the data coming from SelectionService
// It needs to be compatible for mapping to PlzSelectionDetail
export interface InternalPlzEntry {
  id: string;
  plz6: string;
  plz4: string;
  ort: string;
  kt: string;
  preisKategorie?: string;
  all?: number;
  mfh?: number;
  efh?: number;
  isSelected?: boolean;
  isHighlighted?: boolean;
  manual_flyer_count_mfh?: number | null;
  manual_flyer_count_efh?: number | null;
}

export interface PlzSelectionDetail {
  id: string;
  plz6: string;
  plz4: string;
  ort: string;
  kt: string;
  preisKategorie?: string;
  all?: number;
  mfh?: number;
  efh?: number;
  isSelected?: boolean;
  isHighlighted?: boolean;
  manual_flyer_count_mfh: number | null;
  manual_flyer_count_efh: number | null;
  selected_flyer_count_mfh: number;
  selected_flyer_count_efh: number;
  is_manual_count?: boolean;
  selected_display_flyer_count?: number;
  anzahl: number;
  zielgruppe: ZielgruppeOption;
}

export type DesignPackageType = 'basis' | 'plus' | 'premium' | 'eigenes' | null; // Added null for unselection state

export type PrintOptionType = 'eigenes' | 'service' | 'anliefern' | null;

export type FlyerFormatType =
  | 'A6' | 'A5' | 'A4' | 'DIN-Lang'
  | 'A3' | 'Anderes Format' | null;

export type AnlieferungType = 'selbstanlieferung' | 'abholung' | 'selbst' | null;

export type DruckArtType = 'einseitig' | 'zweiseitig' | null;

export type DruckGrammaturType =
  | '90' | '115' | '130' | '170' | '250' | '300'
  | null;

export type DruckAusfuehrungType = 'standard' | 'express' | 'glaenzend' | 'matt' | null;

export interface AnlieferDetails {
  format: FlyerFormatType | null;
  anlieferung: AnlieferungType | null;
}

export interface PrintServiceDetails {
  format: FlyerFormatType | null;
  grammatur: DruckGrammaturType | null;
  art: DruckArtType | null;
  ausfuehrung: DruckAusfuehrungType | null;
  auflage: number;
  reserve: number;
}

export interface VerteilgebietDataState {
  selectedPlzEntries: PlzSelectionDetail[];
  verteilungStartdatum: Date | null;
  expressConfirmed: boolean;
  totalFlyersCount: number;
  zielgruppe: ZielgruppeOption;
  verteilungTyp: VerteilungTypOption;
}

export interface ProduktionDataState {
  designPackage: DesignPackageType | null;
  printOption: PrintOptionType | null;
  anlieferDetails: AnlieferDetails;
  printServiceDetails: PrintServiceDetails;
  eigenesDesignPdfUploaded?: boolean;
}

export interface KontaktDetailsState {
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  zip?: string | null;
  city?: string | null;
  notes?: string | null;
}

export interface DistributionCostItem {
  plz: string;
  ort: string;
  flyers: number;
  price: number | string;
}

export interface KostenState {
  selectedPlzEntriesLength: number;
  expressZuschlagApplicable: boolean;
  fahrzeugGpsApplicable: boolean;
  zuschlagFormatAnzeigeText: string;
  totalFlyersForDistribution: number;
  flyerAbholungApplicable: boolean;
  subTotalDistribution: number | string;
  verteilungTotal: number | string;
  selectedPrintOption: PrintOptionType | null;
  selectedDesignPackageName: string;
  designPackageCost: number;
  subTotalNetto: number | string;
  taxRatePercent: number;
  taxAmount: number | string;
  grandTotalCalculated: number | string;
  mindestbestellwertHinweis: string;
  distributionHeadline: string;
  distributionCostItems: DistributionCostItem[];
  expressZuschlagPrice: number | string;
  fahrzeugGpsPrice: number;
  zuschlagFormatPrice: number | string;
  isAnderesFormatSelected: boolean;
  flyerAbholungPrice: number | string;
  ausgleichKleinauftragPrice: number | string;
  printServiceName: string;
  printServiceCost: number | string;
  mindestbestellwert: number;
  isPerimeterOfferte?: boolean;
}

// Explicitly define StepValidationStatus and AllOrderDataState from order-data.types.ts
export interface StepValidationStatus {
  isStep1Valid: boolean;
  isStep2Valid: boolean;
  isStep3Valid: boolean;
  isOrderProcessValid: boolean;
}

export interface AllOrderDataState {
  verteilgebiet: VerteilgebietDataState;
  produktion: ProduktionDataState;
  kontaktDetails: KontaktDetailsState;
  kosten: KostenState;
  validierungsStatus: StepValidationStatus;
}


// Types for AppPrices to be compatible with CalculatorService
export interface AppDesignPrices {
  basis: number;
  plus: number;
  premium: number;
  eigenes: number;
}
export interface AppVerteilungZuschlagFormatPrices {
  Lang: number;
  A4: number;
  A3: number;
}
export interface AppSurchargesPrices {
  mindestbestellwert: number;
  express: number;
  fahrzeugGPS: number;
  abholungFlyer: number;
}
export interface AppDistributionPrices {
  mfh: { [key: string]: number };
  efh: { [key: string]: number };
  verteilungZuschlagFormat: AppVerteilungZuschlagFormatPrices;
  surcharges: AppSurchargesPrices;
}
export interface AppPrices {
  design: AppDesignPrices;
  distribution: AppDistributionPrices;
  tax: {
    "vat-ch": number;
  };
}
// --- END: Types from order-data.types.ts ---

const initialVerteilgebietState: Omit<VerteilgebietDataState, 'selectedPlzEntries' | 'totalFlyersCount'> = {
  verteilungStartdatum: null,
  expressConfirmed: false,
  zielgruppe: 'Alle Haushalte',
  verteilungTyp: 'Nach PLZ'
};

const initialProduktionState: ProduktionDataState = {
  designPackage: null,
  printOption: null,
  anlieferDetails: { format: null, anlieferung: null },
  printServiceDetails: { format: null, grammatur: null, art: null, ausfuehrung: null, auflage: 0, reserve: 0 },
  eigenesDesignPdfUploaded: false
};

@Injectable({
  providedIn: 'root'
})
export class OrderDataService {

  public readonly verteilgebietStateSubject = new BehaviorSubject<Omit<VerteilgebietDataState, 'selectedPlzEntries' | 'totalFlyersCount'>>(initialVerteilgebietState);

  public readonly produktionStateSubject = new BehaviorSubject<ProduktionDataState>(initialProduktionState);

  private readonly kontaktDetailsSubject = new BehaviorSubject<KontaktDetailsState>({
    salutation: null, firstName: null, lastName: null, email: null, phone: null, company: null, address: null, zip: null, city: null, notes: null
  });

  public readonly verteilgebiet$: Observable<VerteilgebietDataState>;
  public readonly produktion$: Observable<ProduktionDataState> = this.produktionStateSubject.asObservable();
  public readonly kontaktDetails$: Observable<KontaktDetailsState> = this.kontaktDetailsSubject.asObservable();
  public readonly kosten$: Observable<KostenState>;
  public readonly validierungsStatus$: Observable<StepValidationStatus>; // Using the explicit StepValidationStatus
  public readonly state$: Observable<AllOrderDataState>; // Using the explicit AllOrderDataState

  constructor(
    private calculatorService: CalculatorService,
    private selectionService: SelectionService
  ) {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Constructor - Initializing...`);

    this.verteilgebiet$ = combineLatest([
      this.selectionService.selectedEntries$,
      this.verteilgebietStateSubject
    ]).pipe(
      map(([selectedPlzEntriesFromService, verteilgebietStateBase]) => {
        const typedSelectedEntries: PlzSelectionDetail[] = selectedPlzEntriesFromService.map((entry: InternalPlzEntry): PlzSelectionDetail => {
          const manualMfhForDetail: number | null = entry.manual_flyer_count_mfh ?? null;
          const manualEfhForDetail: number | null = entry.manual_flyer_count_efh ?? null;

          const selected_flyer_count_mfh = manualMfhForDetail !== null ? manualMfhForDetail : (entry.mfh ?? 0);
          const selected_flyer_count_efh = manualEfhForDetail !== null ? manualEfhForDetail : (entry.efh ?? 0);
          let anzahl = 0;
          switch (verteilgebietStateBase.zielgruppe) {
            case 'Alle Haushalte': anzahl = entry.all ?? 0; break;
            case 'Mehrfamilienhäuser': anzahl = selected_flyer_count_mfh; break;
            case 'Ein- und Zweifamilienhäuser': anzahl = selected_flyer_count_efh; break;
          }
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
            manual_flyer_count_mfh: manualMfhForDetail,
            manual_flyer_count_efh: manualEfhForDetail,
            selected_flyer_count_mfh,
            selected_flyer_count_efh,
            anzahl,
            zielgruppe: verteilgebietStateBase.zielgruppe,
            is_manual_count: (entry as any).is_manual_count,
            selected_display_flyer_count: (entry as any).selected_display_flyer_count,
          };
        });

        let totalFlyersCount = 0;
        if (verteilgebietStateBase.verteilungTyp === 'Nach PLZ') {
          totalFlyersCount = typedSelectedEntries.reduce((acc, curr) => acc + curr.anzahl, 0);
        }

        return {
          ...verteilgebietStateBase,
          selectedPlzEntries: typedSelectedEntries,
          totalFlyersCount,
        };
      }),
      shareReplay(1)
    );

    const kostenAndValidation$ = combineLatest([
      this.verteilgebiet$,
      this.produktion$,
      this.calculatorService.prices$.pipe(filter((p): p is AppPrices => !!p && typeof p === 'object' && Object.keys(p).length > 0))
    ]).pipe(
      map(([verteilgebiet, produktion, appPrices]) => {
        const kosten = this.calculateAllCosts(verteilgebiet, produktion, appPrices);
        // Step validation is now handled by components, so we just pass dummy values
        const validierung: StepValidationStatus = { isStep1Valid: false, isStep2Valid: false, isStep3Valid: false, isOrderProcessValid: false };
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

  public resetFormButKeepContactDetails(): void {
    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Resetting form but keeping contact details.`);
    this.verteilgebietStateSubject.next(initialVerteilgebietState);
    this.produktionStateSubject.next(initialProduktionState);
    this.selectionService.clearEntries();
  }

  public resetDesignAndPrintDetails(): void {
    const current = this.produktionStateSubject.getValue();
    this.produktionStateSubject.next({
      ...current,
      designPackage: null,
      printServiceDetails: {
        format: null,
        grammatur: null,
        art: null,
        ausfuehrung: null,
        auflage: 0,
        reserve: 0
      }
    });
  }

  public resetAnlieferDetails(): void {
    const current = this.produktionStateSubject.getValue();
    this.produktionStateSubject.next({
      ...current,
      anlieferDetails: {
        format: null,
        anlieferung: null
      }
    });
  }

  private calculateAllCosts(verteilgebiet: VerteilgebietDataState, produktion: ProduktionDataState, appPrices: AppPrices): KostenState {
    const isPerimeterOfferte = verteilgebiet.verteilungTyp === 'Nach Perimeter';
    const calcFormat = produktion.printOption === 'service' ? produktion.printServiceDetails.format : produktion.anlieferDetails.format;

    let distribution: { items: DistributionCostItem[]; total: number } = { items: [], total: 0 };
    let ausgleichKleinauftragPriceNum = 0;
    const mindestVerteilung = this.calculatorService.getSurcharge('mindestbestellwert', appPrices);
    let distributionHeadline = '';
    let mindestbestellwertHinweis = '';

    if (isPerimeterOfferte) {
      distributionHeadline = 'Verteilung nach Perimeter';
      distribution = { items: [], total: 0 };
      ausgleichKleinauftragPriceNum = 0;
    } else {
      if (verteilgebiet.selectedPlzEntries.length > 0 && verteilgebiet.totalFlyersCount > 0) {
        distribution = this.calculatorService.calculateDistributionCost(verteilgebiet.selectedPlzEntries, appPrices);
        distributionHeadline = `Verteilung ${verteilgebiet.zielgruppe}`;
        if (distribution.total > 0 && distribution.total < mindestVerteilung) {
          ausgleichKleinauftragPriceNum = this.calculatorService.roundCurrency(mindestVerteilung - distribution.total);
        }
      } else if (verteilgebiet.selectedPlzEntries.length > 0 && verteilgebiet.totalFlyersCount === 0) {
        distributionHeadline = `Verteilung ${verteilgebiet.zielgruppe}`;
        mindestbestellwertHinweis = 'Flyer Verteilung ist nicht möglich, da keine Flyer für die gewählte Zielgruppe in den PLZ anfallen.';
      } else {
        mindestbestellwertHinweis = 'Bitte wählen Sie mind. 1 PLZ aus.';
      }
    }

    const flyerAbholungSurchargeRelevantTerm: AnlieferungType = 'abholung';
    const flyerAbholungApplicable = produktion.anlieferDetails.anlieferung === flyerAbholungSurchargeRelevantTerm;

    let expressRelevantBase: number;
    if (!isPerimeterOfferte) {
      expressRelevantBase = distribution.total + ausgleichKleinauftragPriceNum;
    } else {
      expressRelevantBase = this.calculatorService.getSurcharge('fahrzeugGPS', appPrices) +
        (flyerAbholungApplicable ? 50 : 0);
    }
    const expressZuschlagApplicable = verteilgebiet.expressConfirmed && (isPerimeterOfferte || expressRelevantBase > 0);

    const expressZuschlagPriceNum = expressZuschlagApplicable && expressRelevantBase > 0
      ? this.calculatorService.roundCurrency(expressRelevantBase * this.calculatorService.getSurcharge('express', appPrices))
      : 0;

    const fahrzeugGpsApplicable = true;
    const fahrzeugGpsPriceNum = fahrzeugGpsApplicable ? this.calculatorService.getSurcharge('fahrzeugGPS', appPrices) : 0;

    let flyerAbholungPriceNum = 0;
    if (flyerAbholungApplicable) {
      if (isPerimeterOfferte) {
        flyerAbholungPriceNum = 50;
      } else {
        flyerAbholungPriceNum = this.calculatorService.getSurcharge('abholungFlyer', appPrices);
      }
    }

    let verteilzuschlag = { price: 0, anzeigeText: '', isAnderes: false, key: null as any };
    if (calcFormat) {
      if (!isPerimeterOfferte && verteilgebiet.totalFlyersCount > 0) {
        verteilzuschlag = this.calculatorService.calculateVerteilzuschlag(calcFormat, verteilgebiet.totalFlyersCount, appPrices);
      } else if (isPerimeterOfferte) {
        const tempVerteilzuschlag = this.calculatorService.calculateVerteilzuschlag(calcFormat, 1, appPrices);
        verteilzuschlag.isAnderes = tempVerteilzuschlag.isAnderes;
        if (tempVerteilzuschlag.isAnderes) {
          verteilzuschlag.anzeigeText = "Formatzuschlag für Sonderformat (auf Anfrage)";
        } else if (tempVerteilzuschlag.price > 0 || tempVerteilzuschlag.key !== null) {
          verteilzuschlag.anzeigeText = tempVerteilzuschlag.anzeigeText.replace(/\+ CHF .* \/ 1'000 Flyer/, "(auf Anfrage)");
          if (!verteilzuschlag.anzeigeText && tempVerteilzuschlag.key) {
            if (tempVerteilzuschlag.key === 'Lang') verteilzuschlag.anzeigeText = 'Formatzuschlag DIN Lang (auf Anfrage)';
            else if (tempVerteilzuschlag.key === 'A4') verteilzuschlag.anzeigeText = 'Formatzuschlag A4 (auf Anfrage)';
            else if (tempVerteilzuschlag.key === 'A3') verteilzuschlag.anzeigeText = 'Formatzuschlag A3 (auf Anfrage)';
          }
        }
        verteilzuschlag.price = 0;
      }
    }
    const verteilzuschlagPriceNum = isPerimeterOfferte ? 0 : verteilzuschlag.price;

    const subTotalDistributionNum = this.calculatorService.roundCurrency(
      (isPerimeterOfferte ? 0 : distribution.total) +
      (isPerimeterOfferte ? 0 : ausgleichKleinauftragPriceNum) +
      expressZuschlagPriceNum +
      fahrzeugGpsPriceNum +
      flyerAbholungPriceNum +
      verteilzuschlagPriceNum
    );

    const designPackageCostNum = this.calculatorService.calculateDesignPackagePrice(produktion.designPackage, appPrices.design);
    const selectedDesignPackageName = this.calculatorService.getDesignPackageName(produktion.designPackage, designPackageCostNum);

    let printService: { name: string, cost: number | string } = { name: 'Kein Druckservice', cost: 0 };
    if (produktion.printOption === 'service') {
      const calculatedPrintService = this.calculatorService.calculatePrintServiceCost(produktion.printServiceDetails);
      printService.name = calculatedPrintService.name;
      printService.cost = calculatedPrintService.cost;

      if (isPerimeterOfferte) {
        printService.name = produktion.printServiceDetails.format
          ? `Druckservice (${produktion.printServiceDetails.format}, Details nach KML)`
          : `Druckservice (Details nach KML)`;
        printService.cost = "auf Anfrage";
      }
    }

    const numericPrintServiceCost = typeof printService.cost === 'number' ? printService.cost : 0;
    const subTotalNettoNum = this.calculatorService.roundCurrency(subTotalDistributionNum + designPackageCostNum + numericPrintServiceCost);
    const taxRate = appPrices.tax["vat-ch"] || 0;
    const taxAmountNum = this.calculatorService.roundCurrency(subTotalNettoNum * taxRate);
    const grandTotalCalculatedNum = this.calculatorService.roundTo5Rappen(subTotalNettoNum + taxAmountNum);

    return {
      selectedPlzEntriesLength: verteilgebiet.selectedPlzEntries.length,
      expressZuschlagApplicable,
      fahrzeugGpsApplicable,
      zuschlagFormatAnzeigeText: verteilzuschlag.anzeigeText,
      totalFlyersForDistribution: verteilgebiet.totalFlyersCount,
      flyerAbholungApplicable,
      subTotalDistribution: isPerimeterOfferte && subTotalDistributionNum === 0 && (distribution.total === 0 || typeof distribution.total === 'string') ? "auf Anfrage" : subTotalDistributionNum,
      verteilungTotal: isPerimeterOfferte && distribution.total === 0 ? "auf Anfrage" : distribution.total,
      selectedPrintOption: produktion.printOption,
      selectedDesignPackageName,
      designPackageCost: designPackageCostNum,
      subTotalNetto: isPerimeterOfferte && subTotalNettoNum === 0 && numericPrintServiceCost === 0 && designPackageCostNum === 0 && subTotalDistributionNum === 0 ? "auf Anfrage" : subTotalNettoNum,
      taxRatePercent: taxRate * 100,
      taxAmount: isPerimeterOfferte && taxAmountNum === 0 && subTotalNettoNum === 0 ? "auf Anfrage" : taxAmountNum,
      grandTotalCalculated: isPerimeterOfferte && grandTotalCalculatedNum === 0 && subTotalNettoNum === 0 ? "auf Anfrage" : grandTotalCalculatedNum,
      mindestbestellwertHinweis,
      distributionHeadline,
      distributionCostItems: distribution.items,
      expressZuschlagPrice: expressZuschlagPriceNum,
      fahrzeugGpsPrice: fahrzeugGpsPriceNum,
      zuschlagFormatPrice: isPerimeterOfferte && verteilzuschlagPriceNum === 0 && verteilzuschlag.isAnderes ? "auf Anfrage" : verteilzuschlagPriceNum,
      isAnderesFormatSelected: verteilzuschlag.isAnderes,
      flyerAbholungPrice: flyerAbholungPriceNum,
      ausgleichKleinauftragPrice: ausgleichKleinauftragPriceNum,
      printServiceName: printService.name,
      printServiceCost: printService.cost,
      mindestbestellwert: mindestVerteilung + fahrzeugGpsPriceNum,
      isPerimeterOfferte: isPerimeterOfferte,
    };
  }

  private validateAllSteps(verteilgebiet: VerteilgebietDataState, produktion: ProduktionDataState, kontakt: KontaktDetailsState, kosten: KostenState): StepValidationStatus {
    let isStep1Valid = false;
    const isDateOk = !!verteilgebiet.verteilungStartdatum;
    const expressZuschlagIsNumericAndPositive = typeof kosten.expressZuschlagPrice === 'number' && kosten.expressZuschlagPrice > 0;
    const isExpressOk = expressZuschlagIsNumericAndPositive ? verteilgebiet.expressConfirmed : true;

    if (verteilgebiet.verteilungTyp === 'Nach PLZ') {
      isStep1Valid = verteilgebiet.selectedPlzEntries.length > 0 && verteilgebiet.totalFlyersCount > 0 && isDateOk && isExpressOk;
    } else { // Nach Perimeter
      isStep1Valid = isDateOk && isExpressOk;
    }

    const isStep3Valid = !!kontakt.salutation && !!kontakt.firstName && !!kontakt.lastName && !!kontakt.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kontakt.email);

    // isStep2Valid is now handled by the component itself, so we don't calculate it here.
    // We pass a dummy value which will be ignored by the OfferProcessComponent.
    return { isStep1Valid, isStep2Valid: false, isStep3Valid, isOrderProcessValid: isStep1Valid && isStep3Valid };
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

  public updateVerteilungTyp(typ: VerteilungTypOption): void {
    const current = this.verteilgebietStateSubject.getValue();
    if (current.verteilungTyp !== typ) {
      this.verteilgebietStateSubject.next({ ...current, verteilungTyp: typ });
    }
  }

  public updateDesignPackage(pkg: DesignPackageType | null): void {
    const current = this.produktionStateSubject.getValue();
    const newState: ProduktionDataState = { ...current, designPackage: pkg }; // Ensure newState is ProduktionDataState
    this.produktionStateSubject.next(newState);
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

  public updateEigenesDesignPdfStatus(uploaded: boolean): void {
    const current = this.produktionStateSubject.getValue();
    // Ensure type compatibility if eigenesDesignPdfUploaded is optional
    const newState: ProduktionDataState = { ...current, eigenesDesignPdfUploaded: uploaded };
    if (current.eigenesDesignPdfUploaded !== uploaded) {
      this.produktionStateSubject.next(newState);
    } else {
      this.produktionStateSubject.next(current); // Emit current if no change to avoid issues with distinctUntilChanged
    }
  }
}
