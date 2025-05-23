export interface FlyerDesignPackage {
  id: 'silber' | 'gold' | 'platin';
  name: string;
  priceNormal: number;
  priceDiscounted: number;
  isBestseller: boolean;
  features: string[];
  designProposals: number;
  revisions: number;
  printablePdf: boolean;
  swissQualityCheck: boolean;
  sourceFiles: boolean;
  logoBrandingConsultation: boolean;
  marketingStrategy: boolean;
}
