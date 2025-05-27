import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DesignPrintSummaryPayload } from '../../app.component'; // Import from app.component
import { CalculatorService } from '../../services/calculator.service';

@Component({
  selector: 'app-design-print-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './design-print-step.component.html',
  styleUrls: ['./design-print-step.component.scss']
})
export class DesignPrintStepComponent implements OnInit, OnDestroy {
  @Input() formGroup!: FormGroup;
  @Output() formValid = new EventEmitter<boolean>();
  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();
  @Output() updateSummary = new EventEmitter<DesignPrintSummaryPayload>();

  private subscriptions = new Subscription();

  // Beispielhafte Optionen (könnten aus einem Service/Konfig kommen)
  designOptions = [
    { id: 'eigenes', name: 'Eigenes Design anliefern', cost: 0, description: 'Sie liefern uns eine druckfertige PDF-Datei.' },
    { id: 'basis', name: 'Design "Basis"', cost: 149, description: 'Einfaches Layout mit Ihrem Logo, Text & Bildern.' },
    { id: 'premium', name: 'Design "Premium"', cost: 299, description: 'Individuelles Design inkl. Bildrecherche & 2 Korrekturläufen.' }
  ];

  printOptions = [
    { id: 'kein_druck', name: 'Kein Druckservice', description: 'Sie kümmern sich selbst um den Druck Ihrer Flyer.' },
    { id: 'standard_druck', name: 'Standard Druckservice', description: 'Wir drucken Ihre Flyer auf hochwertigem Papier.' }
  ];

  flyerFormats = ['A6', 'A5', 'A4', 'DL (Langformat)'];
  flyerPapers = ['135g Bilderdruck matt', '170g Bilderdruck matt', '250g Bilderdruck matt', '80g Recyclingpapier'];

  constructor(private calculatorService: CalculatorService) {}

  ngOnInit(): void {
    if (!this.formGroup) {
      console.error("DesignPrintStepComponent: formGroup is not initialized!");
      // Fallback, sollte aber durch AppComponent sichergestellt sein
      this.formGroup = new FormGroup({
        designOption: new FormGroup(null),
        printOption: new FormGroup(null),
        flyerFormat: new FormGroup('A5'),
        flyerPaper: new FormGroup('135g Bilderdruck matt'),
        flyerQuantity: new FormGroup(5000)
      });
    }

    // Validierung und Summary-Updates bei Wertänderungen
    this.subscriptions.add(
      this.formGroup.valueChanges.pipe(
        debounceTime(50), // Kleine Verzögerung um nicht bei jeder Tasten Eingabe zu feuern.
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)) // Nur feuern wenn sich wirklich was geändert hat
      ).subscribe(() => {
        this.updateConditionalValidators();
        this.triggerSummaryUpdate();
        this.formValid.emit(this.formGroup.valid); // Gesamtgültigkeit des Formularteils
      })
    );

    // Initialen Status setzen
    this.updateConditionalValidators();
    this.triggerSummaryUpdate();
    this.formValid.emit(this.formGroup.valid);
  }

  updateConditionalValidators(): void {
    const printOptionControl = this.formGroup.get('printOption');
    const quantityControl = this.formGroup.get('flyerQuantity');
    const formatControl = this.formGroup.get('flyerFormat');
    const paperControl = this.formGroup.get('flyerPaper');

    if (printOptionControl?.value === 'standard_druck') {
      quantityControl?.setValidators([Validators.required, Validators.min(100), Validators.max(200000)]); // Beispiel: Mindestmenge 100
      formatControl?.setValidators(Validators.required);
      paperControl?.setValidators(Validators.required);
    } else {
      quantityControl?.clearValidators();
      formatControl?.clearValidators();
      paperControl?.clearValidators();
      // Wenn kein Druck, dann sind die Werte nicht relevant für die Validierung, können aber für die Anzeige bleiben
      // quantityControl?.setValue(null, {emitEvent: false}); // Optional: Felder zurücksetzen
    }
    quantityControl?.updateValueAndValidity({ emitEvent: false });
    formatControl?.updateValueAndValidity({ emitEvent: false });
    paperControl?.updateValueAndValidity({ emitEvent: false });
  }

  triggerSummaryUpdate(): void {
    const designOptionId = this.formGroup.get('designOption')?.value;
    const printOptionId = this.formGroup.get('printOption')?.value;
    const format = this.formGroup.get('flyerFormat')?.value;
    const paper = this.formGroup.get('flyerPaper')?.value;
    const quantity = this.formGroup.get('flyerQuantity')?.value;

    const selectedDesign = this.designOptions.find(opt => opt.id === designOptionId);
    const designCost = selectedDesign ? selectedDesign.cost : 0;
    const designPackageName = selectedDesign ? selectedDesign.name : 'Kein Designpaket';

    let printCost = 0;
    let printDetails;
    let printServiceName = 'Kein Druckservice';
    const selectedPrint = this.printOptions.find(opt => opt.id === printOptionId);
    if (selectedPrint && selectedPrint.id === 'standard_druck') {
      printServiceName = selectedPrint.name;
      if (quantity && quantity > 0 && format && paper && this.formGroup.get('flyerQuantity')?.valid) { // Nur berechnen wenn gültig
        printCost = this.calculatorService.calculatePrintCost(format, paper, quantity);
        printDetails = { format, paper, quantity };
      } else {
        // Ungültige Druckdetails, Kosten sind 0, aber Service ist gewählt
        printDetails = { format, paper, quantity: 0 }; // Sende trotzdem die Details
      }
    }


    this.updateSummary.emit({
      designPackage: designPackageName,
      designCost: designCost,
      printService: printServiceName,
      printCost: printCost,
      printDetails: printDetails
    });
  }

  // Hilfsmethode, um Karten-Auswahl zu verwalten (optional, je nach UI)
  selectCard(groupName: 'designOption' | 'printOption', value: string | null): void {
    const currentControl = this.formGroup.get(groupName);
    if (currentControl?.value === value) {
      currentControl?.setValue(null); // Deselektieren, wenn dieselbe Karte geklickt wird
    } else {
      currentControl?.setValue(value);
    }
  }

  onNext(): void {
    if (this.formGroup.valid) {
      this.next.emit();
    } else {
      this.formGroup.markAllAsTouched();
    }
  }

  onPrevious(): void {
    this.previous.emit();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // Getter für Template, um leichter auf Controls zuzugreifen und Touched/Error-Status zu prüfen
  isControlInvalid(controlName: string): boolean {
    const control = this.formGroup.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  get printSelected(): boolean {
    return this.formGroup.get('printOption')?.value === 'standard_druck';
  }
}
