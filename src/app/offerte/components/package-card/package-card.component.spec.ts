import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { By } from '@angular/platform-browser';

import { PackageCardComponent } from './package-card.component';
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';

describe('PackageCardComponent', () => {
  let component: PackageCardComponent;
  let fixture: ComponentFixture<PackageCardComponent>;

  const CARD_WRAPPER_SELECTOR = '.package-card-wrapper';
  const SAVINGS_DISPLAY_SELECTOR = '.price-savings';

  const mockPackageDataInitial: FlyerDesignPackage = {
    id: 'silber',
    name: 'Initial Package Name',
    priceNormal: 0,
    priceDiscounted: 0,
    isBestseller: false,
    features: ['Initial Feature'],
    designProposals: 0,
    revisions: 0,
    printablePdf: false,
    swissQualityCheck: false,
    sourceFiles: false,
    logoBrandingConsultation: false,
    marketingStrategy: false,
  };

  const mockPackageDataForSpecificTests: FlyerDesignPackage = {
    id: 'gold',
    name: 'Gold Test',
    priceNormal: 100,
    priceDiscounted: 80,
    isBestseller: true,
    features: ['Feature 1', 'Feature 2'],
    designProposals: 2,
    revisions: 1,
    printablePdf: true,
    swissQualityCheck: true,
    sourceFiles: true,
    logoBrandingConsultation: false,
    marketingStrategy: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        PackageCardComponent,
      ],
    })
      .compileComponents();

    fixture = TestBed.createComponent(PackageCardComponent);
    component = fixture.componentInstance;

    // Setze initiale Daten und führe Change Detection durch
    component.packageData = { ...mockPackageDataInitial };
    fixture.detectChanges(); // Wichtig für die erste Initialisierung
    await fixture.whenStable(); // Sicherstellen, dass alles stabil ist
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display initial package name on creation', () => {
    // Hier sollten die initialen Daten bereits durch das beforeEach gerendert sein
    const nameElement = fixture.debugElement.query(By.css('.package-name'));
    expect(nameElement).withContext('Element with class .package-name should exist').toBeTruthy();
    if (nameElement) {
      expect(nameElement.nativeElement.textContent).toContain(mockPackageDataInitial.name);
    }
  });

  describe('after input updates', () => {
    // Das beforeEach hier wird für jeden Test in diesem Block ausgeführt
    // Wir setzen die neuen Daten und triggern die Change Detection explizit in jedem Test,
    // der diese neuen Daten erwartet, um die Kontrolle zu maximieren.

    it('should display specific package name', fakeAsync(() => {
      component.packageData = { ...mockPackageDataForSpecificTests };
      fixture.detectChanges(); // Änderungen an Inputs anwenden
      tick();                  // Asynchrone Operationen abschließen lassen
      fixture.detectChanges(); // Erneut, um die View basierend auf den Änderungen zu aktualisieren

      const nameElement = fixture.debugElement.query(By.css('.package-name'));
      expect(nameElement).withContext('.package-name should exist after update').toBeTruthy();
      if (nameElement) {
        expect(nameElement.nativeElement.textContent).toContain(mockPackageDataForSpecificTests.name);
      }
    }));

    it('should display features list correctly', fakeAsync(() => {
      component.packageData = { ...mockPackageDataForSpecificTests };
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const featureElements = fixture.debugElement.queryAll(By.css('.features-list li'));
      expect(featureElements.length).withContext('Number of feature list items').toBe(mockPackageDataForSpecificTests.features.length);
      if (mockPackageDataForSpecificTests.features.length > 0 && featureElements.length > 0) {
        expect(featureElements[0].nativeElement.textContent).toContain(mockPackageDataForSpecificTests.features[0]);
        if (mockPackageDataForSpecificTests.features.length > 1 && featureElements.length > 1) {
          expect(featureElements[1].nativeElement.textContent).toContain(mockPackageDataForSpecificTests.features[1]);
        }
      }
    }));

    it('should display bestseller badge if isBestseller is true', fakeAsync(() => {
      component.packageData = { ...mockPackageDataForSpecificTests, isBestseller: true }; // isBestseller hier explizit setzen
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const badgeElement = fixture.debugElement.query(By.css('.bestseller-badge'));
      expect(badgeElement).withContext('Bestseller badge should be present when isBestseller is true').toBeTruthy();
    }));

    it('should display savings in template when savings are positive', fakeAsync(() => {
      component.packageData = { ...mockPackageDataForSpecificTests, priceNormal: 100, priceDiscounted: 80 };
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const savingsDebugElement = fixture.debugElement.query(By.css(SAVINGS_DISPLAY_SELECTOR));
      expect(savingsDebugElement).withContext(`Savings element '${SAVINGS_DISPLAY_SELECTOR}' should be present. Check component's savings getter & HTML *ngIf.`).toBeTruthy();
      if (savingsDebugElement) {
        expect(savingsDebugElement.nativeElement.textContent).toContain('20');
      }
    }));

    it('should apply "selected" class when isSelected is true', fakeAsync(() => {
      component.isSelected = true;
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const cardDebugElement = fixture.debugElement.query(By.css(CARD_WRAPPER_SELECTOR));
      expect(cardDebugElement).withContext(`'${CARD_WRAPPER_SELECTOR}' must exist. Check HTML.`).toBeTruthy();
      if(cardDebugElement) {
        expect(cardDebugElement.nativeElement.classList.contains('selected')).toBe(true);
      }
    }));

    it('should not apply "selected" class when isSelected is false', fakeAsync(() => {
      component.isSelected = false; // Sicherstellen, dass es false ist
      component.packageData = { ...mockPackageDataForSpecificTests }; // Auch packageData setzen, falls es Interaktionen gibt
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const cardDebugElement = fixture.debugElement.query(By.css(CARD_WRAPPER_SELECTOR));
      expect(cardDebugElement).withContext(`'${CARD_WRAPPER_SELECTOR}' must exist. Check HTML.`).toBeTruthy();
      if(cardDebugElement) {
        expect(cardDebugElement.nativeElement.classList.contains('selected')).toBe(false);
      }
    }));

    it('should emit packageClicked event when the card element is clicked', fakeAsync(() => {
      component.packageData = { ...mockPackageDataForSpecificTests }; // Sicherstellen, dass packageData gesetzt ist
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      spyOn(component.packageClicked, 'emit');

      const cardDebugElement = fixture.debugElement.query(By.css(CARD_WRAPPER_SELECTOR));
      expect(cardDebugElement).withContext(`'${CARD_WRAPPER_SELECTOR}' must exist for click. Check HTML.`).toBeTruthy();
      if(cardDebugElement) {
        cardDebugElement.triggerEventHandler('click', null);
        // tick(); // Für emit normalerweise nicht nötig, aber schadet nicht bei OnPush
        expect(component.packageClicked.emit).toHaveBeenCalledWith(mockPackageDataForSpecificTests.id);
      }
    }));
  });

  describe('component logic', () => {
    it('should calculate savings correctly using the "savings" getter', () => {
      component.packageData = { ...mockPackageDataForSpecificTests, priceNormal: 100, priceDiscounted: 80 };
      expect(component.savings).toBe(20);
    });

    it('should return null from "savings" getter if savings are not positive', () => {
      component.packageData = { ...mockPackageDataForSpecificTests, priceNormal: 80, priceDiscounted: 100 };
      expect(component.savings).toBeNull('Savings should be null for negative calculation. Check .ts getter.');

      component.packageData = { ...mockPackageDataForSpecificTests, priceNormal: 100, priceDiscounted: 100 };
      expect(component.savings).toBeNull('Savings should be null for zero calculation. Check .ts getter.');
    });

    it('should emit packageClicked event with package id when onCardClick method is called', () => {
      spyOn(component.packageClicked, 'emit');
      component.packageData = { ...mockPackageDataForSpecificTests };
      component.onCardClick();
      expect(component.packageClicked.emit).toHaveBeenCalledWith(mockPackageDataForSpecificTests.id);
    });
  });

  describe('initial template state', () => {
    // Diese Tests sollten mit dem äußeren beforeEach und fixture.detectChanges() + await fixture.whenStable() funktionieren
    it('should not display bestseller badge if isBestseller is false initially', () => { // Kein fakeAsync hier nötig
      component.packageData = {...mockPackageDataInitial, isBestseller: false };
      fixture.detectChanges(); // Sicherstellen, dass die Änderung übernommen wird

      const badgeElement = fixture.debugElement.query(By.css('.bestseller-badge'));
      expect(badgeElement).withContext('Bestseller badge should NOT be present (initial state).').toBeFalsy();
    });

    it('should not display savings in template when savings are null initially', () => { // Kein fakeAsync
      component.packageData = {...mockPackageDataInitial };
      fixture.detectChanges();

      const savingsDebugElement = fixture.debugElement.query(By.css(SAVINGS_DISPLAY_SELECTOR));
      expect(savingsDebugElement).withContext(`'${SAVINGS_DISPLAY_SELECTOR}' should NOT be present (initial). Check .ts getter & HTML *ngIf.`).toBeFalsy();
    });
  });
});
