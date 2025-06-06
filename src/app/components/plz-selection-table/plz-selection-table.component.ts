import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Required for ngModel
import { PlzEntry } from '../../services/plz-data.service';
import { ZielgruppeOption } from '../distribution-step/distribution-step.component'; // Ensure path is correct

export interface TableHighlightEvent {
  plzId: string | null;
  highlight: boolean;
}

@Component({
  selector: 'app-plz-selection-table',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './plz-selection-table.component.html',
  styleUrls: ['./plz-selection-table.component.scss'], // Assuming you have this SCSS file
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlzSelectionTableComponent {
  @Input() entries: PlzEntry[] = [];
  @Input() currentZielgruppe: ZielgruppeOption = 'Alle Haushalte';
  @Input() highlightFlyerMaxColumn: boolean = false;

  @Output() remove = new EventEmitter<PlzEntry>();
  @Output() zoom = new EventEmitter<PlzEntry>();
  @Output() highlight = new EventEmitter<TableHighlightEvent>();
  @Output() manualFlyerCountUpdated = new EventEmitter<{ entryId: string, newCount: number | null }>();

  constructor() {}

  // Your existing trackByPlzId (if it was trackByEntryId, either is fine, just be consistent)
  trackByPlzId(index: number, item: PlzEntry): string {
    return item.id;
  }

  // Renamed from getFlyerMaxForEntry to be more specific for the "max" column
  getAudienceCalculatedFlyerCount(entry: PlzEntry): number {
    if (!entry) return 0;
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser':
        return entry.mfh ?? 0;
      case 'Ein- und Zweifamilienhäuser':
        return entry.efh ?? 0;
      case 'Alle Haushalte':
      default:
        return entry.all ?? 0;
    }
  }

  onManualFlyerInputBlur(entry: PlzEntry, target: any): void {
    const rawValue = target.value;
    let processedCount: number | null;

    if (rawValue === null || String(rawValue).trim() === '') {
      // User cleared the input. Signal to revert to audience-calculated.
      processedCount = null;
    } else {
      let numValue = parseInt(rawValue, 10);
      if (isNaN(numValue) || numValue < 0) {
        // Invalid input, signal to revert.
        processedCount = null;
      } else {
        // Valid number, round it.
        processedCount = Math.round(numValue / 100) * 100;
      }
    }

    // Visually update input only if processed value differs from raw or is being reset
    if (processedCount !== null && String(target.value) !== String(processedCount)) {
      target.value = processedCount; // Reflect rounding
    } else if (processedCount === null && String(target.value).trim() !== '') {
      // Input was invalid/cleared, target.value will be updated by ngModel once service changes entry
    }

    this.manualFlyerCountUpdated.emit({ entryId: entry.id, newCount: processedCount });
  }

  getTotalAudienceCalculatedFlyers(): number {
    return this.entries.reduce((sum, entry) => sum + this.getAudienceCalculatedFlyerCount(entry), 0);
  }

  getTotalDefinitiveFlyers(): number {
    return this.entries.reduce((sum, entry) => sum + (entry.selected_display_flyer_count ?? 0), 0);
  }
}
