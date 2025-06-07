import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PlzEntry } from './plz-data.service';
import {
  ZielgruppeOption,
  PlzSelectionDetail,
  DesignPackageType,
  PrintOptionType,
  FlyerFormatType,
  AnlieferungType,
  DruckGrammaturType,
  DruckArtType,
  DruckAusfuehrungType,
  AnlieferDetails,
  PrintServiceDetails,
  VerteilgebietDataState,
  ProduktionDataState,
  KontaktDetailsState,
  AllOrderDataState
} from './order-data.types';

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

  private orderData = new BehaviorSubject<AllOrderDataState>({
    verteilgebiet: { ...this.initialVerteilgebietState },
    produktion: { ...this.initialProduktionState },
    kontaktDetails: null
  });

  public totalFlyersSubject = new BehaviorSubject<number>(0);
  public totalFlyersCount$ = this.totalFlyersSubject.asObservable();

  constructor() {}

  public getAllOrderDataObservable(): Observable<AllOrderDataState> {
    return this.orderData.asObservable();
  }

  public getAllOrderData(): AllOrderDataState {
    return this.orderData.getValue();
  }

  public updateSelectedPlzEntriesForDistribution(entries: PlzEntry[], zielgruppe: ZielgruppeOption): void {
    const currentData = this.orderData.getValue();
    const plzDetails: PlzSelectionDetail[] = entries.map(e => {
      let count = 0;
      if (zielgruppe === 'Alle Haushalte') count = e.all || 0;
      else if (zielgruppe === 'Mehrfamilienhäuser') count = e.mfh || 0;
      else if (zielgruppe === 'Ein- und Zweifamilienhäuser') count = e.efh || 0;
      return {
        id: e.id, plz6: e.plz6, plz4: e.plz4, ort: e.ort, kt: e.kt,
        preisKategorie: e.preisKategorie, all: e.all, efh: e.efh, mfh: e.mfh,
        anzahl: count,
        selected_display_flyer_count: count,
        is_manual_count: false,
        zielgruppe: zielgruppe
      };
    });
    const newVerteilgebiet = { ...currentData.verteilgebiet, selectedPlzEntries: plzDetails };
    this.orderData.next({ ...currentData, verteilgebiet: newVerteilgebiet });
  }

  public updateSelectedPlzDetails(details: PlzSelectionDetail[]): void {
    const currentData = this.orderData.getValue();
    const newVerteilgebiet = { ...currentData.verteilgebiet, selectedPlzEntries: details };
    this.orderData.next({ ...currentData, verteilgebiet: newVerteilgebiet });
  }

  public updateVerteilungStartdatum(datum: string | null): void {
    const currentData = this.orderData.getValue();
    const newVerteilgebiet = { ...currentData.verteilgebiet, verteilungStartdatum: datum };
    this.orderData.next({ ...currentData, verteilgebiet: newVerteilgebiet });
  }

  public updateExpressConfirmed(confirmed: boolean): void {
    const currentData = this.orderData.getValue();
    const newVerteilgebiet = { ...currentData.verteilgebiet, expressConfirmed: confirmed };
    this.orderData.next({ ...currentData, verteilgebiet: newVerteilgebiet });
  }

  public updateTotalFlyersCount(count: number): void {
    this.totalFlyersSubject.next(count);
    const currentData = this.orderData.getValue();
    const newVerteilgebiet = { ...currentData.verteilgebiet, totalFlyersCount: count };
    this.orderData.next({ ...currentData, verteilgebiet: newVerteilgebiet });
  }

  public updateVerteilart(zielgruppe: ZielgruppeOption): void {
    const currentData = this.orderData.getValue();
    const newVerteilgebiet = { ...currentData.verteilgebiet, zielgruppe: zielgruppe };
    this.orderData.next({ ...currentData, verteilgebiet: newVerteilgebiet });
  }

  public getCurrentVerteilart(): ZielgruppeOption {
    return this.orderData.getValue().verteilgebiet.zielgruppe;
  }
  public getCurrentVerteilungStartdatum(): string | null {
    return this.orderData.getValue().verteilgebiet.verteilungStartdatum;
  }
  public getCurrentExpressConfirmed(): boolean {
    return this.orderData.getValue().verteilgebiet.expressConfirmed;
  }

  public updateDesignPackage(pkg: DesignPackageType | null): void {
    const currentData = this.orderData.getValue();
    const newProduktion = { ...currentData.produktion, designPackage: pkg };
    this.orderData.next({ ...currentData, produktion: newProduktion });
  }
  public getCurrentDesignPackage(): DesignPackageType | null {
    return this.orderData.getValue().produktion.designPackage;
  }

  public updatePrintOption(option: PrintOptionType | null): void {
    const currentData = this.orderData.getValue();
    const newProduktion = { ...currentData.produktion, printOption: option };
    this.orderData.next({ ...currentData, produktion: newProduktion });
  }
  public getCurrentPrintOption(): PrintOptionType | null {
    return this.orderData.getValue().produktion.printOption;
  }

  public updateAnlieferDetails(details: Partial<AnlieferDetails>): void {
    const currentData = this.orderData.getValue();
    const currentAnliefer = currentData.produktion.anlieferDetails || { format: null, anlieferung: null };
    const newProduktion = { ...currentData.produktion, anlieferDetails: { ...currentAnliefer, ...details } };
    this.orderData.next({ ...currentData, produktion: newProduktion });
  }
  public getCurrentAnlieferDetails(): AnlieferDetails | null {
    return this.orderData.getValue().produktion.anlieferDetails;
  }

  public updatePrintServiceDetails(details: Partial<PrintServiceDetails>): void {
    const currentData = this.orderData.getValue();
    const currentPrintService = currentData.produktion.printServiceDetails || { format: null, grammatur: null, art: null, ausfuehrung: null, auflage: 0, reserve: 0 };
    const newProduktion = { ...currentData.produktion, printServiceDetails: { ...currentPrintService, ...details } };
    this.orderData.next({ ...currentData, produktion: newProduktion });
  }
  public getCurrentPrintServiceDetails(): PrintServiceDetails | null {
    return this.orderData.getValue().produktion.printServiceDetails;
  }

  public updateContactData(data: Partial<KontaktDetailsState> | null): void {
    const currentData = this.orderData.getValue();
    const currentContact = currentData.kontaktDetails || { salutation: null, firstName: null, lastName: null, email: null};
    this.orderData.next({ ...currentData, kontaktDetails: data ? { ...currentContact, ...data } : null });
  }
  public getCurrentContactData(): KontaktDetailsState | null {
    return this.orderData.getValue().kontaktDetails;
  }
}
