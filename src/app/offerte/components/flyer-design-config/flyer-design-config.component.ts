import { Component, OnInit, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common'; // WICHTIG
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';
import { FlyerDesignConfig } from '../../interfaces/flyer-design-config.interface';
import { PackageCardComponent } from '../package-card/package-card.component'; // WICHTIG

const DESIGN_PACKAGES_DATA: FlyerDesignPackage[] = [
  {
    id: 'silber',
    name: 'Silber',
    priceNormal: 449,
    priceDiscounted: 399,
    isBestseller: false,
    features: ['1 Designvorschlag', '1 Korrektur', 'Druckfähiges PDF', 'Swiss Quality-Check'],
    designProposals: 1,
    revisions: 1,
    printablePdf: true,
    swissQualityCheck: true,
    sourceFiles: false,
    logoBrandingConsultation: false,
    marketingStrategy: false,
  },
  {
    id: 'gold',
    name: 'Gold - Bestseller',
    priceNormal: 999,
    priceDiscounted: 899,
    isBestseller: true,
    features: ['2 Designvorschläge', '3 Korrekturen', 'Druckfähiges PDF', 'Swiss Quality-Check', 'Quelldateien (AI, PSD etc.)'],
    designProposals: 2,
    revisions: 3,
    printablePdf: true,
    swissQualityCheck: true,
    sourceFiles: true,
    logoBrandingConsultation: false,
    marketingStrategy: false,
  },
  {
    id: 'platin',
    name: 'Platin',
    priceNormal: 2499,
    priceDiscounted: 1999,
    isBestseller: false,
    features: ['3 Designvorschläge', '5 Korrekturen', 'Druckfähiges PDF', 'Swiss Quality-Check', 'Quelldateien (AI, PSD etc.)', 'Logo & Branding Beratung', 'Marketing Strategie'],
    designProposals: 3,
    revisions: 5,
    printablePdf: true,
    swissQualityCheck: true,
    sourceFiles: true,
    logoBrandingConsultation: true,
    marketingStrategy: true,
  }
];

@Component({
  selector: 'app-flyer-design-config',
  standalone: true, // WICHTIG
  imports: [
    CommonModule,         // WICHTIG
    PackageCardComponent  // WICHTIG
  ],
  templateUrl: './flyer-design-config.component.html',
  styleUrls: ['./flyer-design-config.component.scss']
})
export class FlyerDesignConfigComponent implements OnInit {
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
    if (this.initialConfig && this.initialConfig.selectedPackageId) {
      this.currentSelectedPackageId = this.initialConfig.selectedPackageId;
    }
  }

  handlePackageSelection(packageId: string): void {
    if (packageId === 'silber' || packageId === 'gold' || packageId === 'platin') {
      this.currentSelectedPackageId = packageId;
      this.notifyParentAboutChange();
    }
  }

  private notifyParentAboutChange(): void {
    this.configChanged.emit({ selectedPackageId: this.currentSelectedPackageId });
  }

  getFeatureDisplayValue(pkg: FlyerDesignPackage, featureKey: keyof FlyerDesignPackage): string | number {
    const value = pkg[featureKey];
    if (typeof value === 'boolean') {
      return value ? '✔' : '·';
    }
    return value as string | number;
  }

  getSelectedPackageName(): string | undefined {
    if (!this.currentSelectedPackageId) {
      return undefined;
    }
    return this.allPackages.find(p => p.id === this.currentSelectedPackageId)?.name;
  }
}
