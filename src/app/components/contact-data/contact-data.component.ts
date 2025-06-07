import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, startWith } from 'rxjs/operators';
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
  public salutations: string[] = ['Keine Angabe', 'Herr', 'Frau', 'Firma'];

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
    this.orderDataService.kontaktDetails$
      .pipe(takeUntil(this.destroy$))
      .subscribe(details => {
        if (details) {
          this.form.patchValue(details, { emitEvent: false });
        }

        this.validationChange.emit(this.form.valid);
        this.cdr.detectChanges();
      });

    this.form.statusChanges
      .pipe(
        takeUntil(this.destroy$),
        startWith(this.form.status)
      )
      .subscribe(status => {
        this.validationChange.emit(status === 'VALID');
        if (status === 'VALID') {
          this.orderDataService.updateKontaktDetails(this.form.value as KontaktDetailsState);
        }
      });
  }

  public finalizeOrder(): void {
    this.form.markAllAsTouched();
    this.validationChange.emit(this.form.valid);
    if (this.form.valid) {
      console.log('[ContactDataComponent] Form is valid, finalizeOrder called.');
      this.orderDataService.updateKontaktDetails(this.form.value as KontaktDetailsState);

    } else {
      console.warn('[ContactDataComponent] Finalize order attempt with invalid form.');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
