import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';
import { CalculatorComponent } from '../calculator/calculator.component';
import { take } from 'rxjs/operators';

import { FlyerDesignConfig } from '../../interfaces/flyer-design-config.interface';
import { FlyerDesignConfigComponent } from '../flyer-design-config/flyer-design-config.component';

// ANNAHME: SolutionsData Interface ist so oder ähnlich definiert (siehe AKTION 5)
interface SolutionsDataFromState {
  selectedSolutions: string[];
  designConfig?: FlyerDesignConfig;
  // printConfig?: any; // Später
  // distributionConfig?: any; // Später
}

interface OverallSolutionConfigs {
  design?: FlyerDesignConfig;
  // print?: any;
  // distribution?: any;
}

@Component({
  selector: 'app-solutions',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgbModule,
    CalculatorComponent,
    FlyerDesignConfigComponent // WICHTIG
  ],
  templateUrl: './solutions.component.html',
  styleUrl: './solutions.component.scss'
})
export class SolutionsComponent implements OnInit {
  @Input() disabled = false;
  solutionsForm: FormGroup;
  isStepCompleted = false;

  currentDetailConfigs: OverallSolutionConfigs = {};

  availableSolutions = [
    { id: 'design', name: 'Flyer Design', description: 'Wir gestalten Ihre Flyer professionell', icon: 'bi-palette-fill' },
    { id: 'druck', name: 'Flyer Druck', description: 'Wir drucken Ihre Flyer in Top-Qualität', icon: 'bi-printer-fill' },
    { id: 'verteilung', name: 'Flyer Verteilung', description: 'Wir verteilen Ihre Flyer schweizweit', icon: 'bi-mailbox2-flag' },
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

    this.offerteState.solutionsData$.pipe(take(1)).subscribe((data: SolutionsDataFromState | null) => {
      if (data) {
        this.solutionsForm.patchValue({ selectedSolutions: data.selectedSolutions || [] });

        if (this.isSolutionSelectedInternal('design')) {
          this.currentDetailConfigs.design = data.designConfig || { selectedPackageId: null };
        }
      }
    });
  }

  openSolutionsModal(content: any) {
    if (!this.disabled) {
      this.offerteState.solutionsData$.pipe(take(1)).subscribe((data: SolutionsDataFromState | null) => {
        if (data) {
          this.solutionsForm.patchValue({ selectedSolutions: data.selectedSolutions || [] });
          if (this.isSolutionSelectedInternal('design')) {
            this.currentDetailConfigs.design = data.designConfig || { selectedPackageId: null };
          } else {
            delete this.currentDetailConfigs.design;
          }
        } else {
          this.solutionsForm.patchValue({ selectedSolutions: [] });
          this.currentDetailConfigs = {};
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
    const selectedSolutionsValue = this.solutionsForm.get('selectedSolutions')?.value;
    if (this.solutionsForm.valid && selectedSolutionsValue?.length > 0) {
      const dataToSave: SolutionsDataFromState = { // Typ hier verwenden
        selectedSolutions: selectedSolutionsValue,
      };
      if (this.isSolutionSelectedInternal('design') && this.currentDetailConfigs.design) {
        dataToSave.designConfig = this.currentDetailConfigs.design;
      }

      this.offerteState.updateSolutions(dataToSave);
      this.modalService.dismissAll();
    } else {
      this.offerteState.updateSolutions(null);
      this.offerteState.invalidateStep('solutions');
      Object.keys(this.solutionsForm.controls).forEach(key => {
        const control = this.solutionsForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  // Diese Methode wird vom Template aufgerufen
  toggleSolutionSelection(solutionId: string) {
    const selectedSolutionsControl = this.solutionsForm.get('selectedSolutions');
    if (!selectedSolutionsControl) return;

    const currentSelected: string[] = [...(selectedSolutionsControl.value || [])];
    const index = currentSelected.indexOf(solutionId);

    if (index === -1) {
      currentSelected.push(solutionId);
      if (solutionId === 'design' && !this.currentDetailConfigs.design) {
        this.currentDetailConfigs.design = { selectedPackageId: null };
      }
    } else {
      currentSelected.splice(index, 1);
      if (solutionId === 'design') {
        delete this.currentDetailConfigs.design;
      }
    }
    selectedSolutionsControl.patchValue(currentSelected);
    selectedSolutionsControl.markAsTouched();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.solutionsForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  // Diese Methode wird vom Template aufgerufen
  isSolutionSelected(solutionId: string): boolean {
    return this.isSolutionSelectedInternal(solutionId);
  }

  // Interne Methode, um Konflikte mit der alten Methode zu vermeiden, falls du sie noch irgendwo hattest
  private isSolutionSelectedInternal(solutionId: string): boolean {
    const selectedSolutions = this.solutionsForm.get('selectedSolutions')?.value || [];
    return selectedSolutions.includes(solutionId);
  }

  onFlyerDesignConfigChanged(config: FlyerDesignConfig): void {
    this.currentDetailConfigs.design = config;
  }
}
