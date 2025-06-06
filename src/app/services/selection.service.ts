import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlzEntry } from './plz-data.service';
import { OrderDataService } from './order-data.service';
// ZielgruppeOption ist ein exportierter *Typ* aus der Datei distribution-step.component.ts, nicht die Komponentenklasse selbst.
// Der Pfad '../components/distribution-step/distribution-step.component' ist korrekt, um diesen Typ zu importieren.
import { ZielgruppeOption } from '../components/distribution-step/distribution-step.component';

@Injectable({
  providedIn: 'root'
})
export class SelectionService {
  private selectedEntriesSource = new BehaviorSubject<PlzEntry[]>([]);
  selectedEntries$ = this.selectedEntriesSource.asObservable();

  private lastKnownGlobalAudience: ZielgruppeOption = 'Alle Haushalte';

  constructor(private orderDataService: OrderDataService) {}

  private getAudienceCalculatedCount(entry: PlzEntry, zielgruppe: ZielgruppeOption): number {
    if (!entry) return 0;
    switch (zielgruppe) {
      case 'Mehrfamilienhäuser':
        return entry.mfh ?? 0;
      case 'Ein- und Zweifamilienhäuser':
        return entry.efh ?? 0;
      case 'Alle Haushalte':
      default:
        return entry.all ?? 0;
    }
  }

  addEntry(entry: PlzEntry, zielgruppe: ZielgruppeOption): void {
    const currentEntries = this.selectedEntriesSource.getValue();
    if (!currentEntries.find(e => e.id === entry.id)) {
      const newEntry = { ...entry };
      newEntry.selected_display_flyer_count = this.getAudienceCalculatedCount(newEntry, zielgruppe);
      newEntry.is_manual_count = false;

      const updatedEntries = [...currentEntries, newEntry];
      this.selectedEntriesSource.next(updatedEntries);
      this.recalculateAndEmitTotalFlyers(updatedEntries);
    }
  }

  addMultipleEntries(entries: PlzEntry[], zielgruppe: ZielgruppeOption): void {
    const currentSelected = [...this.selectedEntriesSource.getValue()];
    const newEntriesToAdd: PlzEntry[] = [];

    entries.forEach(newEntryData => {
      if (!currentSelected.find(e => e.id === newEntryData.id)) {
        const newEntry = { ...newEntryData };
        newEntry.selected_display_flyer_count = this.getAudienceCalculatedCount(newEntry, zielgruppe);
        newEntry.is_manual_count = false;
        newEntriesToAdd.push(newEntry);
      }
    });

    if (newEntriesToAdd.length > 0) {
      const updatedEntries = [...currentSelected, ...newEntriesToAdd];
      this.selectedEntriesSource.next(updatedEntries);
      this.recalculateAndEmitTotalFlyers(updatedEntries);
    }
  }

  removeEntry(id: string): void {
    const currentEntries = this.selectedEntriesSource.getValue();
    const updatedEntries = currentEntries.filter(entry => entry.id !== id);
    if (updatedEntries.length !== currentEntries.length) {
      this.selectedEntriesSource.next(updatedEntries);
      this.recalculateAndEmitTotalFlyers(updatedEntries);
    }
  }

  clearEntries(): void {
    this.selectedEntriesSource.next([]);
    this.orderDataService.updateTotalFlyersCount(0);
  }

  public updateFlyerCountsForAudience(zielgruppe: ZielgruppeOption): void {
    this.lastKnownGlobalAudience = zielgruppe;
    const currentEntries = this.selectedEntriesSource.getValue();

    const updatedEntries = currentEntries.map(entry => {
      const newEntry = { ...entry };
      newEntry.selected_display_flyer_count = this.getAudienceCalculatedCount(newEntry, zielgruppe);
      newEntry.is_manual_count = false;
      return newEntry;
    });

    this.selectedEntriesSource.next(updatedEntries);
    this.recalculateAndEmitTotalFlyers(updatedEntries);
  }

  public updateManualFlyerCountForEntry(entryId: string, manualCountInput: number | null): void {
    const currentEntries = [...this.selectedEntriesSource.getValue()];
    const entryIndex = currentEntries.findIndex(e => e.id === entryId);

    if (entryIndex > -1) {
      const updatedEntry = { ...currentEntries[entryIndex] };

      if (manualCountInput === null) {
        updatedEntry.selected_display_flyer_count = this.getAudienceCalculatedCount(updatedEntry, this.lastKnownGlobalAudience);
        updatedEntry.is_manual_count = false;
      } else {
        updatedEntry.selected_display_flyer_count = manualCountInput;
        updatedEntry.is_manual_count = true;
      }

      const newEntriesArray = [...currentEntries];
      newEntriesArray[entryIndex] = updatedEntry;

      this.selectedEntriesSource.next(newEntriesArray);
      this.recalculateAndEmitTotalFlyers(newEntriesArray);
    }
  }

  private recalculateAndEmitTotalFlyers(entries: PlzEntry[]): void {
    const totalFlyers = entries.reduce((sum, entry) => sum + (Number(entry.selected_display_flyer_count) || 0), 0);
    this.orderDataService.updateTotalFlyersCount(totalFlyers);
  }

  getSelectedEntries(): PlzEntry[] {
    return this.selectedEntriesSource.getValue();
  }

  validateEntry(entry: PlzEntry): boolean {
    return !!(entry && entry.id && entry.ort && entry.plz4);
  }
}
