import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ContactData } from '../interfaces/contact-data.interface';
import { ServiceData } from '../interfaces/service-data.interface';

@Injectable({
  providedIn: 'root'
})
export class OfferteStateService {
  private contactDataSubject = new BehaviorSubject<ContactData | null>(null);
  private serviceDataSubject = new BehaviorSubject<ServiceData | null>(null);
  private stepsCompletedSubject = new BehaviorSubject<{[key: string]: boolean}>({
    contact: false,
    services: false,
    confirmation: false
  });

  contactData$ = this.contactDataSubject.asObservable();
  serviceData$ = this.serviceDataSubject.asObservable();
  stepsCompleted$ = this.stepsCompletedSubject.asObservable();

  updateContactData(data: ContactData) {
    this.contactDataSubject.next(data);
    this.updateStepStatus('contact', true);
  }

  updateServices(data: ServiceData) {
    this.serviceDataSubject.next(data);
    this.updateStepStatus('services', true);
  }

  private updateStepStatus(step: string, completed: boolean) {
    this.stepsCompletedSubject.next({
      ...this.stepsCompletedSubject.value,
      [step]: completed
    });
  }
}
