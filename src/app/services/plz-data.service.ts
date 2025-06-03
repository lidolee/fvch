import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';

const FVDB_JSON_PATH = 'assets/fvdb.json';

export interface PlzEntry {
  id: string;
  plz6: string;
  plz4: string;
  ort: string;
  kt: string;
  all: number;
  mfh?: number;
  efh?: number;
  isGroupEntry?: boolean;
}

export interface EnhancedSearchResultItem extends PlzEntry {
  isGroupHeader?: boolean;
  childPlzCount?: number;
  isPrimaryOrtMatch?: boolean;
  isPrimaryPlzMatch?: boolean;
  uxScore?: number;
}

export interface SearchResultsContainer {
  searchTerm: string;
  searchTypeDisplay: 'ort' | 'plz' | 'mixed' | 'none' | 'popular';
  itemsForDisplay: EnhancedSearchResultItem[];
  headerText: string;
  showSelectAllButton: boolean;
  entriesForSelectAllAction: PlzEntry[];
}

@Injectable({
  providedIn: 'root'
})
export class PlzDataService {
  private plzData$: Observable<PlzEntry[]> | null = null;
  private rawEntriesCache: PlzEntry[] = [];
  private dataLoadedSuccessfully = false;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  private loadPlzData(): Observable<PlzEntry[]> {
    if (!isPlatformBrowser(this.platformId)) {
      this.dataLoadedSuccessfully = false;
      return of([]);
    }
    if (this.plzData$ && this.dataLoadedSuccessfully) {
      return this.plzData$;
    }
    if (this.plzData$ && !this.dataLoadedSuccessfully && this.rawEntriesCache.length > 0) {
      return of(this.rawEntriesCache);
    }
    this.plzData$ = this.http.get<any[]>(FVDB_JSON_PATH).pipe(
      map(rawDataArray => {
        if (!Array.isArray(rawDataArray)) {
          this.dataLoadedSuccessfully = false;
          this.rawEntriesCache = [];
          throw new Error('Invalid data format from fvdb.json');
        }
        let processedEntries: PlzEntry[] = [];
        for (let i = 0; i < rawDataArray.length; i++) {
          const rawEntry = rawDataArray[i];
          if (!rawEntry) continue;
          const plz6FromInput = String(rawEntry.plz || '').trim();
          const ortFromInput = String(rawEntry.name || '').trim();
          const ktFromInput = String(rawEntry.ct || 'N/A').trim();
          const plz4 = plz6FromInput ? plz6FromInput.substring(0, 4) : '';
          const id = plz6FromInput || `${ortFromInput}-${ktFromInput}`;
          if (!id || !plz6FromInput || !plz4 || !ortFromInput) continue;
          const all = Number(rawEntry.all) || 0;
          let mfh = rawEntry.mfh !== undefined && rawEntry.mfh !== null ? Number(rawEntry.mfh) : undefined;
          let efh = rawEntry.efh !== undefined && rawEntry.efh !== null ? Number(rawEntry.efh) : undefined;
          mfh = (mfh === undefined) ? undefined : (isNaN(mfh) ? 0 : mfh);
          efh = (efh === undefined) ? undefined : (isNaN(efh) ? 0 : efh);
          processedEntries.push({
            id: id, plz6: plz6FromInput, plz4: plz4, ort: ortFromInput, kt: ktFromInput,
            all: all, mfh: mfh, efh: efh, isGroupEntry: false
          });
        }
        this.rawEntriesCache = processedEntries;
        this.dataLoadedSuccessfully = processedEntries.length > 0;
        return this.rawEntriesCache;
      }),
      shareReplay(1),
      catchError(() => {
        this.rawEntriesCache = [];
        this.dataLoadedSuccessfully = false;
        return throwError(() => new Error('Failed to load PLZ data.'));
      })
    );
    return this.plzData$;
  }

  public getPlzData(): Observable<PlzEntry[]> {
    if (!this.plzData$) this.plzData$ = this.loadPlzData();
    return this.plzData$;
  }

  public searchEnhanced(term: string): Observable<SearchResultsContainer> {
    const originalTerm = term;
    const searchTermNormalized = term.toLowerCase().trim();
    const emptyResult: SearchResultsContainer = {
      searchTerm: originalTerm, searchTypeDisplay: 'none', itemsForDisplay: [],
      headerText: `Keine Einträge für "${originalTerm}" gefunden.`, showSelectAllButton: false, entriesForSelectAllAction: []
    };

    if (!searchTermNormalized) {
      return of({ ...emptyResult, headerText: '', searchTypeDisplay: 'popular' });
    }

    return this.getPlzData().pipe(
      map((allEntries): SearchResultsContainer => {
        if (!allEntries || allEntries.length === 0) {
          return { ...emptyResult, searchTerm: originalTerm, headerText: 'Keine Daten geladen oder verfügbar.' };
        }

        // Range detection
        const plzRange = /^\s*(\d{4,6})\s*-\s*(\d{4,6})\s*$/.exec(searchTermNormalized);
        if (plzRange) {
          const startPlz = parseInt(plzRange[1], 10);
          const endPlz = parseInt(plzRange[2], 10);
          const foundPlz = allEntries.filter(entry => {
            const plzNum = parseInt(entry.plz4, 10);
            return plzNum >= startPlz && plzNum <= endPlz;
          });
          let headerMsg = foundPlz.length > 0
            ? `PLZ-Bereich ${startPlz}-${endPlz}: ${foundPlz.length} PLZ gefunden.`
            : `Keine PLZ im Bereich ${startPlz}-${endPlz} gefunden.`;
          return {
            searchTerm: originalTerm,
            searchTypeDisplay: 'plz',
            itemsForDisplay: [],
            headerText: headerMsg,
            showSelectAllButton: foundPlz.length > 0,
            entriesForSelectAllAction: foundPlz
          };
        }

        // PLZ search (numbers only, at least 2 digits)
        if (/^\d{2,}$/.test(searchTermNormalized)) {
          const plzResults = allEntries
            .filter(entry => entry.plz4.startsWith(searchTermNormalized))
            .sort((a, b) => a.plz4.localeCompare(b.plz4))
            .slice(0, 5)
            .map(entry => ({
              ...entry,
              isPrimaryPlzMatch: true,
              isPrimaryOrtMatch: false,
              uxScore: 100
            }));
          let headerMsg = plzResults.length > 0
            ? `PLZ-Treffer für "${originalTerm}":`
            : `Keine PLZ gefunden für "${originalTerm}".`;
          return {
            searchTerm: originalTerm,
            searchTypeDisplay: 'plz',
            itemsForDisplay: plzResults,
            headerText: headerMsg,
            showSelectAllButton: false,
            entriesForSelectAllAction: []
          };
        }

        // ORT search (letters only, at least 2, must start with input)
        if (/^[a-zA-ZäöüÄÖÜß]{2,}/.test(term)) {
          const normInput = searchTermNormalized;
          const ortGroups: { [ort: string]: PlzEntry[] } = {};
          for (const entry of allEntries) {
            if (entry.ort.toLowerCase().startsWith(normInput)) {
              if (!ortGroups[entry.ort]) ortGroups[entry.ort] = [];
              ortGroups[entry.ort].push(entry);
            }
          }
          // Sort: most PLZs first, then alphabetically
          let groupArray = Object.entries(ortGroups)
            .map(([ort, list]) => ({ ort, entries: list }))
            .sort((a, b) => {
              if (b.entries.length !== a.entries.length)
                return b.entries.length - a.entries.length;
              return a.ort.localeCompare(b.ort);
            });

          let ortResults: EnhancedSearchResultItem[] = [];
          // First: groups >1 PLZ as group header
          for (const group of groupArray) {
            if (group.entries.length > 1) {
              ortResults.push({
                ...group.entries[0],
                isGroupHeader: true,
                childPlzCount: group.entries.length,
                uxScore: 100 + group.entries.length
              });
            }
          }
          // Then: groups with 1 PLZ only, as single
          for (const group of groupArray) {
            if (group.entries.length === 1) {
              ortResults.push({
                ...group.entries[0],
                isGroupHeader: false,
                childPlzCount: 1,
                uxScore: 80
              });
            }
          }
          ortResults = ortResults.slice(0, 5);

          let headerMsg = ortResults.length > 0
            ? `Orts-Treffer für "${originalTerm}":`
            : `Kein Ort gefunden für "${originalTerm}".`;

          let entriesForSelectAll: PlzEntry[] = [];
          if (ortResults[0]?.isGroupHeader && ortGroups[ortResults[0].ort]) {
            entriesForSelectAll = ortGroups[ortResults[0].ort];
          }

          return <SearchResultsContainer>{
            searchTerm: originalTerm,
            searchTypeDisplay: 'ort',
            itemsForDisplay: ortResults,
            headerText: headerMsg,
            showSelectAllButton: ortResults[0]?.isGroupHeader && entriesForSelectAll.length > 1,
            entriesForSelectAllAction: entriesForSelectAll
          };
        }

        return {
          ...emptyResult,
          searchTerm: originalTerm
        };
      }),
      catchError(() => {
        return of({ ...emptyResult, searchTerm: originalTerm, headerText: 'Fehler bei der Suche.' });
      })
    );
  }

  public getEntryById(id: string): Observable<PlzEntry | undefined> {
    return this.getPlzData().pipe(
      map(entries => entries.find(entry => entry.id === id)),
      catchError(() => of(undefined))
    );
  }

  public getEntriesByPlzRange(plzRange: string): Observable<PlzEntry[]> {
    const parts = plzRange.split('-');
    if (parts.length !== 2) return of([]);
    const startPlz = parseInt(parts[0].trim(), 10);
    const endPlz = parseInt(parts[1].trim(), 10);
    if (isNaN(startPlz) || isNaN(endPlz) || startPlz > endPlz || String(startPlz).length < 4 || String(endPlz).length < 4) {
      return of([]);
    }
    return this.getPlzData().pipe(
      map(entries => entries.filter(entry => {
        const plzNum = parseInt(entry.plz4, 10);
        return plzNum >= startPlz && plzNum <= endPlz;
      })),
      catchError(() => of([]))
    );
  }

  public getEntriesByOrt(ortName: string): Observable<PlzEntry[]> {
    const searchTerm = ortName.toLowerCase().trim();
    return this.getPlzData().pipe(
      map(entries => entries.filter(entry => !entry.isGroupEntry && entry.ort.toLowerCase() === searchTerm)),
      catchError(() => of([]))
    );
  }
}
