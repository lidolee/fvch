import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, shareReplay, tap, map } from 'rxjs/operators';
import { PlzEntry } from './plz-data.service';
import { ZielgruppeOption } from '../components/distribution-step/distribution-step.component';
import { DesignPackage } from '../components/design-print-step/design-print-step.component';

export interface PriceDistributionRates { [category: string]: number; }
export interface PriceVerteilungZuschlagFormat { Lang?: number; A4?: number; A3?: number; anderes?: string; }
export interface PriceSurcharges { fahrzeugGPS?: number; abholungFlyer?: number; express?: number; mindestbestellwert?: number; }
export interface PriceDistribution {
  mfh: PriceDistributionRates;
  efh: PriceDistributionRates;
  perimeter: { base: number; };
  verteilungZuschlagFormat: PriceVerteilungZuschlagFormat;
  surcharges: PriceSurcharges;
}
export interface AppPrices {
  distribution: PriceDistribution;
  designPackages: { [key: string]: number; };
}

@Injectable({
  providedIn: 'root'
})
export class CalculatorService {
  private pricesSource = new BehaviorSubject<AppPrices | null>(null);
  private prices$: Observable<AppPrices | null> = this.pricesSource.asObservable();
  private readonly pricesUrl = 'assets/prices.json';
  private logPrefix = () => `[CalculatorService ${new Date().toISOString()}]`;

  constructor(private http: HttpClient) {
    this.loadPrices().subscribe(prices => this.pricesSource.next(prices));
  }

  private loadPrices(): Observable<AppPrices | null> {
    return this.http.get<AppPrices>(this.pricesUrl).pipe(
      tap(prices => console.log(`${this.logPrefix()} Loaded prices:`, prices)),
      shareReplay(1),
      catchError(error => {
        console.error(`${this.logPrefix()} Error loading prices.json:`, error);
        return of(null);
      })
    );
  }

  public getPricesObservable(): Observable<AppPrices | null> {
    return this.prices$;
  }

  public getPricesValue(): AppPrices | null {
    return this.pricesSource.getValue();
  }

  getDesignPrice(packageName: DesignPackage | string): Observable<number> {
    if (!packageName) {
      return of(0);
    }
    return this.prices$.pipe(
      map(prices => {
        if (prices?.designPackages?.[packageName] !== undefined) {
          return prices.designPackages[packageName];
        }
        console.warn(`${this.logPrefix()} Price for design package "${packageName}" not found.`);
        return 0;
      }),
      catchError(() => of(0))
    );
  }

  /**
   * Calculate distribution cost for a specific PLZ entry based on target group.
   * "Alle Haushalte": MFH & EFH werden separat berechnet und summiert.
   * MFH: nur MFH
   * EFH: nur EFH
   */
  calculateDistributionCostForEntry(entry: PlzEntry, zielgruppe: ZielgruppeOption, prices: AppPrices): number {
    if (!prices || !entry.preisKategorie) {
      return 0;
    }
    const preisKategorie = entry.preisKategorie;
    const mfhRatePer1000 = prices.distribution.mfh[preisKategorie] ?? 0;
    const efhRatePer1000 = prices.distribution.efh[preisKategorie] ?? 0;
    if (zielgruppe === 'Mehrfamilienhäuser') {
      const mfhQuantity = entry.mfh ?? 0;
      return (mfhQuantity * mfhRatePer1000) / 1000;
    }
    if (zielgruppe === 'Ein- und Zweifamilienhäuser') {
      const efhQuantity = entry.efh ?? 0;
      return (efhQuantity * efhRatePer1000) / 1000;
    }
    if (zielgruppe === 'Alle Haushalte') {
      const mfhQuantity = entry.mfh ?? 0;
      const efhQuantity = entry.efh ?? 0;
      const mfhCost = (mfhQuantity * mfhRatePer1000) / 1000;
      const efhCost = (efhQuantity * efhRatePer1000) / 1000;
      return mfhCost + efhCost;
    }
    return 0;
  }

  /**
   * Für Legacy-Kompatibilität. NICHT für "Alle Haushalte" verwenden.
   */
  getDistributionRatePer1000(entry: PlzEntry, zielgruppe: ZielgruppeOption, prices: AppPrices): number {
    if (!prices || !entry.preisKategorie) {
      return 0;
    }
    const preisKategorie = entry.preisKategorie;
    if (zielgruppe === 'Mehrfamilienhäuser') {
      return prices.distribution.mfh[preisKategorie] ?? 0;
    }
    if (zielgruppe === 'Ein- und Zweifamilienhäuser') {
      return prices.distribution.efh[preisKategorie] ?? 0;
    }
    return 0;
  }

  getSurchargeValue(surchargeKey: keyof Omit<PriceSurcharges, 'express'>, prices: AppPrices): number {
    if (prices?.distribution?.surcharges?.[surchargeKey] !== undefined) {
      return Number(prices.distribution.surcharges[surchargeKey]);
    }
    return 0;
  }

  getExpressSurchargeFactor(prices: AppPrices): number {
    if (prices?.distribution?.surcharges?.express !== undefined) {
      return Number(prices.distribution.surcharges.express);
    }
    return 0;
  }

  getVerteilungZuschlagFormatPro1000(formatKey: 'Lang' | 'A4' | 'A3', prices: AppPrices): number {
    if (prices?.distribution?.verteilungZuschlagFormat) {
      const zuschlag = prices.distribution.verteilungZuschlagFormat[formatKey];
      if (typeof zuschlag === 'number') {
        return zuschlag;
      }
    }
    return 0;
  }

  getMinimumOrderValue(prices: AppPrices): number {
    return this.getSurchargeValue('mindestbestellwert', prices);
  }

  getGpsSurcharge(prices: AppPrices): number {
    return this.getSurchargeValue('fahrzeugGPS', prices);
  }

  calculateMinimumOrderSurcharge(currentSubtotal: number, prices: AppPrices): number {
    const baseMinimum = this.getMinimumOrderValue(prices);
    const gpsCharge = this.getGpsSurcharge(prices);
    const totalMinimum = baseMinimum + gpsCharge;
    if (currentSubtotal > 0 && currentSubtotal < totalMinimum) {
      return totalMinimum - currentSubtotal;
    }
    return 0;
  }
}
