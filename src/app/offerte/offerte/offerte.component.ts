import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContactdataComponent } from '../components/contactdata/contactdata.component';
import { SolutionsComponent } from '../components/solutions/solutions.component';
import { ConfirmationComponent } from '../components/confirmation/confirmation.component';
import { OfferteStateService } from '../services/offerte-state.service';
import { OfferteStepState } from '../interfaces/step-state.interface';

@Component({
  selector: 'app-offerte',
  standalone: true,
  imports: [
    CommonModule,
    ContactdataComponent,
    SolutionsComponent,
    ConfirmationComponent
  ],
  templateUrl: './offerte.component.html',
  styleUrl: './offerte.component.scss'
})
export class OfferteComponent implements OnInit {
  stepState: OfferteStepState = {
    contact: { isCompleted: false, isAccessible: true },
    solutions: { isCompleted: false, isAccessible: false },
    confirmation: { isCompleted: false, isAccessible: false }
  };

  constructor(private offerteState: OfferteStateService) {}

  ngOnInit() {
    this.offerteState.stepState$.subscribe(state => {
      this.stepState = state;
    });
  }

  isStepCompleted(step: keyof OfferteStepState): boolean {
    return this.stepState[step].isCompleted;
  }

  isStepAccessible(step: keyof OfferteStepState): boolean {
    return this.stepState[step].isAccessible;
  }
}
