import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PlzEntry } from './plz-data.service';

const LOG_PREFIX_SELECTION = '[SelectionService]';

@Injectable({
  providedIn: 'root'
})
export class SelectionService {
  private selectedEntriesSubject = new BehaviorSubject<PlzEntry[]>([]);
  selectedEntries$: Observable<PlzEntry[]> = this.selectedEntriesSubject.asObservable();

  private readonly MAX_SELECTION_SIZE = 250;

  constructor() {
    const instanceTime = "2025-05-30 11:58:00";
    console.log(`${LOG_PREFIX_SELECTION} Service instantiated at ${instanceTime}`);
  }

  getSelectedEntries(): PlzEntry[] {
    return this.selectedEntriesSubject.getValue();
  }

  addEntry(entry: PlzEntry): boolean {
    const currentEntries = this.selectedEntriesSubject.getValue();
    if (currentEntries.length >= this.MAX_SELECTION_SIZE) {
      console.warn(`${LOG_PREFIX_SELECTION} Max selection size of ${this.MAX_SELECTION_SIZE} reached. Cannot add entry ${entry.id}.`);
      alert(`Sie können maximal ${this.MAX_SELECTION_SIZE} PLZ-Gebiete auswählen.`);
      return false;
    }
    if (!currentEntries.find(e => e.id === entry.id)) {
      this.selectedEntriesSubject.next([...currentEntries, entry]);
      console.log(`${LOG_PREFIX_SELECTION} Added entry: ${entry.id} - ${entry.plz4} ${entry.ort}`);
      return true;
    }
    console.log(`${LOG_PREFIX_SELECTION} Entry ${entry.id} already selected.`);
    return false;
  }

  addMultipleEntries(entries: PlzEntry[]): number {
    const currentSelected = this.selectedEntriesSubject.getValue();
    let addedCount = 0;
    const entriesToAdd: PlzEntry[] = [];

    for (const entry of entries) {
      if (currentSelected.length + entriesToAdd.length >= this.MAX_SELECTION_SIZE) {
        console.warn(`${LOG_PREFIX_SELECTION} Max selection size reached while adding multiple entries.`);
        alert(`Maximale Auswahl von ${this.MAX_SELECTION_SIZE} Gebieten erreicht. Nicht alle Gebiete konnten hinzugefügt werden.`);
        break;
      }
      if (!currentSelected.find(e => e.id === entry.id) && !entriesToAdd.find(e => e.id === entry.id)) {
        entriesToAdd.push(entry);
        addedCount++;
      }
    }

    if (entriesToAdd.length > 0) {
      this.selectedEntriesSubject.next([...currentSelected, ...entriesToAdd]);
      console.log(`${LOG_PREFIX_SELECTION} Added ${addedCount} new entries.`);
    }
    return addedCount;
  }

  removeEntry(entryId: string): void {
    const currentEntries = this.selectedEntriesSubject.getValue();
    this.selectedEntriesSubject.next(currentEntries.filter(e => e.id !== entryId));
    console.log(`${LOG_PREFIX_SELECTION} Removed entry: ${entryId}`);
  }

  clearEntries(): void {
    this.selectedEntriesSubject.next([]);
    console.log(`${LOG_PREFIX_SELECTION} Cleared all selected entries.`);
  }

  validateEntry(entry: PlzEntry): boolean {
    if (!entry || !entry.id) {
      console.warn(`${LOG_PREFIX_SELECTION} Validation failed: Entry or entry.id is missing.`);
      return false;
    }
    if (entry.isGroupEntry) {
      return true;
    }
    return true;
  }
}
