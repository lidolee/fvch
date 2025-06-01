import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, shareReplay, tap } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';

const LOG_PREFIX_PLZ_SERVICE = '[PlzDataService]';
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
  ) {
    const instanceTime = new Date().toISOString();
    console.log(`${LOG_PREFIX_PLZ_SERVICE} Service instantiated at ${instanceTime}`);
  }

  private loadPlzData(): Observable<PlzEntry[]> {
    if (!isPlatformBrowser(this.platformId)) {
      this.dataLoadedSuccessfully = false;
      console.warn(`${LOG_PREFIX_PLZ_SERVICE} PLZ data loading skipped on server platform.`);
      return of([]);
    }

    if (this.plzData$ && this.dataLoadedSuccessfully) {
      return this.plzData$;
    }
    if (this.plzData$ && !this.dataLoadedSuccessfully && this.rawEntriesCache.length > 0) {
      console.warn(`${LOG_PREFIX_PLZ_SERVICE} Returning cached PLZ data due to previous load failure.`);
      return of(this.rawEntriesCache);
    }

    console.log(`${LOG_PREFIX_PLZ_SERVICE} Loading PLZ data from: ${FVDB_JSON_PATH}`);
    this.plzData$ = this.http.get<any[]>(FVDB_JSON_PATH).pipe(
      tap(data => console.log(`${LOG_PREFIX_PLZ_SERVICE} Received ${data?.length || 0} raw entries from JSON.`)),
      map(rawDataArray => {
        if (!Array.isArray(rawDataArray)) {
          this.dataLoadedSuccessfully = false;
          this.rawEntriesCache = [];
          console.error('Invalid data format from fvdb.json, expected an array.');
          throw new Error('Invalid data format from fvdb.json');
        }
        let processedEntries: PlzEntry[] = [];
        let invalidCount = 0;

        for (let i = 0; i < rawDataArray.length; i++) {
          const rawEntry = rawDataArray[i];
          if (!rawEntry) {
            invalidCount++;
            continue;
          }

          const plz6FromInput = String(rawEntry.plz || '').trim();
          const ortFromInput = String(rawEntry.name || '').trim().toUpperCase();
          const ktFromInput = String(rawEntry.ct || 'N/A').trim().toUpperCase();
          const plz4 = plz6FromInput ? plz6FromInput.substring(0, 4) : '';
          const id = plz6FromInput || `${ortFromInput}-${ktFromInput}`;

          if (!id || !plz6FromInput || !plz4 || !ortFromInput) {
            invalidCount++;
            continue;
          }
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
        if (invalidCount > 0) {
          console.warn(`${LOG_PREFIX_PLZ_SERVICE} Skipped ${invalidCount} invalid or incomplete entries during processing.`);
        }
        console.log(`${LOG_PREFIX_PLZ_SERVICE} Successfully processed ${processedEntries.length} valid PLZ entries.`);
        this.rawEntriesCache = processedEntries;
        this.dataLoadedSuccessfully = processedEntries.length > 0;
        return this.rawEntriesCache;
      }),
      shareReplay(1),
      catchError(error => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} Error loading or processing PLZ data:`, error);
        this.rawEntriesCache = [];
        this.dataLoadedSuccessfully = false;
        return throwError(() => new Error('Failed to load PLZ data.'));
      })
    );
    return this.plzData$;
  }

  public getPlzData(): Observable<PlzEntry[]> {
    if (!this.plzData$) {
      this.plzData$ = this.loadPlzData();
    }
    return this.plzData$;
  }

  public searchEnhanced(term: string): Observable<SearchResultsContainer> {
    const searchTermNormalized = term.toLowerCase().trim();
    const emptyResult: SearchResultsContainer = {
      searchTerm: term, searchTypeDisplay: 'none', itemsForDisplay: [],
      headerText: `Keine Einträge für "${term}" gefunden.`, showSelectAllButton: false, entriesForSelectAllAction: []
    };

    if (!searchTermNormalized) {
      return of({ ...emptyResult, headerText: '', searchTypeDisplay: 'popular' }); // Angepasst für leere Suche / Populär
    }

    return this.getPlzData().pipe(
      map((allEntries): SearchResultsContainer => {
        if (!allEntries || allEntries.length === 0) {
          return { ...emptyResult, searchTerm: term, headerText: 'Keine Daten geladen oder verfügbar.' };
        }

        const isPrimarilyPlzSearch = /^\d/.test(searchTermNormalized);
        let results: EnhancedSearchResultItem[] = [];
        let entriesForSelectAll: PlzEntry[] = [];
        let searchTypeForDisplayLogic: 'ort' | 'plz' | 'mixed' | 'none' = 'none';
        let ortNameForHeader = '';

        if (!isPrimarilyPlzSearch) {
          const ortExactMatchesSource = allEntries.filter(entry => entry.ort.toLowerCase() === searchTermNormalized);
          if (ortExactMatchesSource.length > 0) {
            searchTypeForDisplayLogic = 'ort';
            ortNameForHeader = ortExactMatchesSource[0].ort;
            const kanton = ortExactMatchesSource.every(e => e.kt === ortExactMatchesSource[0].kt) ? ortExactMatchesSource[0].kt : '';

            const groupHeader: EnhancedSearchResultItem = {
              id: `group-${ortNameForHeader.toLowerCase().replace(/\s+/g, '-')}`,
              plz4: '', plz6: '', ort: ortNameForHeader, kt: kanton, all: 0, mfh:0, efh:0,
              isGroupEntry: true, isGroupHeader: true, childPlzCount: ortExactMatchesSource.length,
              isPrimaryOrtMatch: true
            };
            results.push(groupHeader);
            entriesForSelectAll = [...ortExactMatchesSource];
            results.push(...ortExactMatchesSource.map(e => ({ ...e, isPrimaryOrtMatch: true, isPrimaryPlzMatch: false} as EnhancedSearchResultItem)));
          }
        }

        if (searchTypeForDisplayLogic !== 'ort' || isPrimarilyPlzSearch) {
          const broaderFilterResults = allEntries
            .filter(entry =>
              entry.plz4.startsWith(searchTermNormalized) ||
              entry.plz6.startsWith(searchTermNormalized) ||
              (!isPrimarilyPlzSearch && entry.ort.toLowerCase().includes(searchTermNormalized) && searchTypeForDisplayLogic !== 'ort')
            )
            .map(entry => ({
              ...entry,
              isPrimaryPlzMatch: entry.plz4.startsWith(searchTermNormalized) || entry.plz6.startsWith(searchTermNormalized),
              isPrimaryOrtMatch: !isPrimarilyPlzSearch && entry.ort.toLowerCase().includes(searchTermNormalized)
            } as EnhancedSearchResultItem));

          broaderFilterResults.forEach(br => {
            if (!results.find(r => r.id === br.id)) {
              results.push(br);
            }
          });

          if (searchTypeForDisplayLogic !== 'ort' && results.length > 0) {
            const hasPlzMatch = results.some(r => r.isPrimaryPlzMatch);
            const hasOrtIncludeMatch = results.some(r => r.isPrimaryOrtMatch && !r.isGroupHeader);

            if (isPrimarilyPlzSearch && hasPlzMatch) searchTypeForDisplayLogic = 'plz';
            else if (hasPlzMatch && hasOrtIncludeMatch) searchTypeForDisplayLogic = 'mixed';
            else if (hasPlzMatch) searchTypeForDisplayLogic = 'plz';
            else if (hasOrtIncludeMatch) searchTypeForDisplayLogic = 'mixed';
            else searchTypeForDisplayLogic = 'mixed';
          } else if (results.length === 0 && searchTypeForDisplayLogic !== 'ort') { // Kein else if
            searchTypeForDisplayLogic = 'none';
          }
        }

        results.sort((a, b) => {
          const aOrtLower = a.ort.toLowerCase();
          const bOrtLower = b.ort.toLowerCase();
          const aPlz4 = a.plz4;
          const bPlz4 = b.plz4;

          let scoreA = 0;
          let scoreB = 0;

          if (a.isGroupHeader) scoreA += 1000;
          if (b.isGroupHeader) scoreB += 1000;

          if (aPlz4 === searchTermNormalized && !a.isGroupHeader) scoreA += 500;
          if (bPlz4 === searchTermNormalized && !b.isGroupHeader) scoreB += 500;

          if (aPlz4.startsWith(searchTermNormalized) && !a.isGroupHeader) scoreA += 400;
          if (bPlz4.startsWith(searchTermNormalized) && !b.isGroupHeader) scoreB += 400;

          if (aOrtLower.startsWith(searchTermNormalized) && !a.isGroupHeader) scoreA += 300;
          if (bOrtLower.startsWith(searchTermNormalized) && !b.isGroupHeader) scoreB += 300;

          if (a.plz6 === searchTermNormalized && !a.isGroupHeader && scoreA < 500) scoreA += 250;
          if (b.plz6 === searchTermNormalized && !b.isGroupHeader && scoreB < 500) scoreB += 250;

          if (a.plz6.startsWith(searchTermNormalized) && !a.isGroupHeader && scoreA < 400) scoreA += 200;
          if (b.plz6.startsWith(searchTermNormalized) && !b.isGroupHeader && scoreB < 400) scoreB += 200;

          if (aOrtLower.includes(searchTermNormalized) && !a.isGroupHeader) scoreA += 100;
          if (bOrtLower.includes(searchTermNormalized) && !b.isGroupHeader) scoreB += 100;

          if (scoreA === scoreB) {
            if (a.isGroupHeader && !b.isGroupHeader) return -1;
            if (!a.isGroupHeader && b.isGroupHeader) return 1;
            return aOrtLower.localeCompare(bOrtLower) || aPlz4.localeCompare(bPlz4);
          }
          return scoreB - scoreA;
        });


        const limitedResults = results.slice(0, 20);
        const totalFoundCountInResults = results.length;

        let headerMsg = `Keine Einträge für "${term}" gefunden.`;
        if (totalFoundCountInResults > 0) {
          const typeDisplay = searchTypeForDisplayLogic === 'ort' && ortNameForHeader ? ortNameForHeader : `"${term}"`;
          const resultWord = totalFoundCountInResults === 1 ? 'Eintrag' : 'Einträge';
          if (totalFoundCountInResults > limitedResults.length) {
            headerMsg = `Zeige ${limitedResults.length} von ${totalFoundCountInResults} ${resultWord} für ${typeDisplay}.`;
          } else {
            headerMsg = `Es ${totalFoundCountInResults === 1 ? 'wurde' : 'wurden'} ${totalFoundCountInResults} ${resultWord} für ${typeDisplay} gefunden.`;
          }
        }
        const finalSearchTypeDisplay: 'ort' | 'plz' | 'mixed' | 'none' = totalFoundCountInResults > 0 ? searchTypeForDisplayLogic : 'none';

        return {
          searchTerm: term,
          searchTypeDisplay: finalSearchTypeDisplay,
          itemsForDisplay: limitedResults,
          headerText: headerMsg,
          showSelectAllButton: searchTypeForDisplayLogic === 'ort' && entriesForSelectAll.length > 1,
          entriesForSelectAllAction: entriesForSelectAll
        };
      }),
      catchError((err): Observable<SearchResultsContainer> => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} Search failed for term "${term}":`, err);
        return of({ ...emptyResult, searchTerm: term, headerText: 'Fehler bei der Suche.' });
      })
    );
  }

  public getEntryById(id: string): Observable<PlzEntry | undefined> {
    return this.getPlzData().pipe(
      map(entries => entries.find(entry => entry.id === id)),
      catchError(err => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} GetEntryById failed for ID "${id}":`, err);
        return of(undefined);
      })
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
      catchError(err => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} getEntriesByPlzRange failed for range "${plzRange}":`, err);
        return of([]);
      })
    );
  }

  public getEntriesByOrt(ortName: string): Observable<PlzEntry[]> {
    const searchTerm = ortName.toLowerCase().trim();
    return this.getPlzData().pipe(
      map(entries => entries.filter(entry => !entry.isGroupEntry && entry.ort.toLowerCase() === searchTerm)),
      catchError(err => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} getEntriesByOrt failed for Ort "${ortName}":`, err);
        return of([]);
      })
    );
  }
}
