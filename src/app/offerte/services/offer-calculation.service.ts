import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FlyerDesignPackage } from '../interfaces/flyer-design-package.interface'; // Importieren
import { CalculationItem } from '../components/calculator/calculator.component'; // Importieren für den Rückgabetyp

/**
 * Interface, um ein ausgewähltes Service-Item zu beschreiben.
 * 'id' ist die eindeutige ID des Pakets/der Option.
 * Bei 'id: null' wird das Item des entsprechenden Typs aus der Kalkulation entfernt.
 */
export interface SelectedService {
  type: 'design' | 'print' | 'distribution'; // Später ggf. auch 'print', 'distribution'
  id: string | null;
}

// Die originalen Paketdaten, die jetzt der Service kennt.
// Die IDs hier sind die Kurzformen ('silber', 'gold', 'platin').
const DESIGN_PACKAGES_SERVICE_DATA: FlyerDesignPackage[] = [
  {
    id: 'silber', name: 'Silber', priceNormal: 449, priceDiscounted: 399, isBestseller: false,
    features: ['1 Designvorschlag', '1 Korrektur', 'Druckfähiges PDF', 'Swiss Quality-Check'],
    designProposals: 1, revisions: 1, printablePdf: true, swissQualityCheck: true, sourceFiles: false, logoBrandingConsultation: false, marketingStrategy: false,
  },
  {
    id: 'gold', name: 'Gold', priceNormal: 999, priceDiscounted: 899, isBestseller: true,
    features: ['2 Designvorschläge', '3 Korrekturen', 'Druckfähiges PDF', 'Swiss Quality-Check', 'Quelldateien (AI, PSD etc.)'],
    designProposals: 2, revisions: 3, printablePdf: true, swissQualityCheck: true, sourceFiles: true, logoBrandingConsultation: false, marketingStrategy: false,
  },
  {
    id: 'platin', name: 'Platin', priceNormal: 2499, priceDiscounted: 1999, isBestseller: false,
    features: ['3 Designvorschläge', '5 Korrekturen', 'Druckfähiges PDF', 'Swiss Quality-Check', 'Quelldateien (AI, PSD etc.)', 'Logo & Branding Beratung', 'Marketing Strategie'],
    designProposals: 3, revisions: 5, printablePdf: true, swissQualityCheck: true, sourceFiles: true, logoBrandingConsultation: true, marketingStrategy: true,
  }
];

// Mapping von vollen Calculator-IDs zurück zu Kurz-IDs für den internen Datenzugriff
const CALCULATOR_ID_TO_SHORT_ID_MAP: { [key: string]: string } = {
  'design_silver': 'silber',
  'design_gold': 'gold',
  'design_platinum': 'platin',
};


@Injectable({
  providedIn: 'root'
})
export class OfferCalculationService {
  private selectedServiceSubject = new BehaviorSubject<SelectedService | null>(null);
  public selectedService$ = this.selectedServiceSubject.asObservable();

  constructor() { }

  public updateSelectedService(service: SelectedService): void {
    this.selectedServiceSubject.next(service);
  }

  public selectDesignPackage(fullPackageId: string | null): void {
    this.updateSelectedService({ type: 'design', id: fullPackageId });
  }

  public selectPrintOption(optionId: string | null): void {
    this.updateSelectedService({ type: 'print', id: optionId });
  }

  /**
   * Ruft die Details eines Design-Pakets für den Kalkulator ab.
   * @param fullCalculatorId Die volle ID des Pakets (z.B. 'design_silver')
   * @returns Ein CalculationItem-Objekt oder null, wenn nicht gefunden.
   */
  public getDesignPackageCalculatorItem(fullCalculatorId: string): CalculationItem | null {
    const shortId = CALCULATOR_ID_TO_SHORT_ID_MAP[fullCalculatorId];
    if (!shortId) {
      console.warn(`[OfferCalculationService] Kein Kurz-ID Mapping für ${fullCalculatorId}`);
      return null;
    }

    const packageData = DESIGN_PACKAGES_SERVICE_DATA.find(p => p.id === shortId);

    if (packageData) {
      return {
        id: fullCalculatorId, // Die volle ID für den Kalkulator verwenden
        name: `Design Paket ${packageData.name}`, // Name für den Kalkulator anpassen
        price: packageData.priceDiscounted, // Den rabattierten Preis verwenden
        type: 'design'
      };
    }
    console.warn(`[OfferCalculationService] Paketdaten für Kurz-ID ${shortId} (von ${fullCalculatorId}) nicht gefunden.`);
    return null;
  }

  // Zukünftig hier auch Methoden für Print-Optionen etc.
  // public getPrintOptionCalculatorItem(optionId: string): CalculationItem | null { ... }
}
