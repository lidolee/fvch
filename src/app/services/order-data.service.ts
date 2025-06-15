import { Injectable } from '@angular/core';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged, tap, shareReplay, filter } from 'rxjs/operators';
import {
  AllOrderDataState, VerteilgebietDataState, ProduktionDataState, KontaktDetailsState,
  KostenState, StepValidationStatus, DesignPackageType, PrintOptionType,
  AnlieferDetails, PrintServiceDetails, PlzSelectionDetail, ZielgruppeOption,
  VerteilungTypOption, DistributionCostItem
} from './order-data.types';
import { CalculatorService, AppPrices } from './calculator.service';
import { SelectionService } from './selection.service';
import { PlzEntry } from './plz-data.service';

@Injectable({
  providedIn: 'root'
})
export class OrderDataService {

  public readonly verteilgebietStateSubject = new BehaviorSubject<Omit<VerteilgebietDataState, 'selectedPlzEntries' | 'totalFlyersCount'>>({
    verteilungStartdatum: null,
    expressConfirmed: false,
    zielgruppe: 'Alle Haushalte',
    verteilungTyp: 'Nach PLZ'
  });

  public readonly produktionStateSubject = new BehaviorSubject<ProduktionDataState>({
    designPackage: null, // Wird jetzt immer Pflicht sein
    printOption: null,
    anlieferDetails: { format: null, anlieferung: null },
    printServiceDetails: { format: null, grammatur: null, art: null, ausfuehrung: null, auflage: 0, reserve: 0 },
    eigenesDesignPdfUploaded: false
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
      map(([selectedPlzEntriesFromService, verteilgebietStateBase]) => {
        const typedSelectedEntries: PlzSelectionDetail[] = selectedPlzEntriesFromService.map((entry: PlzEntry) => {
          const manualMfh = entry.manual_flyer_count_mfh ?? null;
          const manualEfh = entry.manual_flyer_count_efh ?? null;
          const selected_flyer_count_mfh = manualMfh !== null ? manualMfh : (entry.mfh ?? 0);
          const selected_flyer_count_efh = manualEfh !== null ? manualEfh : (entry.efh ?? 0);
          let anzahl = 0;
          switch (verteilgebietStateBase.zielgruppe) {
            case 'Alle Haushalte': anzahl = entry.all ?? 0; break;
            case 'Mehrfamilienhäuser': anzahl = selected_flyer_count_mfh; break;
            case 'Ein- und Zweifamilienhäuser': anzahl = selected_flyer_count_efh; break;
          }
          return {
            ...entry,
            id: entry.id,
            plz6: entry.plz6,
            plz4: entry.plz4,
            ort: entry.ort,
            kt: entry.kt,
            preisKategorie: entry.preisKategorie,
            all: entry.all,
            mfh: entry.mfh,
            efh: entry.efh,
            isSelected: (entry as any).isSelected,
            isHighlighted: (entry as any).isHighlighted,
            manual_flyer_count_mfh: manualMfh,
            manual_flyer_count_efh: manualEfh,
            selected_flyer_count_mfh,
            selected_flyer_count_efh,
            anzahl,
            zielgruppe: verteilgebietStateBase.zielgruppe
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
      this.calculatorService.prices$.pipe(filter((p): p is AppPrices => !!p && Object.keys(p).length > 0))
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
      tap(newState => console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Global state$ emitting... Lidolee: ${new Date().toISOString()}`)),
      shareReplay(1)
    );

    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Constructor - Initialization complete. Lidolee: ${new Date().toISOString()}`);
  }

  private getCurrentTimestamp(): string { return new Date().toISOString(); }

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

    const expressZuschlagApplicable = verteilgebiet.expressConfirmed && (isPerimeterOfferte || distribution.total > 0);
    let expressRelevantBase = 0;
    if (!isPerimeterOfferte) {
      expressRelevantBase = distribution.total + ausgleichKleinauftragPriceNum;
    } else {
      expressRelevantBase = this.calculatorService.getSurcharge('fahrzeugGPS', appPrices) +
        (produktion.anlieferDetails.anlieferung === 'abholung' ? this.calculatorService.getSurcharge('abholungFlyer', appPrices) : 0);
    }
    const expressZuschlagPriceNum = expressZuschlagApplicable && expressRelevantBase > 0
      ? this.calculatorService.roundCurrency(expressRelevantBase * (this.calculatorService.getSurcharge('express', appPrices) / 100))
      : 0;

    const fahrzeugGpsPriceNum = this.calculatorService.getSurcharge('fahrzeugGPS', appPrices);

    const flyerAbholungApplicable = produktion.anlieferDetails.anlieferung === 'abholung';
    const flyerAbholungPriceNum = flyerAbholungApplicable ? this.calculatorService.getSurcharge('abholungFlyer', appPrices) : 0;

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
    const verteilzuschlagPriceNum = verteilzuschlag.price;

    const subTotalDistributionNum = this.calculatorService.roundCurrency(
      (isPerimeterOfferte ? 0 : distribution.total) +
      (isPerimeterOfferte ? 0 : ausgleichKleinauftragPriceNum) +
      expressZuschlagPriceNum +
      fahrzeugGpsPriceNum +
      flyerAbholungPriceNum +
      (isPerimeterOfferte ? 0 : verteilzuschlagPriceNum)
    );

    const designPackageCostNum = this.calculatorService.calculateDesignPackagePrice(produktion.designPackage, appPrices.design);
    const selectedDesignPackageName = this.calculatorService.getDesignPackageName(produktion.designPackage, designPackageCostNum);

    let printService = { name: 'Kein Druckservice', cost: 0 };
    if (produktion.printOption === 'service') {
      printService = this.calculatorService.calculatePrintServiceCost(produktion.printServiceDetails);
      if (isPerimeterOfferte) {
        printService.name = produktion.printServiceDetails.format
          ? `Druckservice (${produktion.printServiceDetails.format}, Details nach KML)`
          : `Druckservice (Details nach KML)`;
        printService.cost = 0;
      }
    }
    const printServiceCostNum = printService.cost;

    const subTotalNettoNum = this.calculatorService.roundCurrency(subTotalDistributionNum + designPackageCostNum + printServiceCostNum);
    const taxRate = appPrices.tax["vat-ch"] || 0;
    const taxAmountNum = this.calculatorService.roundCurrency(subTotalNettoNum * taxRate);
    const grandTotalCalculatedNum = this.calculatorService.roundTo5Rappen(subTotalNettoNum + taxAmountNum);

    let kostenStateErgebnis: KostenState = {
      selectedPlzEntriesLength: verteilgebiet.selectedPlzEntries.length,
      expressZuschlagApplicable,
      fahrzeugGpsApplicable: true,
      zuschlagFormatAnzeigeText: verteilzuschlag.anzeigeText,
      totalFlyersForDistribution: verteilgebiet.totalFlyersCount,
      flyerAbholungApplicable,
      subTotalDistribution: subTotalDistributionNum,
      verteilungTotal: distribution.total,
      selectedPrintOption: produktion.printOption,
      selectedDesignPackageName,
      designPackageCost: designPackageCostNum,
      subTotalNetto: subTotalNettoNum,
      taxRatePercent: taxRate * 100,
      taxAmount: taxAmountNum,
      grandTotalCalculated: grandTotalCalculatedNum,
      mindestbestellwertHinweis,
      distributionHeadline,
      distributionCostItems: distribution.items.map(item => ({...item, price: item.price as number})),
      expressZuschlagPrice: expressZuschlagPriceNum,
      fahrzeugGpsPrice: fahrzeugGpsPriceNum,
      zuschlagFormatPrice: verteilzuschlagPriceNum,
      isAnderesFormatSelected: verteilzuschlag.isAnderes,
      flyerAbholungPrice: flyerAbholungPriceNum,
      ausgleichKleinauftragPrice: ausgleichKleinauftragPriceNum,
      printServiceName: printService.name,
      printServiceCost: printServiceCostNum,
      mindestbestellwert: mindestVerteilung + fahrzeugGpsPriceNum,
      isPerimeterOfferte
    };

    if (isPerimeterOfferte) {
      const manuellePruefungText = "—";
      const emDashText = "—";

      kostenStateErgebnis.verteilungTotal = manuellePruefungText;
      kostenStateErgebnis.distributionCostItems = [];
      kostenStateErgebnis.ausgleichKleinauftragPrice = manuellePruefungText;
      kostenStateErgebnis.expressZuschlagPrice = manuellePruefungText;
      kostenStateErgebnis.flyerAbholungPrice = manuellePruefungText;
      kostenStateErgebnis.zuschlagFormatPrice = manuellePruefungText;
      kostenStateErgebnis.printServiceCost = manuellePruefungText;

      kostenStateErgebnis.subTotalDistribution = emDashText;
      kostenStateErgebnis.subTotalNetto = emDashText;
      kostenStateErgebnis.taxAmount = emDashText;
      kostenStateErgebnis.grandTotalCalculated = "Preis per Email";

      kostenStateErgebnis.mindestbestellwertHinweis = 'Die Kosten für die Verteilung nach Perimeter werden nach manueller Prüfung separat offeriert.';
    }

    return kostenStateErgebnis;
  }

  private validateAllSteps(verteilgebiet: VerteilgebietDataState, produktion: ProduktionDataState, kontakt: KontaktDetailsState, kosten: KostenState): StepValidationStatus {
    let isStep1Valid = false;
    const isDateOk = !!verteilgebiet.verteilungStartdatum;
    const isExpressOk = !kosten.expressZuschlagApplicable || verteilgebiet.expressConfirmed;

    if (verteilgebiet.verteilungTyp === 'Nach PLZ') {
      isStep1Valid = verteilgebiet.selectedPlzEntries.length > 0 && verteilgebiet.totalFlyersCount > 0 && isDateOk && isExpressOk;
    } else {
      isStep1Valid = isDateOk && isExpressOk;
    }

    // --- Anpassungen für Schritt 2 Validierung ---
    let isStep2Valid = false;
    const printSelected = produktion.printOption !== null;

    // Designpaket ist IMMER Pflicht
    let designPartValid = !!produktion.designPackage;
    if (designPartValid && produktion.designPackage === 'eigenes') {
      // PDF Upload ist nur Pflicht, wenn Designpaket "eigenes" gewählt wurde
      designPartValid = designPartValid && !!produktion.eigenesDesignPdfUploaded;
    }

    let printPartValid = true; // Standardmäßig gültig, wenn keine Druckoption gewählt
    if (printSelected) { // Nur validieren, wenn eine Druckoption tatsächlich gewählt wurde
      if (produktion.printOption === 'anliefern' || produktion.printOption === 'eigenes') {
        printPartValid = !!produktion.anlieferDetails.format && !!produktion.anlieferDetails.anlieferung;
      } else if (produktion.printOption === 'service') {
        let auflageConditionMet = false;
        if (verteilgebiet.verteilungTyp === 'Nach Perimeter') {
          auflageConditionMet = produktion.printServiceDetails.auflage === 0;
        } else {
          auflageConditionMet = produktion.printServiceDetails.auflage > 0;
        }
        printPartValid = !!produktion.printServiceDetails.format &&
          !!produktion.printServiceDetails.grammatur &&
          !!produktion.printServiceDetails.art &&
          !!produktion.printServiceDetails.ausfuehrung &&
          auflageConditionMet &&
          produktion.printServiceDetails.reserve !== null && produktion.printServiceDetails.reserve >= 0;
      } else {
        // Sollte nicht vorkommen, wenn printOption null ist, wird es oben abgedeckt.
        // Falls doch ein ungültiger Wert für printOption existiert:
        printPartValid = false;
      }
    }

    isStep2Valid = designPartValid && printPartValid;
    // --- Ende Anpassungen Schritt 2 Validierung ---

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

  public updateVerteilungTyp(typ: VerteilungTypOption): void {
    const current = this.verteilgebietStateSubject.getValue();
    if (current.verteilungTyp !== typ) {
      this.verteilgebietStateSubject.next({ ...current, verteilungTyp: typ });
    }
  }

  public updateDesignPackage(pkg: DesignPackageType | null): void {
    const current = this.produktionStateSubject.getValue();
    const newState = { ...current, designPackage: pkg };
    if (pkg !== 'eigenes') {
      newState.eigenesDesignPdfUploaded = false; // PDF Status zurücksetzen, wenn nicht "eigenes" Design
    }
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
    // Status nur aktualisieren, wenn es sich tatsächlich ändert
    if (current.eigenesDesignPdfUploaded !== uploaded) {
      this.produktionStateSubject.next({ ...current, eigenesDesignPdfUploaded: uploaded });
    }
  }
}
