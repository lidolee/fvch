import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValidationStatus } from '../offer-process/offer-process.component';

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calculator.component.html',
  styleUrl: './calculator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalculatorComponent {
  @Input() activeStep: number = 1;
  @Input() currentStepValidationStatus: ValidationStatus = 'pending';

  @Output() requestPreviousStep = new EventEmitter<void>();
  @Output() requestNextStep = new EventEmitter<void>();
  @Output() requestSubmit = new EventEmitter<void>();

  constructor() {}

  onRequestPrevious(): void {
    this.requestPreviousStep.emit();
  }

  onRequestNext(): void {
    this.requestNextStep.emit();
  }

  onRequestSubmit(): void {
    this.requestSubmit.emit();
  }
}
