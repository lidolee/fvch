import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { DesignPackage } from '../components/design-print-step/design-print-step.component'; // Pfad sicherstellen
import { PlzEntry } from './plz-data.service'; // Pfad sicherstellen
import { ZielgruppeOption } from '../components/distribution-step/distribution-step.component'; // Pfad sicherstellen

// Interfaces, die die Struktur deiner prices.json widerspiegeln
export interface PriceDistributionRates {
  [category: string]: number; // z.B. "A": 140 (pro 1000 Flyer)
}

export interface PriceVerteilungZuschlagFormat {
  Lang?: number; // Absoluter Zuschlag pro 1000 Flyer, z.B. 20
  A4?: number;
  A3?: number;
  anderes?: string;
}

export interface PriceSurcharges {
  fahrzeugGPS?: number; // Einmalig
  abholungFlyer?: number; // Einmalig
  express?: number; // Faktor, z.B. 0.5 für 50%
  mindestbestellwert?: number; // Schwellenwert für die Pauschale
}

export interface PriceDistribution {
  mfh: PriceDistributionRates;
  efh: PriceDistributionRates;
  perimeter: {
    base: number; // pro 1000 Flyer
  };
  verteilungZuschlagFormat: PriceVerteilungZuschlagFormat;
  surcharges: PriceSurcharges;
}

export interface AppPrices {
  distribution: PriceDistribution;
  designPackages: {
    [key: string]: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class CalculatorService {
  private prices$: Observable<AppPrices | null> | null = null;
  private readonly pricesUrl = 'assets/prices.json';
  private logPrefix = () => `[CalculatorService ${new Date().toISOString()}]`;

  constructor(private http: HttpClient) {}

  private loadPrices(): Observable<AppPrices | null> {
    if (!this.prices$) {
      this.prices$ = this.http.get<AppPrices>(this.pricesUrl).pipe(
        tap(prices => console.log(`${this.logPrefix()} Geladene Preise:`, prices)),
        shareReplay(1),
        catchError(error => {
          console.error(`${this.logPrefix()} Fehler beim Laden von prices.json:`, error);
          return of(null);
        })
      );
    }
    return this.prices$;
  }

  public getPricesObservable(): Observable<AppPrices | null> {
    return this.loadPrices();
  }

  getDesignPrice(packageName: DesignPackage | string): Observable<number> {
    if (!packageName) {
      return of(0);
    }
    return this.loadPrices().pipe(
      map(prices => {
        if (prices?.designPackages?.[packageName] !== undefined) {
          return prices.designPackages[packageName];
        }
        console.warn(`${this.logPrefix()} Preis für Designpaket "${packageName}" nicht gefunden.`);
        return 0;
      }),
      catchError(() => of(0))
    );
  }

  getDistributionRatePer1000(entry: PlzEntry, zielgruppe: ZielgruppeOption, prices: AppPrices): number {
    // TODO: PlzEntry muss um 'preisKategorie: string;' erweitert und befüllt werden.
    const preisKategorie = (entry as any)['preisKategorie'] || 'A'; // Fallback auf 'A'

    if (!prices) return 0;
    let rateTable: PriceDistributionRates | undefined;

    if (zielgruppe === 'Mehrfamilienhäuser' || zielgruppe === 'Alle Haushalte') {
      rateTable = prices.distribution.mfh;
    } else if (zielgruppe === 'Ein- und Zweifamilienhäuser') {
      rateTable = prices.distribution.efh;
    } else {
      console.warn(`${this.logPrefix()} Unbekannte Zielgruppe für Verteilpreis: ${zielgruppe}`);
      return 0;
    }

    if (rateTable && rateTable[preisKategorie] !== undefined) {
      return rateTable[preisKategorie];
    }
    console.warn(`${this.logPrefix()} Verteilpreis für Zielgruppe "${zielgruppe}", Kategorie "${preisKategorie}" nicht gefunden. Standard 0 wird verwendet.`);
    return 0;
  }

  getSurchargeValue(surchargeKey: keyof Omit<PriceSurcharges, 'express'>, prices: AppPrices): number {
    if (prices?.distribution?.surcharges?.[surchargeKey] !== undefined) {
      // TypeScript kann hier nicht sicher sein, dass es eine Zahl ist, daher der Cast
      return Number((prices.distribution.surcharges as any)[surchargeKey]);
    }
    console.warn(`${this.logPrefix()} Zuschlag für Schlüssel "${surchargeKey}" nicht gefunden.`);
    return 0;
  }

  getExpressSurchargeFactor(prices: AppPrices): number {
    if (prices?.distribution?.surcharges?.express !== undefined) {
      return Number(prices.distribution.surcharges.express);
    }
    console.warn(`${this.logPrefix()} Express Zuschlagsfaktor nicht gefunden.`);
    return 0; // Kein Zuschlag, wenn Faktor nicht definiert
  }

  getVerteilungZuschlagFormatPro1000(formatKey: 'Lang' | 'A4' | 'A3', prices: AppPrices): number {
    if (prices?.distribution?.verteilungZuschlagFormat) {
      const zuschlag = prices.distribution.verteilungZuschlagFormat[formatKey];
      if (typeof zuschlag === 'number') {
        return zuschlag;
      }
    }
    console.warn(`${this.logPrefix()} Verteilung Zuschlag Format pro 1000 für Schlüssel "${formatKey}" nicht gefunden oder keine Zahl.`);
    return 0;
  }
}
