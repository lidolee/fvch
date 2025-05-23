/**
 * @file calculator.component.ts
 * @author lidolee
 * @date 2025-05-23 17:26:12
 * @description Component for quote calculation with live updates. Displays sums based on selected items.
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { OfferCalculationService, SelectedService } from '../../services/offer-calculation.service'; // Pfad anpassen

export interface CalculationItem {
  id: string;
  name: string;
  price: number;
  type: 'design' | 'print' | 'distribution'; // Erweitere Typen bei Bedarf
  options?: any;
}

export interface Calculation {
  items: CalculationItem[];
  subTotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss']
})
export class CalculatorComponent implements OnInit, OnDestroy {

  public calculation: Calculation = {
    items: [],
    subTotal: 0,
    vatRate: 0.081, // Beispiel MwSt.-Satz Schweiz
    vatAmount: 0,
    total: 0
  };

  private calculationSubscription: Subscription | undefined;

  constructor(private offerCalculationService: OfferCalculationService) {
    console.log('[CalculatorComponent] Constructor called.');
  }

  ngOnInit(): void {
    console.log('[CalculatorComponent] ngOnInit.');
    this.calculationSubscription = this.offerCalculationService.selectedService$.subscribe(serviceEvent => {
      console.log('[CalculatorComponent] Received serviceEvent from OfferCalculationService:', serviceEvent);
      if (serviceEvent) {
        this.handleServiceSelection(serviceEvent);
      } else {
        // Dies könnte passieren, wenn der BehaviorSubject initial null emittiert und keine weiteren Items ausgewählt sind.
        // Oder wenn ein Service explizit mit null abgewählt wird und der Service dies so weitergibt.
        console.log('[CalculatorComponent] Received a null or undefined serviceEvent. Clearing all selections or specific types if identifiable.');
        // Hier könntest du entscheiden, ob alle Items oder nur bestimmte Typen entfernt werden sollen,
        // falls der ServiceEvent keine Typinformationen mehr hat.
        // Fürs Erste, wenn ein Design-Paket abgewählt wird, sollte der ServiceEvent { type: 'design', id: null } sein.
      }
    });
  }

  private handleServiceSelection(service: SelectedService | { type: 'design', id: null }): void { // Typ angepasst
    console.log(`[CalculatorComponent] handleServiceSelection called with service type: ${service.type}, id: ${service.id}`);
    switch (service.type) {
      case 'design':
        this.selectDesignPackageById(service.id as string | null); // Cast zu string | null
        break;
      case 'print':
        // this.selectPrintOptionById(service.id as string | null); // Falls implementiert
        console.log('[CalculatorComponent] Print service selection handling not fully implemented yet.');
        break;
      // Zukünftige Typen hier behandeln
      default:
        console.warn(`[CalculatorComponent] Unknown service type received in handleServiceSelection: ${service.type}`);
    }
  }

  ngOnDestroy(): void {
    console.log('[CalculatorComponent] ngOnDestroy. Unsubscribing from calculationSubscription.');
    if (this.calculationSubscription) {
      this.calculationSubscription.unsubscribe();
    }
  }

  public selectDesignPackageById(fullPackageId: string | null): void {
    console.log(`[CalculatorComponent] selectDesignPackageById called with fullPackageId: '${fullPackageId}'`);
    if (fullPackageId === null) { // Explizite Prüfung auf null
      console.log('[CalculatorComponent] fullPackageId is null. Attempting to remove design item.');
      this.removeItemByType('design');
      return;
    }

    const selectedPackageItem = this.offerCalculationService.getDesignPackageCalculatorItem(fullPackageId);
    if (selectedPackageItem) {
      console.log('[CalculatorComponent] Found design package item from service:', selectedPackageItem);
      this.addOrUpdateItem(selectedPackageItem);
    } else {
      console.warn(`[CalculatorComponent] Design package with full ID '${fullPackageId}' not found or invalid. Removing any existing design item.`);
      this.removeItemByType('design');
    }
  }

  // selectPrintOptionById(printOptionId: string | null): void { ... } // Falls benötigt

  public addOrUpdateItem(item: CalculationItem): void {
    console.log(`[CalculatorComponent] addOrUpdateItem called for item ID: ${item.id}, type: ${item.type}, price: ${item.price}`);
    const existingItemIndex = this.calculation.items.findIndex(i => i.type === item.type);
    let itemChanged = false;

    if (existingItemIndex > -1) {
      if(this.calculation.items[existingItemIndex].id !== item.id || this.calculation.items[existingItemIndex].price !== item.price) {
        console.log(`[CalculatorComponent] Updating existing item of type '${item.type}' from ID '${this.calculation.items[existingItemIndex].id}' to ID '${item.id}'.`);
        this.calculation.items[existingItemIndex] = item;
        itemChanged = true;
      } else {
        console.log(`[CalculatorComponent] Item of type '${item.type}' with ID '${item.id}' already exists with the same price. No change.`);
      }
    } else {
      console.log(`[CalculatorComponent] Adding new item of type '${item.type}' with ID '${item.id}'.`);
      this.calculation.items.push(item);
      itemChanged = true;
    }

    if (itemChanged) {
      this.recalculate();
    }
  }

  public removeItemByType(itemType: 'design' | 'print' | 'distribution'): void {
    console.log(`[CalculatorComponent] removeItemByType called for type: '${itemType}'. Current items count: ${this.calculation.items.length}`);
    const initialLength = this.calculation.items.length;
    this.calculation.items = this.calculation.items.filter(item => item.type !== itemType);
    const newLength = this.calculation.items.length;

    if (newLength < initialLength) {
      console.log(`[CalculatorComponent] Item(s) of type '${itemType}' REMOVED. Old count: ${initialLength}, New count: ${newLength}. Recalculating.`);
      this.recalculate();
    } else {
      console.log(`[CalculatorComponent] No item of type '${itemType}' found to remove. Count remains ${initialLength}.`);
    }
  }

  private recalculate(): void {
    console.log('[CalculatorComponent] Recalculating... Current items before recalc:', JSON.parse(JSON.stringify(this.calculation.items)));
    this.calculation.subTotal = this.calculation.items.reduce((sum, current) => sum + current.price, 0);
    this.calculation.vatAmount = this.calculation.subTotal * this.calculation.vatRate;
    this.calculation.total = this.calculation.subTotal + this.calculation.vatAmount;
    console.log('[CalculatorComponent] Recalculated state:', JSON.parse(JSON.stringify(this.calculation)));
  }

  public clearCalculation(): void {
    console.log('[CalculatorComponent] clearCalculation called. Clearing all items.');
    this.calculation.items = [];
    this.recalculate();
  }
}
