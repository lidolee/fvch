import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';
import { ContactData } from '../../interfaces/contact-data.interface'; // Verwendet das wiederhergestellte Interface
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-contact-data',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModule],
  templateUrl: './contact-data.component.html', // Dein neues HTML wird hier verwendet
  styleUrls: ['./contact-data.component.scss']
})
export class ContactDataComponent implements OnInit {
  @Input() disabled = false;
  contactForm: FormGroup;
  isStepCompleted = false;
  initialDataLoaded = false;

  // Dieses Array wird vom Dropdown im neuen HTML für das 'gender'-Feld benötigt
  salutations: string[] = ['Herr', 'Frau', 'Divers']; // Werte basierend auf deinem neuen HTML

  constructor(
    private fb: FormBuilder,
    private modalService: NgbModal,
    private offerteState: OfferteStateService
  ) {
    // Dies ist die FormGroup-Definition des "alten" Controllers
    this.contactForm = this.fb.group({
      gender: ['', Validators.required], // Wird im HTML für das Anrede-Dropdown verwendet
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      companyName: [''], // Für das Firmenfeld
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern('^[0-9\\s\\+\\/\\(\\)]+$')]],
      street: ['', Validators.required],
      houseNumber: ['', Validators.required],
      zip: ['', [Validators.required, Validators.pattern('^[0-9]{4}$')]], // Für das PLZ-Feld
      city: ['', Validators.required],
      notes: [''] // Dieses Feld ist im Formular, aber nicht im neuen HTML sichtbar
    });
  }

  ngOnInit() {
    this.offerteState.stepState$.subscribe(state => {
      // Prüfe, ob state.contactData existiert, bevor auf isCompleted zugegriffen wird
      this.isStepCompleted = state.contactData ? state.contactData.isCompleted : false;
    });

    this.offerteState.contactData$.pipe(take(1)).subscribe((data: ContactData | null) => {
      if (data) {
        this.contactForm.patchValue(data);
      }
      this.initialDataLoaded = true;
    });
  }

  openContactModal(content: any) {
    if (!this.disabled) {
      this.offerteState.contactData$.pipe(take(1)).subscribe((data: ContactData | null) => {
        if (data) {
          this.contactForm.reset(data);
        } else {
          this.contactForm.reset();
        }
      });
      this.modalService.open(content, { animation: false, fullscreen: true, windowClass: 'contact-data-modal', backdropClass: 'contact-data-modal-backdrop' });
    }
  }

  onSubmit() {
    if (this.contactForm.valid) {
      this.offerteState.updateContactData(this.contactForm.value);
      this.modalService.dismissAll();
    } else {
      Object.keys(this.contactForm.controls).forEach(key => {
        this.contactForm.get(key)?.markAsTouched();
      });
      console.warn("Kontaktdaten-Formular ist ungültig.");
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.contactForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  get fc(): { [key: string]: AbstractControl } { // fc Getter für einfacheren Zugriff im Template
    return this.contactForm.controls;
  }
}
