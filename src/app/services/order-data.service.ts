import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DesignPackage, AnlieferungOption, PrintOption } from '../components/design-print-step/design-print-step.component';

export type VerteilzuschlagFormatKey = 'A4' | 'A3' | 'Lang' | 'anderes' | '';

@Injectable({
  providedIn: 'root'
})
export class OrderDataService {
  private totalFlyersSource = new BehaviorSubject<number>(0);
  totalFlyersCount$ = this.totalFlyersSource.asObservable();

  private designPackageSource = new BehaviorSubject<DesignPackage | ''>('');
  designPackage$ = this.designPackageSource.asObservable();

  private printOptionSource = new BehaviorSubject<PrintOption | ''>('');
  printOption$ = this.printOptionSource.asObservable();

  private finalFlyerFormatSource = new BehaviorSubject<VerteilzuschlagFormatKey>('');
  finalFlyerFormat$ = this.finalFlyerFormatSource.asObservable();

  private anlieferungOptionSource = new BehaviorSubject<AnlieferungOption | ''>('');
  anlieferungOption$ = this.anlieferungOptionSource.asObservable();

  private expressConfirmedSource = new BehaviorSubject<boolean>(false);
  expressConfirmed$ = this.expressConfirmedSource.asObservable();

  constructor() { }

  updatePrintOption(option: PrintOption | ''): void {
    if (this.printOptionSource.getValue() !== option) {
      this.printOptionSource.next(option);
    }
  }

  updateDesignPackage(pkg: DesignPackage | ''): void {
    if (this.designPackageSource.getValue() !== pkg) {
      this.designPackageSource.next(pkg);
    }
  }

  updateFinalFlyerFormat(format: VerteilzuschlagFormatKey): void {
    if (this.finalFlyerFormatSource.getValue() !== format) {
      this.finalFlyerFormatSource.next(format);
    }
  }

  updateAnlieferungOption(option: AnlieferungOption | ''): void {
    if (this.anlieferungOptionSource.getValue() !== option) {
      this.anlieferungOptionSource.next(option);
    }
  }

  updateExpressConfirmed(isConfirmed: boolean): void {
    if (this.expressConfirmedSource.getValue() !== isConfirmed) {
      this.expressConfirmedSource.next(isConfirmed);
    }
  }

  updateTotalFlyersCount(count: number): void {
    if (this.totalFlyersSource.getValue() !== count) {
      this.totalFlyersSource.next(count);
    }
  }

  // --- GETTER FÜR DIREKTEN ZUGRIFF ---
  getCurrentDesignPackage(): DesignPackage | '' { return this.designPackageSource.getValue(); }
  getCurrentPrintOption(): PrintOption | '' { return this.printOptionSource.getValue(); }
  getCurrentFinalFlyerFormat(): VerteilzuschlagFormatKey { return this.finalFlyerFormatSource.getValue(); }
  getCurrentAnlieferungOption(): AnlieferungOption | '' { return this.anlieferungOptionSource.getValue(); }
  getCurrentExpressConfirmed(): boolean { return this.expressConfirmedSource.getValue(); }
}
