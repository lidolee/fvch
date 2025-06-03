import {Inject, Injectable, PLATFORM_ID} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {catchError, map, shareReplay} from 'rxjs/operators';
import {isPlatformBrowser} from '@angular/common';

const FVDB_JSON_PATH = 'assets/fvdb.json';
const MAX_SUGGESTION_RESULTS = 7;

export interface PlzEntry {
  id: string; // WIRD JETZT WIEDER DIE REINE PLZ6 SEIN
  plz6: string;
  plz4: string;
  ort: string;
  kt: string;
  all: number;
  mfh?: number;
  efh?: number;
}

export interface EnhancedSearchResultItem extends PlzEntry {
  // Die ID hier wird auch die PLZ6 sein, da sie PlzEntry erweitert.
  // Für Gruppen-Header verwenden wir eine spezielle ID.
  isGroupHeader?: boolean;
  childPlzCount?: number;
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
  ) {
    console.log(`[PlzDataService] Service instantiated at ${new Date().toISOString()}`);
  }

  private normalizeStringForSearch(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private loadPlzData(): Observable<PlzEntry[]> {
    if (!isPlatformBrowser(this.platformId)) {
      this.dataLoadedSuccessfully = false;
      console.warn(`${new Date().toISOString()} [PlzDataService] Not running in browser, skipping JSON load.`);
      return of([]);
    }
    if (this.plzData$ && this.dataLoadedSuccessfully) {
      return this.plzData$;
    }
    if (this.plzData$ && !this.dataLoadedSuccessfully && this.rawEntriesCache.length > 0) {
      return of(this.rawEntriesCache);
    }

    console.log(`${new Date().toISOString()} [PlzDataService] Initiating PLZ data load from ${FVDB_JSON_PATH}`);
    this.plzData$ = this.http.get<any[]>(FVDB_JSON_PATH).pipe(
      map(rawDataArray => {
        if (!Array.isArray(rawDataArray)) {
          this.dataLoadedSuccessfully = false;
          this.rawEntriesCache = [];
          console.error(`${new Date().toISOString()} [PlzDataService] Invalid data format from fvdb.json: Expected an array. Received:`, typeof rawDataArray);
          return [];
        }

        const processedEntries: PlzEntry[] = rawDataArray
          .map((rawEntry, index) => {
            if (!rawEntry || typeof rawEntry.plz === 'undefined' || typeof rawEntry.name === 'undefined') {
              return null;
            }
            const plz6FromInput = String(rawEntry.plz).trim();
            const ortFromInput = String(rawEntry.name).trim();
            const ktFromInput = String(rawEntry.ct || 'N/A').trim();

            if (!plz6FromInput || !ortFromInput) {
              return null;
            }
            const plz4 = plz6FromInput.substring(0, 4);

            return {
              id: plz6FromInput, // ID ist jetzt die PLZ6
              plz6: plz6FromInput,
              plz4: plz4,
              ort: ortFromInput,
              kt: ktFromInput,
              all: Number(rawEntry.all) || 0,
              mfh: rawEntry.mfh !== undefined && rawEntry.mfh !== null ? Number(rawEntry.mfh) : undefined,
              efh: rawEntry.efh !== undefined && rawEntry.efh !== null ? Number(rawEntry.efh) : undefined,
            };
          })
          .filter(entry => entry !== null) as PlzEntry[];

        this.rawEntriesCache = processedEntries;
        this.dataLoadedSuccessfully = processedEntries.length > 0;
        console.log(`${new Date().toISOString()} [PlzDataService] PLZ data loaded and processed. ${processedEntries.length} entries. First entry ID example: ${processedEntries.length > 0 ? processedEntries[0].id : 'N/A'}`);
        if (!this.dataLoadedSuccessfully && rawDataArray.length > 0) {
          console.warn(`${new Date().toISOString()} [PlzDataService] PLZ data loaded but resulted in an empty processed list. Original raw count: ${rawDataArray.length}`);
        }
        return this.rawEntriesCache;
      }),
      shareReplay(1),
      catchError(err => {
        this.rawEntriesCache = [];
        this.dataLoadedSuccessfully = false;
        console.error(`${new Date().toISOString()} [PlzDataService] Failed to load PLZ data from ${FVDB_JSON_PATH}.`, err);
        return throwError(() => new Error(`Failed to load PLZ data. Error: ${err.message || err}`));
      })
    );
    return this.plzData$;
  }

  public getPlzData(): Observable<PlzEntry[]> {
    if (!this.plzData$) {
      return this.loadPlzData();
    }
    return this.plzData$;
  }

  public getEntriesByOrtAndKanton(ort: string, kanton: string): Observable<PlzEntry[]> {
    const normalizedSearchOrt = this.normalizeStringForSearch(ort);
    const normalizedSearchKanton = this.normalizeStringForSearch(kanton);
    return this.getPlzData().pipe(
      map(entries => entries.filter(entry =>
        this.normalizeStringForSearch(entry.ort) === normalizedSearchOrt &&
        this.normalizeStringForSearch(entry.kt) === normalizedSearchKanton
      )), // Die zurückgegebenen 'entries' haben jetzt die PLZ6 als ID
      catchError(() => of([]))
    );
  }

  public getEntriesByPlzRange(rangeStart: number, rangeEnd: number): Observable<PlzEntry[]> {
    if (isNaN(rangeStart) || isNaN(rangeEnd) || rangeStart > rangeEnd) {
      return of([]);
    }
    return this.getPlzData().pipe(
      map(entries => entries.filter(entry => {
        const plzNum = parseInt(entry.plz4, 10);
        return !isNaN(plzNum) && plzNum >= rangeStart && plzNum <= rangeEnd;
      })), // Die zurückgegebenen 'entries' haben jetzt die PLZ6 als ID
      catchError(() => of([]))
    );
  }

  public getEntryById(id: string): Observable<PlzEntry | undefined> {
    // Sucht jetzt nach der PLZ6 als ID
    console.log(`[PlzDataService] getEntryById called with ID (expected PLZ6): "${id}"`);
    return this.getPlzData().pipe(
      map(entries => {
        const foundEntry = entries.find(entry => entry.id === id); // entry.id ist jetzt PLZ6
        if (!foundEntry) {
          console.warn(`[PlzDataService] getEntryById: No entry found for ID (PLZ6) "${id}". Available ID examples: ${entries.slice(0,5).map(e => e.id).join(', ')}`);
        }
        return foundEntry;
      }),
      catchError((err) => {
        console.error(`[PlzDataService] Error in getEntryById for ID (PLZ6) "${id}":`, err);
        return of(undefined);
      })
    );
  }

  public fetchTypeaheadSuggestions(term: string): Observable<EnhancedSearchResultItem[]> {
    const searchTermNormalized = this.normalizeStringForSearch(term);
    if (searchTermNormalized.length < 2) {
      return of([]);
    }

    return this.getPlzData().pipe(
      map((allEntries): EnhancedSearchResultItem[] => {
        if (!allEntries || allEntries.length === 0) return [];

        const plzRangeRegex = /^\s*(\d{4,6})\s*-\s*(\d{4,6})\s*$/;
        if (plzRangeRegex.test(term.trim())) {
          return [];
        }

        let results: EnhancedSearchResultItem[] = [];

        if (/^\d+$/.test(term.trim())) {
          const originalTrimmedTerm = term.trim();
          results = allEntries
            .filter(entry => entry.plz6.startsWith(originalTrimmedTerm) || entry.plz4.startsWith(originalTrimmedTerm))
            .map(entry => ({ ...entry } as EnhancedSearchResultItem)) // entry.id ist hier PLZ6
            .sort((a, b) => a.plz6.localeCompare(b.plz6));
        }
        else if (/^[a-z0-9\s./]+$/.test(searchTermNormalized)) {
          const ortMap = new Map<string, PlzEntry[]>();
          allEntries.forEach(entry => {
            const entryOrtNormalized = this.normalizeStringForSearch(entry.ort);
            const startsWithSearchTerm = entryOrtNormalized.startsWith(searchTermNormalized);
            if (startsWithSearchTerm) {
              const groupKey = `${entry.ort}-${entry.kt}`;
              if (!ortMap.has(groupKey)) {
                ortMap.set(groupKey, []);
              }
              ortMap.get(groupKey)!.push(entry); // entry.id ist hier PLZ6
            }
          });

          const groupedOrtSuggestions: EnhancedSearchResultItem[] = [];
          ortMap.forEach((entriesInGroup, _groupKey) => {
            const firstEntry = entriesInGroup[0]; // firstEntry.id ist PLZ6
            if (entriesInGroup.length > 1) {
              groupedOrtSuggestions.push({
                ...firstEntry, // firstEntry.id ist PLZ6
                // ID für Gruppen-Header, um klar von Daten-IDs (PLZ6) zu unterscheiden
                id: `group-header-${this.normalizeStringForSearch(firstEntry.ort).replace(/\s+/g, '_')}-${this.normalizeStringForSearch(firstEntry.kt)}`,
                isGroupHeader: true,
                childPlzCount: entriesInGroup.length,
              });
            } else {
              // Einzelner Eintrag, firstEntry.id ist bereits die korrekte PLZ6
              groupedOrtSuggestions.push({ ...firstEntry });
            }
          });

          groupedOrtSuggestions.sort((a, b) => {
            const aIsGroup = a.isGroupHeader ?? false;
            const bIsGroup = b.isGroupHeader ?? false;
            if (aIsGroup && !bIsGroup) return -1;
            if (!aIsGroup && bIsGroup) return 1;
            if (aIsGroup && bIsGroup) {
              if (b.childPlzCount! !== a.childPlzCount!) {
                return b.childPlzCount! - a.childPlzCount!;
              }
            }
            return a.ort.localeCompare(b.ort, undefined, { sensitivity: 'base' });
          });
          results = groupedOrtSuggestions;
        }
        return results.slice(0, MAX_SUGGESTION_RESULTS);
      }),
      catchError((err) => {
        console.error(`${new Date().toISOString()} [PlzDataService] Error in typeahead suggestion processing for "${term}":`, err);
        return of([]);
      })
    );
  }
}
