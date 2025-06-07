import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {catchError, map, shareReplay} from 'rxjs/operators';
import {
  DesignPackageType, DesignPrices, VerteilzuschlagFormatKey, FlyerFormatType,
  PlzSelectionDetail, ZielgruppeOption, PrintServiceDetails, DistributionCostItem
} from './order-data.types'; // PlzEntry hier nicht mehr direkt benötigt

const PRICES_JSON_PATH = 'assets/prices.json';

export interface DistributionPriceCategory {
  [category: string]: number; // Preis pro 1000
}
export interface DistributionPrices {
  mfh: DistributionPriceCategory;
  efh: DistributionPriceCategory;
  verteilungZuschlagFormat: { [key in VerteilzuschlagFormatKey]?: number }; // Annahme: auch Preis pro 1000
  surcharges: {
    fahrzeugGPS: number;
    abholungFlyer: number;
    express: number; // Faktor
    mindestbestellwert: number;
  };
}

export interface AppPrices {
  distribution: DistributionPrices;
  design: DesignPrices;
  tax: { "vat-ch": number };
}

@Injectable({
  providedIn: 'root'
})
export class CalculatorService {
  private pricesSubject = new BehaviorSubject<AppPrices | null>(null);
  public prices$: Observable<AppPrices | null> = this.pricesSubject.asObservable().pipe(
    shareReplay(1)
  );

  constructor(private http: HttpClient) {
    this.loadPrices().subscribe();
  }

  private loadPrices(): Observable<AppPrices | null> {
    return this.http.get<AppPrices>(PRICES_JSON_PATH).pipe(
      map(prices => {
        this.pricesSubject.next(prices);
        return prices;
      }),
      catchError((error: HttpErrorResponse) => {
        console.error("Failed to load prices.json", error);
        this.pricesSubject.next(null);
        return of(null);
      })
    );
  }

  public getAppPrices(): Observable<AppPrices | null> {
    return this.pricesSubject.getValue() ? of(this.pricesSubject.getValue()) : this.prices$;
  }

  public roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  public calculateDesignPackagePrice(packageType: DesignPackageType | null, designPrices: DesignPrices | null): number {
    if (!packageType || !designPrices || !(packageType in designPrices)) {
      return 0;
    }
    return designPrices[packageType as keyof DesignPrices] || 0;
  }

  public getDesignPackageName(packageType: DesignPackageType | null, designPrice: number): string {
    if (!packageType) return 'Kein Designpaket';
    switch(packageType) {
      case 'basis': return 'Designpaket Basis';
      case 'plus': return 'Designpaket Plus';
      case 'premium': return 'Designpaket Premium';
      case 'eigenes': return designPrice > 0 ? 'Eigenes Design (Prüfpauschale)' : 'Eigenes Design';
      default: return 'Kein Designpaket';
    }
  }

  public calculatePrintServiceCost(printDetails: PrintServiceDetails | null): { name: string, cost: number } {
    if (printDetails && printDetails.auflage > 0) {
      return {
        name: `Druckservice (${printDetails.format || 'N/A'}, ${printDetails.auflage} Stk.)`,
        cost: 0
      };
    }
    return { name: 'Kein Druckservice', cost: 0 };
  }

  public calculateVerteilzuschlag(format: FlyerFormatType | null, totalFlyers: number, appPrices: AppPrices | null): { price: number, key: VerteilzuschlagFormatKey | null, isAnderes: boolean, anzeigeText: string } {
    const result = { price: 0, key: null as VerteilzuschlagFormatKey | null, isAnderes: false, anzeigeText: '' };
    result.isAnderes = format === 'Anderes_Format' || format === 'anderes';

    if (result.isAnderes || !format || !appPrices || !appPrices.distribution?.verteilungZuschlagFormat || totalFlyers <= 0) {
      if (result.isAnderes) {
        result.anzeigeText = "Formatzuschlag für Sonderformat (auf Anfrage)";
      }
      return result;
    }

    if (format === 'DIN-Lang' || format === 'DIN_Lang') result.key = 'Lang';
    else if (format === 'A4') result.key = 'A4';
    else if (format === 'A3') result.key = 'A3';

    if (!result.key) return result;

    const pricePer1000FlyersAddon = appPrices.distribution.verteilungZuschlagFormat[result.key] || 0;
    result.price = this.roundCurrency((totalFlyers / 1000) * pricePer1000FlyersAddon);


    if (result.price > 0) {
      if (result.key === 'Lang') result.anzeigeText = 'Formatzuschlag DIN Lang';
      else if (result.key === 'A4') result.anzeigeText = 'Formatzuschlag A4';
      else if (result.key === 'A3') result.anzeigeText = 'Formatzuschlag A3';
    } else if (result.isAnderes) {
      result.anzeigeText = "Formatzuschlag für Sonderformat (auf Anfrage)";
    }
    return result;
  }

  public calculateDistributionCost(
    selectedPlzEntries: PlzSelectionDetail[],
    zielgruppe: ZielgruppeOption,
    appPrices: AppPrices | null
  ): { items: DistributionCostItem[], total: number } {
    const distributionCostItems: DistributionCostItem[] = [];
    let subTotalDistribution = 0;

    if (!appPrices || !appPrices.distribution || !appPrices.distribution.mfh || !appPrices.distribution.efh || selectedPlzEntries.length === 0) {
      return { items: [], total: 0 };
    }

    if (zielgruppe === 'Alle Haushalte') {
      for (const entry of selectedPlzEntries) {
        // Bei "Alle Haushalte" ist selected_display_flyer_count der Wert aus "all" und nicht editierbar.
        // Dieser Wert muss proportional auf EFH und MFH Kosten aufgeteilt werden.
        const totalFlyersForPlz = entry.selected_display_flyer_count || entry.anzahl || 0;
        if (totalFlyersForPlz === 0) continue;

        // Wichtig: entry.efh und entry.mfh sind hier die *Anzahl der Haushalte* aus den Stammdaten
        const haushalteEFH = entry.efh || 0;
        const haushalteMFH = entry.mfh || 0;
        const haushalteGesamtOriginal = haushalteEFH + haushalteMFH; // Summe der ursprünglichen Haushaltszahlen

        let kostenPlz = 0;
        const preisKategorie = entry.preisKategorie || 'default'; // Fallback für Preiskategorie

        if (haushalteGesamtOriginal > 0) {
          // EFH-Anteil berechnen und Kosten dafür
          if (haushalteEFH > 0 && appPrices.distribution.efh && appPrices.distribution.efh[preisKategorie]) {
            const flyersAnteilEFH = totalFlyersForPlz * (haushalteEFH / haushalteGesamtOriginal);
            const preisPro1000EFH = appPrices.distribution.efh[preisKategorie];
            kostenPlz += this.roundCurrency((flyersAnteilEFH / 1000) * preisPro1000EFH);
          }
          // MFH-Anteil berechnen und Kosten dafür
          if (haushalteMFH > 0 && appPrices.distribution.mfh && appPrices.distribution.mfh[preisKategorie]) {
            const flyersAnteilMFH = totalFlyersForPlz * (haushalteMFH / haushalteGesamtOriginal);
            const preisPro1000MFH = appPrices.distribution.mfh[preisKategorie];
            kostenPlz += this.roundCurrency((flyersAnteilMFH / 1000) * preisPro1000MFH);
          }
        } else if (totalFlyersForPlz > 0) {
          // Fallback, falls keine EFH/MFH Haushaltszahlen vorhanden sind (sollte nicht passieren bei "Alle Haushalte")
          // Hier könnte man einen Durchschnittspreis nehmen oder den EFH-Preis als Default.
          // Für jetzt nehmen wir den EFH-Preis als Notfall-Fallback.
          const fallbackPreisPro1000 = appPrices.distribution.efh[preisKategorie] || 0;
          kostenPlz = this.roundCurrency((totalFlyersForPlz / 1000) * fallbackPreisPro1000);
          console.warn(`PLZ ${entry.plz4}: Zielgruppe "Alle Haushalte" aber keine EFH/MFH-Haushaltszahlen zur Aufteilung. Fallback-Preis (EFH) angewendet.`);
        }

        if (totalFlyersForPlz > 0) {
          distributionCostItems.push({
            label: `Verteilung Alle (Kat. ${preisKategorie})`, // Angepasstes Label
            plzCount: 1, // Pro Eintrag ist es 1 PLZ
            flyers: totalFlyersForPlz,
            pricePerFlyer: totalFlyersForPlz > 0 ? kostenPlz / totalFlyersForPlz : 0,
            price: kostenPlz,
            category: preisKategorie
          });
          subTotalDistribution += kostenPlz;
        }
      }
    } else { // Zielgruppe ist 'Mehrfamilienhäuser' oder 'Ein- und Zweifamilienhäuser'
      const pricesConfig = zielgruppe === 'Mehrfamilienhäuser' ? appPrices.distribution.mfh : appPrices.distribution.efh;
      if (!pricesConfig) {
        console.error(`Keine Preiskonfiguration für Zielgruppe ${zielgruppe} gefunden.`);
        return { items: [], total: 0 };
      }

      const groupedByPreisKategorie = selectedPlzEntries.reduce((acc, entry) => {
        const key = entry.preisKategorie || 'default';
        if (!acc[key]) acc[key] = { flyers: 0, plzCount: 0, entries: [] };
        // Hier ist selected_display_flyer_count der (ggf. manuell angepasste) Wert
        acc[key].flyers += (entry.selected_display_flyer_count || entry.anzahl || 0);
        acc[key].plzCount += 1;
        acc[key].entries.push(entry);
        return acc;
      }, {} as { [key: string]: { flyers: number, plzCount: number, entries: PlzSelectionDetail[] } });

      for (const kategorie in groupedByPreisKategorie) {
        if (pricesConfig.hasOwnProperty(kategorie)) {
          const data = groupedByPreisKategorie[kategorie];
          const flyersInKategorie = data.flyers;
          const pricePer1000Flyers = pricesConfig[kategorie];
          const costForKategorie = this.roundCurrency((flyersInKategorie / 1000) * pricePer1000Flyers);

          if (flyersInKategorie > 0) {
            distributionCostItems.push({
              label: `Verteilung Kat. ${kategorie}`,
              plzCount: data.plzCount,
              flyers: flyersInKategorie,
              pricePerFlyer: pricePer1000Flyers / 1000,
              price: costForKategorie,
              category: kategorie
            });
            subTotalDistribution += costForKategorie;
          }
        }
      }
    }
    return { items: distributionCostItems, total: this.roundCurrency(subTotalDistribution) };
  }

  public getSurcharge(surchargeKey: keyof DistributionPrices['surcharges'], appPrices: AppPrices | null): number {
    return appPrices?.distribution?.surcharges?.[surchargeKey] || 0;
  }
}
