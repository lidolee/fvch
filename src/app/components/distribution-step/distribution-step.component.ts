import { Component, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbAlertModule } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil, tap, finalize } from 'rxjs/operators';

import { ValidationStatus } from '../../app.component';
import { PlzDataService, PlzEntry } from '../../services/plz-data.service'; // PlzEntry import ist hier korrekt
import { SelectionService } from '../../services/selection.service';

declare var google: any;
declare var geoXML3: any;

const LOG_PREFIX_DIST = '[DistributionStep]';

const KML_FILE_PATH = 'assets/ch_plz.kml';
const GOOGLE_MAPS_API_KEY = 'AIzaSyBpa1rzAIkaSS2RAlc9frw8GAPiGC1PNwc';

const MAP_INIT_TIMEOUT = 200;
const MAP_RETRY_INIT_TIMEOUT = 100;
const MAP_STATE_UPDATE_TIMEOUT = 50;
const WINDOW_RESIZE_DEBOUNCE = 250;

export type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';

@Component({
  selector: 'app-distribution-step',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbTypeaheadModule, NgbAlertModule],
  templateUrl: './distribution-step.component.html',
  styleUrls: ['./distribution-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DistributionStepComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  @ViewChild('mapDiv') mapDiv!: ElementRef<HTMLElement>;
  @ViewChild('hoverPlzDisplay') hoverPlzDisplayDiv!: ElementRef<HTMLElement>;
  @ViewChild('loadingIndicator') loadingIndicatorDiv!: ElementRef<HTMLElement>;
  @ViewChild('selectedPlzInfoSpan') selectedPlzInfoSpan!: ElementRef<HTMLElement>;

  map: any = null;
  private geoXmlParser: any;
  allPlacemarks: any[] = [];

  private destroy$ = new Subject<void>();

  typeaheadSearchTerm: string = '';
  currentTypeaheadSelection: PlzEntry | null = null;
  searching: boolean = false;
  searchFailed: boolean = false;

  selectedEntries$: Observable<PlzEntry[]>;

  currentVerteilungTyp: 'Nach PLZ' | 'Nach Perimeter' = 'Nach PLZ';
  showPlzUiContainer: boolean = true;
  showPerimeterUiContainer: boolean = false;

  currentZielgruppe: ZielgruppeOption = 'Alle Haushalte';

  textInputStatus: ValidationStatus = 'invalid';

  private readonly initialMapCenter = { lat: 46.8182, lng: 8.2275 };
  private readonly initialMapZoom = 8;
  private readonly mapStyleWithCorrectedFeatures: any[];

  private readonly defaultPolygonOptions = { strokeColor: "#0063d6", strokeOpacity: 0.1, strokeWeight: 1.5, fillColor: "#0063d6", fillOpacity: 0.02 };
  private readonly highlightedPolygonOptions = { strokeColor: "#0063d6", strokeOpacity: 0.6, strokeWeight: 2, fillColor: "#0063d6", fillOpacity: 0.3 };
  private readonly selectedPolygonOptions = { strokeColor: "#D60096", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#D60096", fillOpacity: 0.4 };
  private readonly selectedHighlightedPolygonOptions = { strokeColor: "#D60096", strokeOpacity: 0.9, strokeWeight: 2.5, fillColor: "#D60096", fillOpacity: 0.6 };

  private singlePolygonZoomAdjustListener: any = null;
  private resizeTimeout: any;

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
    private plzDataService: PlzDataService,
    public selectionService: SelectionService,
    private cdr: ChangeDetectorRef
  ) {
    const constructorTime = "2025-05-30 11:08:30"; // Angepasster Zeitstempel
    console.log(`${LOG_PREFIX_DIST} Component instantiated by lidolee at ${constructorTime}`);
    this.selectedEntries$ = this.selectionService.selectedEntries$;
    this.mapStyleWithCorrectedFeatures = [ /* DEINE MAP STYLES HIER */ ];
    this.updateUiFlags(this.currentVerteilungTyp);
  }

  ngOnInit(): void {
    console.log(`${LOG_PREFIX_DIST} ngOnInit. Initial currentVerteilungTyp: ${this.currentVerteilungTyp}, Zielgruppe: ${this.currentZielgruppe}`);
    this.selectedEntries$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        console.log(`${LOG_PREFIX_DIST} Selection changed in service, ${entries.length} entries.`);
        if (this.showPlzUiContainer && this.map) {
          this.synchronizeMapSelectionWithService(entries);
        }
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      });
  }

  ngAfterViewInit(): void {
    console.log(`${LOG_PREFIX_DIST} ngAfterViewInit. IsBrowser: ${isPlatformBrowser(this.platformId)}, PLZ UI: ${this.showPlzUiContainer}`);
    if (isPlatformBrowser(this.platformId)) {
      if (this.showPlzUiContainer) {
        this.scheduleMapInitialization();
      }
      window.addEventListener('resize', this.onWindowResize);
    }
    Promise.resolve().then(() => {
      this.updateOverallValidationState();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    console.log(`${LOG_PREFIX_DIST} ngOnDestroy called.`);
    this.destroy$.next(); this.destroy$.complete();
    this.destroyMap();
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.onWindowResize);
      clearTimeout(this.resizeTimeout);
      if (typeof (window as any).angularGoogleMapsCallback === 'function') { delete (window as any).angularGoogleMapsCallback; }
      if ((window as any).googleMapsScriptLoadingPromise) { delete (window as any).googleMapsScriptLoadingPromise; }
    }
  }

  onVerteilungTypChangeFromTemplate(newVerteilungTyp: 'Nach PLZ' | 'Nach Perimeter'): void {
    console.log(`${LOG_PREFIX_DIST} Verteilungstyp geändert zu: ${this.currentVerteilungTyp}`);
    this.updateUiFlagsAndMapState();
  }

  onZielgruppeChange(): void {
    console.log(`${LOG_PREFIX_DIST} Zielgruppe geändert zu: ${this.currentZielgruppe}`);
    this.cdr.markForCheck();
    this.updateOverallValidationState();
  }

  private updateUiFlags(verteilungTyp: 'Nach PLZ' | 'Nach Perimeter'): void {
    this.showPlzUiContainer = verteilungTyp === 'Nach PLZ';
    this.showPerimeterUiContainer = verteilungTyp === 'Nach Perimeter';
    console.log(`${LOG_PREFIX_DIST} UI Flags aktualisiert: PLZ UI=${this.showPlzUiContainer}, Perimeter UI=${this.showPerimeterUiContainer}`);
  }

  private updateUiFlagsAndMapState(): void {
    console.log(`${LOG_PREFIX_DIST} updateUiFlagsAndMapState. Verteilungstyp: ${this.currentVerteilungTyp}. Map vorhanden: ${!!this.map}`);
    const oldShowPlzUiContainer = this.showPlzUiContainer;
    this.updateUiFlags(this.currentVerteilungTyp);
    this.cdr.detectChanges();

    if (isPlatformBrowser(this.platformId)) {
      if (!this.showPlzUiContainer && oldShowPlzUiContainer && this.map) {
        console.log(`${LOG_PREFIX_DIST} Wechsel von PLZ UI: Karte wird zerstört.`);
        this.destroyMap();
      } else if (this.showPlzUiContainer && !this.map) {
        console.log(`${LOG_PREFIX_DIST} Wechsel zu PLZ UI, keine Karte: Karte wird initialisiert.`);
        this.scheduleMapInitialization();
      } else if (this.showPlzUiContainer && this.map) {
        console.log(`${LOG_PREFIX_DIST} PLZ UI aktiv, Karte vorhanden: Karten-Resize wird getriggert.`);
        this.ngZone.runOutsideAngular(() => {
          setTimeout(() => {
            if (this.map && typeof google !== 'undefined' && google.maps) {
              google.maps.event.trigger(this.map, 'resize');
              this.zoomMapToSelectedEntries(this.selectionService.getSelectedEntries());
            }
          }, MAP_STATE_UPDATE_TIMEOUT);
        });
      }
    }
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  private scheduleMapInitialization(): void {
    if (!this.showPlzUiContainer || !isPlatformBrowser(this.platformId)) return;
    if (this.map) {
      console.log(`${LOG_PREFIX_DIST} Map bereits vorhanden, nur Resize/Zoom.`);
      this.ngZone.runOutsideAngular(() => {
        if (typeof google !== 'undefined' && google.maps && this.map) {
          google.maps.event.trigger(this.map, 'resize');
          this.zoomMapToSelectedEntries(this.selectionService.getSelectedEntries());
        }
      });
      return;
    }
    console.log(`${LOG_PREFIX_DIST} Karteninitialisierung geplant.`);
    setTimeout(() => {
      if (this.showPlzUiContainer && this.mapDiv?.nativeElement && !this.map) {
        const rect = this.mapDiv.nativeElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          console.warn(`${LOG_PREFIX_DIST} mapDiv hat keine Dimensionen vor Karteninit. CSS prüfen.`);
        }
        this.ngZone.run(() => this.initializeMapAndGeoXml());
      }
    }, MAP_INIT_TIMEOUT);
  }

  private destroyMap(): void {
    console.log(`${LOG_PREFIX_DIST} Zerstöre Karteninstanz.`);
    if (this.map && typeof google !== 'undefined' && google.maps) {
      google.maps.event.clearInstanceListeners(this.map);
      if (this.allPlacemarks?.length > 0) {
        this.allPlacemarks.forEach(p => {
          const actualPolygon = p.polygon || p.gObject;
          if (actualPolygon) google.maps.event.clearInstanceListeners(actualPolygon);
        });
      }
    }
    this.allPlacemarks = []; this.map = null; this.geoXmlParser = null;
    this.cdr.markForCheck();
  }

  private initializeMapAndGeoXml(): void {
    if (!this.showPlzUiContainer || !isPlatformBrowser(this.platformId) || this.map) return;
    console.log(`${LOG_PREFIX_DIST} Lade Google Maps Skript und initialisiere Karte.`);
    this.loadGoogleMapsScript().then(() => {
      if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
        this.initMapInternal();
      } else { console.error(`${LOG_PREFIX_DIST} Google Maps API oder geoXML3 nicht bereit.`); }
    }).catch(err => console.error(`${LOG_PREFIX_DIST} Fehler beim Laden von Google Maps:`, err));
  }

  private initMapInternal(): void {
    if (!this.showPlzUiContainer || !isPlatformBrowser(this.platformId) || !this.mapDiv?.nativeElement || this.map) return;
    const mapDivElement = this.mapDiv.nativeElement;
    const rect = mapDivElement.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) {
      console.warn(`${LOG_PREFIX_DIST} mapDiv ohne Dimensionen. Erneuter Versuch in ${MAP_RETRY_INIT_TIMEOUT}ms.`);
      setTimeout(() => {
        if (this.showPlzUiContainer && !this.map && this.mapDiv?.nativeElement) {
          this.initMapInternal();
        }
      }, MAP_RETRY_INIT_TIMEOUT);
      return;
    }

    console.log(`${LOG_PREFIX_DIST} Erstelle Google Map Instanz.`);
    this.ngZone.runOutsideAngular(() => {
      try {
        this.map = new google.maps.Map(mapDivElement, {
          center: this.initialMapCenter, zoom: this.initialMapZoom, mapTypeControl: false,
          fullscreenControl: false, streetViewControl: false,
          styles: this.mapStyleWithCorrectedFeatures?.length > 0 ? this.mapStyleWithCorrectedFeatures : undefined
        });
      } catch (e) { console.error(`${LOG_PREFIX_DIST} Fehler bei Erstellung der Map Instanz:`, e); this.map = null; return; }
    });
    if (!this.map) return;

    if (this.loadingIndicatorDiv?.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'flex';
    this.geoXmlParser = new geoXML3.parser({
      map: this.map, suppressInfoWindows: true, singleInfoWindow: true, processStyles: true,
      afterParse: (docs: any) => this.ngZone.run(() => {
        if (this.loadingIndicatorDiv?.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        if (docs?.[0]?.placemarks?.length > 0) {
          this.allPlacemarks = docs[0].placemarks;
          this.setupPlacemarkInteractions(this.allPlacemarks, this.hoverPlzDisplayDiv?.nativeElement);
          this.synchronizeMapSelectionWithService(this.selectionService.getSelectedEntries());
        } else { this.allPlacemarks = []; }
        this.updateOverallValidationState(); this.cdr.markForCheck();
      }),
      failedParse: (error: any) => this.ngZone.run(() => {
        if (this.loadingIndicatorDiv?.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        console.error(`${LOG_PREFIX_DIST} KML Parse Fehler:`, error); this.allPlacemarks = [];
        this.updateOverallValidationState(); this.cdr.markForCheck();
      }),
      polygonOptions: this.defaultPolygonOptions
    });
    try { this.geoXmlParser.parse(KML_FILE_PATH); }
    catch (e) { console.error(`${LOG_PREFIX_DIST} Fehler bei geoXmlParser.parse():`, e); }
  }

  private setupPlacemarkInteractions(placemarks: any[], hoverPlzDisplayElement?: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return;
    placemarks.forEach((placemark) => {
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon?.setOptions) {
        const plzIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);
        google.maps.event.clearInstanceListeners(actualPolygon);
        google.maps.event.addListener(actualPolygon, 'mouseover', () => this.ngZone.runOutsideAngular(() => {
          if (!this.showPlzUiContainer || !this.map) return;
          const isSelected = plzIdFromMap ? this.selectionService.getSelectedEntries().some(e => e.id === plzIdFromMap) : false;
          actualPolygon.setOptions(isSelected ? this.selectedHighlightedPolygonOptions : this.highlightedPolygonOptions);
          if (hoverPlzDisplayElement) {
            hoverPlzDisplayElement.textContent = `${this.extractPlzInfoFromPlacemark(placemark, true)}`;
            hoverPlzDisplayElement.style.display = 'block';
          }
        }));
        google.maps.event.addListener(actualPolygon, 'mouseout', () => this.ngZone.runOutsideAngular(() => {
          if (!this.showPlzUiContainer || !this.map) return;
          const isSelected = plzIdFromMap ? this.selectionService.getSelectedEntries().some(e => e.id === plzIdFromMap) : false;
          actualPolygon.setOptions(isSelected ? this.selectedPolygonOptions : this.defaultPolygonOptions);
          if (hoverPlzDisplayElement) hoverPlzDisplayElement.style.display = 'none';
        }));
        google.maps.event.addListener(actualPolygon, 'mousemove', (event: any) => {
          if (hoverPlzDisplayElement?.style.display === 'block' && event.domEvent) {
            hoverPlzDisplayElement.style.left = (event.domEvent.clientX + 15) + 'px';
            hoverPlzDisplayElement.style.top = (event.domEvent.clientY + 15) + 'px';
          }
        });
        google.maps.event.addListener(actualPolygon, 'click', () => this.ngZone.run(() => {
          if (this.showPlzUiContainer && this.map) this.handleMapPolygonClick(placemark);
        }));
      }
    });
  }

  private handleMapPolygonClick(placemark: any): void {
    const entryIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);
    if (!entryIdFromMap) return;
    const isCurrentlySelected = this.selectionService.getSelectedEntries().some(e => e.id === entryIdFromMap);
    if (isCurrentlySelected) {
      this.selectionService.removeEntry(entryIdFromMap);
    } else {
      this.plzDataService.getEntryById(entryIdFromMap).subscribe(entry => {
        if (entry && this.selectionService.validateEntry(entry)) {
          this.selectionService.addEntry(entry);
        } else {
          const plz6 = entryIdFromMap; const plz4 = plz6.length >= 4 ? plz6.substring(0, 4) : plz6;
          const pseudoOrt = placemark.name || 'Unbekannt';
          const pseudoEntry: PlzEntry = { id: entryIdFromMap, plz6, plz4, ort: pseudoOrt, kt: 'N/A', all: 0, mfh: 0, efh: 0, isGroupEntry: false };
          if (this.selectionService.validateEntry(pseudoEntry)) this.selectionService.addEntry(pseudoEntry);
        }
        this.cdr.markForCheck();
      });
    }
  }

  private extractPlzInfoFromPlacemark(placemark: any, forDisplay = true): string | null {
    let plz6: string | null = null;
    if (placemark?.name) {
      const nameMatch = String(placemark.name).trim().match(/^(\d{6})$/);
      if (nameMatch) plz6 = nameMatch[1];
    }
    if (!plz6 && placemark?.description) {
      const descriptionMatch = String(placemark.description).match(/PLZCH:\s*(\d{6})/i);
      if (descriptionMatch?.[1]) plz6 = descriptionMatch[1];
    }
    if (!plz6) return null;
    return forDisplay ? `PLZ: ${plz6.substring(0, 4)}` : plz6;
  }

  private getPolygonBounds(polygon: any): google.maps.LatLngBounds | null {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return null;
    const bounds = new google.maps.LatLngBounds();
    if (polygon?.getPaths) polygon.getPaths().forEach((path: any) => path?.getArray().forEach((latLng: any) => bounds.extend(latLng)));
    else if (polygon?.getPath) polygon.getPath()?.getArray().forEach((latLng: any) => bounds.extend(latLng));
    else return null;
    return bounds.isEmpty() ? null : bounds;
  }

  searchPlzTypeahead = (text$: Observable<string>): Observable<PlzEntry[]> =>
    text$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => { this.searching = true; this.searchFailed = false; this.currentTypeaheadSelection = null; this.cdr.markForCheck(); }),
      switchMap(term => {
        if (term.length < 2) {
          return of([]);
        }
        return this.plzDataService.search(term).pipe(
          tap((results) => { this.searchFailed = results.length === 0 && term.length >=2; }),
          catchError(() => { this.searchFailed = true; return of([]); }),
          finalize(() => { this.searching = false; this.cdr.markForCheck();})
        );
      })
    );

  public formatInput = (item: PlzEntry): string => {
    return '';
  };

  resultFormatter = (entry: PlzEntry) => { // Wird für das #rtTable Template nicht mehr direkt benötigt, aber schadet nicht
    if (entry.isGroupEntry) {
      return entry.ort;
    }
    return `${entry.plz4} ${entry.ort} (${entry.kt})`;
  }

  onTypeaheadInputChange(term: string): void {
    this.typeaheadSearchTerm = term;
    if (term.length < 2 && this.selectionService.getSelectedEntries().length === 0) {
      this.textInputStatus = 'invalid';
    } else if (term.length >= 2 && !this.currentTypeaheadSelection && this.selectionService.getSelectedEntries().length === 0) {
      this.textInputStatus = 'pending';
    } else {
      this.textInputStatus = 'valid';
    }
    this.updateOverallValidationState();
  }

  addSelectedEntryToTable(entry: PlzEntry, event?: MouseEvent): void {
    event?.preventDefault();
    console.log(`${LOG_PREFIX_DIST} addSelectedEntryToTable für:`, entry);

    if (entry.isGroupEntry) {
      console.log(`${LOG_PREFIX_DIST} Ortssuche-Kontext (Gruppeneintrag): Füge alle PLZ für Ort "${entry.ort}" hinzu.`);
      this.plzDataService.getEntriesByOrt(entry.ort).subscribe(entriesForOrt => {
        if (entriesForOrt && entriesForOrt.length > 0) {
          let addedCount = 0;
          entriesForOrt.forEach(ortEntry => {
            if (this.selectionService.validateEntry(ortEntry)) {
              if(this.selectionService.addEntry(ortEntry)) addedCount++;
            }
          });
          console.log(`${LOG_PREFIX_DIST} ${addedCount} von ${entriesForOrt.length} Einträgen für Ort "${entry.ort}" hinzugefügt.`);
        } else {
          console.warn(`${LOG_PREFIX_DIST} Keine Einträge für Ort "${entry.ort}" gefunden (via getEntriesByOrt).`);
        }
        this.cdr.markForCheck();
      });
    } else if (this.selectionService.validateEntry(entry)) {
      this.selectionService.addEntry(entry);
      console.log(`${LOG_PREFIX_DIST} Direkten PLZ-Eintrag hinzugefügt:`, entry);
    } else {
      console.warn(`${LOG_PREFIX_DIST} Versuch, ungültigen Eintrag hinzuzufügen oder Eintrag nicht validiert:`, entry);
    }

    this.typeaheadSearchTerm = '';
    this.currentTypeaheadSelection = null;
    this.searchFailed = false;
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  addCurrentTypeaheadSelectionToTable(): void {
    if (this.currentTypeaheadSelection) {
      this.addSelectedEntryToTable(this.currentTypeaheadSelection);
    }
  }

  removePlzFromTable(entry: PlzEntry): void { this.selectionService.removeEntry(entry.id); }
  clearPlzTable(): void { this.selectionService.clearEntries(); }

  zoomToTableEntryOnMap(entry: PlzEntry): void {
    if (!this.map || !this.showPlzUiContainer) return;
    const placemarkToZoom = this.allPlacemarks.find(p => this.extractPlzInfoFromPlacemark(p, false) === entry.id);
    if (placemarkToZoom) {
      const actualPolygon = placemarkToZoom.polygon || placemarkToZoom.gObject;
      if (actualPolygon && typeof google !== 'undefined' && google.maps) {
        const bounds = this.getPolygonBounds(actualPolygon);
        if (bounds && !bounds.isEmpty()) {
          this.map.fitBounds(bounds);
          if (this.singlePolygonZoomAdjustListener) google.maps.event.removeListener(this.singlePolygonZoomAdjustListener);
          this.singlePolygonZoomAdjustListener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
            let currentZoom = this.map.getZoom();
            if (currentZoom !== undefined) this.map.setZoom(Math.max(0, currentZoom - 2));
            this.singlePolygonZoomAdjustListener = null;
          });
        }
      }
    }
  }

  private synchronizeMapSelectionWithService(selectedEntries: PlzEntry[]): void {
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks?.length) return;
    const selectedEntryIds = new Set(selectedEntries.map(e => e.id));
    this.allPlacemarks.forEach(placemark => {
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon?.setOptions) {
        const plzIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);
        actualPolygon.setOptions(plzIdFromMap && selectedEntryIds.has(plzIdFromMap) ? this.selectedPolygonOptions : this.defaultPolygonOptions);
      }
    });
    if (this.selectedPlzInfoSpan?.nativeElement) this.updateSelectedPlzInfoText(selectedEntries);
    this.zoomMapToSelectedEntries(selectedEntries);
    this.cdr.markForCheck();
  }

  private updateSelectedPlzInfoText(currentSelection: PlzEntry[]): void {
    if (!isPlatformBrowser(this.platformId) || !this.selectedPlzInfoSpan?.nativeElement) return;
    const displayPlzList = currentSelection.map(entry => entry.plz4).sort().join(', ');
    this.selectedPlzInfoSpan.nativeElement.textContent = displayPlzList || "Keine";
  }

  private zoomMapToSelectedEntries(entriesToZoom: PlzEntry[]): void {
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks?.length || typeof google === 'undefined' || !google.maps) return;
    this.ngZone.runOutsideAngular(() => {
      if (this.singlePolygonZoomAdjustListener) google.maps.event.removeListener(this.singlePolygonZoomAdjustListener);
      this.singlePolygonZoomAdjustListener = null;

      const totalBounds = new google.maps.LatLngBounds();
      let hasSelected = false;
      if (entriesToZoom.length > 0) {
        const selectedEntryIds = new Set(entriesToZoom.map(e => e.id));
        this.allPlacemarks.forEach(placemark => {
          const plzIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);
          if (plzIdFromMap && selectedEntryIds.has(plzIdFromMap)) {
            const bounds = this.getPolygonBounds(placemark.polygon || placemark.gObject);
            if (bounds) { totalBounds.union(bounds); hasSelected = true; }
          }
        });
      }
      if (hasSelected && !totalBounds.isEmpty()) {
        this.map.fitBounds(totalBounds);
        if (entriesToZoom.length === 1) {
          this.singlePolygonZoomAdjustListener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
            let currentZoom = this.map.getZoom();
            if (currentZoom !== undefined) this.map.setZoom(Math.max(0, currentZoom - 2));
            this.singlePolygonZoomAdjustListener = null;
          });
        }
      } else {
        this.map.setCenter(this.initialMapCenter); this.map.setZoom(this.initialMapZoom);
      }
    });
  }

  getFlyerMaxForEntry(entry: PlzEntry): number {
    if (!entry) return 0;
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser': return entry.mfh ?? 0;
      case 'Ein- und Zweifamilienhäuser': return entry.efh ?? 0;
      default: return entry.all ?? 0;
    }
  }

  setExampleStatus(status: ValidationStatus): void {
    this.textInputStatus = status;
    if (status === 'invalid') { this.typeaheadSearchTerm = ''; this.currentTypeaheadSelection = null; this.searchFailed = false; }
    this.updateOverallValidationState(); this.cdr.markForCheck();
  }

  private updateOverallValidationState(): void {
    const mapHasSelection = this.selectionService.getSelectedEntries().length > 0;
    let newOverallStatus: ValidationStatus = 'invalid';

    if (this.showPlzUiContainer) {
      if (mapHasSelection) {
        newOverallStatus = 'valid';
      } else if (this.textInputStatus === 'pending') {
        newOverallStatus = 'pending';
      }
    } else if (this.showPerimeterUiContainer) {
      newOverallStatus = 'valid';
    }
    if (this.validationChange.observers.length > 0) {
      this.validationChange.emit(newOverallStatus);
    }
  }

  proceedToNextStep(): void {
    this.updateOverallValidationState();

    let currentOverallStatusForProceed: ValidationStatus = 'invalid';
    const mapHasSelection = this.selectionService.getSelectedEntries().length > 0;
    if (this.showPlzUiContainer) {
      if (mapHasSelection) currentOverallStatusForProceed = 'valid';
    } else if (this.showPerimeterUiContainer) {
      currentOverallStatusForProceed = 'valid';
    }

    this.validationChange.emit(currentOverallStatusForProceed);
    if (currentOverallStatusForProceed === 'valid') {
      this.nextStepRequest.emit();
    } else {
      const message = "Bitte wählen Sie mindestens ein PLZ-Gebiet aus der Suche oder von der Karte aus, um fortzufahren.";
      if (isPlatformBrowser(this.platformId)) alert(message);
    }
  }

  private loadGoogleMapsScript(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!isPlatformBrowser(this.platformId) || (typeof google !== 'undefined' && google.maps)) { resolve(); return; }
      if ((window as any).googleMapsScriptLoadingPromise) return (window as any).googleMapsScriptLoadingPromise;

      (window as any).googleMapsScriptLoadingPromise = new Promise<void>((innerResolve, innerReject) => {
        (window as any).angularGoogleMapsCallback = () => {
          if ((window as any).google?.maps) innerResolve();
          else innerReject(new Error("Google Maps API geladen, aber google.maps nicht gefunden."));
          delete (window as any).angularGoogleMapsCallback; delete (window as any).googleMapsScriptLoadingPromise;
        };
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=angularGoogleMapsCallback&libraries=visualization,geometry`;
        script.async = true; script.defer = true;
        script.onerror = (e) => {
          innerReject(e); delete (window as any).angularGoogleMapsCallback; delete (window as any).googleMapsScriptLoadingPromise;
        };
        document.head.appendChild(script);
      });
      return (window as any).googleMapsScriptLoadingPromise.then(resolve).catch(reject);
    });
  }

  private readonly onWindowResize = () => {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (!this.map || !isPlatformBrowser(this.platformId) || !this.showPlzUiContainer) return;
      const center = this.map.getCenter();
      if (typeof google !== 'undefined' && google.maps && this.map) {
        google.maps.event.trigger(this.map, 'resize');
        if (center) this.map.setCenter(center);
        this.zoomMapToSelectedEntries(this.selectionService.getSelectedEntries());
      }
    }, WINDOW_RESIZE_DEBOUNCE);
  };

  highlight(text: string, term: string): string {
    if (!term) return text;
    const safeTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
}
