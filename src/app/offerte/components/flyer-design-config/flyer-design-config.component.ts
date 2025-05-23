import { Component, OnInit, Output, EventEmitter, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';
import { FlyerDesignConfig } from '../../interfaces/flyer-design-config.interface';
import { PackageCardComponent } from '../package-card/package-card.component';
import { OfferCalculationService } from '../../services/offer-calculation.service';

const CALCULATOR_PACKAGE_ID_MAP: { [key: string]: string } = {
  'silber': 'design_silver',
  'gold': 'design_gold',
  'platin': 'design_platinum',
};

const DESIGN_PACKAGES_DATA: FlyerDesignPackage[] = [
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
  public designServiceAktiv: boolean = true; // Initialwert

  comparisonTableFeatures: { key: keyof FlyerDesignPackage, label: string }[] = [
    { key: 'designProposals', label: 'Designvorschläge' },
    { key: 'revisions', label: 'Korrekturen' },
    { key: 'printablePdf', label: 'Druckfähiges PDF' },
    { key: 'swissQualityCheck', label: 'Swiss Quality-Check' },
    { key: 'sourceFiles', label: 'Quelldateien' },
    { key: 'logoBrandingConsultation', label: 'Logo & Branding Beratung' },
    { key: 'marketingStrategy', label: 'Marketing Strategie' },
  ];

  constructor(private offerCalculationService: OfferCalculationService) { }

  ngOnInit(): void {
    this.updateFromInitialConfig();
    this.notifyParentAndService();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialConfig']) {
      this.updateFromInitialConfig();
      this.notifyParentAndService();
    }
  }

  private updateFromInitialConfig(): void {
    if (this.initialConfig) {
      // Wenn initialConfig vorhanden ist, verwende dessen Wert für designAktiv,
      // oder falle auf 'true' zurück, falls initialConfig.designAktiv undefined ist.
      this.designServiceAktiv = this.initialConfig.designAktiv ?? true;

      if (this.initialConfig.selectedPackageId &&
        (this.initialConfig.selectedPackageId === 'silber' || this.initialConfig.selectedPackageId === 'gold' || this.initialConfig.selectedPackageId === 'platin')) {
        this.currentSelectedPackageId = this.initialConfig.selectedPackageId;
      } else {
        this.currentSelectedPackageId = null;
      }
    } else {
      // initialConfig ist NICHT vorhanden. Setze auf Standardwerte.
      this.designServiceAktiv = true; // Standardmäßig aktiv, wenn keine Konfiguration übergeben wird
      this.currentSelectedPackageId = null;
    }
  }

  handlePackageSelection(eventData: any): void {
    console.log('[FlyerDesignConfigComponent] handlePackageSelection received eventData:', eventData);

    let extractedPackageId: 'silber' | 'gold' | 'platin' | null = null;
    const validPackageIds = ['silber', 'gold', 'platin'];

    if (typeof eventData === 'string' && validPackageIds.includes(eventData)) {
      extractedPackageId = eventData as 'silber' | 'gold' | 'platin';
    } else if (eventData && typeof eventData.id === 'string' && validPackageIds.includes(eventData.id)) {
      extractedPackageId = eventData.id as 'silber' | 'gold' | 'platin';
    }

    if (extractedPackageId) {
      if (this.currentSelectedPackageId === extractedPackageId) {
        this.currentSelectedPackageId = null;
      } else {
        this.currentSelectedPackageId = extractedPackageId;
      }
      console.log('[FlyerDesignConfigComponent] Package selected and ID set to:', this.currentSelectedPackageId);
    } else {
      console.warn('[FlyerDesignConfigComponent] Could not extract a valid packageId. currentSelectedPackageId remains:', this.currentSelectedPackageId, '. Received eventData:', eventData);
    }
    this.notifyParentAndService();
  }

  onDesignAktivToggle(aktiv: boolean): void {
    this.designServiceAktiv = aktiv;
    if (!this.designServiceAktiv) {
      this.currentSelectedPackageId = null;
    }
    this.notifyParentAndService();
  }

  private notifyParentAndService(): void {
    const configForParent: FlyerDesignConfig = {
      designAktiv: this.designServiceAktiv,
      selectedPackageId: this.currentSelectedPackageId,
      isValid: this.designServiceAktiv ? !!this.currentSelectedPackageId : true
    };
    console.log('[FlyerDesignConfigComponent] Notifying parent with config:', configForParent);
    this.configChanged.emit(configForParent);

    if (this.designServiceAktiv && this.currentSelectedPackageId) {
      const fullCalculatorId = CALCULATOR_PACKAGE_ID_MAP[this.currentSelectedPackageId];
      if (fullCalculatorId) {
        this.offerCalculationService.selectDesignPackage(fullCalculatorId);
      } else {
        console.warn(`[FlyerDesignConfigComponent] No calculator mapping for package ID: ${this.currentSelectedPackageId}`);
        this.offerCalculationService.selectDesignPackage(null);
      }
    } else {
      this.offerCalculationService.selectDesignPackage(null);
    }
  }

  getFeatureDisplayValue(pkg: FlyerDesignPackage, featureKey: keyof FlyerDesignPackage): string | number {
    const value = pkg[featureKey];
    if (typeof value === 'boolean') {
      return value ? '✔' : '·';
    }
    return value as string | number;
  }

  isSelected(pkgId: 'silber' | 'gold' | 'platin'): boolean {
    return this.currentSelectedPackageId === pkgId && this.designServiceAktiv;
  }
}
