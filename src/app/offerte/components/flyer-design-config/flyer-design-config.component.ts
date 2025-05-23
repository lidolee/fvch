import { Component, OnInit, Output, EventEmitter, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';
import { FlyerDesignConfig } from '../../interfaces/flyer-design-config.interface';
import { PackageCardComponent } from '../package-card/package-card.component';

const DESIGN_PACKAGES_DATA: FlyerDesignPackage[] = [
  {
    id: 'silber', name: 'Silber', priceNormal: 449, priceDiscounted: 399, isBestseller: false,
    features: ['1 Designvorschlag', '1 Korrektur', 'Druckfähiges PDF', 'Swiss Quality-Check'],
    designProposals: 1, revisions: 1, printablePdf: true, swissQualityCheck: true, sourceFiles: false, logoBrandingConsultation: false, marketingStrategy: false,
  },
  {
    id: 'gold', name: 'Gold - Bestseller', priceNormal: 999, priceDiscounted: 899, isBestseller: true,
    features: ['2 Designvorschläge', '3 Korrekturen', 'Druckfähiges PDF', 'Swiss Quality-Check', 'Quelldateien (AI, PSD etc.)'],
    designProposals: 2, revisions: 3, printablePdf: true, swissQualityCheck: true, sourceFiles: true, logoBrandingConsultation: false, marketingStrategy: false,
  },
  {
    id: 'platin', name: 'Platin', priceNormal: 2499, priceDiscounted: 1999, isBestseller: false,
    features: ['3 Designvorschläge', '5 Korrekturen', 'Druckfähiges PDF', 'Swiss Quality-Check', 'Quelldateien (AI, PSD etc.)', 'Logo & Branding Beratung', 'Marketing Strategie'],
    designProposals: 3, revisions: 5, printablePdf: true, swissQualityCheck: true, sourceFiles: true, logoBrandingConsultation: true, marketingStrategy: true,
  }
];

@Component({
  selector: 'app-flyer-design-config',
  standalone: true,
  imports: [
    CommonModule,
    PackageCardComponent
  ],
  templateUrl: './flyer-design-config.component.html',
  styleUrls: ['./flyer-design-config.component.scss']
})
export class FlyerDesignConfigComponent implements OnInit, OnChanges {
  @Input() initialConfig?: FlyerDesignConfig;
  @Output() configChanged = new EventEmitter<FlyerDesignConfig>();

  allPackages: FlyerDesignPackage[] = DESIGN_PACKAGES_DATA;
  currentSelectedPackageId: 'silber' | 'gold' | 'platin' | null = null;

  comparisonTableFeatures: { key: keyof FlyerDesignPackage, label: string }[] = [
    { key: 'designProposals', label: 'Designvorschläge' },
    { key: 'revisions', label: 'Korrekturen' },
    { key: 'printablePdf', label: 'Druckfähiges PDF' },
    { key: 'swissQualityCheck', label: 'Swiss Quality-Check' },
    { key: 'sourceFiles', label: 'Quelldateien' },
    { key: 'logoBrandingConsultation', label: 'Logo & Branding Beratung' },
    { key: 'marketingStrategy', label: 'Marketing Strategie' },
  ];

  constructor() { }

  ngOnInit(): void {
    this.updateFromInitialConfig();
    this.notifyParentAboutChange(); // Wichtig für initialen Zustand an Parent
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialConfig']) {
      this.updateFromInitialConfig();
      this.notifyParentAboutChange(); // Wichtig nach Änderung von initialConfig
    }
  }

  private updateFromInitialConfig(): void {
    if (this.initialConfig && this.initialConfig.selectedPackageId) {
      this.currentSelectedPackageId = this.initialConfig.selectedPackageId;
    } else {
      this.currentSelectedPackageId = null;
    }
  }

  handlePackageSelection(eventData: any): void {
    console.log('[FlyerDesignConfigComponent] handlePackageSelection received eventData:', eventData);

    let extractedPackageId: 'silber' | 'gold' | 'platin' | null = null;
    const validPackageIds = ['silber', 'gold', 'platin'];

    if (typeof eventData === 'string' && validPackageIds.includes(eventData)) {
      extractedPackageId = eventData as 'silber' | 'gold' | 'platin';
    } else if (typeof eventData === 'object' && eventData !== null) {
      if (eventData.id && typeof eventData.id === 'string' && validPackageIds.includes(eventData.id)) {
        extractedPackageId = eventData.id as 'silber' | 'gold' | 'platin';
      } else if (eventData.packageId && typeof eventData.packageId === 'string' && validPackageIds.includes(eventData.packageId)) {
        extractedPackageId = eventData.packageId as 'silber' | 'gold' | 'platin';
      } else if (eventData.detail && typeof eventData.detail === 'string' && validPackageIds.includes(eventData.detail)) {
        // Für CustomEvent, falls die ID in event.detail steckt
        extractedPackageId = eventData.detail as 'silber' | 'gold' | 'platin';
      }
    }

    if (extractedPackageId) {
      this.currentSelectedPackageId = extractedPackageId;
      console.log('[FlyerDesignConfigComponent] Package selected and ID set to:', this.currentSelectedPackageId);
    } else {
      console.warn('[FlyerDesignConfigComponent] Could not extract a valid packageId. currentSelectedPackageId remains:', this.currentSelectedPackageId, '. Received eventData:', eventData);
      // Optional: Wenn keine gültige ID extrahiert werden kann, Auswahl zurücksetzen oder beibehalten.
      // Aktuell wird currentSelectedPackageId nicht geändert, wenn die Extraktion fehlschlägt.
    }
    this.notifyParentAboutChange();
  }

  private notifyParentAboutChange(): void {
    const config: FlyerDesignConfig = {
      designAktiv: true,
      selectedPackageId: this.currentSelectedPackageId,
      isValid: !!this.currentSelectedPackageId // isValid ist true, wenn ein Paket ausgewählt ist
    };
    console.log('[FlyerDesignConfigComponent] Notifying parent with config:', config);
    this.configChanged.emit(config);
  }

  getFeatureDisplayValue(pkg: FlyerDesignPackage, featureKey: keyof FlyerDesignPackage): string | number {
    const value = pkg[featureKey];
    if (typeof value === 'boolean') {
      return value ? '✔' : '·';
    }
    return value as string | number;
  }

  isSelected(pkgId: 'silber' | 'gold' | 'platin'): boolean {
    return this.currentSelectedPackageId === pkgId;
  }
}
