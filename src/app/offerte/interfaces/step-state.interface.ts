export interface StepState {
  isCompleted: boolean;
  isAccessible: boolean;
}

export interface OfferteStepState {
  contactdata: StepState;
  solutions: StepState;
  confirmation: StepState;
}
