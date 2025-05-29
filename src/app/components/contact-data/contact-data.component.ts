import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ValidationStatus } from '../../app.component';

@Component({
  selector: 'app-contact-data',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact-data.component.html',
  styleUrls: ['./contact-data.component.scss']
})
export class ContactDataComponent {
  @Output() prevStepRequest = new EventEmitter<void>();
  @Output() submitRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  form: FormGroup;

  salutations = ['Herr', 'Frau', 'Divers / Keine Angabe'];

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      salutation: ['', Validators.required],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      company: [''],
      street: [''],
      houseNumber: [''],
      postalCode: [''],
      city: [''],
      website: ['']
    });

    this.emitValidationStatus();

    this.form.valueChanges.subscribe(() => {
      this.emitValidationStatus();
    });
  }

  private emitValidationStatus() {
    const status: ValidationStatus = this.form.valid
      ? 'valid'
      : this.form.dirty
        ? 'pending'
        : 'invalid';
    this.validationChange.emit(status);
  }

  goBack() {
    this.prevStepRequest.emit();
  }

  finalizeOrder() {
    this.form.markAllAsTouched();
    if (this.form.valid) {
      this.submitRequest.emit();
    } else {
      console.warn('Contact data: Form is not valid.');
    }
  }
}
