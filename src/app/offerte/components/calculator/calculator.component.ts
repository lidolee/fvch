/**
 * @file calculator.component.ts
 * @author lidolee
 * @date 2025-05-23 17:20:10
 * @description Component for quote calculation with live updates. Displays sums based on selected items.
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { OfferCalculationService, SelectedService } from '../../services/offer-calculation.service';

// Interface für ein einzelnes Kalkulationselement
export interface CalculationItem {
  id: string; // Eindeutige ID für das Item im Kalkulator, z.B. 'design_silver'
  name: string;
  price: number;
  type: 'design' | 'print' | 'distribution';
  options?: any;
}

// Interface für die Struktur der gesamten Kalkulation
export interface Calculation {
  items: CalculationItem[];
  subTotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

// ENTFERNT: const DESIGN_PACKAGES: CalculationItem[] = [ ... ];

const PRINT_OPTIONS: CalculationItem[] = [ // Beispielhaft, falls du es später brauchst
  { id: 'print_1000_a5', name: 'Druck 1000 Stk. A5', price: 150, type: 'print', options: { quantity: 1000, format: 'A5'} },
  { id: 'print_5000_a5', name: 'Druck 5000 Stk. A5', price: 450, type: 'print', options: { quantity: 5000, format: 'A5'} },
];

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calculator.component.html',
  styleUrl: './calculator.component.scss'
})
export class CalculatorComponent implements OnInit, OnDestroy {

  public calculation: Calculation = {
    items: [],
    subTotal: 0,
    vatRate: 0.081,
    vatAmount: 0,
    total: 0
  };

  // ENTFERNT: private availableDesignPackages: CalculationItem[] = DESIGN_PACKAGES;
  private availablePrintOptions: CalculationItem[] = PRINT_OPTIONS; // Beibehalten für spätere Print-Logik
  private calculationSubscription: Subscription | undefined;

  constructor(private offerCalculationService: OfferCalculationService) { }

  ngOnInit(): void {
    this.calculationSubscription = this.offerCalculationService.selectedService$.subscribe(serviceEvent => {
      if (serviceEvent) {
        this.handleServiceSelection(serviceEvent);
      }
    });
  }

  private handleServiceSelection(service: SelectedService): void {
    switch (service.type) {
      case 'design':
        this.selectDesignPackageById(service.id); // service.id ist hier die volle ID, z.B. 'design_silver'
        break;
      case 'print':
        this.selectPrintOptionById(service.id);
        break;
      default:
        console.warn(`[CalculatorComponent] Unknown service type received: ${service.type}`);
    }
  }

  ngOnDestroy(): void {
    if (this.calculationSubscription) {
      this.calculationSubscription.unsubscribe();
    }
  }

  public selectDesignPackageById(fullPackageId: string | null): void {
    if (!fullPackageId) { // Wenn ID null oder leer ist
      this.removeItemByType('design');
      return;
    }

    const selectedPackageItem = this.offerCalculationService.getDesignPackageCalculatorItem(fullPackageId);

    if (selectedPackageItem) {
      this.addOrUpdateItem(selectedPackageItem);
    } else {
      console.warn(`[CalculatorComponent] Design package with full ID ${fullPackageId} not found via service or invalid.`);
      this.removeItemByType('design'); // Sicherstellen, dass kein altes Design-Item verbleibt
    }
  }

  public selectPrintOptionById(optionId: string | null): void {
    if (!optionId) {
      this.removeItemByType('print');
      return;
    }
    // Logik für Print-Optionen (wenn Preise zentralisiert werden, ähnlich anpassen)
    const selectedOption = this.availablePrintOptions.find(p => p.id === optionId);
    if (selectedOption) {
      this.addOrUpdateItem(selectedOption);
    } else {
      console.warn(`[CalculatorComponent] Print option with ID ${optionId} not found.`);
      this.removeItemByType('print');
    }
  }

  public addOrUpdateItem(item: CalculationItem): void {
    const existingItemIndex = this.calculation.items.findIndex(i => i.type === item.type);
    let itemChanged = false;
    if (existingItemIndex > -1) {
      if(this.calculation.items[existingItemIndex].id !== item.id || this.calculation.items[existingItemIndex].price !== item.price) {
        this.calculation.items[existingItemIndex] = item;
        itemChanged = true;
      }
    } else {
      this.calculation.items.push(item);
      itemChanged = true;
    }

    if (itemChanged) {
      this.recalculate();
    }
  }

  public removeItemByType(itemType: 'design' | 'print' | 'distribution'): void {
    const initialLength = this.calculation.items.length;
    this.calculation.items = this.calculation.items.filter(item => item.type !== itemType);
    if (this.calculation.items.length < initialLength) {
      this.recalculate();
    }
  }

  private recalculate(): void {
    this.calculation.subTotal = this.calculation.items.reduce((sum, current) => sum + current.price, 0);
    this.calculation.vatAmount = this.calculation.subTotal * this.calculation.vatRate;
    this.calculation.total = this.calculation.subTotal + this.calculation.vatAmount;
    console.log('[CalculatorComponent] Recalculated:', this.calculation);
  }

  public clearCalculation(): void {
    this.calculation.items = [];
    this.recalculate();
  }
}
