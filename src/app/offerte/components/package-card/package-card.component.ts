import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlyerDesignPackage } from '../../interfaces/flyer-design-package.interface'; // Pfad anpassen!

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

  // Das Output-Event muss explizit den Typ string (für die packageData.id) emittieren.
  @Output() packageSelected = new EventEmitter<string>();

  onCardClick(): void {
    // Überprüfen, ob packageData und packageData.id vorhanden sind.
    if (this.packageData && this.packageData.id) {
      console.log(`[PackageCardComponent] Card for package '${this.packageData.name}' (ID: ${this.packageData.id}) clicked. Emitting ID: ${this.packageData.id}`);
      // Hier wird die ID des Pakets (ein String) emittiert.
      // NICHT das $event des Klicks, sondern this.packageData.id
      this.packageSelected.emit(this.packageData.id);
    } else {
      console.warn('[PackageCardComponent] packageData or packageData.id is missing. Cannot emit selection.');
      // Optional: Hier könntest du auch this.packageSelected.emit(undefined) oder einen Fehler werfen,
      // aber für diesen Fall ist es besser, nichts zu emittieren, wenn keine ID vorhanden ist.
    }
  }
}
