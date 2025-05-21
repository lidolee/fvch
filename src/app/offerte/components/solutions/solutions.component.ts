/**
 * @file solutions.component.ts
 * @author lidolee
 * @date 2025-05-20 16:57:11
 * @description Component for handling solution selection in the quote process
 */

import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';
import {CalculatorComponent} from '../calculator/calculator.component';

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
      additionalNotes: ['']
    });
  }

  ngOnInit() {
    this.offerteState.stepState$.subscribe(state => {
      this.isStepCompleted = state.solutions.isCompleted;
    });
  }

  openSolutionsModal(content: any) {
    if (!this.disabled) {
      this.modalService.open(content, {
        animation: false,
        fullscreen: true,
        windowClass: 'solutions-modal',
        backdropClass: 'solutions-modal-backdrop'
      });
    }
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

  isSolutionSelected(solutionId: string): boolean {
    const selectedSolutions = this.solutionsForm.get('selectedSolutions')?.value || [];
    return selectedSolutions.includes(solutionId);
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
}
