import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FlyerDesignPackage } from '../interfaces/flyer-design-package.interface';
import { CalculationItem } from '../components/calculator/calculator.component';

export interface SelectedService {
  type: 'design' | 'print' | 'distribution';
  id: string | null;
}

// SINGLE SOURCE OF TRUTH für Design-Paket-Daten
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

// Mapping von vollen Calculator-IDs (Design) zurück zu Kurz-IDs für den internen Datenzugriff
const CALCULATOR_DESIGN_ID_TO_SHORT_ID_MAP: { [key: string]: string } = {
  'design_silver': 'silber',
  'design_gold': 'gold',
  'design_platinum': 'platin',
};

// Daten für Druckoptionen
const PRINT_OPTIONS_SERVICE_DATA: CalculationItem[] = [
  { id: 'print_1000_a5', name: 'Druck 1000 Stk. A5', price: 150, type: 'print', options: { quantity: 1000, format: 'A5'} },
  { id: 'print_5000_a5', name: 'Druck 5000 Stk. A5', price: 450, type: 'print', options: { quantity: 5000, format: 'A5'} },
  { id: 'print_1000_a4', name: 'Druck 1000 Stk. A4', price: 220, type: 'print', options: { quantity: 1000, format: 'A4'} },
];


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

  public selectPrintOption(printOptionId: string | null): void {
    this.updateSelectedService({ type: 'print', id: printOptionId });
  }

  /**
   * Gibt die Liste aller verfügbaren Design-Pakete zurück.
   * Wird von Komponenten wie FlyerDesignConfigComponent verwendet, um Optionen anzuzeigen.
   */
  public getAvailableDesignPackages(): FlyerDesignPackage[] {
    return DESIGN_PACKAGES_SERVICE_DATA;
  }

  public getDesignPackageCalculatorItem(fullCalculatorId: string): CalculationItem | null {
    const shortId = CALCULATOR_DESIGN_ID_TO_SHORT_ID_MAP[fullCalculatorId];
    if (!shortId) {
      console.warn(`[OfferCalculationService] Kein Kurz-ID Mapping für Design-ID ${fullCalculatorId}`);
      return null;
    }
    const packageData = DESIGN_PACKAGES_SERVICE_DATA.find(p => p.id === shortId);
    if (packageData) {
      return {
        id: fullCalculatorId,
        name: `Design Paket ${packageData.name}`,
        price: packageData.priceDiscounted,
        type: 'design'
      };
    }
    console.warn(`[OfferCalculationService] Design-Paketdaten für Kurz-ID ${shortId} (von ${fullCalculatorId}) nicht gefunden.`);
    return null;
  }

  public getPrintOptionCalculatorItem(printOptionId: string): CalculationItem | null {
    const optionData = PRINT_OPTIONS_SERVICE_DATA.find(p => p.id === printOptionId);
    if (optionData) {
      return { ...optionData, type: 'print' };
    }
    console.warn(`[OfferCalculationService] Druckoptionsdaten für ID ${printOptionId} nicht gefunden.`);
    return null;
  }
}
