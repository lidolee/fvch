import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common'; // Für CurrencyPipe etc.
import { SummaryData } from '../../app.component'; // Import from app.component

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './summary.component.html',
  styleUrls: ['./summary.component.scss']
})
export class SummaryComponent {
  @Input() summaryData!: SummaryData; // Non-null assertion
  @Input() showTitle: boolean = true;
}
