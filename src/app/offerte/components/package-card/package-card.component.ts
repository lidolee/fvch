import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';
import { CommonModule } from '@angular/common'; // WICHTIG

@Component({
  selector: 'app-package-card',
  standalone: true, // WICHTIG
  imports: [CommonModule], // WICHTIG
  templateUrl: './package-card.component.html',
  styleUrls: ['./package-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PackageCardComponent {
  @Input() packageData!: FlyerDesignPackage;
  @Input() isSelected: boolean = false;
  @Output() packageClicked = new EventEmitter<string>(); // Sendet die packageData.id

  constructor() { }

  get savings(): number | null {
    if (this.packageData && this.packageData.priceNormal && this.packageData.priceDiscounted) {
      return this.packageData.priceNormal - this.packageData.priceDiscounted;
    }
    return null;
  }

  onCardClick(): void {
    this.packageClicked.emit(this.packageData.id);
  }
}
