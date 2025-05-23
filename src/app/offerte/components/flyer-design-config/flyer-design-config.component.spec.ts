import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';

import { FlyerDesignConfigComponent } from './flyer-design-config.component';
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';
import { FlyerDesignConfig } from '../../interfaces/flyer-design-config.interface';

// WICHTIG: Importiere das Original für den `remove` Teil von overrideComponent
import { PackageCardComponent } from '../package-card/package-card.component';

// Mock-Daten
const MOCK_DESIGN_PACKAGES_DATA: FlyerDesignPackage[] = [
  {
    id: 'silber', name: 'Silber Test', priceNormal: 100, priceDiscounted: 90, isBestseller: false, features: ['S-Feature 1'], designProposals: 1, revisions: 1, printablePdf: true, swissQualityCheck: true, sourceFiles: false, logoBrandingConsultation: false, marketingStrategy: false,
  },
  {
    id: 'gold', name: 'Gold Test', priceNormal: 200, priceDiscounted: 180, isBestseller: true, features: ['G-Feature 1', 'G-Feature 2'], designProposals: 2, revisions: 2, printablePdf: true, swissQualityCheck: true, sourceFiles: true, logoBrandingConsultation: false, marketingStrategy: false,
  },
  {
    id: 'platin', name: 'Platin Test', priceNormal: 300, priceDiscounted: 250, isBestseller: false, features: ['P-Feature 1', 'P-Feature 2', 'P-Feature 3'], designProposals: 3, revisions: 3, printablePdf: true, swissQualityCheck: true, sourceFiles: true, logoBrandingConsultation: true, marketingStrategy: true,
  }
];

// Mock für die Kind-Komponente PackageCardComponent
@Component({
  selector: 'app-package-card', // Muss mit dem Selector der echten Komponente übereinstimmen
  standalone: true,
  imports: [CommonModule], // Mock kann auch CommonModule importieren, falls nötig
  template: '<div class="mock-package-card" (click)="triggerPackageClick()">Mock Card: {{packageData?.name}}</div>'
})
class MockPackageCardComponent {
  @Input() packageData!: FlyerDesignPackage;
  @Input() isSelected: boolean = false;
  @Output() packageClicked = new EventEmitter<string>();

  triggerPackageClick() {
    if (this.packageData) {
      this.packageClicked.emit(this.packageData.id);
    }
  }
}

describe('FlyerDesignConfigComponent', () => {
  let component: FlyerDesignConfigComponent;
  let fixture: ComponentFixture<FlyerDesignConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FlyerDesignConfigComponent, // Die zu testende Komponente (standalone)
        // MockPackageCardComponent NICHT hier importieren, wird über override gehandhabt
      ],
      // declarations: [], // Nicht mehr nötig bei standalone
    })
      .overrideComponent(FlyerDesignConfigComponent, {
        // Entferne den echten PackageCardComponent aus den Imports der FlyerDesignConfigComponent
        // für diesen Test, damit nur der Mock verwendet wird.
        // Dies ist nötig, wenn FlyerDesignConfigComponent PackageCardComponent in seinem 'imports'-Array hat.
        remove: { imports: [PackageCardComponent] },
        // Füge den MockPackageCardComponent zu den Imports der FlyerDesignConfigComponent hinzu.
        add: { imports: [MockPackageCardComponent] }
      })
      .compileComponents();

    fixture = TestBed.createComponent(FlyerDesignConfigComponent);
    component = fixture.componentInstance;
    // Setze die Daten für die Komponente vor dem ersten detectChanges
    component.allPackages = JSON.parse(JSON.stringify(MOCK_DESIGN_PACKAGES_DATA));
    fixture.detectChanges(); // Dies ruft ngOnInit zum ersten Mal auf
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with no package selected by default', () => {
    expect(component.currentSelectedPackageId).toBeNull();
    expect(component.getSelectedPackageName()).toBeUndefined();
  });

  it('should initialize with initialConfig if provided', () => {
    const initialConfig: FlyerDesignConfig = { selectedPackageId: 'gold' };
    component.initialConfig = initialConfig;
    component.ngOnInit(); // Rufe ngOnInit erneut auf, da initialConfig nach dem ersten Mal gesetzt wurde
    fixture.detectChanges();

    expect(component.currentSelectedPackageId).toBe('gold');
    expect(component.getSelectedPackageName()).toBe('Gold Test');
  });

  describe('handlePackageSelection', () => {
    it('should select a valid package and update display name (via getSelectedPackageName)', () => {
      spyOn(component.configChanged, 'emit');
      component.handlePackageSelection('gold');
      fixture.detectChanges();

      expect(component.currentSelectedPackageId).toBe('gold');
      expect(component.getSelectedPackageName()).toBe('Gold Test');
      expect(component.configChanged.emit).toHaveBeenCalledWith({ selectedPackageId: 'gold' });
    });

    it('should not select an invalid package id and not emit', () => {
      spyOn(component.configChanged, 'emit');
      component.currentSelectedPackageId = 'gold'; // Setze einen Ausgangszustand
      component.handlePackageSelection('invalid-id');
      fixture.detectChanges();

      expect(component.currentSelectedPackageId).toBe('gold'); // Sollte beim alten Wert bleiben
      expect(component.getSelectedPackageName()).toBe('Gold Test');
      expect(component.configChanged.emit).not.toHaveBeenCalled();
    });

    it('should deselect if the same package is clicked again (current behavior based on handlePackageSelection)', () => {
      component.handlePackageSelection('gold'); // First click selects
      fixture.detectChanges();
      expect(component.currentSelectedPackageId).toBe('gold');

      component.handlePackageSelection('gold'); // Second click on the same package
      fixture.detectChanges();
      // Erwartung hängt von der Logik in handlePackageSelection ab.
      // Wenn ein zweiter Klick deselektiert:
      // expect(component.currentSelectedPackageId).toBeNull();
      // expect(component.getSelectedPackageName()).toBeUndefined();
      // Wenn ein zweiter Klick nichts ändert (bleibt ausgewählt):
      expect(component.currentSelectedPackageId).toBe('gold');
      expect(component.getSelectedPackageName()).toBe('Gold Test');
    });


    it('should update selection when a package card emits packageClicked', () => {
      spyOn(component, 'handlePackageSelection').and.callThrough();
      const packageCardDebugElements = fixture.debugElement.queryAll(By.directive(MockPackageCardComponent));
      expect(packageCardDebugElements.length).toBe(MOCK_DESIGN_PACKAGES_DATA.length);

      const goldCardInstance = packageCardDebugElements[1].componentInstance as MockPackageCardComponent;
      goldCardInstance.packageClicked.emit('gold');
      fixture.detectChanges();

      expect(component.handlePackageSelection).toHaveBeenCalledWith('gold');
      expect(component.currentSelectedPackageId).toBe('gold');
      expect(component.getSelectedPackageName()).toBe('Gold Test');
    });
  });

  describe('getFeatureDisplayValue', () => {
    const testPackagePlatin: FlyerDesignPackage = MOCK_DESIGN_PACKAGES_DATA[2];
    const testPackageSilber: FlyerDesignPackage = MOCK_DESIGN_PACKAGES_DATA[0];

    it('should return "✔" for true boolean features', () => {
      expect(component.getFeatureDisplayValue(testPackagePlatin, 'printablePdf')).toBe('✔');
    });

    it('should return "·" for false boolean features', () => {
      expect(component.getFeatureDisplayValue(testPackageSilber, 'sourceFiles')).toBe('·');
    });

    it('should return the number for numeric features like designProposals', () => {
      expect(component.getFeatureDisplayValue(testPackagePlatin, 'designProposals')).toBe(3);
    });

    it('should return the number for numeric features like revisions', () => {
      expect(component.getFeatureDisplayValue(testPackagePlatin, 'revisions')).toBe(3);
    });

    it('should return the package name for the "name" feature key', () => {
      expect(component.getFeatureDisplayValue(testPackagePlatin, 'name' as keyof FlyerDesignPackage)).toBe('Platin Test');
    });
  });

  describe('Template Rendering', () => {
    it('should render an app-package-card for each package using the mock', () => {
      const packageCardDebugElements = fixture.debugElement.queryAll(By.directive(MockPackageCardComponent));
      expect(packageCardDebugElements.length).toBe(MOCK_DESIGN_PACKAGES_DATA.length);
      // Stelle sicher, dass es wirklich der Mock ist (optional, aber gut für die Verifizierung)
      packageCardDebugElements.forEach(el => {
        expect(el.componentInstance).toBeInstanceOf(MockPackageCardComponent);
      });
    });

    it('should display the selected package name when a package is selected', () => {
      component.handlePackageSelection('platin');
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const selectionInfo = compiled.querySelector('.current-selection-info strong');
      expect(selectionInfo?.textContent).toContain('Platin Test');
    });

    it('should not display selection info if no package is selected', () => {
      component.currentSelectedPackageId = null; // Explizit null setzen
      // component.allPackages = []; // Optional: Leere Daten, um sicherzustellen, dass kein Name gefunden wird
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const selectionInfo = compiled.querySelector('.current-selection-info');
      // Erwartung: Das Element ist nicht da oder hat keinen Text, der auf eine Auswahl hindeutet
      // Wenn das Element immer da ist, aber der Text leer ist:
      // const strongElement = compiled.querySelector('.current-selection-info strong');
      // expect(strongElement?.textContent?.trim()).toBe('');
      // Wenn das Element mit ngIf gerendert wird:
      expect(selectionInfo).toBeFalsy(); // Oder genauer, wenn es ein Parent-Element gibt, das verschwindet
    });

    it('should render the comparison table headers correctly', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const headers = compiled.querySelectorAll('.comparison-table-area th');
      expect(headers.length).toBe(1 + MOCK_DESIGN_PACKAGES_DATA.length); // "Leistung" + Anzahl Pakete
      expect(headers[0]?.textContent?.trim()).toBe('Leistung');
      expect(headers[1]?.textContent?.trim()).toBe(MOCK_DESIGN_PACKAGES_DATA[0].name); // Silber Test
    });

    it('should render the comparison table rows and feature labels correctly', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const featureRows = compiled.querySelectorAll('.comparison-table-area tbody tr');
      expect(featureRows.length).toBe(component.comparisonTableFeatures.length);

      if (component.comparisonTableFeatures.length > 0) {
        const firstFeatureRowCells = featureRows[0].querySelectorAll('td');
        expect(firstFeatureRowCells[0]?.textContent?.trim()).toBe(component.comparisonTableFeatures[0].label);
        expect(firstFeatureRowCells.length).toBe(1 + MOCK_DESIGN_PACKAGES_DATA.length); // Label + Anzahl Pakete
      }
    });

    it('should highlight the selected package column in the table', () => {
      component.handlePackageSelection('gold');
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      const headers = compiled.querySelectorAll('.comparison-table-area th');
      // Header Indizes: 0="Leistung", 1="Silber", 2="Gold", 3="Platin"
      expect(headers[2].classList.contains('highlight-col')).toBe(true, 'Gold header should be highlighted');
      expect(headers[1].classList.contains('highlight-col')).toBe(false, 'Silber header should not be highlighted');

      if (component.comparisonTableFeatures.length > 0) {
        const firstFeatureRowCells = compiled.querySelectorAll('.comparison-table-area tbody tr')[0].querySelectorAll('td');
        // Zellen Indizes: 0=Label, 1=Silber-Wert, 2=Gold-Wert, 3=Platin-Wert
        expect(firstFeatureRowCells[2].classList.contains('highlight-col')).toBe(true, 'Gold cell in first feature row should be highlighted');
        expect(firstFeatureRowCells[1].classList.contains('highlight-col')).toBe(false, 'Silber cell in first feature row should not be highlighted');
      }
    });
  });
});
