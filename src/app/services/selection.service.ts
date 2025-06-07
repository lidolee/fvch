import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PlzEntry, PlzDataService } from './plz-data.service';
import { ZielgruppeOption } from './order-data.types';

@Injectable({
  providedIn: 'root'
})
export class SelectionService {
  private selectedEntriesSubject = new BehaviorSubject<PlzEntry[]>([]);
  public selectedEntries$: Observable<PlzEntry[]> = this.selectedEntriesSubject.asObservable();

  public totalFlyerCount$: Observable<number>;
  public totalMaxPossibleFlyers$: Observable<number>;

  private currentZielgruppeInternal: ZielgruppeOption = 'Alle Haushalte';


  constructor(private plzDataService: PlzDataService) {
    this.totalFlyerCount$ = this.selectedEntries$.pipe(
      map(entries => entries.reduce((sum, entry) => sum + (entry.selected_display_flyer_count ?? this.getDefaultFlyerCountForEntry(entry, this.currentZielgruppeInternal)), 0))
    );

    this.totalMaxPossibleFlyers$ = this.selectedEntries$.pipe(
      map(entries => entries.reduce((sum, entry) => sum + (entry.all || 0), 0))
    );
    console.log(`[${new Date().toISOString()}] [SelectionService] Initialized. Current internal Zielgruppe: ${this.currentZielgruppeInternal}`);
  }

  public getSelectedEntriesSnapshot(): PlzEntry[] {
    return [...this.selectedEntriesSubject.getValue()];
  }

  public addEntry(entry: PlzEntry, zielgruppe: ZielgruppeOption): void {
    const currentEntries = this.selectedEntriesSubject.getValue();
    if (!currentEntries.find(e => e.id === entry.id) && this.validateEntry(entry)) {
      const newEntryWithDefaults = {
        ...entry,
        selected_display_flyer_count: this.getDefaultFlyerCountForEntry(entry, zielgruppe),
        is_manual_count: false,
      };
      this.selectedEntriesSubject.next([...currentEntries, newEntryWithDefaults].sort((a,b) => a.plz6.localeCompare(b.plz6)));
      console.log(`[${new Date().toISOString()}] [SelectionService] Entry added. ID: ${newEntryWithDefaults.id}. Zielgruppe at add: ${zielgruppe}`);
    }
  }

  public addMultipleEntries(entries: PlzEntry[], zielgruppe: ZielgruppeOption): void {
    const currentSelected = this.selectedEntriesSubject.getValue();
    const newEntriesToAdd = entries.filter(
      newEntry => !currentSelected.find(existing => existing.id === newEntry.id) && this.validateEntry(newEntry)
    );

    if (newEntriesToAdd.length > 0) {
      const entriesWithDefaults = newEntriesToAdd.map(entry => ({
        ...entry,
        selected_display_flyer_count: this.getDefaultFlyerCountForEntry(entry, zielgruppe),
        is_manual_count: false,
      }));
      this.selectedEntriesSubject.next([...currentSelected, ...entriesWithDefaults].sort((a,b) => a.plz6.localeCompare(b.plz6)));
      console.log(`[${new Date().toISOString()}] [SelectionService] Multiple entries added. Count: ${entriesWithDefaults.length}. Zielgruppe at add: ${zielgruppe}`);
    }
  }

  public removeEntry(entryId: string): void {
    const currentEntries = this.selectedEntriesSubject.getValue();
    this.selectedEntriesSubject.next(currentEntries.filter(e => e.id !== entryId));
    console.log(`[${new Date().toISOString()}] [SelectionService] Entry removed. ID: ${entryId}`);
  }

  public clearEntries(): void {
    this.selectedEntriesSubject.next([]);
    console.log(`[${new Date().toISOString()}] [SelectionService] All entries cleared.`);
  }

  public validateEntry(entry: PlzEntry): boolean {
    return !!entry && entry.id.length > 0;
  }

  public updateFlyerCountForEntry(entryId: string, newCount: number, zielgruppeRelevantAtInput: ZielgruppeOption): void {
    const currentEntries = this.selectedEntriesSubject.getValue();
    const entryIndex = currentEntries.findIndex(e => e.id === entryId);

    if (entryIndex > -1) {
      const originalEntry = currentEntries[entryIndex];
      const maxCount = this.getMaxFlyerCountForEntry(originalEntry, zielgruppeRelevantAtInput);

      let validatedCount = isNaN(newCount) ? 0 : newCount;
      validatedCount = Math.max(0, Math.min(validatedCount, maxCount));

      if (originalEntry.selected_display_flyer_count === validatedCount && originalEntry.is_manual_count === true) {
        console.log(`[${new Date().toISOString()}] [SelectionService] updateFlyerCountForEntry: No change for ID ${entryId}, count ${validatedCount}. Skipping emit.`);
        return;
      }

      const updatedEntry = {
        ...originalEntry,
        selected_display_flyer_count: validatedCount,
        is_manual_count: true,
      };

      const updatedEntries = currentEntries.map(e => e.id === entryId ? updatedEntry : e);
      this.selectedEntriesSubject.next(updatedEntries);
      console.log(`[${new Date().toISOString()}] [SelectionService] Flyer count manually updated for entryId: ${entryId}, newCount: ${validatedCount}, Zielgruppe at input: ${zielgruppeRelevantAtInput}. Emitting new selectedEntries$.`);
    } else {
      console.warn(`[${new Date().toISOString()}] [SelectionService] updateFlyerCountForEntry: Entry not found with ID ${entryId}.`);
    }
  }

  public updateFlyerCountsForAudience(newZielgruppeGlobal: ZielgruppeOption): void {
    this.currentZielgruppeInternal = newZielgruppeGlobal;
    const currentEntries = this.selectedEntriesSubject.getValue();

    const updatedEntries = currentEntries.map(originalEntry => {
      const entry = { ...originalEntry };

      if (newZielgruppeGlobal === 'Alle Haushalte') {
        entry.selected_display_flyer_count = this.getDefaultFlyerCountForEntry(entry, newZielgruppeGlobal);
        entry.is_manual_count = false;
      } else {
        if (!entry.is_manual_count || typeof entry.selected_display_flyer_count === 'undefined') {
          entry.selected_display_flyer_count = this.getDefaultFlyerCountForEntry(entry, newZielgruppeGlobal);
          entry.is_manual_count = false;
        } else {
          const maxForNewAudience = this.getMaxFlyerCountForEntry(entry, newZielgruppeGlobal);
          if (entry.selected_display_flyer_count > maxForNewAudience) {
            entry.selected_display_flyer_count = maxForNewAudience;
          }
        }
      }
      return entry;
    });

    if (JSON.stringify(currentEntries) !== JSON.stringify(updatedEntries)) {
      this.selectedEntriesSubject.next(updatedEntries);
      console.log(`[${new Date().toISOString()}] [SelectionService] Flyer counts updated for global audience change. New global Zielgruppe: ${newZielgruppeGlobal}. Emitting new selectedEntries$.`);
    } else {
      console.log(`[${new Date().toISOString()}] [SelectionService] Flyer counts for global audience change did not result in actual data changes for selectedEntries. New global Zielgruppe: ${newZielgruppeGlobal}.`);
    }
  }

  private getDefaultFlyerCountForEntry(entry: PlzEntry, zielgruppe: ZielgruppeOption): number {
    switch (zielgruppe) {
      case 'Alle Haushalte':
        return entry.all || 0;
      case 'Ein- und Zweifamilienhäuser':
        return entry.efh || 0;
      case 'Mehrfamilienhäuser':
        return entry.mfh || 0;
      default:
        console.warn(`[SelectionService] Unbekannte Zielgruppe "${zielgruppe}" in getDefaultFlyerCountForEntry. Fallback auf entry.all.`);
        return entry.all || 0;
    }
  }

  private getMaxFlyerCountForEntry(entry: PlzEntry, zielgruppe: ZielgruppeOption): number {
    return this.getDefaultFlyerCountForEntry(entry, zielgruppe);
  }
}
