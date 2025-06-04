import { Component, Output, EventEmitter, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValidationStatus } from '../offer-process/offer-process.component';
import { ContactDataComponent } from '../contact-data/contact-data.component';

@Component({
  selector: 'app-summary-step',
  standalone: true,
  imports: [CommonModule, ContactDataComponent],
  templateUrl: './summary-step.component.html',
  styleUrls: ['./summary-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryStepComponent implements OnInit, AfterViewInit {
  @Output() nextStepRequest = new EventEmitter<void>(); // For actual submission/completion
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  @ViewChild(ContactDataComponent) contactDataComponent!: ContactDataComponent;

  private contactDataIsValid: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // Initial validation state depends on ContactDataComponent, which starts as invalid/pending
    this.validationChange.emit('pending');
  }

  ngAfterViewInit() {
    // Subscribe to validation changes from child ContactDataComponent
    if (this.contactDataComponent) {
      this.contactDataComponent.validationChange.subscribe((status: ValidationStatus) => {
        this.onContactDataValidationChange(status);
      });
      // Emit initial status from contactDataComp after it's initialized
      Promise.resolve().then(() => {
        this.onContactDataValidationChange(this.contactDataComponent.form.valid ? 'valid' : 'pending');
      });
    }
  }

  onContactDataValidationChange(status: ValidationStatus) {
    this.contactDataIsValid = status === 'valid';
    this.validationChange.emit(this.contactDataIsValid ? 'valid' : 'invalid'); // Or 'pending'
    this.cdr.markForCheck();
  }

  // This method will be called by OfferProcessComponent
  public triggerFinalizeOrder() {
    if (this.contactDataComponent) {
      this.contactDataComponent.finalizeOrder(); // This marks form as touched and may emit submitRequest
    }
  }

  // This method is connected to (submitRequest) from ContactDataComponent in the template
  onContactDataSubmitRequest() {
    // This means ContactDataComponent's form was valid and submitted
    this.nextStepRequest.emit(); // Signal to OfferProcessComponent that the final action is done
  }

  // This method can be called by the parent to force UI updates for validation.
  public triggerValidationDisplay(): void {
    if (this.contactDataComponent) {
      this.contactDataComponent.form.markAllAsTouched();
      // Re-emit current validation status
      this.onContactDataValidationChange(this.contactDataComponent.form.valid ? 'valid' : 'invalid');
    }
    this.cdr.markForCheck();
  }
}
