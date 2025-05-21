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

  updateContactData(data: ContactData | null) {
    this.contactDataSubject.next(data);
    this.updateStepState('contactdata', data !== null);
  }

  updateSolutions(data: SolutionsData | null) {
    this.solutionsDataSubject.next(data);
    this.updateStepState('solutions', data !== null);
  }

  updateConfirmation(data: ConfirmationData | null) {
    this.confirmationDataSubject.next(data);
    this.updateStepState('confirmation', data !== null);
  }

  invalidateStep(step: keyof OfferteStepState) {
    const currentState = this.stepStateSubject.value;
    const newState: OfferteStepState = {
      ...currentState,
      [step]: {
        ...currentState[step],
        isCompleted: false
      }
    };

    // Nachfolgende Steps invalidieren
    switch(step) {
      case 'solutions':
        newState.contactdata.isAccessible = false;
        newState.contactdata.isCompleted = false;
        newState.confirmation.isAccessible = false;
        newState.confirmation.isCompleted = false;
        break;
      case 'contactdata':
        newState.confirmation.isAccessible = false;
        newState.confirmation.isCompleted = false;
        break;
    }

    this.stepStateSubject.next(newState);
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
}
