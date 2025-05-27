import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CalculatorService {

  constructor() { }

  calculateVAT(netAmount: number): number {
    return netAmount * 0.077; // 7.7% VAT
  }

  getDesignCost(designOption: string | null): number {
    if (designOption === 'basis') return 149;
    if (designOption === 'premium') return 299;
    return 0; // 'eigenes' or null
  }

  calculatePrintCost(format: string, paper: string, quantity: number): number {
    if (!quantity || quantity < 1) return 0;

    let baseCostPerFlyer = 0.03; // Default für A5, 135g
    // Beispielhafte Anpassungen - diese Logik muss detaillierter sein
    if (format === 'A6') baseCostPerFlyer *= 0.8;
    if (paper.includes('170g')) baseCostPerFlyer *= 1.2;
    // Weitere Staffelpreise etc. könnten hier implementiert werden

    return quantity * baseCostPerFlyer;
  }
}
