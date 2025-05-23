export interface StepState {
  isCompleted: boolean;
  isAccessible: boolean;
}

export interface OfferteStepState {
  contactData: StepState;
  solutions: StepState;
  confirmation: StepState;
}
