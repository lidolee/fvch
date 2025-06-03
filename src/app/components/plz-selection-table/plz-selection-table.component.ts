import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlzEntry } from '../../services/plz-data.service';
import {NgbTooltip} from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-plz-selection-table',
  standalone: true,
  imports: [CommonModule, NgbTooltip],
  templateUrl: './plz-selection-table.component.html',
  styleUrls: ['./plz-selection-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlzSelectionTableComponent {
  @Input() entries: PlzEntry[] = [];
  @Input() currentZielgruppe: 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser' = 'Alle Haushalte';
  @Input() highlightFlyerMaxColumn = false;

  @Output() remove = new EventEmitter<PlzEntry>();
  @Output() clear = new EventEmitter<void>();
  @Output() zoom = new EventEmitter<PlzEntry>();
  @Output() highlight = new EventEmitter<{plzId: string | null, highlight: boolean}>();

  trackByPlzId(index: number, entry: PlzEntry) {
    return entry.id;
  }

  getFlyerMaxForEntry(entry: PlzEntry): number {
    if (!entry) return 0;
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser': return entry.mfh ?? 0;
      case 'Ein- und Zweifamilienhäuser': return entry.efh ?? 0;
      default: return entry.all ?? 0;
    }
  }
}
