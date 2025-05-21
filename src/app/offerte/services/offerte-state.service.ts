import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ContactData } from '../interfaces/contact-data.interface';
import { SolutionsData } from '../interfaces/solutions-data.interface';
import { ConfirmationData } from '../interfaces/confirmation-data.interface';
import { OfferteStepState } from '../interfaces/step-state.interface';

@Injectable({
  providedIn: 'root'
})
export class OfferteStateService {
  private initialStepState: OfferteStepState = {
    solutions: { isCompleted: false, isAccessible: true },
    contactdata: { isCompleted: false, isAccessible: false },
    confirmation: { isCompleted: false, isAccessible: false }
  };

  private contactDataSubject = new BehaviorSubject<ContactData | null>(null);
  private solutionsDataSubject = new BehaviorSubject<SolutionsData | null>(null);
  private confirmationDataSubject = new BehaviorSubject<ConfirmationData | null>(null);
  private stepStateSubject = new BehaviorSubject<OfferteStepState>(this.initialStepState);

  // Public Observables
  contactData$ = this.contactDataSubject.asObservable();
  solutionsData$ = this.solutionsDataSubject.asObservable();
  confirmationData$ = this.confirmationDataSubject.asObservable();
  stepState$ = this.stepStateSubject.asObservable();

  updateContactData(data: ContactData) {
    this.contactDataSubject.next(data);
    this.updateStepState('contactdata', true);
  }

  updateSolutions(data: SolutionsData) {
    this.solutionsDataSubject.next(data);
    this.updateStepState('solutions', true);
  }

  updateConfirmation(data: ConfirmationData) {
    this.confirmationDataSubject.next(data);
    this.updateStepState('confirmation', true);
  }

  private updateStepState(step: keyof OfferteStepState, completed: boolean) {
    const currentState = this.stepStateSubject.value;
    const newState: OfferteStepState = {
      ...currentState,
      [step]: {
        ...currentState[step],
        isCompleted: completed
      }
    };

    // Update accessibility based on completion status
    if (completed) {
      switch(step) {
        case 'solutions':
          newState.contactdata.isAccessible = true;
          break;
        case 'contactdata':
          newState.confirmation.isAccessible = true;
          break;
      }
    }

    this.stepStateSubject.next(newState);
  }

  isStepAccessible(step: keyof OfferteStepState): boolean {
    return this.stepStateSubject.value[step].isAccessible;
  }

  isStepCompleted(step: keyof OfferteStepState): boolean {
    return this.stepStateSubject.value[step].isCompleted;
  }
}
