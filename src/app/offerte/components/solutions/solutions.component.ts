import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';
import { CalculatorComponent } from '../calculator/calculator.component';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-solutions',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModule, CalculatorComponent],
  templateUrl: './solutions.component.html',
  styleUrl: './solutions.component.scss'
})
export class SolutionsComponent implements OnInit {
  @Input() disabled = false;
  solutionsForm: FormGroup;
  isStepCompleted = false;

  availableSolutions = [
    { id: 'design',
      name: 'Flyer Design',
      description: 'Wir gestalten Ihre Flyer professionell',
      icon: 'bi-palette-fill'
    },
    { id: 'druck',
      name: 'Flyer Druck',
      description: 'Wir drucken Ihre Flyer in Top-Qualität',
      icon: 'bi-printer-fill'
    },
    { id: 'verteilung',
      name: 'Flyer Verteilung',
      description: 'Wir verteilen Ihre Flyer schweizweit',
      icon: 'bi-mailbox2-flag'
    },
  ];

  constructor(
    private fb: FormBuilder,
    private modalService: NgbModal,
    private offerteState: OfferteStateService
  ) {
    this.solutionsForm = this.fb.group({
      selectedSolutions: [[], [Validators.required, Validators.minLength(1)]],
    });
  }

  ngOnInit() {
    this.offerteState.stepState$.subscribe(state => {
      this.isStepCompleted = state.solutions.isCompleted;
    });
  }

  openSolutionsModal(content: any) {
    if (!this.disabled) {
      // Lade aktuelle Daten
      this.offerteState.solutionsData$.pipe(take(1)).subscribe(data => {
        if (data) {
          this.solutionsForm.patchValue(data);
        }
      });

      this.modalService.open(content, {
        animation: false,
        fullscreen: true,
        windowClass: 'solutions-modal',
        backdropClass: 'solutions-modal-backdrop'
      });
    }
  }

  onSubmit() {
    if (this.solutionsForm.valid &&
      this.solutionsForm.get('selectedSolutions')?.value?.length > 0) {
      this.offerteState.updateSolutions(this.solutionsForm.value);
      this.modalService.dismissAll();
    } else {
      // Invalidiere den State
      this.offerteState.updateSolutions(null);
      this.offerteState.invalidateStep('solutions');

      // Markiere invalide Felder
      Object.keys(this.solutionsForm.controls).forEach(key => {
        const control = this.solutionsForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

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

  isFieldInvalid(fieldName: string): boolean {
    const field = this.solutionsForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  isSolutionSelected(solutionId: string): boolean {
    const selectedSolutions = this.solutionsForm.get('selectedSolutions')?.value || [];
    return selectedSolutions.includes(solutionId);
  }
}
