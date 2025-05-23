import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { OfferteStateService } from '../../services/offerte-state.service';
import { CalculatorComponent } from '../calculator/calculator.component';
import { take } from 'rxjs/operators';

import { FlyerDesignConfig } from '../../interfaces/flyer-design-config.interface';
import { FlyerDesignConfigComponent } from '../flyer-design-config/flyer-design-config.component';

import { FlyerDruckConfig } from '../../interfaces/flyer-druck-config.interface';
import { FlyerDruckConfigComponent } from '../flyer-druck-config/flyer-druck-config.component';

interface SolutionsDataFromState {
  selectedSolutions: string[];
  designConfig?: FlyerDesignConfig;
  druckConfig?: FlyerDruckConfig;
}

interface OverallSolutionConfigs {
  design?: FlyerDesignConfig;
  druck?: FlyerDruckConfig;
}

@Component({
  selector: 'app-solutions',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, NgbModule, CalculatorComponent,
    FlyerDesignConfigComponent, FlyerDruckConfigComponent
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
      selectedSolutions: [[] as string[], [Validators.required, Validators.minLength(1)]],
    });
  }

  get selectedSolutionsValue(): string[] {
    const control = this.solutionsForm.get('selectedSolutions');
    return control && Array.isArray(control.value) ? control.value : [];
  }

  ngOnInit() {
    this.offerteState.stepState$.subscribe(state => {
      this.isStepCompleted = state.solutions.isCompleted;
    });

    this.offerteState.solutionsData$.pipe(take(1)).subscribe((data: SolutionsDataFromState | null) => {
      if (data) {
        this.solutionsForm.patchValue({ selectedSolutions: data.selectedSolutions || [] });

        if (this.isSolutionSelectedInternal('design')) {
          this.currentDetailConfigs.design = data.designConfig || { designAktiv: true, selectedPackageId: null, isValid: false };
        }
        if (this.isSolutionSelectedInternal('druck')) {
          this.currentDetailConfigs.druck = data.druckConfig || { druckAktiv: true, format: null, grammatur: null, druckart: null, auflage: null, isValid: false };
        }
      } else {
        this.currentDetailConfigs = {
          design: { designAktiv: true, selectedPackageId: null, isValid: false },
          druck: { druckAktiv: true, format: null, grammatur: null, druckart: null, auflage: null, isValid: false }
        };
      }
    });
  }

  areSelectedDetailConfigsValid(): boolean {
    if (this.isSolutionSelectedInternal('design')) {
      if (!this.currentDetailConfigs.design?.isValid) {
        return false;
      }
    }
    if (this.isSolutionSelectedInternal('druck')) {
      if (!this.currentDetailConfigs.druck?.isValid) {
        return false;
      }
    }
    return true;
  }

  openSolutionsModal(content: any) {
    if (!this.disabled) {
      this.offerteState.solutionsData$.pipe(take(1)).subscribe((data: SolutionsDataFromState | null) => {
        if (data) {
          this.solutionsForm.patchValue({ selectedSolutions: data.selectedSolutions || [] });
          if (this.isSolutionSelectedInternal('design')) {
            this.currentDetailConfigs.design = data.designConfig || { designAktiv: true, selectedPackageId: null, isValid: false };
          } else {
            delete this.currentDetailConfigs.design;
          }
          if (this.isSolutionSelectedInternal('druck')) {
            this.currentDetailConfigs.druck = data.druckConfig || { druckAktiv: true, format: null, grammatur: null, druckart: null, auflage: null, isValid: false };
          } else {
            delete this.currentDetailConfigs.druck;
          }
        } else {
          this.solutionsForm.patchValue({ selectedSolutions: [] });
          this.currentDetailConfigs = {
            design: { designAktiv: true, selectedPackageId: null, isValid: false },
            druck: { druckAktiv: true, format: null, grammatur: null, druckart: null, auflage: null, isValid: false }
          };
        }
      });
      this.modalService.open(content, { animation: false, fullscreen: true, windowClass: 'solutions-modal', backdropClass: 'solutions-modal-backdrop' });
    }
  }

  onSubmit() {
    const currentSelectedSolutions = this.selectedSolutionsValue;
    if (this.solutionsForm.valid && currentSelectedSolutions.length > 0 && this.areSelectedDetailConfigsValid()) {
      const dataToSave: SolutionsDataFromState = {
        selectedSolutions: currentSelectedSolutions,
      };
      if (this.isSolutionSelectedInternal('design') && this.currentDetailConfigs.design) {
        dataToSave.designConfig = this.currentDetailConfigs.design;
      }
      if (this.isSolutionSelectedInternal('druck') && this.currentDetailConfigs.druck) {
        dataToSave.druckConfig = this.currentDetailConfigs.druck;
      }
      this.offerteState.updateSolutions(dataToSave);
      this.modalService.dismissAll();
    } else {
      this.offerteState.updateSolutions(null);
      this.offerteState.invalidateStep('solutions');
      Object.keys(this.solutionsForm.controls).forEach(key => { this.solutionsForm.get(key)?.markAsTouched(); });
      if (currentSelectedSolutions.length === 0) {
        this.solutionsForm.get('selectedSolutions')?.setErrors({ required: true });
      }
      if (!this.areSelectedDetailConfigsValid()) {
        console.warn("Eine oder mehrere Detailkonfigurationen sind ungültig.");
      }
    }
  }

  toggleSolutionSelection(solutionId: string) {
    const selectedSolutionsControl = this.solutionsForm.get('selectedSolutions');
    if (!selectedSolutionsControl) return;

    const currentSelected: string[] = [...this.selectedSolutionsValue];
    const index = currentSelected.indexOf(solutionId);

    if (index === -1) {
      currentSelected.push(solutionId);
      if (solutionId === 'design' && !this.currentDetailConfigs.design) {
        this.currentDetailConfigs.design = { designAktiv: true, selectedPackageId: null, isValid: false };
      }
      if (solutionId === 'druck' && !this.currentDetailConfigs.druck) {
        this.currentDetailConfigs.druck = { druckAktiv: true, format: null, grammatur: null, druckart: null, auflage: null, isValid: false };
      }
    } else {
      currentSelected.splice(index, 1);
      if (solutionId === 'design') { delete this.currentDetailConfigs.design; }
      if (solutionId === 'druck') { delete this.currentDetailConfigs.druck; }
    }
    selectedSolutionsControl.patchValue(currentSelected);
    selectedSolutionsControl.markAsTouched();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.solutionsForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  isSolutionSelected(solutionId: string): boolean { return this.isSolutionSelectedInternal(solutionId); }
  isSolutionSelectedInternal(solutionId: string): boolean { return this.selectedSolutionsValue.includes(solutionId); }

  onFlyerDesignConfigChanged(config: FlyerDesignConfig): void {
    if (this.isSolutionSelectedInternal('design')) {
      this.currentDetailConfigs.design = config;
    }
  }

  onFlyerDruckConfigChanged(config: FlyerDruckConfig): void {
    if (this.isSolutionSelectedInternal('druck')) {
      this.currentDetailConfigs.druck = config;
    }
  }
}
