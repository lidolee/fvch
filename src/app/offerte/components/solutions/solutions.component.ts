import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';

@Component({
  selector: 'app-solutions',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModule],
  templateUrl: './solutions.component.html',
  styleUrl: './solutions.component.scss'
})
export class SolutionsComponent {
  solutionsForm: FormGroup;

  // Beispiel-Services - diese sollten später aus einem Service oder einer Konfiguration kommen
  availableSolutions = [
    { id: 'web', name: 'Webentwicklung', description: 'Entwicklung von Webseiten und Webanwendungen' },
    { id: 'mobile', name: 'Mobile Apps', description: 'Entwicklung von mobilen Anwendungen' },
    { id: 'cloud', name: 'Cloud Services', description: 'Cloud-Infrastruktur und Beratung' },
    { id: 'consulting', name: 'IT Beratung', description: 'Strategische IT-Beratung' }
  ];

  constructor(
    private fb: FormBuilder,
    private modalService: NgbModal,
    private offerteState: OfferteStateService
  ) {
    this.solutionsForm = this.fb.group({
      selectedSolutions: [[], [Validators.required, Validators.minLength(1)]],
      additionalNotes: ['']
    });
  }

  openSolutionsModal(content: any) {
    this.modalService.open(content, {
      fullscreen: true,
      windowClass: 'solutions-modal',
      backdropClass: 'solutions-modal-backdrop'
    });
  }

  onSubmit() {
    if (this.solutionsForm.valid) {
      this.offerteState.updateSolutions(this.solutionsForm.value);
      this.modalService.dismissAll();
    } else {
      Object.keys(this.solutionsForm.controls).forEach(key => {
        const control = this.solutionsForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.solutionsForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  // Hilfsmethode zum Prüfen, ob ein Service ausgewählt ist
  isSolutionSelected(solutionId: string): boolean {
    const selectedSolutions = this.solutionsForm.get('selectedSolutions')?.value || [];
    return selectedSolutions.includes(solutionId);
  }

  // Methode zum Togglen eines Services
  toggleSolution(solutionId: string) {
    const selectedSolutions = [...(this.solutionsForm.get('selectedSolutions')?.value || [])];
    const index = selectedSolutions.indexOf(solutionId);

    if (index === -1) {
      selectedSolutions.push(solutionId);
    } else {
      selectedSolutions.splice(index, 1);
    }

    this.solutionsForm.patchValue({ selectedSolutions });
    this.solutionsForm.get('selectedSolutions')?.markAsTouched();
  }
}
