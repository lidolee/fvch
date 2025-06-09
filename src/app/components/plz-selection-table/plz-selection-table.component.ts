import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, SimpleChanges, OnChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ZielgruppeOption, PlzSelectionDetail } from '../../services/order-data.types';
import { TableHighlightEvent } from '../distribution-step/distribution-step.component';

@Component({
  selector: 'app-plz-selection-table',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './plz-selection-table.component.html',
  styleUrls: ['./plz-selection-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DecimalPipe]
})
export class PlzSelectionTableComponent implements OnChanges {
  @Input() public entries: PlzSelectionDetail[] = [];
  @Input() public currentZielgruppe: ZielgruppeOption = 'Alle Haushalte';
  @Input() public highlightFlyerMaxColumn: boolean = false;

  @Output() public remove = new EventEmitter<PlzSelectionDetail>();
  @Output() public zoom = new EventEmitter<PlzSelectionDetail>();
  @Output() public highlight = new EventEmitter<TableHighlightEvent>();
  @Output() public flyerCountChange = new EventEmitter<{ entryId: string, type: 'mfh' | 'efh', newCount: number | null }>();

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entries'] || changes['currentZielgruppe']) {
      this.cdr.markForCheck();
    }
  }

  public onRemovePlzClick(detail: PlzSelectionDetail): void {
    this.remove.emit(detail);
  }

  public onZoomToPlzClick(detail: PlzSelectionDetail): void {
    this.zoom.emit(detail);
  }

  public onMouseEnterRow(plzId: string): void {
    this.highlight.emit({ plzId: plzId, highlight: true });
  }

  public onMouseLeaveRow(): void {
    this.highlight.emit({ plzId: null, highlight: false });
  }

  public onManualFlyerInputChange(entry: PlzSelectionDetail, target: EventTarget | null, type: 'mfh' | 'efh'): void {
    if (target instanceof HTMLInputElement) {
      const value = target.value;

      if (value === '') {
        this.flyerCountChange.emit({ entryId: entry.id, type, newCount: null });
        return;
      }

      let newCount = parseInt(value, 10);

      if (!isNaN(newCount)) {
        const maxCount = type === 'mfh' ? (entry.mfh ?? 0) : (entry.efh ?? 0);

        if (newCount > maxCount) newCount = maxCount;
        if (newCount < 0) newCount = 0;

        const currentVal = type === 'mfh' ? entry.selected_flyer_count_mfh : entry.selected_flyer_count_efh;

        if (currentVal !== newCount) {
          this.flyerCountChange.emit({ entryId: entry.id, type, newCount });
        }
      }
    }
  }

  public getAudienceCalculatedFlyerCount(entry: PlzSelectionDetail): number {
    if (!entry) return 0;
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser': return entry.mfh ?? 0;
      case 'Ein- und Zweifamilienhäuser': return entry.efh ?? 0;
      case 'Alle Haushalte':
      default: return entry.all || 0;
    }
  }

  public trackByPlzId(index: number, item: PlzSelectionDetail): string {
    return item.id;
  }

  public getTotalAudienceCalculatedFlyers(): number {
    return this.entries.reduce((sum, entry) => sum + this.getAudienceCalculatedFlyerCount(entry), 0);
  }

  public getTotalDefinitiveMfhFlyers(): number {
    return this.entries.reduce((sum, entry) => sum + entry.selected_flyer_count_mfh, 0);
  }

  public getTotalDefinitiveEfhFlyers(): number {
    return this.entries.reduce((sum, entry) => sum + entry.selected_flyer_count_efh, 0);
  }
}
