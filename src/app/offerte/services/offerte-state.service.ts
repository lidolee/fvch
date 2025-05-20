import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ContactData } from '../interfaces/contact-data.interface';
import { ServiceData } from '../interfaces/service-data.interface';
import { ConfirmationData } from '../interfaces/confirmation-data.interface';

@Injectable({
  providedIn: 'root'
})
export class OfferteStateService {
  private contactDataSubject = new BehaviorSubject<ContactData | null>(null);
  private serviceDataSubject = new BehaviorSubject<ServiceData | null>(null);
  private confirmationDataSubject = new BehaviorSubject<ConfirmationData | null>(null);
  private stepsCompletedSubject = new BehaviorSubject<{[key: string]: boolean}>({
    contact: false,
    services: false,
    confirmation: false
  });

  contactData$ = this.contactDataSubject.asObservable();
  serviceData$ = this.serviceDataSubject.asObservable();
  confirmationData$ = this.confirmationDataSubject.asObservable();
  stepsCompleted$ = this.stepsCompletedSubject.asObservable();

  updateContactData(data: ContactData) {
    this.contactDataSubject.next(data);
    this.updateStepStatus('contact', true);
  }

  updateServices(data: ServiceData) {
    this.serviceDataSubject.next(data);
    this.updateStepStatus('services', true);
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
