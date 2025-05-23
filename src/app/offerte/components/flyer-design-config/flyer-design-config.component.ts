import { Component, OnInit, Output, EventEmitter, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Wichtig für [(ngModel)]
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';
import { FlyerDesignConfig } from '../../interfaces/flyer-design-config.interface';
import { PackageCardComponent } from '../package-card/package-card.component'; // Pfad ggf. anpassen
import { OfferCalculationService } from '../../services/offer-calculation.service';

const CALCULATOR_PACKAGE_ID_MAP: { [key: string]: string } = {
  'silber': 'design_silver',
  'gold': 'design_gold',
  'platin': 'design_platinum',
};

@Component({
  selector: 'app-flyer-design-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule, // Für [(ngModel)] und (ngModelChange) auf deiner Checkbox
    PackageCardComponent
  ],
  templateUrl: './flyer-design-config.component.html',
  styleUrls: ['./flyer-design-config.component.scss']
})
export class FlyerDesignConfigComponent implements OnInit, OnChanges {
  @Input() initialConfig?: FlyerDesignConfig;
  @Output() configChanged = new EventEmitter<FlyerDesignConfig>();

  allPackages: FlyerDesignPackage[] = [];
  currentSelectedPackageId: 'silber' | 'gold' | 'platin' | null = null;
  public designServiceAktiv: boolean = true; // Wird durch DEINE Checkbox im Template gesteuert

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
    console.log(`[FlyerDesignConfigComponent] ngOnInit. Initial designServiceAktiv: ${this.designServiceAktiv}`);
    this.allPackages = this.offerCalculationService.getAvailableDesignPackages();
    this.updateFromInitialConfig();
    if (!this.initialConfig) {
      this.notifyParentAndService(); // Initiale Benachrichtigung
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('[FlyerDesignConfigComponent] ngOnChanges detected:', changes);
    if (changes['initialConfig']) {
      if (!this.allPackages || this.allPackages.length === 0) {
        this.allPackages = this.offerCalculationService.getAvailableDesignPackages();
      }
      this.updateFromInitialConfig();
    }
  }

  private updateFromInitialConfig(): void {
    console.log('[FlyerDesignConfigComponent] updateFromInitialConfig. initialConfig:', this.initialConfig);
    if (this.initialConfig) {
      this.designServiceAktiv = this.initialConfig.designAktiv ?? true; // Fallback auf true
      const selectedId = this.initialConfig.selectedPackageId;
      if (selectedId && (selectedId === 'silber' || selectedId === 'gold' || selectedId === 'platin')) {
        this.currentSelectedPackageId = selectedId;
      } else {
        this.currentSelectedPackageId = null;
      }
    } else {
      // designServiceAktiv behält seinen initialen Wert (true), currentSelectedPackageId ist null
      this.currentSelectedPackageId = null;
    }
    console.log(`[FlyerDesignConfigComponent] After updateFromInitialConfig: designServiceAktiv=${this.designServiceAktiv}, currentSelectedPackageId=${this.currentSelectedPackageId}`);
    this.notifyParentAndService();
  }

  // Diese Methode wird von DEINER Checkbox im Template aufgerufen via (ngModelChange)
  onDesignAktivToggleChange(): void {
    console.log('<<<< [FlyerDesignConfigComponent] onDesignAktivToggleChange entered >>>>');
    // designServiceAktiv wurde bereits durch [(ngModel)] aktualisiert
    console.log(`[FlyerDesignConfigComponent] Current designServiceAktiv state (from ngModel): ${this.designServiceAktiv}`);

    if (!this.designServiceAktiv) {
      // Wenn der Design-Service deaktiviert wird, die Auswahl des Pakets aufheben.
      this.currentSelectedPackageId = null;
      console.log('[FlyerDesignConfigComponent] Design service DEACTIVATED. Cleared currentSelectedPackageId.');
    }
    // Immer den Service und Parent benachrichtigen, auch wenn nur der Aktiv-Status geändert wurde
    // und kein Paket ausgewählt war/ist.
    this.notifyParentAndService();
  }

  handlePackageSelection(packageId: string | null): void { // packageId ist 'silber', 'gold', 'platin' oder null
    console.log(`[FlyerDesignConfigComponent] handlePackageSelection received packageId: ${packageId}`);

    if (!packageId) { // Sollte nicht direkt von der PackageCard kommen, aber als Absicherung
      this.currentSelectedPackageId = null;
    } else if (packageId === 'silber' || packageId === 'gold' || packageId === 'platin') {
      if (this.currentSelectedPackageId === packageId) {
        this.currentSelectedPackageId = null; // Abwahl bei erneutem Klick auf dasselbe Paket
      } else {
        this.currentSelectedPackageId = packageId; // Auswahl eines neuen Pakets
      }
    } else {
      console.warn(`[FlyerDesignConfigComponent] Received unknown packageId in handlePackageSelection: ${packageId}`);
      this.currentSelectedPackageId = null; // Sicherheitshalber zurücksetzen
    }
    console.log(`[FlyerDesignConfigComponent] After handlePackageSelection, currentSelectedPackageId is now: ${this.currentSelectedPackageId}`);
    this.notifyParentAndService();
  }

  private notifyParentAndService(): void {
    const configForParent: FlyerDesignConfig = {
      designAktiv: this.designServiceAktiv,
      selectedPackageId: this.currentSelectedPackageId,
      // Gültig, wenn:
      // 1. Design Service aktiv ist UND ein Paket ausgewählt ist
      // ODER
      // 2. Design Service NICHT aktiv ist (dann ist die Auswahl irrelevant)
      isValid: (this.designServiceAktiv && !!this.currentSelectedPackageId) || (!this.designServiceAktiv)
    };
    console.log('[FlyerDesignConfigComponent] Notifying parent with config:', JSON.parse(JSON.stringify(configForParent)));
    this.configChanged.emit(configForParent);

    // Den OfferCalculationService benachrichtigen
    if (this.designServiceAktiv && this.currentSelectedPackageId) {
      const fullCalculatorId = CALCULATOR_PACKAGE_ID_MAP[this.currentSelectedPackageId];
      if (fullCalculatorId) {
        console.log(`[FlyerDesignConfigComponent] Notifying service: Design ACTIVE, Package selected: ${this.currentSelectedPackageId} (Full ID: ${fullCalculatorId})`);
        this.offerCalculationService.selectDesignPackage(fullCalculatorId);
      } else {
        // Sollte nicht passieren, wenn currentSelectedPackageId einer der gültigen Werte ist
        console.warn(`[FlyerDesignConfigComponent] No calculator mapping for package ID: ${this.currentSelectedPackageId}. Notifying service with null.`);
        this.offerCalculationService.selectDesignPackage(null);
      }
    } else {
      // Dieser Fall tritt ein, wenn:
      // 1. designServiceAktiv = false (Design Service wurde deaktiviert)
      // ODER
      // 2. designServiceAktiv = true, ABER currentSelectedPackageId = null (kein Paket ausgewählt/abgewählt)
      console.log(`[FlyerDesignConfigComponent] Notifying service: Design INACTIVE or NO package selected. designServiceAktiv: ${this.designServiceAktiv}, currentSelectedPackageId: ${this.currentSelectedPackageId}. Sending NULL to service.`);
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

  isSelected(pkgId: FlyerDesignPackage['id']): boolean {
    return this.currentSelectedPackageId === pkgId && this.designServiceAktiv;
  }
}
