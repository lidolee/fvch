import { Component, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbAlertModule } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil, tap } from 'rxjs/operators';

import { ValidationStatus } from '../../app.component';
import { PlzDataService, PlzEntry } from '../../services/plz-data.service'; // Stelle sicher, dass PlzEntry mfh und efh hat
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

// Typ für Zielgruppen-Optionen für bessere Typsicherheit
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

  // NEUES FEATURE: Zielgruppen-Variable
  currentZielgruppe: ZielgruppeOption = 'Alle Haushalte'; // Default-Wert

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
    const constructorTime = "2025-05-29 19:23:29";
    console.log(`${LOG_PREFIX_DIST} Component instantiated by lidolee at ${constructorTime}`);
    this.selectedEntries$ = this.selectionService.selectedEntries$;
    this.mapStyleWithCorrectedFeatures = [ /* DEINE MAP STYLES HIER */ ];
    this.updateUiFlags(this.currentVerteilungTyp);
  }

  ngOnInit(): void {
    console.log(`${LOG_PREFIX_DIST} ngOnInit called. Initial currentVerteilungTyp: ${this.currentVerteilungTyp}, showPlzUiContainer: ${this.showPlzUiContainer}, currentZielgruppe: ${this.currentZielgruppe}`);
    this.selectedEntries$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        console.log(`${LOG_PREFIX_DIST} Selection changed in service, ${entries.length} entries. Will sync map if visible and map exists.`);
        if (this.showPlzUiContainer && this.map) {
          this.synchronizeMapSelectionWithService(entries);
        }
        // Wichtig: Bei jeder Änderung der Auswahl auch die Validierung prüfen, da die Tabelle sich ändert
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      });
  }

  ngAfterViewInit(): void {
    console.log(`${LOG_PREFIX_DIST} ngAfterViewInit called. IsBrowser: ${isPlatformBrowser(this.platformId)}, current showPlzUiContainer: ${this.showPlzUiContainer}`);
    if (isPlatformBrowser(this.platformId)) {
      if (this.showPlzUiContainer) {
        console.log(`${LOG_PREFIX_DIST} ngAfterViewInit: PLZ UI is visible, scheduling map initialization.`);
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
      if (typeof (window as any).angularGoogleMapsCallback === 'function') {
        delete (window as any).angularGoogleMapsCallback;
      }
      if ((window as any).googleMapsScriptLoadingPromise) {
        delete (window as any).googleMapsScriptLoadingPromise;
      }
    }
  }

  // --- UI MODE HANDLING (Verteilungstyp & Zielgruppe) ---

  onVerteilungTypChangeFromTemplate(newVerteilungTyp: 'Nach PLZ' | 'Nach Perimeter'): void {
    console.log(`${LOG_PREFIX_DIST} onVerteilungTypChangeFromTemplate called. New value from template: ${newVerteilungTyp}. Internal this.currentVerteilungTyp is already: ${this.currentVerteilungTyp}`);
    this.updateUiFlagsAndMapState();
  }

  // NEUES FEATURE: Handler für Zielgruppen-Änderung
  onZielgruppeChange(): void {
    console.log(`${LOG_PREFIX_DIST} onZielgruppeChange called. New Zielgruppe: ${this.currentZielgruppe}`);
    // Da sich die anzuzeigenden Flyer Max Werte ändern, muss die View aktualisiert werden.
    // Das Observable selectedEntries$ an sich ändert sich nicht, nur wie seine Elemente *interpretiert* werden.
    // Ein einfaches markForCheck sollte ausreichen, da getFlyerMaxForEntry in der nächsten CD-Runde neu ausgewertet wird.
    this.cdr.markForCheck();
    this.updateOverallValidationState(); // Validierung könnte von Flyer Max abhängen, falls Geschäftsregeln dies erfordern
  }

  private updateUiFlags(verteilungTyp: 'Nach PLZ' | 'Nach Perimeter'): void {
    this.showPlzUiContainer = verteilungTyp === 'Nach PLZ';
    this.showPerimeterUiContainer = verteilungTyp === 'Nach Perimeter';
    console.log(`${LOG_PREFIX_DIST} updateUiFlags: Set showPlzUiContainer=${this.showPlzUiContainer}, showPerimeterUiContainer=${this.showPerimeterUiContainer} based on ${verteilungTyp}`);
  }

  private updateUiFlagsAndMapState(): void {
    console.log(`${LOG_PREFIX_DIST} updateUiFlagsAndMapState called. Effective Verteilungstyp: ${this.currentVerteilungTyp}. Current map: ${!!this.map}`);

    const oldShowPlzUiContainer = this.showPlzUiContainer;
    this.updateUiFlags(this.currentVerteilungTyp);

    this.cdr.detectChanges();

    if (isPlatformBrowser(this.platformId)) {
      if (!this.showPlzUiContainer && oldShowPlzUiContainer && this.map) {
        console.log(`${LOG_PREFIX_DIST} Map state logic: Switched AWAY from PLZ UI. Destroying map.`);
        this.destroyMap();
      } else if (this.showPlzUiContainer && !this.map) {
        console.log(`${LOG_PREFIX_DIST} Map state logic: Switched TO PLZ UI and no map exists. Scheduling initialization.`);
        this.scheduleMapInitialization();
      } else if (this.showPlzUiContainer && this.map) {
        console.log(`${LOG_PREFIX_DIST} Map state logic: PLZ UI active and map exists. Ensuring map is responsive (resize/zoom).`);
        this.ngZone.runOutsideAngular(() => {
          setTimeout(() => {
            if (this.map && typeof google !== 'undefined' && google.maps) {
              google.maps.event.trigger(this.map, 'resize');
              this.zoomMapToSelectedEntries(this.selectionService.getSelectedEntries());
            }
          }, MAP_STATE_UPDATE_TIMEOUT);
        });
      } else if (!this.showPlzUiContainer && !this.map) {
        console.log(`${LOG_PREFIX_DIST} Map state logic: Not in PLZ UI and no map. Correct state.`);
      }
    }
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  // --- GOOGLE MAPS API & KML HANDLING ---

  private scheduleMapInitialization(): void {
    if (!this.showPlzUiContainer) {
      console.log(`${LOG_PREFIX_DIST} scheduleMapInitialization: Aborted, PLZ UI not visible.`);
      return;
    }
    if (this.map) {
      console.log(`${LOG_PREFIX_DIST} scheduleMapInitialization: Map instance already exists. Triggering resize/zoom instead of re-init.`);
      this.ngZone.runOutsideAngular(() => {
        if (typeof google !== 'undefined' && google.maps && this.map) {
          google.maps.event.trigger(this.map, 'resize');
          this.zoomMapToSelectedEntries(this.selectionService.getSelectedEntries());
        }
      });
      return;
    }

    console.log(`${LOG_PREFIX_DIST} Scheduling map initialization (map is currently null and PLZ UI is visible).`);
    setTimeout(() => {
      if (this.showPlzUiContainer && this.mapDiv?.nativeElement && !this.map) {
        console.log(`${LOG_PREFIX_DIST} Timeout: DOM ready for map. Attempting actual map initialization.`);
        const rect = this.mapDiv.nativeElement.getBoundingClientRect();
        console.log(`${LOG_PREFIX_DIST} mapDiv details INSIDE setTimeout, BEFORE init: offsetWidth=${this.mapDiv.nativeElement.offsetWidth}, offsetHeight=${this.mapDiv.nativeElement.offsetHeight}, visible=${rect.width > 0 && rect.height > 0}`);
        if (rect.width === 0 || rect.height === 0) {
          console.warn(`${LOG_PREFIX_DIST} mapDiv has zero dimensions right before map init. Map might not be visible. Check CSS for #map-container-angular and #map-angular.`);
        }
        this.ngZone.run(() => this.initializeMapAndGeoXml());
      } else {
        console.log(`${LOG_PREFIX_DIST} Timeout: Conditions for map init NOT met (showPlzUiContainer: ${this.showPlzUiContainer}, mapDiv: ${!!this.mapDiv?.nativeElement}, map: ${!!this.map})`);
      }
    }, MAP_INIT_TIMEOUT);
  }

  private destroyMap(): void {
    console.log(`${LOG_PREFIX_DIST} destroyMap: Attempting to destroy existing map instance.`);
    if (this.map && typeof google !== 'undefined' && google.maps) {
      console.log(`${LOG_PREFIX_DIST} destroyMap: Clearing map instance listeners.`);
      google.maps.event.clearInstanceListeners(this.map);

      if (this.allPlacemarks && this.allPlacemarks.length > 0) {
        console.log(`${LOG_PREFIX_DIST} destroyMap: Clearing ${this.allPlacemarks.length} placemark listeners.`);
        this.allPlacemarks.forEach(p => {
          const actualPolygon = p.polygon || p.gObject;
          if (actualPolygon) {
            google.maps.event.clearInstanceListeners(actualPolygon);
          }
        });
      }
    }
    this.allPlacemarks = [];
    this.map = null;
    this.geoXmlParser = null;
    console.log(`${LOG_PREFIX_DIST} destroyMap: Map instance set to null, placemarks and parser cleared.`);
    this.cdr.markForCheck();
  }

  private initializeMapAndGeoXml(): void {
    if (!this.showPlzUiContainer) { console.log(`${LOG_PREFIX_DIST} initializeMapAndGeoXml: Not in PLZ mode. Aborting.`); return; }
    if (this.map) { console.warn(`${LOG_PREFIX_DIST} initializeMapAndGeoXml: Map already initialized. Skipping.`); return; }

    console.log(`${LOG_PREFIX_DIST} initializeMapAndGeoXml called to load script and init map.`);
    this.loadGoogleMapsScript().then(() => {
      if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
        console.log(`${LOG_PREFIX_DIST} Google Maps script and geoXML3 ready. Proceeding to initMapInternal.`);
        this.initMapInternal();
      } else { console.error(`${LOG_PREFIX_DIST} Google Maps API or geoXML3 not ready after script load attempt.`); }
    }).catch(err => console.error(`${LOG_PREFIX_DIST} Error loading Google Maps script:`, err));
  }

  private initMapInternal(): void {
    if (!this.showPlzUiContainer) { console.log(`${LOG_PREFIX_DIST} initMapInternal: Not in PLZ mode. Aborting.`); return; }
    if (!isPlatformBrowser(this.platformId)) { console.warn(`${LOG_PREFIX_DIST} initMapInternal: Not in browser, cannot init map.`); return; }
    if (!this.mapDiv?.nativeElement) { console.error(`${LOG_PREFIX_DIST} initMapInternal: mapDiv.nativeElement is NULL. Cannot create map.`); return; }
    if (this.map) { console.warn(`${LOG_PREFIX_DIST} initMapInternal: Map object ALREADY EXISTS. Skipping creation.`); return; }

    const mapDivElement = this.mapDiv.nativeElement;
    const rect = mapDivElement.getBoundingClientRect();
    console.log(`${LOG_PREFIX_DIST} initMapInternal: mapDiv details JUST BEFORE new google.maps.Map(): offsetWidth=${mapDivElement.offsetWidth}, offsetHeight=${mapDivElement.offsetHeight}, clientWidth=${mapDivElement.clientWidth}, clientHeight=${mapDivElement.clientHeight}, visible=${rect.width > 0 && rect.height > 0}`);

    if (!(rect.width > 0 && rect.height > 0)) {
      console.warn(`${LOG_PREFIX_DIST} initMapInternal: mapDiv has no dimensions (width/height is 0). Map might not be visible. Retrying in ${MAP_RETRY_INIT_TIMEOUT}ms if still in PLZ mode.`);
      setTimeout(() => {
        if (this.showPlzUiContainer && !this.map && this.mapDiv?.nativeElement) {
          const currentRect = this.mapDiv.nativeElement.getBoundingClientRect();
          if(currentRect.width === 0 || currentRect.height === 0) {
            console.error(`${LOG_PREFIX_DIST} initMapInternal: mapDiv STILL has no dimensions after retry. Check CSS affecting #map-container-angular and #map-angular visibility and sizing. Map initialization aborted.`);
          } else {
            console.log(`${LOG_PREFIX_DIST} initMapInternal: Retrying map creation after small delay as dimensions are now valid.`);
            this.initMapInternal();
          }
        }
      }, MAP_RETRY_INIT_TIMEOUT);
      return;
    }

    console.log(`${LOG_PREFIX_DIST} initMapInternal: Creating Google Map instance...`);
    this.ngZone.runOutsideAngular(() => {
      try {
        this.map = new google.maps.Map(mapDivElement, {
          center: this.initialMapCenter,
          zoom: this.initialMapZoom,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          styles: this.mapStyleWithCorrectedFeatures.length > 0 ? this.mapStyleWithCorrectedFeatures : undefined
        });
        console.log(`${LOG_PREFIX_DIST} initMapInternal: Google Map instance CREATED.`);
      } catch (e) { console.error(`${LOG_PREFIX_DIST} initMapInternal: ERROR creating Google Map instance:`, e); this.map = null; return; }
    });

    if (!this.map) { console.error(`${LOG_PREFIX_DIST} initMapInternal: Map is null after creation attempt. Aborting KML load.`); return; }

    if (this.loadingIndicatorDiv?.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'flex';

    this.geoXmlParser = new geoXML3.parser({
      map: this.map,
      suppressInfoWindows: true,
      singleInfoWindow: true,
      processStyles: true,
      afterParse: (docs: any) => this.ngZone.run(() => {
        if (this.loadingIndicatorDiv?.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        if (docs?.[0]?.placemarks?.length > 0) {
          this.allPlacemarks = docs[0].placemarks;
          console.log(`${LOG_PREFIX_DIST} KML afterParse: ${this.allPlacemarks.length} placemarks parsed. Setting up interactions.`);
          this.setupPlacemarkInteractions(this.allPlacemarks, this.hoverPlzDisplayDiv?.nativeElement);
          this.synchronizeMapSelectionWithService(this.selectionService.getSelectedEntries());
        } else {
          console.error(`${LOG_PREFIX_DIST} KML afterParse: KML parse error or no placemarks found.`);
          this.allPlacemarks = [];
        }
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      }),
      failedParse: (error: any) => this.ngZone.run(() => {
        if (this.loadingIndicatorDiv?.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        console.error(`${LOG_PREFIX_DIST} KML failedParse:`, error);
        this.allPlacemarks = [];
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      }),
      polygonOptions: this.defaultPolygonOptions
    });

    try {
      console.log(`${LOG_PREFIX_DIST} initMapInternal: Calling geoXmlParser.parse('${KML_FILE_PATH}')`);
      this.geoXmlParser.parse(KML_FILE_PATH);
    }
    catch (e) { console.error(`${LOG_PREFIX_DIST} initMapInternal: ERROR during geoXmlParser.parse():`, e); }
  }

  private setupPlacemarkInteractions(placemarks: any[], hoverPlzDisplayElement?: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return;
    console.log(`${LOG_PREFIX_DIST} setupPlacemarkInteractions for ${placemarks.length} placemarks.`);

    placemarks.forEach((placemark) => {
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon && typeof actualPolygon.setOptions === 'function') {
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
          if (!this.showPlzUiContainer || !this.map) return;
          if (hoverPlzDisplayElement?.style.display === 'block' && event.domEvent) {
            hoverPlzDisplayElement.style.left = (event.domEvent.clientX + 15) + 'px';
            hoverPlzDisplayElement.style.top = (event.domEvent.clientY + 15) + 'px';
          }
        });

        google.maps.event.addListener(actualPolygon, 'click', () => this.ngZone.run(() => {
          if (this.showPlzUiContainer && this.map) {
            console.log(`${LOG_PREFIX_DIST} Map polygon clicked. PLZ UI visible and map exists. Handling click for ${plzIdFromMap || 'unknown ID'}`);
            this.handleMapPolygonClick(placemark);
          } else {
            console.log(`${LOG_PREFIX_DIST} Map polygon click IGNORED. PLZ UI not visible (${this.showPlzUiContainer}) or map not initialized (${!!this.map}).`);
          }
        }));
      }
    });
  }

  private handleMapPolygonClick(placemark: any): void {
    const entryIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);
    if (!entryIdFromMap) {
      console.warn(`${LOG_PREFIX_DIST} handleMapPolygonClick: Could not extract ID from placemark. Click ignored.`);
      return;
    }
    const isCurrentlySelected = this.selectionService.getSelectedEntries().some(e => e.id === entryIdFromMap);
    if (isCurrentlySelected) {
      console.log(`${LOG_PREFIX_DIST} handleMapPolygonClick: Removing entry ${entryIdFromMap}`);
      this.selectionService.removeEntry(entryIdFromMap);
    } else {
      console.log(`${LOG_PREFIX_DIST} handleMapPolygonClick: Attempting to add entry ${entryIdFromMap}`);
      this.plzDataService.getEntryById(entryIdFromMap).subscribe(entry => {
        if (entry && this.selectionService.validateEntry(entry)) {
          this.selectionService.addEntry(entry);
          console.log(`${LOG_PREFIX_DIST} handleMapPolygonClick: Added entry ${entry.id} from PlzDataService.`);
        } else {
          const plz6 = entryIdFromMap;
          const plz4 = plz6.length >= 4 ? plz6.substring(0, 4) : plz6;
          const pseudoOrt = placemark.name || 'Unbekannt';
          const pseudoEntry: PlzEntry = { id: entryIdFromMap, plz6, plz4, ort: pseudoOrt, kt: 'N/A', all: 0, mfh: 0, efh: 0 }; // Sicherstellen, dass mfh/efh initialisiert sind

          if (this.selectionService.validateEntry(pseudoEntry)) {
            this.selectionService.addEntry(pseudoEntry);
            console.log(`${LOG_PREFIX_DIST} handleMapPolygonClick: Added pseudo-entry ${pseudoEntry.id} from KML placemark.`);
          } else {
            console.warn(`${LOG_PREFIX_DIST} handleMapPolygonClick: Pseudo-entry ${pseudoEntry.id} not valid or already exists.`);
          }
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
      if (descriptionMatch && descriptionMatch[1]) {
        plz6 = descriptionMatch[1];
      }
    }

    if (!plz6) {
      return null;
    }

    if (forDisplay) {
      const plz4ForDisplay = plz6.substring(0, 4);
      return `PLZ: ${plz4ForDisplay}`;
    }
    return plz6;
  }

  private getPolygonBounds(polygon: any): google.maps.LatLngBounds | null {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return null;
    const bounds = new google.maps.LatLngBounds();

    if (polygon && typeof polygon.getPaths === 'function') {
      polygon.getPaths().forEach((path: any) => {
        if (path && typeof path.getArray === 'function') {
          path.getArray().forEach((latLng: any) => bounds.extend(latLng));
        }
      });
    } else if (polygon && typeof polygon.getPath === 'function') {
      const path = polygon.getPath();
      if (path && typeof path.getArray === 'function') {
        path.getArray().forEach((latLng: any) => bounds.extend(latLng));
      }
    } else {
      console.warn(`${LOG_PREFIX_DIST} getPolygonBounds: Polygon object does not have getPaths or getPath method.`);
      return null;
    }
    return bounds.isEmpty() ? null : bounds;
  }

  // --- TYPEAHEAD METHODS ---

  searchPlzTypeahead = (text$: Observable<string>): Observable<PlzEntry[]> =>
    text$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => { this.searching = true; this.searchFailed = false; this.cdr.markForCheck(); }),
      switchMap(term => {
        if (term.length < 2) {
          this.searching = false;
          if (!this.currentTypeaheadSelection) this.textInputStatus = 'invalid';
          this.updateOverallValidationState(); this.cdr.markForCheck(); return of([]);
        }
        return this.plzDataService.search(term).pipe(
          tap((results) => {
            this.searching = false; this.searchFailed = results.length === 0;
            this.cdr.markForCheck();
          }),
          catchError(() => {
            this.searching = false; this.searchFailed = true; this.cdr.markForCheck(); return of([]);
          })
        );
      })
    );

  resultFormatter = (entry: PlzEntry) => `${entry.plz4} ${entry.ort} (${entry.kt})`;

  typeaheadInputFormatter = (entry: PlzEntry | null | undefined): string => {
    if (entry && entry.plz4 && entry.ort) {
      return `${entry.plz4} ${entry.ort}`;
    }
    return '';
  };

  typeaheadItemSelected(event: NgbTypeaheadSelectItemEvent<PlzEntry>): void {
    event.preventDefault();
    this.currentTypeaheadSelection = event.item;
    this.typeaheadSearchTerm = this.typeaheadInputFormatter(event.item);
    this.textInputStatus = 'valid'; this.searchFailed = false;
    this.updateOverallValidationState(); this.cdr.markForCheck();
  }

  onTypeaheadInputChange(term: string): void {
    if (this.currentTypeaheadSelection && this.typeaheadInputFormatter(this.currentTypeaheadSelection) !== term) {
      this.currentTypeaheadSelection = null;
    }
    if (term === '' && !this.currentTypeaheadSelection) { this.searchFailed = false; }

    if (this.currentTypeaheadSelection) { this.textInputStatus = 'valid'; }
    else if (term.length > 1) { this.textInputStatus = 'pending'; }
    else { this.textInputStatus = 'invalid'; }
    this.updateOverallValidationState(); this.cdr.markForCheck();
  }

  addCurrentTypeaheadSelectionToTable(): void {
    if (this.currentTypeaheadSelection && this.selectionService.validateEntry(this.currentTypeaheadSelection)) {
      const added = this.selectionService.addEntry(this.currentTypeaheadSelection);
      if (added) {
        this.typeaheadSearchTerm = ''; this.currentTypeaheadSelection = null;
        this.textInputStatus = 'invalid'; this.searchFailed = false;
      } else {
        this.typeaheadSearchTerm = ''; this.currentTypeaheadSelection = null; this.textInputStatus = 'invalid';
      }
    }
    this.updateOverallValidationState(); this.cdr.markForCheck();
  }

  // --- TABLE & SELECTION METHODS ---

  removePlzFromTable(entry: PlzEntry): void { this.selectionService.removeEntry(entry.id); }
  clearPlzTable(): void { this.selectionService.clearEntries(); }

  zoomToTableEntryOnMap(entry: PlzEntry): void {
    if (!this.map || !this.showPlzUiContainer) {
      console.log(`${LOG_PREFIX_DIST} ZoomToTableEntry: Map not available or not in PLZ mode. Map: ${!!this.map}, ShowPLZ: ${this.showPlzUiContainer}`);
      return;
    }
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
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks || this.allPlacemarks.length === 0) {
      console.log(`${LOG_PREFIX_DIST} SyncMapSelection: Conditions not met. Map: ${!!this.map}, ShowPLZ: ${this.showPlzUiContainer}, Placemarks: ${this.allPlacemarks?.length}`);
      return;
    }
    const selectedEntryIds = new Set(selectedEntries.map(e => e.id));
    this.allPlacemarks.forEach(placemark => {
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon?.setOptions) {
        const plzIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);
        actualPolygon.setOptions(plzIdFromMap && selectedEntryIds.has(plzIdFromMap) ? this.selectedPolygonOptions : this.defaultPolygonOptions);
      }
    });
    if (this.selectedPlzInfoSpan?.nativeElement) {
      this.updateSelectedPlzInfoText(selectedEntries);
    }
    this.zoomMapToSelectedEntries(selectedEntries);
    this.cdr.markForCheck();
  }

  private updateSelectedPlzInfoText(currentSelection: PlzEntry[]): void {
    if (!isPlatformBrowser(this.platformId) || !this.selectedPlzInfoSpan?.nativeElement) return;
    const displayPlzList = currentSelection.map(entry => entry.plz4).sort();
    this.selectedPlzInfoSpan.nativeElement.textContent = displayPlzList.length === 0 ? "Keine" : displayPlzList.join(', ');
  }

  private zoomMapToSelectedEntries(entriesToZoom: PlzEntry[]): void {
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks || this.allPlacemarks.length === 0 || typeof google === 'undefined' || !google.maps) return;
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
            const actualPolygon = placemark.polygon || placemark.gObject;
            if (actualPolygon) {
              const bounds = this.getPolygonBounds(actualPolygon);
              if (bounds) { totalBounds.union(bounds); hasSelected = true; }
            }
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

  // NEUES FEATURE: Methoden für Zielgruppen-Logik
  getFlyerMaxForEntry(entry: PlzEntry): number {
    if (!entry) return 0;
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser':
        return entry.mfh ?? 0; // Fallback auf 0, falls mfh nicht definiert ist
      case 'Ein- und Zweifamilienhäuser':
        return entry.efh ?? 0; // Fallback auf 0, falls efh nicht definiert ist
      case 'Alle Haushalte':
      default:
        return entry.all ?? 0; // Fallback auf 0, falls all nicht definiert ist
    }
  }

  getZielgruppeLabel(): string {
    // Gibt einen kürzeren Label für den Tabellenkopf zurück
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser': return 'MFH';
      case 'Ein- und Zweifamilienhäuser': return 'EFH/ZFH';
      case 'Alle Haushalte':
      default: return 'Alle';
    }
  }

  // --- VALIDATION AND NAVIGATION ---

  setExampleStatus(status: ValidationStatus): void {
    this.textInputStatus = status;
    if (status === 'invalid') {
      this.currentTypeaheadSelection = null; this.typeaheadSearchTerm = ''; this.searchFailed = false;
    }
    this.updateOverallValidationState(); this.cdr.markForCheck();
  }

  private updateOverallValidationState(): void {
    const mapHasSelection = this.selectionService.getSelectedEntries().length > 0;
    let newOverallStatus: ValidationStatus = 'invalid';

    if (this.showPlzUiContainer) {
      if (this.textInputStatus === 'valid' || mapHasSelection) {
        newOverallStatus = 'valid';
      } else if (this.textInputStatus === 'pending' && !mapHasSelection) {
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
    let currentOverallStatus: ValidationStatus = 'invalid';
    const mapHasSelection = this.selectionService.getSelectedEntries().length > 0;

    if (this.showPlzUiContainer) {
      if (this.textInputStatus === 'valid' || mapHasSelection) { currentOverallStatus = 'valid'; }
      else if (this.textInputStatus === 'pending' && !mapHasSelection) { currentOverallStatus = 'pending'; }
    } else if (this.showPerimeterUiContainer) {
      currentOverallStatus = 'valid';
    }

    this.validationChange.emit(currentOverallStatus);
    if (currentOverallStatus === 'valid') {
      this.nextStepRequest.emit();
    } else {
      const message = currentOverallStatus === 'pending'
        ? "Bitte vervollständigen Sie Ihre Eingabe im Suchfeld oder wählen Sie PLZ-Gebiete auf der Karte aus, um fortzufahren."
        : "Die Eingabe im Suchfeld ist ungültig und es sind keine PLZ-Gebiete auf der Karte ausgewählt. Bitte korrigieren Sie Ihre Auswahl.";
      if (isPlatformBrowser(this.platformId)) alert(message);
    }
  }

  // --- GOOGLE MAPS SCRIPT LOADING ---

  private loadGoogleMapsScript(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!isPlatformBrowser(this.platformId)) { resolve(); return; }
      if (typeof google !== 'undefined' && google.maps) { resolve(); return; }

      if ((window as any).googleMapsScriptLoadingPromise) {
        return (window as any).googleMapsScriptLoadingPromise;
      }

      (window as any).googleMapsScriptLoadingPromise = new Promise<void>((innerResolve, innerReject) => {
        (window as any).angularGoogleMapsCallback = () => {
          if ((window as any).google?.maps) {
            console.log(`${LOG_PREFIX_DIST} Google Maps API Callback erfolgreich.`);
            innerResolve();
          } else {
            console.error(`${LOG_PREFIX_DIST} Google Maps API Callback, aber google.maps nicht gefunden.`);
            innerReject(new Error("Google Maps API geladen, aber google.maps nicht gefunden."));
          }
          delete (window as any).angularGoogleMapsCallback;
          delete (window as any).googleMapsScriptLoadingPromise;
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=angularGoogleMapsCallback&libraries=visualization,geometry`;
        script.async = true;
        script.defer = true;
        script.onerror = (e) => {
          console.error(`${LOG_PREFIX_DIST} Fehler beim Laden des Google Maps Skript-Tags.`);
          innerReject(e);
          delete (window as any).angularGoogleMapsCallback;
          delete (window as any).googleMapsScriptLoadingPromise;
        };
        document.head.appendChild(script);
        console.log(`${LOG_PREFIX_DIST} Google Maps API Skript-Tag zum head hinzugefügt.`);
      });

      return (window as any).googleMapsScriptLoadingPromise.then(resolve).catch(reject);
    });
  }

  // --- UTILITY METHODS ---
  private readonly onWindowResize = () => {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (!this.map || !isPlatformBrowser(this.platformId) || !this.showPlzUiContainer) return;
      const logTime = "2025-05-29 19:23:29";
      console.log(`${LOG_PREFIX_DIST} Window resized, re-triggering map operations. Current time: ${logTime}`);
      const center = this.map.getCenter();
      if (typeof google !== 'undefined' && google.maps && this.map) {
        google.maps.event.trigger(this.map, 'resize');
        if (center) {
          this.map.setCenter(center);
        }
        this.zoomMapToSelectedEntries(this.selectionService.getSelectedEntries());
      }
    }, WINDOW_RESIZE_DEBOUNCE);
  };

  highlight(text: string, term: string): string {
    if (!term || term.length === 0) { return text; }
    const R_SPECIAL = /[-\/\\^$*+?.()|[\]{}]/g;
    const safeTerm = term.replace(R_SPECIAL, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
}
