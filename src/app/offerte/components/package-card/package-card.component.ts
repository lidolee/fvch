import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-package-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './package-card.component.html',
  styleUrls: ['./package-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PackageCardComponent {
  @Input() packageData!: FlyerDesignPackage;
  @Input() isSelected: boolean = false;
  @Output() packageClicked = new EventEmitter<string>();

  constructor() { }

  get savings(): number | null {
    if (
      this.packageData &&
      typeof this.packageData.priceNormal === 'number' &&
      typeof this.packageData.priceDiscounted === 'number'
    ) {
      const saving = this.packageData.priceNormal - this.packageData.priceDiscounted;
      return saving > 0 ? saving : null;
    }
    return null;
  }

  onCardClick(): void {
    if (this.packageData && this.packageData.id) {
      this.packageClicked.emit(this.packageData.id);
    }
  }
}
