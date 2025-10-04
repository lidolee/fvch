import {Inject, Injectable, PLATFORM_ID} from '@angular/core';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {catchError, map, shareReplay} from 'rxjs/operators';
import {
  DesignPackageType, DesignPrices, VerteilzuschlagFormatKey, FlyerFormatType,
  PlzSelectionDetail, PrintServiceDetails, DistributionCostItem
} from './order-data.types';
import { isPlatformBrowser } from '@angular/common';

const PRICES_JSON_PATH = 'assets/prices.json';

export interface DistributionPriceCategory {
  [category: string]: number; // Preis pro 1000
}
export interface DistributionPrices {
  mfh: DistributionPriceCategory;
  efh: DistributionPriceCategory;
  verteilungZuschlagFormat: { [key in VerteilzuschlagFormatKey]?: number };
  surcharges: {
    fahrzeugGPS: number;
    abholungFlyer: number;
    express: number;
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

  constructor(
    private http: HttpClient,
    // Inject PLATFORM_ID to detect if we are on the server or in the browser.
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // THIS IS THE FIX: Only attempt to load prices via HTTP if we are in a browser environment.
    // This prevents the timeout error during Server-Side Rendering (SSR).
    if (isPlatformBrowser(this.platformId)) {
      this.loadPrices().subscribe();
    } else {
      //console.log('SSR Environment: Skipping HttpClient call for prices.json on the server.');
    }
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

  public roundTo5Rappen(value: number): number {
    return Math.round(value * 20) / 20;
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
    result.isAnderes = format === 'Anderes Format';

    if (result.isAnderes || !format || !appPrices || !appPrices.distribution?.verteilungZuschlagFormat || totalFlyers <= 0) {
      if (result.isAnderes) {
        result.anzeigeText = "Formatzuschlag für Sonderformat (auf Anfrage)";
      }
      return result;
    }

    if (format === 'DIN-Lang') result.key = 'Lang';
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
    appPrices: AppPrices | null
  ): { items: DistributionCostItem[], total: number } {
    if (!appPrices || !appPrices.distribution || selectedPlzEntries.length === 0) {
      return { items: [], total: 0 };
    }

    const zielgruppe = selectedPlzEntries[0].zielgruppe;
    let totalDistributionCost = 0;
    const distributionCostItems: DistributionCostItem[] = [];

    for (const entry of selectedPlzEntries) {
      let costForThisEntry = 0;
      let flyersForThisEntry = entry.anzahl;

      if (flyersForThisEntry === 0) continue;

      const preisKategorie = entry.preisKategorie || 'A';

      switch (zielgruppe) {
        case 'Mehrfamilienhäuser':
          const pricePer1000Mfh = appPrices.distribution.mfh[preisKategorie] || 0;
          costForThisEntry = (flyersForThisEntry / 1000) * pricePer1000Mfh;
          break;

        case 'Ein- und Zweifamilienhäuser':
          const pricePer1000Efh = appPrices.distribution.efh[preisKategorie] || 0;
          costForThisEntry = (flyersForThisEntry / 1000) * pricePer1000Efh;
          break;

        case 'Alle Haushalte':
          const haushalteEFH = entry.efh || 0;
          const haushalteMFH = entry.mfh || 0;
          const haushalteGesamtOriginal = haushalteEFH + haushalteMFH;
          if (haushalteGesamtOriginal > 0) {
            if (haushalteEFH > 0) {
              const flyersAnteilEFH = flyersForThisEntry * (haushalteEFH / haushalteGesamtOriginal);
              costForThisEntry += (flyersAnteilEFH / 1000) * (appPrices.distribution.efh[preisKategorie] || 0);
            }
            if (haushalteMFH > 0) {
              const flyersAnteilMFH = flyersForThisEntry * (haushalteMFH / haushalteGesamtOriginal);
              costForThisEntry += (flyersAnteilMFH / 1000) * (appPrices.distribution.mfh[preisKategorie] || 0);
            }
          } else {
            costForThisEntry = (flyersForThisEntry / 1000) * (appPrices.distribution.efh[preisKategorie] || 0);
          }
          break;
      }

      distributionCostItems.push({
        plz: entry.plz4,
        ort: entry.ort,
        flyers: flyersForThisEntry,
        price: this.roundCurrency(costForThisEntry)
      });

      totalDistributionCost += costForThisEntry;
    }

    return { items: distributionCostItems, total: this.roundCurrency(totalDistributionCost) };
  }

  public getSurcharge(surchargeKey: keyof DistributionPrices['surcharges'], appPrices: AppPrices | null): number {
    return appPrices?.distribution?.surcharges?.[surchargeKey] || 0;
  }
}
