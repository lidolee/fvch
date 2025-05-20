import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModule],
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.scss'
})
export class ConfirmationComponent {
  @Input() disabled = false;
  confirmationForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private modalService: NgbModal,
    private offerteState: OfferteStateService
  ) {
    this.confirmationForm = this.fb.group({
      acceptTerms: [false, [Validators.requiredTrue]],
      acceptPrivacy: [false, [Validators.requiredTrue]],
      newsletter: [false],
      preferredContact: ['email', [Validators.required]]
    });
  }

  openConfirmationModal(content: any) {
    if (!this.disabled) {
      this.modalService.open(content, {
        animation: false,
        fullscreen: true,
        windowClass: 'confirmation-modal',
        backdropClass: 'confirmation-modal-backdrop'
      });
    }
  }

  onSubmit() {
    if (this.confirmationForm.valid) {
      this.offerteState.updateConfirmation(this.confirmationForm.value);
      this.modalService.dismissAll();
    } else {
      Object.keys(this.confirmationForm.controls).forEach(key => {
        const control = this.confirmationForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.confirmationForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }
}
