import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PlzEntry } from './plz-data.service';

@Injectable({
  providedIn: 'root'
})
export class SelectionService {
  private readonly _selectedEntries = new BehaviorSubject<PlzEntry[]>([]);
  public readonly selectedEntries$ = this._selectedEntries.asObservable();

  constructor() {}

  public getSelectedEntriesSnapshot(): PlzEntry[] {
    return this._selectedEntries.getValue();
  }

  public addEntry(entry: PlzEntry): void {
    const currentEntries = this.getSelectedEntriesSnapshot();
    if (!currentEntries.some(e => e.id === entry.id)) {
      this._selectedEntries.next([...currentEntries, entry]);
    }
  }

  public addMultipleEntries(entries: PlzEntry[]): void {
    const currentEntries = this.getSelectedEntriesSnapshot();
    const entriesToAdd = entries
      .filter(newEntry => !currentEntries.some(existing => existing.id === newEntry.id));

    if (entriesToAdd.length > 0) {
      this._selectedEntries.next([...currentEntries, ...entriesToAdd]);
    }
  }

  public removeEntry(entryId: string): void {
    const currentEntries = this.getSelectedEntriesSnapshot();
    const filteredEntries = currentEntries.filter(e => e.id !== entryId);
    this._selectedEntries.next(filteredEntries);
  }

  public clearEntries(): void {
    this._selectedEntries.next([]);
  }

  public validateEntry(entry: PlzEntry): boolean {
    return !!entry && !!entry.id;
  }

  public updateFlyerCountForEntry(entryId: string, newCount: number | null, type: 'mfh' | 'efh'): void {
    const entries = [...this.getSelectedEntriesSnapshot()];
    const entryIndex = entries.findIndex(e => e.id === entryId);

    if (entryIndex > -1) {
      const entry = { ...entries[entryIndex] };

      if (type === 'mfh') {
        entry.manual_flyer_count_mfh = newCount;
      } else if (type === 'efh') {
        entry.manual_flyer_count_efh = newCount;
      }

      entries[entryIndex] = entry;
      this._selectedEntries.next(entries);
    }
  }
}
