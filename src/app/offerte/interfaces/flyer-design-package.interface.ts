export interface FlyerDesignPackage {
  id: 'silber' | 'gold' | 'platin'; // Eindeutiger interner Name/Schlüssel
  name: string;                     // Anzeigename, z.B. "Silber" oder "Gold - Bestseller"
  priceNormal: number;              // Der ursprüngliche Preis
  priceDiscounted: number;          // Der rabattierte Preis, den der Kunde zahlt
  isBestseller?: boolean;           // Optional: um einen Bestseller zu markieren

  // Liste der Hauptmerkmale für die direkte Anzeige auf der Karte
  features: string[];

  // Detaillierte Aufschlüsselung der Merkmale für die Vergleichstabelle
  designProposals: number;
  revisions: number;
  printablePdf: boolean;
  swissQualityCheck: boolean;
  sourceFiles: boolean;
  logoBrandingConsultation: boolean;
  marketingStrategy: boolean;
}
