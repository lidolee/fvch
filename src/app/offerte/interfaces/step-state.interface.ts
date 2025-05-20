export interface StepState {
  isCompleted: boolean;
  isAccessible: boolean;
}

export interface OfferteStepState {
  contact: StepState;
  solutions: StepState;
  confirmation: StepState;
}
