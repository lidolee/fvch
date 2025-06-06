import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { PlzEntry } from './plz-data.service';
import { ZielgruppeOption } from '../components/distribution-step/distribution-step.component';

export interface PriceDistributionRates { [category: string]: number; }
export interface PriceVerteilungZuschlagFormat { Lang?: number; A4?: number; A3?: number; anderes?: string; }
export interface PriceSurcharges { fahrzeugGPS?: number; abholungFlyer?: number; express?: number; mindestbestellwert?: number; }
export interface PriceDistribution { mfh: PriceDistributionRates; efh: PriceDistributionRates; perimeter: { base: number; }; verteilungZuschlagFormat: PriceVerteilungZuschlagFormat; surcharges: PriceSurcharges; }
export interface AppPrices { distribution: PriceDistribution; designPackages: { [key: string]: number; }; }

@Injectable({
  providedIn: 'root'
})
export class CalculatorService {
  private pricesSource = new BehaviorSubject<AppPrices | null>(null);
  private prices$: Observable<AppPrices | null> = this.pricesSource.asObservable();
  private readonly pricesUrl = 'assets/prices.json';

  constructor(private http: HttpClient) {
    this.loadPrices().subscribe(prices => this.pricesSource.next(prices));
  }

  private loadPrices(): Observable<AppPrices | null> {
    return this.http.get<AppPrices>(this.pricesUrl).pipe(
      shareReplay(1),
      catchError(error => {
        console.error(`Fehler beim Laden von prices.json:`, error);
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

  getDistributionRatePer1000(entry: PlzEntry, zielgruppe: ZielgruppeOption, prices: AppPrices): number {
    const preisKategorie = (entry as any)['preisKategorie'] || 'A';
    let rateTable: PriceDistributionRates | undefined;

    if (zielgruppe === 'Mehrfamilienhäuser' || zielgruppe === 'Alle Haushalte') {
      rateTable = prices.distribution.mfh;
    } else if (zielgruppe === 'Ein- und Zweifamilienhäuser') {
      rateTable = prices.distribution.efh;
    } else {
      return 0;
    }

    return rateTable?.[preisKategorie] ?? 0;
  }
}
