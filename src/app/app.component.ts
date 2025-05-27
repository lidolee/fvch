import { Component, OnInit, ViewChild, ElementRef, HostListener, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

// Standalone Komponenten importieren
import { DistributionStepComponent } from './components/distribution-step/distribution-step.component';
import { DesignPrintStepComponent } from './components/design-print-step/design-print-step.component';
import { ContactStepComponent } from './components/contact-step/contact-step.component';
import { OverviewStepComponent } from './components/overview-step/overview-step.component';
import { SummaryComponent } from './components/summary/summary.component';

import { CalculatorService } from './services/calculator.service';

interface StepConfig {
  number: number;
  label: string;
  icon: string;
  validationState: 'gray' | 'green' | 'orange' | 'red';
  isValid?: boolean;
}

export interface SummaryData {
  distributionDetails?: string;
  distributionCost?: number;
  designPackage?: string;
  designCost?: number;
  printService?: string;
  printCost?: number;
  printDetails?: { format?: string; paper?: string; quantity?: number; };
  totalNet?: number;
  totalVat?: number;
  totalGross?: number;
}

export interface DistributionSummaryPayload {
  details: string;
  cost: number;
}
export interface DesignPrintSummaryPayload {
  designPackage?: string;
  designCost?: number;
  printService?: string;
  printCost?: number;
  printDetails?: { format?: string; paper?: string; quantity?: number; };
}


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DistributionStepComponent,
    DesignPrintStepComponent,
    ContactStepComponent,
    OverviewStepComponent,
    SummaryComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, AfterViewInit {
  isSummaryOffcanvasOpen = false;

  currentStep: number = 1;
  previousStep: number = 1;
  currentStepTransform: number = 0;
  totalSteps: number = 4;

  fvFlowForm!: FormGroup;

  stepsConfiguration: StepConfig[] = [
    { number: 1, label: 'Verteilung', icon: 'bi-bounding-box-circles', validationState: 'gray', isValid: false },
    { number: 2, label: 'Design & Druck', icon: 'bi-palette2', validationState: 'gray', isValid: true }, // isValid true, da optional
    { number: 3, label: 'Kontakt', icon: 'bi-person-lines-fill', validationState: 'gray', isValid: false },
    { number: 4, label: 'Übersicht', icon: 'bi-check2-all', validationState: 'gray', isValid: true } // isValid true, da keine eigene Validierung
  ];

  currentSummaryData: SummaryData = {
    distributionCost: 0,
    designCost: 0,
    printCost: 0,
    totalNet: 0,
    totalVat: 0,
    totalGross: 0,
  };

  constructor(private fb: FormBuilder, private calculatorService: CalculatorService) {}

  ngOnInit(): void {
    this.fvFlowForm = this.fb.group({
      distribution: this.fb.group({
        selectedAreas: [null, Validators.required],
        households: [0, Validators.min(1)] // Haushalte sollten > 0 sein, wenn ein Gebiet gewählt ist
      }),
      designPrint: this.fb.group({
        designOption: [null],
        printOption: [null],
        flyerFormat: ['A5'],
        flyerPaper: ['135g Bilderdruck matt'],
        flyerQuantity: [5000] // Validatoren werden dynamisch in der Komponente gesetzt
      }),
      contact: this.fb.group({
        name: ['', Validators.required],
        company: [''],
        email: ['', [Validators.required, Validators.email]],
        phone: [''],
        message: ['']
      })
    });

    // Die Initialisierung, die den validationState ändert, in setTimeout verschieben
    setTimeout(() => {
      // Standardwerte setzen oder Logik für geladene Werte
      // Hier setzen wir Standardwerte für die Demo:
      this.distributionForm.patchValue({selectedAreas: "Zürich Stadt", households: 25000}, {emitEvent: false});
      // Manuelles Triggern der Updates nach dem Patchen (da emitEvent: false)
      this.updateDistributionSummary({ details: "Zürich Stadt, ca. 25'000 HH", cost: 1875.00 });
      this.updateStepValidation(1, this.distributionForm.valid); // Prüfe die Gültigkeit des initial gepatchten Formulars

      // Sicherstellen, dass der Stepper korrekt ist
      this.updateStepperVisuals();
    }, 0);

    this.animateInitialStep();
  }

  ngAfterViewInit() {
    // Nichts mehr hier für Offcanvas JS
  }

  get distributionForm(): FormGroup { return this.fvFlowForm.get('distribution') as FormGroup; }
  get designPrintForm(): FormGroup { return this.fvFlowForm.get('designPrint') as FormGroup; }
  get contactForm(): FormGroup { return this.fvFlowForm.get('contact') as FormGroup; }


  toggleSummaryOffcanvas(): void {
    this.isSummaryOffcanvasOpen = !this.isSummaryOffcanvasOpen;
  }

  getAnimationClass(stepNumber: number): string {
    if (stepNumber === this.currentStep && stepNumber > this.previousStep) return 'animate-slide-in-from-right';
    if (stepNumber === this.currentStep && stepNumber < this.previousStep) return 'animate-slide-in-from-left';
    return '';
  }

  animateInitialStep(): void {
    // Verzögere die Animation leicht, um sicherzustellen, dass das Element im DOM ist
    setTimeout(() => {
      const firstStepContent = document.querySelector('#steps-container > *:first-child .step-content-inner');
      if (firstStepContent) {
        // Force reflow/repaint (kann manchmal bei Animationen helfen)
        void (firstStepContent as HTMLElement).offsetWidth;
        firstStepContent.classList.add('animate-slide-in-from-right');
      }
    }, 50); // Kleine Verzögerung
  }

  canNavigateToStep(targetStep: number): boolean {
    if (targetStep < this.currentStep) return true; // Zurück ist immer erlaubt
    // Vorwärts nur, wenn alle vorherigen Schritte gültig sind
    for (let i = 0; i < targetStep - 1; i++) {
      const stepConfig = this.stepsConfiguration[i];
      if (!stepConfig.isValid) {
        // Wenn der vorherige Schritt nicht gültig ist, markiere ihn als berührt, um Fehler anzuzeigen
        const formGroupForPreviousStep = this.getFormGroupForStep(stepConfig.number);
        formGroupForPreviousStep?.markAllAsTouched();
        this.updateStepValidation(stepConfig.number, false); // Update Visuals
        return false;
      }
    }
    return true;
  }

  navigateToStep(stepNumber: number): void {
    if (stepNumber < 1 || stepNumber > this.totalSteps || stepNumber === this.currentStep) return;

    // Wenn vorwärts navigiert wird, prüfe den aktuellen Schritt
    if (stepNumber > this.currentStep) {
      const currentFormGroup = this.getFormGroupForStep(this.currentStep);
      if (currentFormGroup) {
        currentFormGroup.markAllAsTouched(); // Zeige Fehler, falls vorhanden
        this.updateStepValidation(this.currentStep, currentFormGroup.valid);
        if (!currentFormGroup.valid) {
          return; // Nicht navigieren, wenn aktueller Schritt ungültig
        }
      } else {
        // Für Schritte ohne Formular (wie Übersicht, wenn sie keine eigene Validierung hätten)
        // oder wenn die Validierung anderweitig gehandhabt wird (wie bei Design/Print, das optional ist)
        this.updateStepValidation(this.currentStep, true); // Annahme, dass es gültig ist, weiterzugehen
      }
    }

    this.previousStep = this.currentStep;
    this.currentStep = stepNumber;
    this.currentStepTransform = -(this.currentStep - 1) * 100;
    this.updateStepperVisuals(); // Aktualisiere Stepper nach jeder Navigation
  }

  getFormGroupForStep(stepNumber: number): FormGroup | null {
    if (stepNumber === 1) return this.distributionForm;
    if (stepNumber === 2) return this.designPrintForm;
    if (stepNumber === 3) return this.contactForm;
    return null;
  }

  updateStepValidation(stepNumber: number, isValid: boolean): void {
    const stepConfig = this.stepsConfiguration.find(s => s.number === stepNumber);
    if (stepConfig) {
      stepConfig.isValid = isValid;

      // Spezifische Logik für Design & Druck (Step 2), da es optional ist
      if (stepNumber === 2) {
        const dpForm = this.designPrintForm;
        const designSelected = !!dpForm.get('designOption')?.value;
        const printSelected = dpForm.get('printOption')?.value === 'standard_druck';

        if (!designSelected && !printSelected) { // Nichts ausgewählt
          stepConfig.isValid = true; // Optional, also gültig
          stepConfig.validationState = 'green'; // Oder 'gray', wenn 'unberührt' gewünscht ist
        } else if (printSelected && !dpForm.get('flyerQuantity')?.valid) { // Druck gewählt, aber Auflage ungültig
          stepConfig.isValid = false;
          stepConfig.validationState = 'red';
        } else { // Etwas ausgewählt und (hoffentlich) gültig
          stepConfig.isValid = dpForm.valid; // Verlasse dich auf die interne Validierung des Formulars
          stepConfig.validationState = dpForm.valid ? 'green' : 'red';
        }
      } else { // Für andere Schritte
        stepConfig.validationState = isValid ? 'green' : 'red';
      }
    }
    // Stelle sicher, dass der Stepper nach jeder Validierungsänderung aktualisiert wird
    this.updateStepperVisuals();
  }

  updateStepperVisuals(): void {
    this.stepsConfiguration.forEach(stepConf => {
      if (stepConf.number < this.currentStep) { // Bereits besuchte Schritte
        // Hier wird der Zustand beibehalten, der beim Verlassen des Schrittes gesetzt wurde (grün/rot)
        // Es sei denn, eine Neubewertung ist gewünscht. Fürs Erste belassen wir es dabei.
        // Die `isValid` Property sollte den tatsächlichen Zustand widerspiegeln.
        stepConf.validationState = stepConf.isValid ? 'green' : 'red';
      } else if (stepConf.number === this.currentStep) { // Aktueller Schritt
        // Setze auf 'gray', wenn noch keine Validierung (grün/rot) stattgefunden hat
        if (stepConf.validationState !== 'green' && stepConf.validationState !== 'red') {
          // Wenn das Formular für den aktuellen Schritt schon existiert und (un)gültig ist, das reflektieren
          const form = this.getFormGroupForStep(stepConf.number);
          if (form && (form.touched || form.dirty)) { // Nur wenn schon interagiert wurde
            stepConf.validationState = form.valid ? 'green' : 'red';
          } else {
            stepConf.validationState = 'gray';
          }
        }
      } else { // Zukünftige Schritte
        stepConf.validationState = 'gray';
      }
    });
  }

  getValidationIconClass(state: 'gray' | 'green' | 'orange' | 'red'): string {
    switch (state) {
      case 'green': return 'bi-check-circle-fill green';
      case 'orange': return 'bi-exclamation-circle-fill orange'; // Orange wird aktuell nicht aktiv gesetzt
      case 'red': return 'bi-x-circle-fill red';
      default: return 'bi-circle gray';
    }
  }

  updateDistributionSummary(data: DistributionSummaryPayload): void {
    this.currentSummaryData.distributionDetails = data.details;
    this.currentSummaryData.distributionCost = data.cost;
    this.recalculateTotals();
  }

  updateDesignPrintSummary(data: DesignPrintSummaryPayload): void {
    this.currentSummaryData.designPackage = data.designPackage;
    this.currentSummaryData.designCost = data.designCost;
    this.currentSummaryData.printService = data.printService;
    this.currentSummaryData.printCost = data.printCost;
    this.currentSummaryData.printDetails = data.printDetails;
    this.recalculateTotals();
  }

  recalculateTotals(): void {
    const net = (this.currentSummaryData.distributionCost || 0) +
      (this.currentSummaryData.designCost || 0) +
      (this.currentSummaryData.printCost || 0);
    const vat = this.calculatorService.calculateVAT(net); // Annahme: 7.7%
    const gross = net + vat;

    this.currentSummaryData.totalNet = net;
    this.currentSummaryData.totalVat = vat;
    this.currentSummaryData.totalGross = gross;
  }

  submitOffer(): void {
    // Alle Formular-Schritte validieren und ggf. Fehler anzeigen
    this.distributionForm.markAllAsTouched();
    this.designPrintForm.markAllAsTouched();
    this.contactForm.markAllAsTouched();

    this.updateStepValidation(1, this.distributionForm.valid);
    this.updateStepValidation(2, this.designPrintForm.valid); // Beachtet die spezielle Logik in updateStepValidation
    this.updateStepValidation(3, this.contactForm.valid);

    // Finde den ersten ungültigen Schritt und navigiere dorthin
    let firstInvalidStepNumber = -1;
    for (const step of this.stepsConfiguration) {
      if (step.number === 4) continue; // Schritt 4 (Übersicht) hat kein eigenes Formular hier

      const formGroup = this.getFormGroupForStep(step.number);
      if (formGroup && !formGroup.valid) {
        // Spezielle Behandlung für Step 2 (Design/Druck), da es optional ist
        if (step.number === 2) {
          const dpForm = this.designPrintForm;
          const designSelected = !!dpForm.get('designOption')?.value;
          const printSelected = dpForm.get('printOption')?.value === 'standard_druck';
          // Nur ungültig, wenn etwas ausgewählt wurde, das ungültige Details hat (z.B. Auflage)
          if ((designSelected || printSelected) && !dpForm.valid) {
            if (firstInvalidStepNumber === -1) firstInvalidStepNumber = step.number;
          } else if (!designSelected && !printSelected) {
            // Ist gültig, da optional und nichts gewählt
          } else {
            // Etwas ausgewählt und Formular ist gültig
          }
        } else { // Für andere Schritte
          if (firstInvalidStepNumber === -1) firstInvalidStepNumber = step.number;
        }
      }
    }


    if (firstInvalidStepNumber !== -1) {
      this.navigateToStep(firstInvalidStepNumber);
      console.error('Formular ungültig. Bitte korrigieren Sie die Angaben im Schritt:', firstInvalidStepNumber);
      return;
    }

    // Wenn alle relevanten Formulare gültig sind
    if (this.distributionForm.valid && this.contactForm.valid && (this.designPrintForm.valid || (!this.designPrintForm.get('designOption')?.value && !this.designPrintForm.get('printOption')?.value) )) {
      console.log('Formular gültig, sende Offerte:', this.fvFlowForm.value);
      console.log('Zusammenfassung:', this.currentSummaryData);
      alert('Offerte angefordert! (Siehe Konsole für Details)');
    } else {
      // Dieser Fall sollte durch die obige Logik eigentlich abgefangen werden,
      // aber als letzte Sicherheitsmaßnahme.
      console.error('Fehler bei der finalen Validierung. Bitte prüfen Sie alle Schritte.');
      // Versuche, zum ersten "roten" Schritt zu navigieren, falls nicht schon geschehen
      const firstRedStep = this.stepsConfiguration.find(s => s.validationState === 'red' && s.number < 4);
      if (firstRedStep) {
        this.navigateToStep(firstRedStep.number);
      } else if (!this.distributionForm.valid) {
        this.navigateToStep(1);
      } else if (!this.contactForm.valid) {
        this.navigateToStep(3);
      } else {
        // Spezifischer Check für Design/Print, falls es das Problem ist
        const dpForm = this.designPrintForm;
        const printSelected = dpForm.get('printOption')?.value === 'standard_druck';
        if(printSelected && !dpForm.get('flyerQuantity')?.valid) {
          this.navigateToStep(2);
        }
      }
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.updateStepperVisuals();
  }
}
