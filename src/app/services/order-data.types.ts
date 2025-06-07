export type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';

export interface PlzSelectionDetail {
  id: string;
  plz6: string;
  plz4: string;
  ort: string;
  kt: string;
  preisKategorie: string;
  all: number | null;
  efh?: number | null;
  mfh?: number | null;
  anzahl: number;
  selected_display_flyer_count: number;
  is_manual_count: boolean;
  zielgruppe: ZielgruppeOption;
}

export type DesignPackageType = 'basis' | 'plus' | 'premium' | 'eigenes';
export type PrintOptionType = 'anliefern' | 'service';
export type FlyerFormatType = 'A6' | 'A5' | 'A4' | 'A3' | 'DIN-Lang' | 'anderes';
export type AnlieferungType = 'selbst' | 'abholung';
export type DruckGrammaturType = '90' | '115' | '130' | '170' | '250' | '300';
export type DruckArtType = 'einseitig' | 'zweiseitig';
export type DruckAusfuehrungType = 'glaenzend' | 'matt';

// NEU: Alias für die Verwendung im CalculatorService und Component
export type DesignPackageService = DesignPackageType;
export type AnlieferungOptionService = AnlieferungType;

// NEU: Spezifischer Typ für Formate mit Zuschlägen + 'anderes'
export type VerteilzuschlagFormatKey = 'Lang' | 'A4' | 'A3' | 'anderes';


export interface AnlieferDetails {
  format: FlyerFormatType | null;
  anlieferung: AnlieferungType | null;
}

export interface PrintServiceDetails {
  format: FlyerFormatType | null;
  grammatur: DruckGrammaturType | null;
  art: DruckArtType | null;
  ausfuehrung: DruckAusfuehrungType | null;
  auflage: number | null;
  reserve: number;
}

export interface VerteilgebietDataState {
  selectedPlzEntries: PlzSelectionDetail[];
  verteilungStartdatum: string | null;
  expressConfirmed: boolean;
  totalFlyersCount: number;
  zielgruppe: ZielgruppeOption;
}

export interface ProduktionDataState {
  designPackage: DesignPackageType | null;
  printOption: PrintOptionType | null;
  anlieferDetails: AnlieferDetails | null;
  printServiceDetails: PrintServiceDetails | null;
}

export interface KontaktDetailsState {
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone?: string | null;
  company?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  website?: string | null;
}

export interface AllOrderDataState {
  verteilgebiet: VerteilgebietDataState;
  produktion: ProduktionDataState;
  kontaktDetails: KontaktDetailsState | null;
}
