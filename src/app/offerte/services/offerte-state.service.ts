import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ContactData } from '../interfaces/contact-data.interface';

@Injectable({
  providedIn: 'root'
})
export class OfferteStateService {
  private contactDataSubject = new BehaviorSubject<ContactData | null>(null);
  private stepsCompletedSubject = new BehaviorSubject<{[key: string]: boolean}>({
    contact: false,
    services: false,
    confirmation: false
  });

  contactData$ = this.contactDataSubject.asObservable();
  stepsCompleted$ = this.stepsCompletedSubject.asObservable();

  updateContactData(data: ContactData) {
    this.contactDataSubject.next(data);
    this.updateStepStatus('contact', true);
  }

  private updateStepStatus(step: string, completed: boolean) {
    this.stepsCompletedSubject.next({
      ...this.stepsCompletedSubject.value,
      [step]: completed
    });
  }
}
