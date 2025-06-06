import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DesignPackage, DruckFormat, AnlieferungOption as DesignPrintAnlieferungOption } from '../components/design-print-step/design-print-step.component'; // Pfad sicherstellen

// Definiert die möglichen Flyer-Formate, die einen Verteilzuschlag auslösen können
export type VerteilzuschlagFormatKey = 'Lang' | 'A4' | 'A3' | ''; // Leerstring für "kein spezieller Zuschlag"

@Injectable({
  providedIn: 'root'
})
export class OrderDataService {
  private totalFlyersSource = new BehaviorSubject<number>(0);
  totalFlyersCount$ = this.totalFlyersSource.asObservable();

  private designPackageSource = new BehaviorSubject<DesignPackage | ''>('');
  designPackage$ = this.designPackageSource.asObservable();

  // NEU: Status für das endgültige Flyerformat (relevant für Verteilzuschlag)
  private finalFlyerFormatSource = new BehaviorSubject<VerteilzuschlagFormatKey>('');
  finalFlyerFormat$ = this.finalFlyerFormatSource.asObservable();

  // NEU: Status für die Anlieferungsoption (relevant für Abholgebühr)
  // Verwendet den Typ von DesignPrintStepComponent für Konsistenz
  private anlieferungOptionSource = new BehaviorSubject<DesignPrintAnlieferungOption | ''>('');
  anlieferungOption$ = this.anlieferungOptionSource.asObservable();

  // NEU: Status für bestätigten Express-Zuschlag
  private expressConfirmedSource = new BehaviorSubject<boolean>(false);
  expressConfirmed$ = this.expressConfirmedSource.asObservable();

  constructor() { }

  updateTotalFlyersCount(count: number): void {
    if (this.totalFlyersSource.getValue() !== count) {
      this.totalFlyersSource.next(count);
    }
  }

  getCurrentTotalFlyersCount(): number {
    return this.totalFlyersSource.getValue();
  }

  updateDesignPackage(pkg: DesignPackage | ''): void {
    if (this.designPackageSource.getValue() !== pkg) {
      this.designPackageSource.next(pkg);
    }
  }

  getCurrentDesignPackage(): DesignPackage | '' {
    return this.designPackageSource.getValue();
  }

  /**
   * Aktualisiert das endgültige Flyerformat, das für Verteilzuschläge relevant ist.
   * Wird vom DesignPrintStepComponent aufgerufen.
   */
  updateFinalFlyerFormat(format: VerteilzuschlagFormatKey): void {
    if (this.finalFlyerFormatSource.getValue() !== format) {
      this.finalFlyerFormatSource.next(format);
      // console.log(`[OrderDataService] Final Flyer Format updated to: ${format}`);
    }
  }

  getCurrentFinalFlyerFormat(): VerteilzuschlagFormatKey {
    return this.finalFlyerFormatSource.getValue();
  }

  /**
   * Aktualisiert die gewählte Anlieferungsoption.
   * Wird vom DesignPrintStepComponent aufgerufen.
   */
  updateAnlieferungOption(option: DesignPrintAnlieferungOption | ''): void {
    if (this.anlieferungOptionSource.getValue() !== option) {
      this.anlieferungOptionSource.next(option);
      // console.log(`[OrderDataService] Anlieferung Option updated to: ${option}`);
    }
  }

  getCurrentAnlieferungOption(): DesignPrintAnlieferungOption | '' {
    return this.anlieferungOptionSource.getValue();
  }

  /**
   * Aktualisiert den Status des Express-Zuschlags.
   * Wird vom DistributionStepComponent aufgerufen.
   */
  updateExpressConfirmed(isConfirmed: boolean): void {
    if (this.expressConfirmedSource.getValue() !== isConfirmed) {
      this.expressConfirmedSource.next(isConfirmed);
      // console.log(`[OrderDataService] Express Confirmed updated to: ${isConfirmed}`);
    }
  }

  getCurrentExpressConfirmed(): boolean {
    return this.expressConfirmedSource.getValue();
  }
}
