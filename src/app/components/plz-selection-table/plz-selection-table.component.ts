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
  @Output() public flyerCountChange = new EventEmitter<{ entryId: string, newCount: number | null }>();

  public anzahlSumme: number = 0;
  public haushalteSumme: number = 0;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entries'] || changes['currentZielgruppe']) {
      this.calculateSums();
    }
  }

  private calculateSums(): void {
    this.anzahlSumme = this.getTotalDefinitiveFlyers();
    this.haushalteSumme = this.getTotalAudienceCalculatedFlyers();
    this.cdr.markForCheck();
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

  public onManualFlyerInputChange(entry: PlzSelectionDetail, target: EventTarget | null): void {
    if (target instanceof HTMLInputElement) {
      const value = target.value;

      if (value === '') {
        this.flyerCountChange.emit({ entryId: entry.id, newCount: null });
        return;
      }

      let newCount = parseInt(value, 10);

      if (!isNaN(newCount)) {
        const maxCount = this.getAudienceCalculatedFlyerCount(entry);

        if (newCount > maxCount) newCount = maxCount;
        if (newCount < 0) newCount = 0;

        // Use getInitialDisplayCount to check against the currently displayed value
        if (this.getInitialDisplayCount(entry) !== newCount) {
          this.flyerCountChange.emit({ entryId: entry.id, newCount: newCount });
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

  public getInitialDisplayCount(entry: PlzSelectionDetail): number {
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser':
        return typeof entry.manual_flyer_count_mfh === 'number' ? entry.manual_flyer_count_mfh : (entry.mfh ?? 0);
      case 'Ein- und Zweifamilienhäuser':
        return typeof entry.manual_flyer_count_efh === 'number' ? entry.manual_flyer_count_efh : (entry.efh ?? 0);
      default:
        return entry.all ?? 0;
    }
  }

  public trackByPlzId(index: number, item: PlzSelectionDetail): string {
    return item.id;
  }

  public getTotalAudienceCalculatedFlyers(): number {
    return this.entries.reduce((sum, entry) => sum + this.getAudienceCalculatedFlyerCount(entry), 0);
  }

  public getTotalDefinitiveFlyers(): number {
    return this.entries.reduce((sum, entry) => sum + (entry.selected_display_flyer_count ?? 0), 0);
  }
}
