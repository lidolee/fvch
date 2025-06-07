import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PlzEntry, PlzDataService } from './plz-data.service';
// KORREKTER IMPORT für ZielgruppeOption
import { ZielgruppeOption } from './order-data.types';

@Injectable({
  providedIn: 'root'
})
export class SelectionService {
  private selectedEntriesSubject = new BehaviorSubject<PlzEntry[]>([]);
  public selectedEntries$: Observable<PlzEntry[]> = this.selectedEntriesSubject.asObservable();

  public totalFlyerCount$: Observable<number>;
  public totalMaxPossibleFlyers$: Observable<number>;

  constructor(private plzDataService: PlzDataService) {
    this.totalFlyerCount$ = this.selectedEntries$.pipe(
      map(entries => entries.reduce((sum, entry) => sum + (entry.selected_display_flyer_count ?? this.getDefaultFlyerCountForEntry(entry, 'Alle Haushalte')), 0))
    );

    this.totalMaxPossibleFlyers$ = this.selectedEntries$.pipe(
      map(entries => entries.reduce((sum, entry) => sum + (entry.all || 0), 0))
    );
  }

  public getSelectedEntries(): PlzEntry[] {
    return this.selectedEntriesSubject.getValue();
  }

  public addEntry(entry: PlzEntry, zielgruppe: ZielgruppeOption): void {
    const currentEntries = this.selectedEntriesSubject.getValue();
    if (!currentEntries.find(e => e.id === entry.id) && this.validateEntry(entry)) {
      entry.selected_display_flyer_count = this.getDefaultFlyerCountForEntry(entry, zielgruppe);
      entry.is_manual_count = false;
      this.selectedEntriesSubject.next([...currentEntries, entry].sort((a,b) => a.plz6.localeCompare(b.plz6)));
    }
  }

  public addMultipleEntries(entries: PlzEntry[], zielgruppe: ZielgruppeOption): void {
    const currentSelected = this.selectedEntriesSubject.getValue();
    const newEntriesToAdd = entries.filter(
      newEntry => !currentSelected.find(existing => existing.id === newEntry.id) && this.validateEntry(newEntry)
    );

    if (newEntriesToAdd.length > 0) {
      newEntriesToAdd.forEach(entry => {
        entry.selected_display_flyer_count = this.getDefaultFlyerCountForEntry(entry, zielgruppe);
        entry.is_manual_count = false;
      });
      this.selectedEntriesSubject.next([...currentSelected, ...newEntriesToAdd].sort((a,b) => a.plz6.localeCompare(b.plz6)));
    }
  }

  public removeEntry(entryId: string): void {
    const currentEntries = this.selectedEntriesSubject.getValue();
    this.selectedEntriesSubject.next(currentEntries.filter(e => e.id !== entryId));
  }

  public clearEntries(): void {
    this.selectedEntriesSubject.next([]);
  }

  public validateEntry(entry: PlzEntry): boolean {
    return !!entry && typeof entry.id === 'string' && entry.id.length > 0;
  }

  public updateFlyerCountForEntry(entryId: string, newCount: number, zielgruppe: ZielgruppeOption): void {
    const currentEntries = this.selectedEntriesSubject.getValue();
    const entryIndex = currentEntries.findIndex(e => e.id === entryId);

    if (entryIndex > -1) {
      const entryToUpdate = { ...currentEntries[entryIndex] };
      const maxCount = this.getMaxFlyerCountForEntry(entryToUpdate, zielgruppe);

      entryToUpdate.selected_display_flyer_count = Math.max(0, Math.min(newCount, maxCount));
      entryToUpdate.is_manual_count = true;

      const updatedEntries = [...currentEntries];
      updatedEntries[entryIndex] = entryToUpdate;
      this.selectedEntriesSubject.next(updatedEntries);
    }
  }

  public updateFlyerCountsForAudience(zielgruppe: ZielgruppeOption): void {
    const currentEntries = this.selectedEntriesSubject.getValue();
    const updatedEntries = currentEntries.map(entry => {
      if (!entry.is_manual_count || typeof entry.selected_display_flyer_count === 'undefined') {
        return {
          ...entry,
          selected_display_flyer_count: this.getDefaultFlyerCountForEntry(entry, zielgruppe),
          is_manual_count: false
        };
      }
      const maxForNewAudience = this.getMaxFlyerCountForEntry(entry, zielgruppe);
      if (entry.selected_display_flyer_count && entry.selected_display_flyer_count > maxForNewAudience) {
        return {
          ...entry,
          selected_display_flyer_count: maxForNewAudience
        };
      }
      return entry;
    });
    this.selectedEntriesSubject.next(updatedEntries);
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
        return entry.all || 0;
    }
  }

  private getMaxFlyerCountForEntry(entry: PlzEntry, zielgruppe: ZielgruppeOption): number {
    return this.getDefaultFlyerCountForEntry(entry, zielgruppe);
  }
}
