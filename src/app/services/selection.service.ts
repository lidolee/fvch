import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { PlzEntry } from './plz-data.service';

const SESSION_STORAGE_KEY = 'selectedPlzEntriesFvch';
const LOG_PREFIX = '[SelectionService]';

@Injectable({
  providedIn: 'root'
})
export class SelectionService {
  private selectedEntriesSubject: BehaviorSubject<PlzEntry[]>;
  selectedEntries$: Observable<PlzEntry[]>;
  private isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    console.log(`${LOG_PREFIX} Service instantiated. IsBrowser: ${this.isBrowser}`);
    const initialEntries = this.loadFromSession();
    this.selectedEntriesSubject = new BehaviorSubject<PlzEntry[]>(initialEntries);
    this.selectedEntries$ = this.selectedEntriesSubject.asObservable();
    console.log(`${LOG_PREFIX} Initialized with ${initialEntries.length} entries from session storage.`);
  }

  private loadFromSession(): PlzEntry[] {
    if (this.isBrowser) {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          console.log(`${LOG_PREFIX} Loaded ${parsed.length} entries from session storage.`);
          return parsed;
        } catch (e) {
          console.error(`${LOG_PREFIX} Error parsing session storage data:`, e, `Raw data: "${stored}"`);
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          return [];
        }
      } else {
        // console.log(`${LOG_PREFIX} No data in session storage for key "${SESSION_STORAGE_KEY}".`);
        return [];
      }
    }
    // console.log(`${LOG_PREFIX} Not in browser, skipping session storage load.`);
    return [];
  }

  private saveToSession(entries: PlzEntry[]): void {
    if (this.isBrowser) {
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(entries));
        // console.log(`${LOG_PREFIX} Saved ${entries.length} entries to session storage.`);
      } catch (e) {
        console.error(`${LOG_PREFIX} Error saving to session storage:`, e);
      }
    }
    this.selectedEntriesSubject.next(entries);
  }

  addEntry(entry: PlzEntry): boolean {
    console.log(`${LOG_PREFIX} Attempting to add entry:`, entry);
    if (!this.validateEntry(entry)) {
      console.warn(`${LOG_PREFIX} Add failed: Invalid entry provided.`, entry);
      return false;
    }
    const currentEntries = this.selectedEntriesSubject.getValue();
    if (!currentEntries.find(e => e.id === entry.id)) {
      const updatedEntries = [...currentEntries, entry];
      this.saveToSession(updatedEntries);
      console.log(`${LOG_PREFIX} Entry added. Total selected: ${updatedEntries.length}`);
      return true;
    }
    console.log(`${LOG_PREFIX} Add failed: Entry with ID ${entry.id} already exists.`);
    return false;
  }

  removeEntry(entryId: string): void {
    console.log(`${LOG_PREFIX} Attempting to remove entry with ID: ${entryId}`);
    const currentEntries = this.selectedEntriesSubject.getValue();
    const updatedEntries = currentEntries.filter(e => e.id !== entryId);
    if (updatedEntries.length < currentEntries.length) {
      this.saveToSession(updatedEntries);
      console.log(`${LOG_PREFIX} Entry removed. Total selected: ${updatedEntries.length}`);
    } else {
      console.log(`${LOG_PREFIX} Remove failed: No entry found with ID ${entryId}.`);
    }
  }

  clearEntries(): void {
    const currentCount = this.selectedEntriesSubject.getValue().length;
    console.log(`${LOG_PREFIX} Attempting to clear ${currentCount} entries.`);
    if (currentCount > 0) {
      this.saveToSession([]);
      console.log(`${LOG_PREFIX} All entries cleared.`);
    } else {
      console.log(`${LOG_PREFIX} No entries to clear.`);
    }
  }

  getSelectedEntries(): PlzEntry[] {
    return this.selectedEntriesSubject.getValue();
  }

  validateEntry(entry: PlzEntry): boolean {
    const isValid = entry &&
      typeof entry.id === 'string' && entry.id.trim() !== '' &&
      typeof entry.ort === 'string' && // Ort darf leer sein, aber muss ein String sein
      typeof entry.plz4 === 'string' && entry.plz4.trim() !== '' &&
      typeof entry.plz6 === 'string' && entry.plz6.trim() !== '';
    if (!isValid) {
      // console.warn(`${LOG_PREFIX} Validation failed for entry:`, entry); // Kann sehr gesprächig sein
    }
    return isValid;
  }
}
