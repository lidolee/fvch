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
  isGroupEntry?: boolean; // NEUES Flag zur Kennzeichnung von Ortseinträgen
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
    const instanceTime = "2025-05-30 11:08:30"; // Angepasster Zeitstempel
    console.log(`${LOG_PREFIX_PLZ_SERVICE} Service instantiated at ${instanceTime}`);
  }

  private loadPlzData(): Observable<PlzEntry[]> {
    if (!isPlatformBrowser(this.platformId)) {
      console.log(`${LOG_PREFIX_PLZ_SERVICE} Not in browser, skipping data load.`);
      this.dataLoadedSuccessfully = false;
      return of([]);
    }

    console.log(`${LOG_PREFIX_PLZ_SERVICE} Loading PLZ data from: ${FVDB_JSON_PATH}`);
    return this.http.get<any[]>(FVDB_JSON_PATH).pipe(
      tap(data => console.log(`${LOG_PREFIX_PLZ_SERVICE} Received ${data?.length || 0} raw entries from JSON.`)),
      map(rawDataArray => {
        if (!Array.isArray(rawDataArray)) {
          console.error(`${LOG_PREFIX_PLZ_SERVICE} Data from JSON is not an array.`, rawDataArray);
          this.dataLoadedSuccessfully = false;
          this.rawEntriesCache = [];
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
          const ortFromInput = String(rawEntry.name || '').trim();
          const ktFromInput = String(rawEntry.ct || 'N/A').trim().toUpperCase();

          const plz4 = plz6FromInput ? plz6FromInput.substring(0, 4) : '';
          const id = String(rawEntry.id || plz6FromInput || `generated-${i}`).trim();

          if (!id || !plz6FromInput || !plz4 || !ortFromInput) {
            console.warn(`${LOG_PREFIX_PLZ_SERVICE} Invalid core fields for entry at index ${i}:`,
              { id, plz6: plz6FromInput, plz4, ort: ortFromInput, raw: rawEntry });
            invalidCount++;
            continue;
          }

          const all = Number(rawEntry.all) || 0;
          let mfh = rawEntry.mfh !== undefined && rawEntry.mfh !== null ? Number(rawEntry.mfh) : undefined;
          let efh = rawEntry.efh !== undefined && rawEntry.efh !== null ? Number(rawEntry.efh) : undefined;

          mfh = (mfh === undefined) ? undefined : (isNaN(mfh) ? 0 : mfh);
          efh = (efh === undefined) ? undefined : (isNaN(efh) ? 0 : efh);

          processedEntries.push({
            id: id,
            plz6: plz6FromInput,
            plz4: plz4,
            ort: ortFromInput,
            kt: ktFromInput,
            all: all,
            mfh: mfh,
            efh: efh,
            isGroupEntry: false // Standardmäßig kein Gruppeneintrag
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
  }

  public getPlzData(): Observable<PlzEntry[]> {
    if (!this.plzData$) {
      this.plzData$ = this.loadPlzData();
    } else if (!this.dataLoadedSuccessfully && this.rawEntriesCache.length === 0) {
      console.warn(`${LOG_PREFIX_PLZ_SERVICE} Previous data load failed or yielded no data. Retrying...`);
      this.plzData$ = this.loadPlzData();
    }
    return this.plzData$;
  }

  public search(term: string): Observable<PlzEntry[]> {
    const searchTerm = term.trim();
    if (!searchTerm || searchTerm.length < 2) {
      return of([]);
    }

    return this.getPlzData().pipe(
      map(entries => {
        if (!entries || entries.length === 0) {
          return [];
        }

        const isPlzSearch = /^\d/.test(searchTerm);

        if (isPlzSearch) {
          // PLZ Search: Gibt individuelle PLZ-Einträge zurück
          return entries.filter(entry =>
            entry.plz4.startsWith(searchTerm) ||
            entry.plz6.startsWith(searchTerm)
          ).slice(0, 20); // Limit auf 20 Ergebnisse
        } else {
          // Ort Search:
          const lowerSearchTerm = searchTerm.toLowerCase();
          const matchingEntries = entries.filter(entry =>
            entry.ort.toLowerCase().startsWith(lowerSearchTerm)
          );

          // Gruppiere nach Ort und erstelle eindeutige Ortseinträge
          const uniqueOrteMap = new Map<string, PlzEntry>();
          matchingEntries.forEach(entry => {
            const ortKey = entry.ort.toLowerCase(); // Schlüssel normalisieren
            if (!uniqueOrteMap.has(ortKey)) {
              uniqueOrteMap.set(ortKey, {
                id: `ortgroup_${ortKey.replace(/\s+/g, '_')}`, // Eindeutige ID für den Ortseintrag
                plz6: '',
                plz4: '',
                ort: entry.ort,
                kt: entry.kt,
                all: 0, // Könnte hier aggregiert werden, wenn gewünscht
                mfh: 0,
                efh: 0,
                isGroupEntry: true
              });
            }
          });
          return Array.from(uniqueOrteMap.values())
            .sort((a, b) => a.ort.localeCompare(b.ort))
            .slice(0, 10);
        }
      }),
      catchError(err => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} Search failed due to data loading error:`, err);
        return of([]);
      })
    );
  }

  public getEntryById(id: string): Observable<PlzEntry | undefined> {
    return this.getPlzData().pipe(
      map(entries => {
        if (!entries || entries.length === 0) {
          return undefined;
        }
        const foundEntry = entries.find(entry => entry.id === id && !entry.isGroupEntry);
        return foundEntry;
      }),
      catchError(err => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} GetEntryById failed for ID "${id}":`, err);
        return of(undefined);
      })
    );
  }

  public getEntriesByOrt(ortName: string): Observable<PlzEntry[]> {
    const lowerOrtName = ortName.toLowerCase().trim();
    if (!lowerOrtName) {
      return of([]);
    }
    return this.getPlzData().pipe(
      map(entries => {
        if (!entries || entries.length === 0) {
          return [];
        }
        return entries.filter(entry => entry.ort.toLowerCase() === lowerOrtName && !entry.isGroupEntry);
      }),
      catchError(err => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} GetEntriesByOrt failed for Ort "${ortName}":`, err);
        return of([]);
      })
    );
  }
}
