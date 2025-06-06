import {Inject, Injectable, PLATFORM_ID} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom, Observable, of, throwError} from 'rxjs';
import {catchError, map, shareReplay} from 'rxjs/operators';
import {isPlatformBrowser} from '@angular/common';

const FVDB_JSON_PATH = 'assets/fvdb.json';
const MAX_SUGGESTION_RESULTS = 7;

export interface PlzEntry {
  id: string;
  plz6: string;
  plz4: string;
  ort: string;
  kt: string;
  all: number;
  mfh?: number;
  efh?: number;
  isSelected?: boolean;
  isHighlighted?: boolean;
  selected_display_flyer_count?: number;
  is_manual_count?: boolean;
}

export interface EnhancedSearchResultItem extends PlzEntry {
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
  private dataLoadingPromise: Promise<PlzEntry[]> | null = null;
  private logPrefix = () => `${new Date().toISOString()} [PlzDataService]`;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  public normalizeStringForSearch(str: string): string {
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
      return of([]);
    }
    if (this.dataLoadedSuccessfully && this.rawEntriesCache.length > 0 && this.plzData$) {
      return of(this.rawEntriesCache);
    }
    if (this.plzData$) {
      return this.plzData$;
    }

    this.plzData$ = this.http.get<any[]>(FVDB_JSON_PATH).pipe(
      map(rawDataArray => {
        if (!Array.isArray(rawDataArray)) {
          this.dataLoadedSuccessfully = false;
          this.rawEntriesCache = [];
          return [];
        }
        const processedEntries: PlzEntry[] = rawDataArray
          .map((rawEntry) => {
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
              id: plz6FromInput,
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
        return this.rawEntriesCache;
      }),
      shareReplay(1),
      catchError(err => {
        console.error(`${this.logPrefix()} loadPlzData (catchError): HTTP or mapping error. Resetting state. Error:`, err);
        this.rawEntriesCache = [];
        this.dataLoadedSuccessfully = false;
        this.plzData$ = null;
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

  public async ensureDataReady(): Promise<boolean> {
    if (this.dataLoadedSuccessfully && this.rawEntriesCache.length > 0) {
      return true;
    }
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    if (this.dataLoadingPromise) {
      try {
        await this.dataLoadingPromise;
        return this.dataLoadedSuccessfully;
      } catch(e) {
        return false;
      }
    }

    this.dataLoadingPromise = firstValueFrom(
      this.getPlzData().pipe(
        catchError(err => {
          this.dataLoadedSuccessfully = false;
          return of([]);
        })
      )
    );

    try {
      await this.dataLoadingPromise;
      return this.dataLoadedSuccessfully;
    } catch (error) {
      this.dataLoadedSuccessfully = false;
      return false;
    } finally {
      this.dataLoadingPromise = null;
    }
  }

  public getEntriesByOrtAndKanton(ort: string, kanton: string): Observable<PlzEntry[]> {
    const normalizedSearchOrt = this.normalizeStringForSearch(ort);
    const normalizedSearchKanton = this.normalizeStringForSearch(kanton);
    return this.getPlzData().pipe(
      map(entries => entries.filter(entry =>
        this.normalizeStringForSearch(entry.ort) === normalizedSearchOrt &&
        this.normalizeStringForSearch(entry.kt) === normalizedSearchKanton
      )),
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
      })),
      catchError(() => of([]))
    );
  }

  public getEntryById(id: string): Observable<PlzEntry | undefined> {
    return this.getPlzData().pipe(
      map(entries => {
        return entries.find(entry => entry.id === id);
      }),
      catchError((_err) => {
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
            .map(entry => ({ ...entry } as EnhancedSearchResultItem))
            .sort((a, b) => a.plz6.localeCompare(b.plz6));
        }
        else if (/^[a-z0-9\s./]+$/.test(searchTermNormalized)) {
          const ortMap = new Map<string, PlzEntry[]>();
          allEntries.forEach(entry => {
            const entryOrtNormalized = this.normalizeStringForSearch(entry.ort);
            if (entryOrtNormalized.startsWith(searchTermNormalized)) {
              const groupKey = `${entry.ort}-${entry.kt}`;
              if (!ortMap.has(groupKey)) {
                ortMap.set(groupKey, []);
              }
              ortMap.get(groupKey)!.push(entry);
            }
          });
          const groupedOrtSuggestions: EnhancedSearchResultItem[] = [];
          ortMap.forEach((entriesInGroup, _groupKey) => {
            const firstEntry = entriesInGroup[0];
            if (entriesInGroup.length > 1) {
              groupedOrtSuggestions.push({
                ...firstEntry,
                id: `group-header-${this.normalizeStringForSearch(firstEntry.ort).replace(/\s+/g, '_')}-${this.normalizeStringForSearch(firstEntry.kt)}`,
                isGroupHeader: true,
                childPlzCount: entriesInGroup.length,
              });
            } else {
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
      catchError((_err) => {
        return of([]);
      })
    );
  }
}
