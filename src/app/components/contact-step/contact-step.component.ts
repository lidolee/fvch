import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'; // Validators importiert
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-contact-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact-step.component.html',
  styleUrls: ['./contact-step.component.scss'] // Eigene SCSS-Datei, falls spezifische Styles benötigt werden
})
export class ContactStepComponent implements OnInit, OnDestroy {
  @Input() formGroup!: FormGroup;
  @Output() formValid = new EventEmitter<boolean>();
  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();

  private statusSubscription!: Subscription;

  constructor() {}

  ngOnInit(): void {
    if (!this.formGroup) {
      console.error("ContactStepComponent: formGroup is not initialized!");
      // Fallback, sollte aber durch AppComponent sichergestellt sein
      this.formGroup = new FormGroup({
        name: new FormGroup('', Validators.required),
        company: new FormGroup(''),
        email: new FormGroup('', [Validators.required, Validators.email]),
        phone: new FormGroup(''),
        message: new FormGroup('')
      });
    }

    this.statusSubscription = this.formGroup.statusChanges.subscribe(status => {
      this.formValid.emit(status === 'VALID');
    });
    // Initialen Status senden
    this.formValid.emit(this.formGroup.valid);
  }

  onNext(): void {
    if (this.formGroup.valid) {
      this.next.emit();
    } else {
      this.formGroup.markAllAsTouched(); // Zeige Validierungsfehler an
    }
  }

  onPrevious(): void {
    this.previous.emit();
  }

  ngOnDestroy(): void {
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
    }
  }

  // Hilfsmethode für das Template
  isControlInvalid(controlName: string): boolean {
    const control = this.formGroup.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }
}
