import { FlyerDesignConfig } from "./flyer-design-config.interface";

export interface SolutionsData {
  selectedSolutions: string[];
  additionalNotes?: string;
  designConfig?: FlyerDesignConfig; // DAS HINZUFÜGEN
  // printConfig?: any; // Platzhalter für später
  // distributionConfig?: any; // Platzhalter für später
}
