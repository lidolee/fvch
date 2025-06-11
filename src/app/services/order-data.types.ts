export type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';

export type VerteilungTypOption = 'Nach PLZ' | 'Nach Perimeter';

export interface PlzSelectionDetail {
  id: string;
  plz6: string;
  plz4: string;
  ort: string;
  kt: string;
  preisKategorie?: string;
  all?: number;
  mfh?: number;
  efh?: number;
  isSelected?: boolean;
  isHighlighted?: boolean;

  // Manuelle Anzahl pro Zielgruppe
  manual_flyer_count_mfh: number | null;
  manual_flyer_count_efh: number | null;

  // Der finale Wert, der für die Kalkulation verwendet wird
  selected_flyer_count_mfh: number;
  selected_flyer_count_efh: number;

  // veraltet, wird entfernt oder angepasst
  is_manual_count?: boolean;
  selected_display_flyer_count?: number;
  anzahl: number;
  zielgruppe: ZielgruppeOption;
}


export type DesignPackageType = 'basis' | 'plus' | 'premium' | 'eigenes';

export interface DesignPrices {
  basis: number;
  plus: number;
  premium: number;
  eigenes: number;
}

export type PrintOptionType = 'eigenes' | 'service' | 'anliefern' | null;

export type FlyerFormatType =
  | 'A6' | 'A5' | 'A4' | 'DIN-Lang' | 'DIN_Lang'
  | 'A3' | 'Anderes_Format' | 'anderes' | null;

export type AnlieferungType = 'selbstanlieferung' | 'abholung' | 'selbst' | null;

export type DruckArtType = 'einseitig' | 'zweiseitig' | null;

export type DruckGrammaturType =
  | '90' | '115' | '130' | '170' | '250' | '300'
  | '90g' | '115g' | '130g' | '135g' | '170g' | '250g' | '300g'
  | null;

export type DruckAusfuehrungType = 'standard' | 'express' | 'glaenzend' | 'matt' | null;

export interface AnlieferDetails {
  format: FlyerFormatType | null;
  anlieferung: AnlieferungType | null;
}

export interface PrintServiceDetails {
  format: FlyerFormatType | null;
  grammatur: DruckGrammaturType | null;
  art: DruckArtType | null;
  ausfuehrung: DruckAusfuehrungType | null;
  auflage: number;
  reserve: number;
}

export interface VerteilgebietDataState {
  selectedPlzEntries: PlzSelectionDetail[];
  verteilungStartdatum: Date | null;
  expressConfirmed: boolean;
  totalFlyersCount: number;
  zielgruppe: ZielgruppeOption;
  verteilungTyp: VerteilungTypOption;
}

export interface ProduktionDataState {
  designPackage: DesignPackageType | null;
  printOption: PrintOptionType | null;
  anlieferDetails: AnlieferDetails;
  printServiceDetails: PrintServiceDetails;
  eigenesDesignPdfUploaded?: boolean;
}

export interface KontaktDetailsState {
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  zip?: string | null;
  city?: string | null;
  notes?: string | null;
}

export interface DistributionCostItem {
  plz: string;
  ort: string;
  flyers: number; // 'count' wurde zu 'flyers' umbenannt, um mit dem Template übereinzustimmen
  price: number;  // 'total' wurde zu 'price' umbenannt
}

export interface KostenState {
  selectedPlzEntriesLength: number;
  expressZuschlagApplicable: boolean;
  fahrzeugGpsApplicable: boolean;
  zuschlagFormatAnzeigeText: string;
  totalFlyersForDistribution: number;
  flyerAbholungApplicable: boolean;
  subTotalDistribution: number;
  verteilungTotal: number;
  selectedPrintOption: PrintOptionType | null;
  selectedDesignPackageName: string;
  designPackageCost: number;
  subTotalNetto: number;
  taxRatePercent: number;
  taxAmount: number;
  grandTotalCalculated: number;
  mindestbestellwertHinweis: string;
  distributionHeadline: string;
  distributionCostItems: DistributionCostItem[];
  expressZuschlagPrice: number;
  fahrzeugGpsPrice: number;
  zuschlagFormatPrice: number;
  isAnderesFormatSelected: boolean;
  flyerAbholungPrice: number;
  ausgleichKleinauftragPrice: number;
  printServiceName: string;
  printServiceCost: number;
  mindestbestellwert: number;
  isPerimeterOfferte?: boolean; // NEU
}

export interface StepValidationStatus {
  isStep1Valid: boolean;
  isStep2Valid: boolean;
  isStep3Valid: boolean;
  isOrderProcessValid: boolean;
}

export interface AllOrderDataState {
  verteilgebiet: VerteilgebietDataState;
  produktion: ProduktionDataState;
  kontaktDetails: KontaktDetailsState;
  kosten: KostenState;
  validierungsStatus: StepValidationStatus;
}

export type VerteilzuschlagFormatKey = 'Lang' | 'A4' | 'A3' | 'anderes';
