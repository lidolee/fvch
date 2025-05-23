import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface';

@Component({
  selector: 'app-package-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './package-card.component.html',
  styleUrls: ['./package-card.component.scss']
})
export class PackageCardComponent {
  @Input() packageData!: FlyerDesignPackage;
  @Input() isSelected: boolean = false;
  @Output() selected = new EventEmitter<string>();

  constructor() { }

  onCardClick(): void {
    if (this.packageData && this.packageData.id) {
      console.log(`[PackageCardComponent] Card for package '${this.packageData.name}' clicked. Emitting ID: ${this.packageData.id}`);
      this.selected.emit(this.packageData.id);
    } else {
      console.warn('[PackageCardComponent] Card clicked, but packageData or packageData.id is missing.');
    }
  }
}
