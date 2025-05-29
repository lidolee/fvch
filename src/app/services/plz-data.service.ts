import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, shareReplay, tap } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';

const LOG_PREFIX_PLZ_SERVICE = '[PlzDataService]';
const FVDB_JSON_PATH = 'assets/fvdb.json';

export interface PlzEntry {
  id: string;        // Wird aus plz (6-stellig) generiert oder direkt aus JSON 'id' Feld
  plz6: string;      // 6-stellige PLZ (aus JSON 'plz')
  plz4: string;      // 4-stellige PLZ (abgeleitet aus plz6)
  ort: string;       // Ort (aus JSON 'name')
  kt: string;        // Kanton (aus JSON 'ct')
  all: number;
  mfh?: number;
  efh?: number;
  // cat?: string;    // Falls du 'cat' auch benötigst
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
    const instanceTime = "2025-05-29 19:33:02"; // Dein Zeitstempel
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
            // console.warn(`${LOG_PREFIX_PLZ_SERVICE} Empty raw entry at index ${i}. Skipping.`);
            invalidCount++;
            continue;
          }

          // **** KORREKTUR DER FELDNAMEN HIER ****
          const plz6FromInput = String(rawEntry.plz || '').trim(); // JSON hat 'plz'
          const ortFromInput = String(rawEntry.name || '').trim();  // JSON hat 'name'
          const ktFromInput = String(rawEntry.ct || 'N/A').trim().toUpperCase(); // JSON hat 'ct'
          // const catFromInput = String(rawEntry.cat || '').trim(); // Falls du 'cat' brauchst

          const plz4 = plz6FromInput ? plz6FromInput.substring(0, 4) : '';
          // ID-Generierung: Wir verwenden plz6FromInput als primären Identifier, wenn kein 'id'-Feld in der JSON ist.
          // Die KML-Daten verwenden oft die 6-stellige PLZ als Namen/ID.
          const id = String(rawEntry.id || plz6FromInput || `generated-${i}`).trim();

          // Strenge Prüfung: Alle Kernfelder müssen einen nicht-leeren Wert haben nach dem Trimmen
          if (!id || !plz6FromInput || !plz4 || !ortFromInput) {
            // Aktiviere dieses Log, um genau zu sehen, welche Einträge fehlschlagen und warum
            console.warn(`${LOG_PREFIX_PLZ_SERVICE} Invalid core fields for entry at index ${i}:`,
              { id, plz6: plz6FromInput, plz4, ort: ortFromInput, raw: rawEntry });
            invalidCount++;
            continue;
          }

          const all = Number(rawEntry.all) || 0;
          // Annahme: mfh und efh sind die korrekten Feldnamen in deiner JSON für diese Werte
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
            // cat: catFromInput, // Falls benötigt
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
    const searchTerm = term.toLowerCase().trim();
    if (!searchTerm) {
      return of([]);
    }

    return this.getPlzData().pipe(
      map(entries => {
        if (!entries || entries.length === 0) {
          return [];
        }
        // Suche jetzt in den korrekten Feldern plz4, plz6, ort
        return entries.filter(entry =>
          entry.plz4.startsWith(searchTerm) || // Suche nach 4-stelliger PLZ
          entry.plz6.startsWith(searchTerm) || // Suche nach 6-stelliger PLZ
          entry.ort.toLowerCase().includes(searchTerm) // Suche im Ort (case-insensitive)
        ).slice(0, 20);
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
        // ID ist jetzt typischerweise die 6-stellige PLZ
        const foundEntry = entries.find(entry => entry.id === id);
        return foundEntry;
      }),
      catchError(err => {
        console.error(`${LOG_PREFIX_PLZ_SERVICE} GetEntryById failed for ID "${id}":`, err);
        return of(undefined);
      })
    );
  }
}
