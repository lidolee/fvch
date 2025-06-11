import { Injectable } from '@angular/core';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged, tap, shareReplay, filter } from 'rxjs/operators';
import {
  AllOrderDataState, VerteilgebietDataState, ProduktionDataState, KontaktDetailsState,
  KostenState, StepValidationStatus, DesignPackageType, PrintOptionType,
  AnlieferDetails, PrintServiceDetails, PlzSelectionDetail, ZielgruppeOption,
  VerteilungTypOption, DistributionCostItem // DistributionCostItem importiert
} from './order-data.types';
import { CalculatorService, AppPrices } from './calculator.service';
import { SelectionService } from './selection.service';
import { PlzEntry } from './plz-data.service'; // Korrekter Import für PlzEntry

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
    designPackage: null,
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
      map(([selectedPlzEntriesFromService, verteilgebietStateBase]) => { // selectedPlzEntriesFromService ist PlzEntry[]
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
          // Sicherstellen, dass alle PlzSelectionDetail Felder vorhanden sind
          return {
            ...entry,
            id: entry.id, // Explizit für Klarheit
            plz6: entry.plz6,
            plz4: entry.plz4,
            ort: entry.ort,
            kt: entry.kt,
            preisKategorie: entry.preisKategorie,
            all: entry.all,
            mfh: entry.mfh,
            efh: entry.efh,
            isSelected: (entry as any).isSelected, // Cast wenn isSelected nicht in PlzEntry ist
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
      tap(newState => console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Global state$ emitting...`)),
      shareReplay(1)
    );

    console.log(`[${this.getCurrentTimestamp()}] [OrderDataService] Constructor - Initialization complete.`);
  }

  private getCurrentTimestamp(): string { return new Date().toISOString(); }

  private calculateAllCosts(verteilgebiet: VerteilgebietDataState, produktion: ProduktionDataState, appPrices: AppPrices): KostenState {
    const isPerimeterOfferte = verteilgebiet.verteilungTyp === 'Nach Perimeter';
    const calcFormat = produktion.printOption === 'service' ? produktion.printServiceDetails.format : produktion.anlieferDetails.format;

    let distribution: { items: DistributionCostItem[]; total: number } = { items: [], total: 0 };
    let ausgleichKleinauftragPrice = 0;
    const mindestVerteilung = this.calculatorService.getSurcharge('mindestbestellwert', appPrices);
    let distributionHeadline = '';
    let mindestbestellwertHinweis = '';

    if (isPerimeterOfferte) {
      distributionHeadline = 'Verteilung nach Perimeter';
      // Verteilungskosten sind 0 und werden separat offeriert
      distribution = { items: [], total: 0 };
      ausgleichKleinauftragPrice = 0;
      // Hinweis für KML Upload wird von der UI gehandhabt
    } else { // Nach PLZ
      if (verteilgebiet.selectedPlzEntries.length > 0 && verteilgebiet.totalFlyersCount > 0) {
        distribution = this.calculatorService.calculateDistributionCost(verteilgebiet.selectedPlzEntries, appPrices);
        distributionHeadline = `Verteilung ${verteilgebiet.zielgruppe}`;
        if (distribution.total > 0 && distribution.total < mindestVerteilung) {
          ausgleichKleinauftragPrice = this.calculatorService.roundCurrency(mindestVerteilung - distribution.total);
        }
      } else if (verteilgebiet.selectedPlzEntries.length > 0 && verteilgebiet.totalFlyersCount === 0) {
        distributionHeadline = `Verteilung ${verteilgebiet.zielgruppe}`;
        mindestbestellwertHinweis = 'Flyer Verteilung ist nicht möglich, da keine Flyer für die gewählte Zielgruppe in den PLZ anfallen.';
      } else {
        // Keine PLZ ausgewählt, wird von UI gehandhabt. Headline bleibt leer.
        mindestbestellwertHinweis = 'Bitte wählen Sie mind. 1 PLZ aus.';
      }
    }

    // Express Zuschlag
    const expressZuschlagApplicable = verteilgebiet.expressConfirmed && (isPerimeterOfferte || distribution.total > 0);
    let expressRelevantBase = 0;
    if (!isPerimeterOfferte) {
      expressRelevantBase = distribution.total + ausgleichKleinauftragPrice;
    } else {
      // Für Perimeter: Express-Zuschlag könnte auf eine Grundpauschale oder andere Kosten (Design, Druck-Handling) anfallen.
      // Annahme: Wenn Perimeter und Express, dann auf den Mindestbestellwert als Basis, falls keine anderen Kosten da sind.
      // Dies muss ggf. genauer definiert werden. Vorerst 0, wenn keine anderen Kosten anfallen.
      // Hier nehmen wir an, dass Express auf die Servicepauschale und Abholung anfallen könnte, falls diese gewählt sind.
      expressRelevantBase = this.calculatorService.getSurcharge('fahrzeugGPS', appPrices) +
        (produktion.anlieferDetails.anlieferung === 'abholung' ? this.calculatorService.getSurcharge('abholungFlyer', appPrices) : 0);
      // Wenn Design oder Druck (auch wenn separat offeriert) gewählt, könnten diese auch Basis sein.
      // Für die automatische Kalkulation hier komplex.
    }
    const expressZuschlagPrice = expressZuschlagApplicable && expressRelevantBase > 0
      ? this.calculatorService.roundCurrency(expressRelevantBase * (this.calculatorService.getSurcharge('express', appPrices) / 100))
      : 0;


    const fahrzeugGpsApplicable = true;
    const fahrzeugGpsPrice = fahrzeugGpsApplicable ? this.calculatorService.getSurcharge('fahrzeugGPS', appPrices) : 0;

    const flyerAbholungApplicable = produktion.anlieferDetails.anlieferung === 'abholung';
    const flyerAbholungPrice = flyerAbholungApplicable ? this.calculatorService.getSurcharge('abholungFlyer', appPrices) : 0;

    let verteilzuschlag = { price: 0, anzeigeText: '', isAnderes: false, key: null as any };
    if (calcFormat) {
      if (!isPerimeterOfferte && verteilgebiet.totalFlyersCount > 0) {
        verteilzuschlag = this.calculatorService.calculateVerteilzuschlag(calcFormat, verteilgebiet.totalFlyersCount, appPrices);
      } else if (isPerimeterOfferte) {
        const tempVerteilzuschlag = this.calculatorService.calculateVerteilzuschlag(calcFormat, 1, appPrices); // Dummy für Text
        verteilzuschlag.isAnderes = tempVerteilzuschlag.isAnderes;
        if (tempVerteilzuschlag.isAnderes) {
          verteilzuschlag.anzeigeText = "Formatzuschlag für Sonderformat (auf Anfrage)";
        } else if (tempVerteilzuschlag.price > 0 || tempVerteilzuschlag.key !== null) { // Auch wenn Preis 0 ist aber ein Standardformat gewählt
          verteilzuschlag.anzeigeText = tempVerteilzuschlag.anzeigeText.replace(/\+ CHF .* \/ 1'000 Flyer/, "(auf Anfrage)");
          if (!verteilzuschlag.anzeigeText && tempVerteilzuschlag.key) { // Fallback falls anzeigeText leer
            if (tempVerteilzuschlag.key === 'Lang') verteilzuschlag.anzeigeText = 'Formatzuschlag DIN Lang (auf Anfrage)';
            else if (tempVerteilzuschlag.key === 'A4') verteilzuschlag.anzeigeText = 'Formatzuschlag A4 (auf Anfrage)';
            else if (tempVerteilzuschlag.key === 'A3') verteilzuschlag.anzeigeText = 'Formatzuschlag A3 (auf Anfrage)';
          }
        }
        verteilzuschlag.price = 0; // Preis ist Teil der separaten Offerte
      }
    }

    const subTotalDistribution = this.calculatorService.roundCurrency(
      (isPerimeterOfferte ? 0 : distribution.total) +
      (isPerimeterOfferte ? 0 : ausgleichKleinauftragPrice) +
      expressZuschlagPrice +
      fahrzeugGpsPrice +
      flyerAbholungPrice +
      (isPerimeterOfferte ? 0 : verteilzuschlag.price) // Formatzuschlag nur bei PLZ in die Summe
    );

    const designPackageCost = this.calculatorService.calculateDesignPackagePrice(produktion.designPackage, appPrices.design);
    const selectedDesignPackageName = this.calculatorService.getDesignPackageName(produktion.designPackage, designPackageCost);

    let printService = { name: 'Kein Druckservice', cost: 0 };
    if (produktion.printOption === 'service') {
      printService = this.calculatorService.calculatePrintServiceCost(produktion.printServiceDetails); // Nimmt Auflage aus Details
      if (isPerimeterOfferte) {
        printService.name = produktion.printServiceDetails.format
          ? `Druckservice (${produktion.printServiceDetails.format}, Details nach KML)`
          : `Druckservice (Details nach KML)`;
        printService.cost = 0; // Kosten für Perimeter-Druck sind separat
      }
    }

    const subTotalNetto = this.calculatorService.roundCurrency(subTotalDistribution + designPackageCost + printService.cost);
    const taxRate = appPrices.tax["vat-ch"] || 0;
    const taxAmount = this.calculatorService.roundCurrency(subTotalNetto * taxRate);
    const grandTotalCalculated = this.calculatorService.roundTo5Rappen(subTotalNetto + taxAmount);

    return {
      selectedPlzEntriesLength: verteilgebiet.selectedPlzEntries.length,
      expressZuschlagApplicable,
      fahrzeugGpsApplicable,
      zuschlagFormatAnzeigeText: verteilzuschlag.anzeigeText,
      totalFlyersForDistribution: verteilgebiet.totalFlyersCount,
      flyerAbholungApplicable,
      subTotalDistribution,
      verteilungTotal: distribution.total, // Roh-Verteilungstotal, auch wenn Perimeter (dann 0)
      selectedPrintOption: produktion.printOption,
      selectedDesignPackageName,
      designPackageCost,
      subTotalNetto,
      taxRatePercent: taxRate * 100,
      taxAmount,
      grandTotalCalculated,
      mindestbestellwertHinweis,
      distributionHeadline,
      distributionCostItems: distribution.items, // Leer bei Perimeter
      expressZuschlagPrice,
      fahrzeugGpsPrice,
      zuschlagFormatPrice: isPerimeterOfferte ? 0 : verteilzuschlag.price, // Preis 0 bei Perimeter
      isAnderesFormatSelected: verteilzuschlag.isAnderes,
      flyerAbholungPrice,
      ausgleichKleinauftragPrice,
      printServiceName: printService.name,
      printServiceCost: printService.cost, // Ist 0 bei Perimeter
      mindestbestellwert: mindestVerteilung + fahrzeugGpsPrice, // Basis Mindestbestellwert
      isPerimeterOfferte
    };
  }

  // Die validateAllSteps Methode bleibt vorerst unverändert, da die KML-Upload-Logik
  // außerhalb dieses Services liegt und von der DistributionStepComponent gehandhabt wird.
  // Die `isStep1Valid` Logik hier ist eine serverseitige Konsistenzprüfung.
  private validateAllSteps(verteilgebiet: VerteilgebietDataState, produktion: ProduktionDataState, kontakt: KontaktDetailsState, kosten: KostenState): StepValidationStatus {
    let isStep1Valid = false;
    const isDateOk = !!verteilgebiet.verteilungStartdatum;
    const isExpressOk = !kosten.expressZuschlagApplicable || verteilgebiet.expressConfirmed;

    if (verteilgebiet.verteilungTyp === 'Nach PLZ') {
      isStep1Valid = verteilgebiet.selectedPlzEntries.length > 0 && verteilgebiet.totalFlyersCount > 0 && isDateOk && isExpressOk;
    } else { // Nach Perimeter
      // Die eigentliche KML-Validierung geschieht in DistributionStepComponent.
      // Für die globale Gültigkeit des Bestellprozesses hier:
      isStep1Valid = isDateOk && isExpressOk; // Annahme: KML-Upload wird von Komponente sichergestellt
    }

    let isStep2Valid = false;
    const designSelected = produktion.designPackage !== null;
    const printSelected = produktion.printOption !== null;

    if (!designSelected && !printSelected) {
      isStep2Valid = true;
    } else {
      let designPartValid = true;
      if (designSelected) {
        designPartValid = !!produktion.designPackage;
        if (produktion.designPackage === 'eigenes') {
          designPartValid = designPartValid && !!produktion.eigenesDesignPdfUploaded;
        }
      }

      let printPartValid = true;
      if (printSelected) {
        if (produktion.printOption === 'anliefern' || produktion.printOption === 'eigenes') { // 'eigenes' ist wie 'anliefern'
          printPartValid = !!produktion.anlieferDetails.format && !!produktion.anlieferDetails.anlieferung;
        } else if (produktion.printOption === 'service') {
          let auflageConditionMet = false;
          if (verteilgebiet.verteilungTyp === 'Nach Perimeter') {
            auflageConditionMet = produktion.printServiceDetails.auflage === 0; // Auflage muss 0 sein für Perimeter
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
          printPartValid = false;
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
      newState.eigenesDesignPdfUploaded = false;
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
    if (current.eigenesDesignPdfUploaded !== uploaded) {
      this.produktionStateSubject.next({ ...current, eigenesDesignPdfUploaded: uploaded });
    }
  }
}
