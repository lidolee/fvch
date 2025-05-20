import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ContactData } from '../interfaces/contact-data.interface';
import { SolutionsData } from '../interfaces/solutions-data.interface';
import { ConfirmationData } from '../interfaces/confirmation-data.interface';

@Injectable({
  providedIn: 'root'
})
export class OfferteStateService {
  private contactDataSubject = new BehaviorSubject<ContactData | null>(null);
  private solutionsDataSubject = new BehaviorSubject<SolutionsData | null>(null);
  private confirmationDataSubject = new BehaviorSubject<ConfirmationData | null>(null);
  private stepsCompletedSubject = new BehaviorSubject<{[key: string]: boolean}>({
    contact: false,
    solutions: false,
    confirmation: false
  });

  contactData$ = this.contactDataSubject.asObservable();
  solutionsData$ = this.solutionsDataSubject.asObservable();
  confirmationData$ = this.confirmationDataSubject.asObservable();
  stepsCompleted$ = this.stepsCompletedSubject.asObservable();

  updateContactData(data: ContactData) {
    this.contactDataSubject.next(data);
    this.updateStepStatus('contact', true);
  }

  updateSolutions(data: SolutionsData) {
    this.solutionsDataSubject.next(data);
    this.updateStepStatus('solutions', true);
  }

  updateConfirmation(data: ConfirmationData) {
    this.confirmationDataSubject.next(data);
    this.updateStepStatus('confirmation', true);
  }

  private updateStepStatus(step: string, completed: boolean) {
    this.stepsCompletedSubject.next({
      ...this.stepsCompletedSubject.value,
      [step]: completed
    });
  }
}
