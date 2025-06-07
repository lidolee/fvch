import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {catchError, filter, map, take, tap} from 'rxjs/operators';
import {PlzEntry} from './plz-data.service';
import {AnlieferungOptionService, DesignPackageService, VerteilzuschlagFormatKey} from './order-data.types';

const PRICES_JSON_PATH = 'assets/prices.json';

export interface DistributionPrices {
  mfh: { [category: string]: number };
  efh: { [category: string]: number };
  perimeter?: { base: number };
  verteilungZuschlagFormat: {
    Lang?: number;
    A4?: number;
    A3?: number;
    anderes?: string;
  };
  surcharges: {
    fahrzeugGPS: number;
    abholungFlyer: number;
    express: number;
    mindestbestellwert: number;
  };
}

export interface DesignPrices {
  basis: number;
  plus: number;
  premium: number;
  eigenes: number;
}

export interface TaxSettings {
  "vat-ch": number;
}

export interface AppPrices {
  distribution: DistributionPrices;
  design: DesignPrices;
  tax: TaxSettings;
}

@Injectable({
  providedIn: 'root'
})
export class CalculatorService {
  private pricesSubject = new BehaviorSubject<AppPrices | null>(null);
  public prices$: Observable<AppPrices | null> = this.pricesSubject.asObservable();
  private pricesLoadingAttempted = false;

  constructor(private http: HttpClient) {
    this.loadPrices();
  }

  public loadPrices(): void {
    if (this.pricesLoadingAttempted && this.pricesSubject.getValue() !== null) {
      return;
    }
    if (this.pricesLoadingAttempted && this.pricesSubject.getValue() === null) {
      // Potenziell wichtig für Debugging, wenn Preise nicht geladen werden konnten
      console.warn('[CalculatorService] loadPrices: Previous attempt to load prices failed. Retrying might be needed or error should be handled.');
    }

    this.pricesLoadingAttempted = true;

    this.http.get<AppPrices>(PRICES_JSON_PATH).pipe(
      tap(prices => {
        this.pricesSubject.next(prices);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('[CalculatorService] loadPrices HTTP GET FAILED. Error:', error.message, 'Status:', error.status, 'URL:', error.url); // Gekürzt für Produktion, aber Error bleibt
        this.pricesSubject.next(null);
        return of(null); // Weiterhin null emittieren, um die App nicht zu brechen
      })
    ).subscribe({
      next: (prices) => {
        if (!prices) {
          console.warn('[CalculatorService] loadPrices: Subscription next handler. Prices are null (likely due to load failure).');
        }
      },
      error: (err) => {
        // Dieser Fehler sollte durch catchError abgefangen werden, aber falls nicht:
        console.error('[CalculatorService] loadPrices: Subscription error handler.', err);
      }
      // complete-Handler kann entfernt werden, da er keine kritische Info liefert
    });
  }

  public getPricesObservable(): Observable<AppPrices | null> {
    return this.prices$;
  }

  public roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  public getSurchargeValue(
    surchargeName: keyof DistributionPrices['surcharges'],
    prices: AppPrices | null
  ): number {
    if (!prices?.distribution?.surcharges) return 0;
    return prices.distribution.surcharges[surchargeName];
  }

  public getGpsSurcharge(prices: AppPrices): number {
    return this.getSurchargeValue('fahrzeugGPS', prices);
  }

  public getVerteilungZuschlagFormatPro1000(
    format: VerteilzuschlagFormatKey,
    prices: AppPrices
  ): number {
    if (!prices?.distribution?.verteilungZuschlagFormat || format === 'anderes') return 0;
    const zuschlag = prices.distribution.verteilungZuschlagFormat[format as 'Lang' | 'A4' | 'A3'];
    return typeof zuschlag === 'number' ? zuschlag : 0;
  }

  public getExpressSurchargeFactor(prices: AppPrices): number {
    return prices.distribution?.surcharges?.express ?? 0;
  }

  public getMinimumOrderValue(prices: AppPrices): number {
    return prices.distribution?.surcharges?.mindestbestellwert ?? 0;
  }

  public getDesignPrice(
    designPackage: DesignPackageService | null,
    prices: AppPrices | null
  ): Observable<number> {
    if (prices && prices.design) {
      if (designPackage === null || designPackage === 'eigenes') {
        return of(0);
      }
      const validPackageKey = designPackage as keyof DesignPrices;
      if (prices.design.hasOwnProperty(validPackageKey)) {
        return of(prices.design[validPackageKey] || 0);
      }
      // console.warn(`[CalculatorService] getDesignPrice: designPackage '${String(designPackage)}' not found in provided prices. Returning 0.`);
      return of(0);
    }

    return this.prices$.pipe(
      filter((p): p is AppPrices => p !== null && p.design !== null),
      map(loadedPrices => {
        if (designPackage === null || designPackage === 'eigenes') {
          return 0;
        }
        const validPackageKey = designPackage as keyof DesignPrices;
        if (loadedPrices.design.hasOwnProperty(validPackageKey)) {
          return loadedPrices.design[validPackageKey] || 0;
        }
        // console.warn(`[CalculatorService] getDesignPrice: designPackage '${String(designPackage)}' not found in loaded prices. Returning 0.`);
        return 0;
      }),
      catchError((err) => {
        console.error('[CalculatorService] getDesignPrice: Error while getting design price from observable.', err);
        return of(0);
      }),
      take(1)
    );
  }

  public calculateMinimumOrderSurcharge(currentDistributionTotal: number, prices: AppPrices): number {
    const minimumValue = this.getMinimumOrderValue(prices);
    if (minimumValue > 0 && currentDistributionTotal < minimumValue) {
      return this.roundCurrency(minimumValue - currentDistributionTotal);
    }
    return 0;
  }

  public recalculateAllCostsLogic(
    grundkostenVerteilung: number,
    totalFlyers: number,
    finalFlyerFormat: VerteilzuschlagFormatKey | null,
    anlieferOption: AnlieferungOptionService | null,
    isExpress: boolean,
    plzEntries: PlzEntry[],
    prices: AppPrices
  ): { total: number; gps: number; format: number; abhol: number; express: number; mind: number } {
    let aktuelleZwischensummeVerteilung = grundkostenVerteilung;
    let gpsPreis = 0;
    let formatPreis = 0;
    let abholPreis = 0;
    let expressPreis = 0;
    let mindestPreis = 0;

    if (!prices) {
      console.error("[CalculatorService] recalculateAllCostsLogic: AppPrices are null. Cannot perform calculations.");
      return { total: 0, gps: 0, format: 0, abhol: 0, express: 0, mind: 0 };
    }

    if (plzEntries && plzEntries.length > 0) {
      gpsPreis = this.getGpsSurcharge(prices);
      aktuelleZwischensummeVerteilung += gpsPreis;
    }

    if (finalFlyerFormat && finalFlyerFormat !== 'anderes' && totalFlyers > 0) {
      const zuschlagPro1000 = this.getVerteilungZuschlagFormatPro1000(finalFlyerFormat, prices);
      if (zuschlagPro1000 > 0) {
        formatPreis = this.roundCurrency((totalFlyers / 1000) * zuschlagPro1000);
        aktuelleZwischensummeVerteilung += formatPreis;
      }
    }

    if (anlieferOption === 'abholung') {
      abholPreis = this.getSurchargeValue('abholungFlyer', prices);
      aktuelleZwischensummeVerteilung += abholPreis;
    }

    aktuelleZwischensummeVerteilung = this.roundCurrency(aktuelleZwischensummeVerteilung);

    const basisFuerExpress = this.roundCurrency(grundkostenVerteilung + formatPreis);
    if (isExpress && basisFuerExpress > 0) {
      const expressFactor = this.getExpressSurchargeFactor(prices);
      if (expressFactor > 0) {
        expressPreis = this.roundCurrency(basisFuerExpress * expressFactor);
        aktuelleZwischensummeVerteilung = this.roundCurrency(aktuelleZwischensummeVerteilung + expressPreis);
      }
    }

    const summeVorMindestwert = aktuelleZwischensummeVerteilung;
    const mindestbestellwert = this.getMinimumOrderValue(prices);

    if (summeVorMindestwert < mindestbestellwert) {
      mindestPreis = this.roundCurrency(mindestbestellwert - summeVorMindestwert);
      aktuelleZwischensummeVerteilung = mindestbestellwert;
    } else {
      mindestPreis = 0;
    }

    return {
      total: this.roundCurrency(aktuelleZwischensummeVerteilung),
      gps: gpsPreis,
      format: formatPreis,
      abhol: abholPreis,
      express: expressPreis,
      mind: mindestPreis
    };
  }
}
