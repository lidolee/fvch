import {Inject, Injectable, PLATFORM_ID} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom, Observable, of, throwError} from 'rxjs';
import {catchError, map, shareReplay, tap} from 'rxjs/operators';
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
  private copilotLogPrefix = () => `${new Date().toISOString()} [COPILOT] [PlzDataService]`;


  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    console.log(`${this.copilotLogPrefix()} Constructor. Platform: ${isPlatformBrowser(this.platformId) ? 'Browser' : 'Server'}`);
  }

  public normalizeStringForSearch(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private loadPlzData(): Observable<PlzEntry[]> {
    console.log(`${this.copilotLogPrefix()} loadPlzData: CALLED.`);
    if (!isPlatformBrowser(this.platformId)) {
      console.log(`${this.copilotLogPrefix()} loadPlzData: Not in browser platform. Returning empty, dataLoadedSuccessfully = false.`);
      this.dataLoadedSuccessfully = false;
      return of([]);
    }
    if (this.dataLoadedSuccessfully && this.rawEntriesCache.length > 0 && this.plzData$) {
      console.log(`${this.copilotLogPrefix()} loadPlzData: Returning from cache (dataLoadedSuccessfully=true, rawEntriesCache has data).`);
      return of(this.rawEntriesCache);
    }
    if (this.plzData$) {
      console.log(`${this.copilotLogPrefix()} loadPlzData: plzData$ observable already exists. Returning it.`);
      return this.plzData$;
    }

    console.log(`${this.copilotLogPrefix()} loadPlzData: Initiating new HTTP GET for ${FVDB_JSON_PATH}.`);
    this.plzData$ = this.http.get<any[]>(FVDB_JSON_PATH).pipe(
      map(rawDataArray => {
        console.log(`${this.copilotLogPrefix()} loadPlzData (map): Received rawDataArray. Length: ${rawDataArray?.length}`);
        if (!Array.isArray(rawDataArray)) {
          console.error(`${this.copilotLogPrefix()} loadPlzData (map): rawDataArray is not an array!`);
          this.dataLoadedSuccessfully = false;
          this.rawEntriesCache = [];
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
              // console.log(`${this.copilotLogPrefix()} loadPlzData (map-item ${index}): Missing plz6 or ort.`, rawEntry);
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

        console.log(`${this.copilotLogPrefix()} loadPlzData (map): Processed ${processedEntries.length} valid entries.`);
        this.rawEntriesCache = processedEntries;
        this.dataLoadedSuccessfully = processedEntries.length > 0; // Critical: Set based on actual processed data
        console.log(`${this.copilotLogPrefix()} loadPlzData (map): Set dataLoadedSuccessfully to ${this.dataLoadedSuccessfully} based on processedEntries.`);

        if (!this.dataLoadedSuccessfully && rawDataArray.length > 0) {
          console.warn(`${this.copilotLogPrefix()} loadPlzData (map): Raw data had items, but processedEntries is empty. Review mapping logic or data quality.`);
        }
        return this.rawEntriesCache; // Return processed entries
      }),
      tap({
        next: (entries) => {
          // This tap should primarily react or log. dataLoadedSuccessfully is now set reliably by map.
          console.log(`${this.copilotLogPrefix()} loadPlzData (tap next): Stream emitted ${entries?.length} entries. Current dataLoadedSuccessfully state: ${this.dataLoadedSuccessfully}.`);
          // If entries.length > 0 but dataLoadedSuccessfully is false, or vice-versa, it indicates a logic flaw upstream (likely in map).
          if (entries && entries.length > 0 && !this.dataLoadedSuccessfully) {
            console.warn(`${this.copilotLogPrefix()} loadPlzData (tap next): WARNING - Stream has entries, but dataLoadedSuccessfully is false.`);
          }
          if (entries && entries.length === 0 && this.dataLoadedSuccessfully) {
            console.warn(`${this.copilotLogPrefix()} loadPlzData (tap next): WARNING - Stream has NO entries, but dataLoadedSuccessfully is true.`);
            // Potentially reset if this state is considered invalid:
            // this.dataLoadedSuccessfully = false;
            // console.log(`${this.copilotLogPrefix()} loadPlzData (tap next): Corrected dataLoadedSuccessfully to false due to empty entries.`);
          }
        },
        error: (err) => {
          console.error(`${this.copilotLogPrefix()} loadPlzData (tap error): Stream errored. Setting dataLoadedSuccessfully to false. Error:`, err);
          this.dataLoadedSuccessfully = false; // Correct for error case
        }
      }),
      shareReplay(1),
      catchError(err => {
        console.error(`${this.copilotLogPrefix()} loadPlzData (catchError): HTTP or mapping error. Resetting state. Error:`, err);
        this.rawEntriesCache = [];
        this.dataLoadedSuccessfully = false;
        this.plzData$ = null; // Reset observable so next call to loadPlzData re-fetches
        return throwError(() => new Error(`Failed to load PLZ data. Error: ${err.message || err}`));
      })
    );
    return this.plzData$;
  }

  public getPlzData(): Observable<PlzEntry[]> {
    console.log(`${this.copilotLogPrefix()} getPlzData: CALLED. plzData$ exists: ${!!this.plzData$}`);
    if (!this.plzData$) {
      console.log(`${this.copilotLogPrefix()} getPlzData: No existing plzData$, calling loadPlzData().`);
      return this.loadPlzData();
    }
    return this.plzData$;
  }

  public async ensureDataReady(): Promise<boolean> {
    console.log(`${this.copilotLogPrefix()} ensureDataReady: CALLED. Current dataLoadedSuccessfully: ${this.dataLoadedSuccessfully}, rawEntriesCache length: ${this.rawEntriesCache.length}`);
    if (this.dataLoadedSuccessfully && this.rawEntriesCache.length > 0) {
      console.log(`${this.copilotLogPrefix()} ensureDataReady: Data already loaded and cache populated. Returning true.`);
      return true;
    }
    if (!isPlatformBrowser(this.platformId)) {
      console.log(`${this.copilotLogPrefix()} ensureDataReady: Not in browser platform. Returning false.`);
      return false;
    }

    if (this.dataLoadingPromise) {
      console.log(`${this.copilotLogPrefix()} ensureDataReady: dataLoadingPromise already exists. Awaiting its completion.`);
      try {
        await this.dataLoadingPromise;
        console.log(`${this.copilotLogPrefix()} ensureDataReady: Awaited existing promise. Returning dataLoadedSuccessfully: ${this.dataLoadedSuccessfully}`);
        return this.dataLoadedSuccessfully;
      } catch(e) {
        console.error(`${this.copilotLogPrefix()} ensureDataReady: Error awaiting existing dataLoadingPromise.`, e);
        return false; // dataLoadedSuccessfully should be false if promise rejected
      }
    }

    console.log(`${this.copilotLogPrefix()} ensureDataReady: No active loading promise. Creating new one by calling getPlzData().`);
    this.dataLoadingPromise = firstValueFrom(
      this.getPlzData().pipe( // getPlzData will call loadPlzData if needed
        tap(entries => { // Added tap here to see what firstValueFrom receives
          console.log(`${this.copilotLogPrefix()} ensureDataReady (firstValueFrom tap): Received ${entries?.length} entries. dataLoadedSuccessfully is ${this.dataLoadedSuccessfully}`);
        }),
        map(entries => { // map here is fine, just passes through
          return entries;
        }),
        catchError(err => {
          console.error(`${this.copilotLogPrefix()} ensureDataReady (firstValueFrom catchError): Error from getPlzData stream. Error:`, err);
          this.dataLoadedSuccessfully = false; // Ensure flag is false on error
          return of([]); // Resolve with empty array to prevent unhandled promise rejection
        })
      )
    );

    try {
      console.log(`${this.copilotLogPrefix()} ensureDataReady: Awaiting new dataLoadingPromise.`);
      await this.dataLoadingPromise;
      console.log(`${this.copilotLogPrefix()} ensureDataReady: New dataLoadingPromise resolved. Final dataLoadedSuccessfully: ${this.dataLoadedSuccessfully}`);
      return this.dataLoadedSuccessfully;
    } catch (error) {
      // This catch should ideally not be hit if the inner catchError returns of([])
      console.error(`${this.copilotLogPrefix()} ensureDataReady: Outer catch for dataLoadingPromise. This should be rare. Error:`, error);
      this.dataLoadedSuccessfully = false;
      return false;
    } finally {
      console.log(`${this.copilotLogPrefix()} ensureDataReady: Resetting dataLoadingPromise to null.`);
      this.dataLoadingPromise = null;
    }
  }

  // ... (rest of your service methods: getEntriesByOrtAndKanton, getEntriesByPlzRange, getEntryById, fetchTypeaheadSuggestions) ...
  // Diese Methoden bleiben unverändert, da das Logging sich auf den Ladeprozess konzentriert.
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
      catchError((err) => {
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
      catchError((err) => {
        return of([]);
      })
    );
  }
}
