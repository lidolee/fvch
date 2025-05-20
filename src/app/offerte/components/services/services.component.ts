import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModule],
  templateUrl: './services.component.html',
  styleUrl: './services.component.scss'
})
export class ServicesComponent {
  servicesForm: FormGroup;

  // Beispiel-Services - diese sollten später aus einem Service oder einer Konfiguration kommen
  availableServices = [
    { id: 'web', name: 'Webentwicklung', description: 'Entwicklung von Webseiten und Webanwendungen' },
    { id: 'mobile', name: 'Mobile Apps', description: 'Entwicklung von mobilen Anwendungen' },
    { id: 'cloud', name: 'Cloud Services', description: 'Cloud-Infrastruktur und Beratung' },
    { id: 'consulting', name: 'IT Beratung', description: 'Strategische IT-Beratung' }
  ];

  constructor(
    private fb: FormBuilder,
    private modalService: NgbModal,
    private offerteState: OfferteStateService
  ) {
    this.servicesForm = this.fb.group({
      selectedServices: [[], [Validators.required, Validators.minLength(1)]],
      additionalNotes: ['']
    });
  }

  openServicesModal(content: any) {
    this.modalService.open(content, {
      fullscreen: true,
      windowClass: 'services-modal',
      backdropClass: 'services-modal-backdrop'
    });
  }

  onSubmit() {
    if (this.servicesForm.valid) {
      this.offerteState.updateServices(this.servicesForm.value);
      this.modalService.dismissAll();
    } else {
      Object.keys(this.servicesForm.controls).forEach(key => {
        const control = this.servicesForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.servicesForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  // Hilfsmethode zum Prüfen, ob ein Service ausgewählt ist
  isServiceSelected(serviceId: string): boolean {
    const selectedServices = this.servicesForm.get('selectedServices')?.value || [];
    return selectedServices.includes(serviceId);
  }

  // Methode zum Togglen eines Services
  toggleService(serviceId: string) {
    const selectedServices = [...(this.servicesForm.get('selectedServices')?.value || [])];
    const index = selectedServices.indexOf(serviceId);

    if (index === -1) {
      selectedServices.push(serviceId);
    } else {
      selectedServices.splice(index, 1);
    }

    this.servicesForm.patchValue({ selectedServices });
    this.servicesForm.get('selectedServices')?.markAsTouched();
  }
}
