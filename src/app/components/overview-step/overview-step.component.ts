import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SummaryData } from '../../app.component'; // Import from app.component

@Component({
  selector: 'app-overview-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './overview-step.component.html',
  styleUrls: ['./overview-step.component.scss']
})
export class OverviewStepComponent {
  @Input() formData: any;
  @Input() summaryData!: SummaryData; // Non-null assertion, da es immer von AppComponent kommen sollte
  @Output() submitOffer = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();

  onPrevious(): void {
    this.previous.emit();
  }

  onSubmit(): void {
    this.submitOffer.emit();
  }
}
