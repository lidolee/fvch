import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
// *** THE FIX ***: 'take' is now imported from 'rxjs/operators'.
import { takeUntil, startWith, debounceTime, tap, take } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import { KontaktDetailsState } from '../../services/order-data.types';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-contact-data',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact-data.component.html',
  styleUrls: ['./contact-data.component.scss']
})
export class ContactDataComponent implements OnInit, OnDestroy {

  @Output() validationChange = new EventEmitter<boolean>();
  public form: FormGroup;
  private destroy$ = new Subject<void>();
  public salutations: string[] = ['Herr', 'Frau', 'Keine Angabe'];

  constructor(
    private fb: FormBuilder,
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      salutation: [this.salutations[0], Validators.required],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      company: [''],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      street: [''],
      houseNumber: [''],
      postalCode: [''],
      city: [''],
      website: [''],
      notes: ['']
    });
  }

  ngOnInit(): void {
    // Load initial data from the service
    this.orderDataService.kontaktDetails$
      .pipe(take(1)) // Take only the first emission to pre-fill the form
      .subscribe(details => {
        if (details) {
          this.form.patchValue(details, { emitEvent: false }); // patchValue without emitting an event initially
        }
      });

    // Use `valueChanges` combined with `startWith` to get immediate and subsequent validation states.
    // This is more reliable than `statusChanges`.
    this.form.valueChanges.pipe(
      startWith(this.form.value), // Emit the initial value immediately
      debounceTime(100), // Prevent too many rapid emissions
      tap(() => {
        const isValid = this.form.valid;
        this.validationChange.emit(isValid);
        if (isValid) {
          this.orderDataService.updateKontaktDetails(this.form.value as KontaktDetailsState);
        }
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  public finalizeOrder(): void {
    this.form.markAllAsTouched();
    const isValid = this.form.valid;
    this.validationChange.emit(isValid);
    if (isValid) {
      this.orderDataService.updateKontaktDetails(this.form.value as KontaktDetailsState);
    } else {
      //console.warn('[ContactDataComponent] Finalize order attempt with invalid form.');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
