import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common'; // WICHTIG für *ngIf, *ngFor, CurrencyPipe etc.
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms'; // WICHTIG
import { Subscription } from 'rxjs';

interface StepDefinition {
  step: number;
  label: string;
  icon: string;
  validationStatus: 'gray' | 'green' | 'orange' | 'red';
}

interface SelectedOption {
  value: string;
  text: string;
  cost: number;
}

interface DruckDetails {
  format: string | null;
  paper: string | null;
  auflage: number;
  cost: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'FV-FLOW';

  // Stepper Logik
  currentStep: number = 1;
  previousStep: number = 0;
  totalSteps: number = 4;
  stepDefinitions: StepDefinition[] = [
    { step: 1, label: 'Verteilung', icon: 'bi-bounding-box-circles', validationStatus: 'gray' },
    { step: 2, label: 'Design & Druck', icon: 'bi-palette2', validationStatus: 'gray' },
    { step: 3, label: 'Kontakt', icon: 'bi-person-lines-fill', validationStatus: 'gray' },
    { step: 4, label: 'Übersicht', icon: 'bi-check2-all', validationStatus: 'gray' }
  ];

  // Formular Logik
  fvFlowForm!: FormGroup;

  // Optionen & Preisberechnung
  selectedDesign: SelectedOption | null = null;
  selectedDruck: SelectedOption | null = null;
  druckDetails: DruckDetails = { format: 'A5', paper: '135g matt', auflage: 5000, cost: 0 };
  showDruckConfigDetails: boolean = false;

  // Summary Werte
  summaryVerteilungDetails: string = '-';
  summaryVerteilungKosten: number = 0;
  summaryNetto: number = 0;
  summaryMwst: number = 0;
  summaryBrutto: number = 0;

  // Offcanvas (Mobile Summary)
  isOffcanvasOpen: boolean = false;

  private formChangesSubscription!: Subscription;

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private currencyPipe: CurrencyPipe // Optional, wenn man im TS formatieren will
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadInitialData();
    this.updateStepperVisuals();

    this.formChangesSubscription = this.fvFlowForm.valueChanges.subscribe(values => {
      if (this.currentStep === 2 && this.selectedDruck?.value === 'standard_druck') {
        // Nur wenn Standard-Druck aktiv ist und sich relevante Felder ändern
        const flyerFormatChanged = this.fvFlowForm.get('flyerFormat')?.dirty;
        const flyerPaperChanged = this.fvFlowForm.get('flyerPaper')?.dirty;
        const flyerAuflageChanged = this.fvFlowForm.get('flyerAuflage')?.dirty;

        if (flyerFormatChanged || flyerPaperChanged || flyerAuflageChanged) {
          this.updateDruckDetailsFromForm();
        }
      }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.formChangesSubscription) {
      this.formChangesSubscription.unsubscribe();
    }
  }

  private initForm(): void {
    this.fvFlowForm = this.fb.group({
      verteilungsDaten: [null],
      designOption: [null],
      druckOption: [null],
      flyerFormat: ['A5'],
      flyerPaper: ['135g matt'],
      flyerAuflage: [5000, [Validators.required, Validators.min(1)]],
      contactName: ['', Validators.required],
      contactCompany: [''],
      contactEmail: ['', [Validators.required, Validators.email]],
      contactPhone: [''],
      contactMessage: [''],
    });
  }

  private loadInitialData(): void {
    setTimeout(() => {
      this.summaryVerteilungDetails = "Zürich Stadt, ca. 25'000 HH";
      this.summaryVerteilungKosten = 1875.00;
      this.fvFlowForm.get('verteilungsDaten')?.setValue({ details: this.summaryVerteilungDetails, cost: this.summaryVerteilungKosten });
      this.setValidationStateInternal(1, 'green');
      this.recalculateTotalSummary();
      this.cdr.markForCheck();
    }, 100);
  }

  // --- Stepper Navigation & Validierung ---
  nextStep(): void {
    if (this.currentStep < this.totalSteps) {
      if (!this.validateCurrentStepAndUpdateState(true)) {
        this.cdr.markForCheck();
        return;
      }
      this.previousStep = this.currentStep;
      this.currentStep++;
      this.updateStepperVisuals();
      this.cdr.markForCheck();
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.previousStep = this.currentStep;
      this.currentStep--;
      this.updateStepperVisuals();
      this.cdr.markForCheck();
    }
  }

  goToStep(step: number): void {
    if (step >= 1 && step <= this.totalSteps && step !== this.currentStep) {
      const targetStepDef = this.stepDefinitions[step - 1];
      const currentStepDef = this.stepDefinitions[this.currentStep - 1];

      if (step < this.currentStep || targetStepDef.validationStatus === 'green' || targetStepDef.validationStatus === 'orange' || (targetStepDef === currentStepDef && this.currentStep === step) ) {
        if (step > this.currentStep) {
          if (!this.validateCurrentStepAndUpdateState(true)) {
            this.cdr.markForCheck();
            return;
          }
        }
        this.previousStep = this.currentStep;
        this.currentStep = step;
        this.updateStepperVisuals();
        this.cdr.markForCheck();
      }
    }
  }

  private validateCurrentStepAndUpdateState(isNavigatingForward: boolean = false): boolean {
    const stepDef = this.stepDefinitions[this.currentStep - 1];
    if (!stepDef) return true;

    let isValid = true;
    let calculatedValidationState: StepDefinition['validationStatus'] = 'gray';

    switch (this.currentStep) {
      case 1:
        isValid = !!this.fvFlowForm.get('verteilungsDaten')?.value;
        calculatedValidationState = isValid ? 'green' : 'red';
        break;
      case 2:
        const druckOptionVal = this.fvFlowForm.get('druckOption')?.value;
        const auflageControl = this.fvFlowForm.get('flyerAuflage');
        let needsAttentionForStep2 = false;

        if (druckOptionVal === 'standard_druck') {
          isValid = !!(auflageControl?.valid && (auflageControl?.value || 0) >= 1);
        }
        if (!this.selectedDesign && !this.selectedDruck && isNavigatingForward) {
          needsAttentionForStep2 = true;
        }
        if (!isValid && druckOptionVal === 'standard_druck') calculatedValidationState = 'red';
        else if (needsAttentionForStep2) calculatedValidationState = 'orange';
        else calculatedValidationState = 'green';
        break;
      case 3:
        const contactNameCtrl = this.fvFlowForm.get('contactName');
        const contactEmailCtrl = this.fvFlowForm.get('contactEmail');
        contactNameCtrl?.markAsTouched();
        contactEmailCtrl?.markAsTouched();
        this.fvFlowForm.get('contactCompany')?.markAsTouched();
        this.fvFlowForm.get('contactPhone')?.markAsTouched();
        this.fvFlowForm.get('contactMessage')?.markAsTouched();

        isValid = !!(contactNameCtrl?.valid && contactEmailCtrl?.valid);
        calculatedValidationState = isValid ? 'green' : 'red';
        break;
      case 4:
        calculatedValidationState = 'green';
        break;
    }
    this.setValidationStateInternal(this.currentStep, calculatedValidationState);
    return isValid || calculatedValidationState === 'orange';
  }

  private setValidationStateInternal(stepNumber: number, state: StepDefinition['validationStatus']): void {
    const stepDef = this.stepDefinitions.find(s => s.step === stepNumber);
    if (stepDef && stepDef.validationStatus !== state) {
      stepDef.validationStatus = state;
    }
  }

  updateStepperVisuals(): void {
    this.cdr.markForCheck();
  }

  selectDesignOption(value: string, text: string, cost: number): void {
    const designControl = this.fvFlowForm.get('designOption');
    if (this.selectedDesign && this.selectedDesign.value === value) {
      this.selectedDesign = null;
      designControl?.setValue(null);
    } else {
      this.selectedDesign = { value, text, cost };
      designControl?.setValue(value);
    }
    this.recalculateTotalSummary();
    this.validateCurrentStepAndUpdateState();
    this.cdr.markForCheck();
  }

  selectDruckOption(value: string, text: string, costHint: number): void {
    const druckControl = this.fvFlowForm.get('druckOption');
    if (this.selectedDruck && this.selectedDruck.value === value) {
      this.selectedDruck = null;
      druckControl?.setValue(null);
      this.showDruckConfigDetails = false;
      this.druckDetails.cost = 0;
      this.fvFlowForm.get('flyerAuflage')?.clearValidators(); // Validatoren entfernen wenn nicht Standarddruck
      this.fvFlowForm.get('flyerAuflage')?.updateValueAndValidity();
    } else {
      this.selectedDruck = { value, text, cost: (value === 'standard_druck' ? 0 : costHint) };
      druckControl?.setValue(value);
      if (value === 'standard_druck') {
        this.showDruckConfigDetails = true;
        this.fvFlowForm.get('flyerAuflage')?.setValidators([Validators.required, Validators.min(1)]); // Validatoren hinzufügen
        this.updateDruckDetailsFromForm();
      } else {
        this.showDruckConfigDetails = false;
        this.druckDetails.cost = 0;
        this.fvFlowForm.get('flyerAuflage')?.clearValidators();
      }
      this.fvFlowForm.get('flyerAuflage')?.updateValueAndValidity();
    }
    this.recalculateTotalSummary();
    this.validateCurrentStepAndUpdateState();
    this.cdr.markForCheck();
  }

  updateDruckDetailsFromForm(): void {
    if (!this.showDruckConfigDetails || !this.selectedDruck || this.selectedDruck.value !== 'standard_druck') {
      this.druckDetails.cost = 0;
    } else {
      const formValues = this.fvFlowForm.value;
      this.druckDetails.format = formValues.flyerFormat;
      this.druckDetails.paper = formValues.flyerPaper;
      this.druckDetails.auflage = formValues.flyerAuflage || 0;

      let calculatedCost = 0;
      if (this.fvFlowForm.get('flyerAuflage')?.valid && this.druckDetails.auflage > 0) {
        calculatedCost = this.druckDetails.auflage * 0.03;
        if (this.druckDetails.paper && this.druckDetails.paper.includes("170g")) {
          calculatedCost *= 1.2;
        }
      } else {
        // Wenn Auflage ungültig ist, Kosten auf 0 setzen oder Fehler anzeigen
        calculatedCost = 0;
      }
      this.druckDetails.cost = calculatedCost;
    }
    this.recalculateTotalSummary();
    this.validateCurrentStepAndUpdateState();
    this.cdr.markForCheck();
  }

  recalculateTotalSummary(): void {
    const verteilungCost = this.summaryVerteilungKosten || 0;
    const designCost = this.selectedDesign ? this.selectedDesign.cost : 0;
    let druckCostTotal = 0;
    if (this.selectedDruck) {
      druckCostTotal = this.selectedDruck.value === 'standard_druck' ? this.druckDetails.cost : this.selectedDruck.cost;
    }

    this.summaryNetto = verteilungCost + designCost + druckCostTotal;
    this.summaryMwst = this.summaryNetto * 0.077;
    this.summaryBrutto = this.summaryNetto + this.summaryMwst;
    this.cdr.markForCheck();
  }

  toggleOffcanvas(force?: boolean): void {
    this.isOffcanvasOpen = force !== undefined ? force : !this.isOffcanvasOpen;
    this.cdr.markForCheck();
  }

  submitOfferRequest(): void {
    this.fvFlowForm.markAllAsTouched();
    let overallValid = true;
    for (let i = 1; i <= this.totalSteps -1 ; i++) {
      const tempCurrentStep = this.currentStep;
      this.currentStep = i;
      if (!this.validateCurrentStepAndUpdateState(true) && this.stepDefinitions[i-1].validationStatus === 'red') { // Nur wenn wirklich rot
        overallValid = false;
      }
      this.currentStep = tempCurrentStep;
    }
    if (this.currentStep === 3 && !this.validateCurrentStepAndUpdateState(true)) { // Step 3 ist der letzte mit Formular
      overallValid = false;
    }

    if (overallValid && this.fvFlowForm.get('contactName')?.valid && this.fvFlowForm.get('contactEmail')?.valid) {
      console.log('Formular abgeschickt:', this.fvFlowForm.value);
      console.log('Ausgewähltes Design:', this.selectedDesign);
      console.log('Ausgewählter Druck:', this.selectedDruck);
      console.log('Druckdetails:', this.druckDetails);
      console.log('Gesamtkosten Brutto:', this.summaryBrutto);
      alert('FV-FLOW Offertanfrage (simuliert) abgeschickt!');
    } else {
      console.error('Formular ist ungültig oder nicht alle erforderlichen Schritte validiert!');
      let firstInvalidStep = -1;
      for (const stepDef of this.stepDefinitions) {
        if (stepDef.validationStatus === 'red') {
          firstInvalidStep = stepDef.step;
          break;
        }
      }
      if(firstInvalidStep !== -1 && firstInvalidStep !== this.currentStep) {
        this.previousStep = this.currentStep; // Für Animation
        this.currentStep = firstInvalidStep;
        this.updateStepperVisuals();
      }
      this.cdr.markForCheck();
    }
  }

  getValidationIconClass(status: StepDefinition['validationStatus']): string {
    switch (status) {
      case 'green': return 'bi-check-circle-fill step-indicator__validation-icon--green';
      case 'orange': return 'bi-exclamation-circle-fill step-indicator__validation-icon--orange';
      case 'red': return 'bi-x-circle-fill step-indicator__validation-icon--red';
      default: return 'bi-circle step-indicator__validation-icon--gray';
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.fvFlowForm.get(fieldName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  hasFieldError(fieldName: string, error: string): boolean {
    const control = this.fvFlowForm.get(fieldName);
    return !!(control && control.hasError(error));
  }

  // Formatierung für Template mit Pipe (Beispiel)
  formatCurrency(value: number): string | null {
    return this.currencyPipe.transform(value, 'CHF', 'symbol', '1.2-2');
  }
}
