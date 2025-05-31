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
}

export interface EnhancedSearchResultItem extends PlzEntry {
  isGroupHeader?: boolean;
  childPlzCount?: number;
  isPrimaryOrtMatch?: boolean;
  isPrimaryPlzMatch?: boolean;
}

export interface SearchResultsContainer {
  searchTerm: string;
  searchTypeDisplay: 'ort' | 'plz' | 'mixed' | 'none';
  itemsForDisplay: EnhancedSearchResultItem[];
  headerText: string;
  showSelectAllButton: boolean;
  entriesForSelectAllAction: PlzEntry[]; // Kinder der ERSTEN Gruppe für den Standard "Select All" Button
  mapBaseOrtToChildren?: Map<string, PlzEntry[]>; // Alle gefundenen Gruppen und ihre Kinder
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
    // Verwendung des vom Benutzer angegebenen Zeitstempels
    const instanceTime = "2025-05-31 17:08:33";
    console.log(`${LOG_PREFIX_PLZ_SERVICE} Service instantiated at ${instanceTime}`);
  }

  // Mache diese Methode public
  public getBaseOrtName(ort: string): string {
    if (!ort) return '';
    return ort.replace(/\s+\d+$/, '').trim();
  }

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

    console.log(`${LOG_PREFIX_PLZ_SERVICE} Loading PLZ data from: ${FVDB_JSON_PATH}`);
    this.plzData$ = this.http.get<any[]>(FVDB_JSON_PATH).pipe(
      tap(data => console.log(`${LOG_PREFIX_PLZ_SERVICE} Received ${data?.length || 0} raw entries from JSON.`)),
      map(rawDataArray => {
        if (!Array.isArray(rawDataArray)) {
          this.dataLoadedSuccessfully = false;
          this.rawEntriesCache = [];
          console.error(`${LOG_PREFIX_PLZ_SERVICE} Invalid data format from fvdb.json: Expected an array.`);
          throw new Error('Invalid data format from fvdb.json');
        }
        let processedEntries: PlzEntry[] = [];
        let invalidCount = 0;

        for (let i = 0; i < rawDataArray.length; i++) {
          const rawEntry = rawDataArray[i];
          if (!rawEntry || typeof rawEntry !== 'object') {
            invalidCount++;
            continue;
          }

          const plz6FromInput = String(rawEntry.plz || '').trim();
          const ortFromInput = String(rawEntry.name || '').trim();
          const ktFromInput = String(rawEntry.ct || 'N/A').trim().toUpperCase();
          const plz4 = plz6FromInput ? plz6FromInput.substring(0, 4) : '';
          const id = plz6FromInput;

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
            all: all, mfh: mfh, efh: efh
          });
        }
        if (invalidCount > 0) {
          console.warn(`${LOG_PREFIX_PLZ_SERVICE} Skipped ${invalidCount} invalid or incomplete entries.`);
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
    if (!this.plzData$ || !this.dataLoadedSuccessfully) {
      this.plzData$ = this.loadPlzData();
    }
    return this.plzData$;
  }

  public searchEnhanced(term: string): Observable<SearchResultsContainer> {
    const searchTermNormalized = term.toLowerCase().trim();
    const emptyResult: SearchResultsContainer = {
      searchTerm: term, searchTypeDisplay: 'none', itemsForDisplay: [],
      headerText: `Keine Einträge für "${term}" gefunden.`, showSelectAllButton: false, entriesForSelectAllAction: [],
      mapBaseOrtToChildren: new Map<string, PlzEntry[]>() // Initialisiere die Map
    };

    if (!searchTermNormalized || searchTermNormalized.length < 1) {
      return of({...emptyResult, headerText: 'Bitte geben Sie mindestens 1 Zeichen ein.'});
    }

    return this.getPlzData().pipe(
      map((allEntries): SearchResultsContainer => {
        if (!allEntries || allEntries.length === 0) {
          return { ...emptyResult, headerText: 'Keine PLZ-Daten geladen oder verfügbar.' };
        }

        let finalItemsForDisplay: EnhancedSearchResultItem[] = [];
        let searchTypeDisplay: 'ort' | 'plz' | 'mixed' | 'none' = 'none';
        let headerText = `Keine Einträge für "${term}" gefunden.`;
        let showSelectAllButton = false;
        let entriesForFirstGroupAction: PlzEntry[] = [];
        const mapBaseOrtToChildrenResult = new Map<string, PlzEntry[]>();

        const isNumericSearch = /^\d/.test(searchTermNormalized);

        if (isNumericSearch) {
          searchTypeDisplay = 'plz';
          const plzMatches = allEntries
            .filter(entry =>
              entry.plz4.startsWith(searchTermNormalized) ||
              entry.plz6.startsWith(searchTermNormalized)
            )
            .map(entry => ({ ...entry, isPrimaryPlzMatch: true, isPrimaryOrtMatch: false } as EnhancedSearchResultItem))
            .sort((a, b) => {
              const plzComp = a.plz4.localeCompare(b.plz4);
              if (plzComp !== 0) return plzComp;
              return a.ort.localeCompare(b.ort);
            });

          finalItemsForDisplay = plzMatches;
          if (finalItemsForDisplay.length > 0) {
            headerText = `Es ${finalItemsForDisplay.length === 1 ? 'wurde' : 'wurden'} ${finalItemsForDisplay.length} ${finalItemsForDisplay.length === 1 ? 'PLZ-Eintrag' : 'PLZ-Einträge'} für "${term}" gefunden.`;
          }

        } else {
          searchTypeDisplay = 'ort';
          const groupHeaders: EnhancedSearchResultItem[] = [];
          const singleOrtMatches: EnhancedSearchResultItem[] = [];

          const initialOrtMatches = allEntries.filter(entry =>
            this.getBaseOrtName(entry.ort).toLowerCase().startsWith(searchTermNormalized)
          );

          if (initialOrtMatches.length > 0) {
            const groupedByBaseOrt = new Map<string, PlzEntry[]>();
            initialOrtMatches.forEach(entry => {
              const baseOrtKey = this.getBaseOrtName(entry.ort).toLowerCase();
              if (!groupedByBaseOrt.has(baseOrtKey)) {
                groupedByBaseOrt.set(baseOrtKey, []);
              }
              groupedByBaseOrt.get(baseOrtKey)!.push(entry);
            });

            groupedByBaseOrt.forEach((cityEntries, baseOrtKey) => {
              const actualDisplayOrtName = this.getBaseOrtName(cityEntries[0].ort);
              if (cityEntries.length > 1) {
                const representativeEntry = cityEntries[0];
                groupHeaders.push({
                  id: `group-${actualDisplayOrtName.toLowerCase().replace(/\s+/g, '-')}`,
                  plz4: '', plz6: '', ort: actualDisplayOrtName,
                  kt: cityEntries.every(e => e.kt === representativeEntry.kt) ? representativeEntry.kt : '',
                  all: 0, mfh: 0, efh: 0,
                  isGroupHeader: true,
                  childPlzCount: cityEntries.length,
                  isPrimaryOrtMatch: true, isPrimaryPlzMatch: false
                });
                mapBaseOrtToChildrenResult.set(baseOrtKey, cityEntries); // Hier alle Gruppenkinder speichern
              } else {
                singleOrtMatches.push(...cityEntries.map(e => ({ ...e, isPrimaryOrtMatch: true, isPrimaryPlzMatch: false })));
              }
            });
          }

          groupHeaders.sort((a, b) => {
            const countDiff = (b.childPlzCount || 0) - (a.childPlzCount || 0);
            if (countDiff !== 0) return countDiff;
            return a.ort.localeCompare(b.ort);
          });

          singleOrtMatches.sort((a,b) => {
            const ortComp = a.ort.localeCompare(b.ort);
            if (ortComp !== 0) return ortComp;
            return a.plz4.localeCompare(b.plz4);
          });

          finalItemsForDisplay.push(...groupHeaders);
          finalItemsForDisplay.push(...singleOrtMatches);

          let topOrtGroupNameForSelectAllInternal = '';
          if (groupHeaders.length > 0) {
            const firstGroupBaseOrtKey = this.getBaseOrtName(groupHeaders[0].ort).toLowerCase();
            topOrtGroupNameForSelectAllInternal = groupHeaders[0].ort;
            entriesForFirstGroupAction = mapBaseOrtToChildrenResult.get(firstGroupBaseOrtKey) || [];
          }

          const countFoundItems = finalItemsForDisplay.length;
          if (countFoundItems > 0) {
            let displayTerm = `"${term}"`;
            if (topOrtGroupNameForSelectAllInternal && groupHeaders.length > 0 && groupHeaders[0].ort === topOrtGroupNameForSelectAllInternal) {
              displayTerm = topOrtGroupNameForSelectAllInternal;
            }

            if (groupHeaders.length > 0 && singleOrtMatches.length > 0) {
              headerText = `Ortsgruppen und einzelne Orte für ${displayTerm} gefunden.`;
            } else if (groupHeaders.length > 0) {
              headerText = `${groupHeaders.length} Ortsgruppe${groupHeaders.length === 1 ? '' : 'n'} für ${displayTerm} gefunden.`;
            } else if (singleOrtMatches.length > 0) {
              headerText = `${singleOrtMatches.length} passende${singleOrtMatches.length === 1 ? 'r' : ''} Ort${singleOrtMatches.length === 1 ? '' : 'e'} für ${displayTerm} gefunden.`;
            }
          }
          showSelectAllButton = !!(topOrtGroupNameForSelectAllInternal && entriesForFirstGroupAction.length > 1 && groupHeaders.length > 0 && groupHeaders[0].ort === topOrtGroupNameForSelectAllInternal);
        }

        return {
          searchTerm: term,
          searchTypeDisplay: searchTypeDisplay,
          itemsForDisplay: finalItemsForDisplay.slice(0, 20),
          headerText: headerText,
          showSelectAllButton: showSelectAllButton,
          entriesForSelectAllAction: entriesForFirstGroupAction, // Umbenannt für Klarheit
          mapBaseOrtToChildren: mapBaseOrtToChildrenResult      // Hinzugefügt
        };
      }),
      catchError((err): Observable<SearchResultsContainer> => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} Search failed:`, err);
        return of({ ...emptyResult, headerText: 'Fehler bei der Suche.' }); // Stelle sicher, dass mapBaseOrtToChildren hier auch initialisiert wird
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
    const startPlzStr = parts[0].trim();
    const endPlzStr = parts[1].trim();

    if (!/^\d{4,6}$/.test(startPlzStr) || !/^\d{4,6}$/.test(endPlzStr)) {
      return of([]);
    }

    const startPlz = parseInt(startPlzStr.substring(0,4), 10);
    const endPlz = parseInt(endPlzStr.substring(0,4), 10);

    if (isNaN(startPlz) || isNaN(endPlz) || startPlz > endPlz) {
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
    const searchTermBase = this.getBaseOrtName(ortName).toLowerCase().trim();
    if (!searchTermBase) return of([]); // Verhindere Suche mit leerem Basisnamen
    return this.getPlzData().pipe(
      map(entries => entries.filter(entry =>
        this.getBaseOrtName(entry.ort).toLowerCase() === searchTermBase
      )),
      catchError(err => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} getEntriesByOrt failed for Ort "${ortName}":`, err);
        return of([]);
      })
    );
  }
}
