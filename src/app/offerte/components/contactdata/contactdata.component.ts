import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';

@Component({
  selector: 'app-contactdata',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModule],
  templateUrl: './contactdata.component.html',
  styleUrl: './contactdata.component.scss'
})
export class ContactdataComponent {
  contactForm: FormGroup;
  salutations = ['Herr', 'Frau'];

  constructor(
    private fb: FormBuilder,
    private modalService: NgbModal,
    private offerteState: OfferteStateService
  ) {
    this.contactForm = this.fb.group({
      salutation: ['', [Validators.required]],
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      company: [''],
      street: [''],
      postalCode: [''],
      city: [''],
      website: ['']
    });
  }

  openContactModal(content: any) {
    this.modalService.open(content, {
      fullscreen: true,
      windowClass: 'contact-modal',
      backdropClass: 'contact-modal-backdrop'
    });
  }

  onSubmit() {
    if (this.contactForm.valid) {
      this.offerteState.updateContactData(this.contactForm.value);
      this.modalService.dismissAll();
    } else {
      Object.keys(this.contactForm.controls).forEach(key => {
        const control = this.contactForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.contactForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }
}
