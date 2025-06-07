import { Component, OnInit, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import { KontaktDetailsState } from '../../services/order-data.types';
import { ValidationStatus } from '../offer-process/offer-process.component';

@Component({
  selector: 'app-contact-data',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact-data.component.html',
  styleUrls: ['./contact-data.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContactDataComponent implements OnInit, OnDestroy {
  @Output() public validationChange = new EventEmitter<ValidationStatus>();
  @Output() public submitRequest = new EventEmitter<void>();

  public form!: FormGroup;
  public salutations: string[] = ['Herr', 'Frau', 'Firma'];
  public currentStatus: ValidationStatus = 'unchecked';
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
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
    this.loadInitialData();
    this.form.statusChanges.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.updateAndEmitValidation();
      this.saveData();
    });
    Promise.resolve().then(() => this.updateAndEmitValidation());
  }

  private loadInitialData(): void {
    const contactData = this.orderDataService.getCurrentContactData();
    if (contactData) {
      this.form.patchValue(contactData, { emitEvent: false });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private saveData(): void {
    if (this.form.valid) {
      this.orderDataService.updateContactData(this.form.value as Partial<KontaktDetailsState>);
    }
  }

  private updateAndEmitValidation(): void {
    let newStatus: ValidationStatus;
    if (this.form.valid) {
      newStatus = 'valid';
    } else if (this.form.touched || this.form.dirty) {
      newStatus = 'invalid';
    } else {
      newStatus = 'unchecked';
    }
    if (this.currentStatus !== newStatus) {
      this.currentStatus = newStatus;
      this.validationChange.emit(this.currentStatus);
      this.cdr.markForCheck();
    }
  }

  public finalizeOrder(): void {
    this.form.markAllAsTouched();
    this.updateAndEmitValidation();
    if (this.form.valid) {
      this.saveData();
      this.submitRequest.emit();
    }
  }

  public triggerValidationDisplay(): void {
    this.form.markAllAsTouched();
    this.updateAndEmitValidation();
  }
}
