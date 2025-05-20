import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContactdataComponent } from '../components/contactdata/contactdata.component';
import { SolutionsComponent } from '../components/solutions/solutions.component';
import { ConfirmationComponent } from '../components/confirmation/confirmation.component';
import { OfferteStateService } from '../services/offerte-state.service';


@Component({
  selector: 'app-offerte',
  standalone: true,
  imports: [CommonModule, ContactdataComponent, SolutionsComponent, ConfirmationComponent],
  templateUrl: './offerte.component.html',
  styleUrl: './offerte.component.scss'
})
export class OfferteComponent implements OnInit {
  stepsCompleted: {[key: string]: boolean} = {
    contact: false,
    solutions: false,
    confirmation: false
  };

  constructor(private offerteState: OfferteStateService) {}

  ngOnInit() {
    this.offerteState.stepsCompleted$.subscribe(steps => {
      this.stepsCompleted = steps;
    });
  }

  isStepCompleted(step: string): boolean {
    return this.stepsCompleted[step] || false;
  }
}
