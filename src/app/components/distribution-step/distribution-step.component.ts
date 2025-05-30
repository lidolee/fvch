import { Component, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbAlertModule } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil, tap, filter } from 'rxjs/operators';

import { ValidationStatus } from '../../app.component';
import { PlzDataService, PlzEntry } from '../../services/plz-data.service';
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
const COLUMN_HIGHLIGHT_DURATION = 1500;

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
  private currentlyHoveredPlacemarkId: string | null = null;

  private destroy$ = new Subject<void>();

  typeaheadSearchTerm: string = '';
  currentTypeaheadSelection: PlzEntry | null = null;
  public typeaheadHoverResults: PlzEntry[] = [];
  searching: boolean = false;
  searchFailed: boolean = false;

  selectedEntries$: Observable<PlzEntry[]>;

  currentVerteilungTyp: 'Nach PLZ' | 'Nach Perimeter' = 'Nach PLZ';
  showPlzUiContainer: boolean = true;
  showPerimeterUiContainer: boolean = false;

  currentZielgruppe: ZielgruppeOption = 'Alle Haushalte';
  highlightFlyerMaxColumn: boolean = false;

  textInputStatus: ValidationStatus = 'invalid';

  private readonly initialMapCenter = { lat: 46.8182, lng: 8.2275 };
  private readonly initialMapZoom = 8;
  private readonly mapStyleWithCorrectedFeatures: any[];

  private readonly defaultPolygonOptions = { strokeColor: "#0063d6", strokeOpacity: 0.1, strokeWeight: 1.5, fillColor: "#0063d6", fillOpacity: 0.02 };
  private readonly highlightedPolygonOptions = { strokeColor: "#0063d6", strokeOpacity: 0.6, strokeWeight: 2, fillColor: "#0063d6", fillOpacity: 0.3 };
  private readonly selectedPolygonOptions = { strokeColor: "#D60096", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#D60096", fillOpacity: 0.4 };
  private readonly selectedHighlightedPolygonOptions = { strokeColor: "#D60096", strokeOpacity: 0.9, strokeWeight: 2.5, fillColor: "#D60096", fillOpacity: 0.6 };
  private readonly typeaheadHoverPolygonOptions = { strokeColor: "#50C878", strokeOpacity: 0.7, strokeWeight: 2, fillColor: "#50C878", fillOpacity: 0.25 };


  private singlePolygonZoomAdjustListener: any = null;
  private resizeTimeout: any;

  public readonly plzRangeRegex = /^\s*(\d{4,6})\s*-\s*(\d{4,6})\s*$/;


  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
    private plzDataService: PlzDataService,
    public selectionService: SelectionService,
    private cdr: ChangeDetectorRef
  ) {
    this.selectedEntries$ = this.selectionService.selectedEntries$;
    this.mapStyleWithCorrectedFeatures = [ ];
    this.updateUiFlags(this.currentVerteilungTyp);
  }

  ngOnInit(): void {
    this.selectedEntries$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        if (this.showPlzUiContainer && this.map) {
          this.synchronizeMapSelectionWithService(entries);
          this.applyAllMapHighlights();
        }
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      });
  }

  ngAfterViewInit(): void {
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

  onVerteilungTypChangeFromTemplate(newVerteilungTyp: 'Nach PLZ' | 'Nach Perimeter'): void {
    this.updateUiFlagsAndMapState();
  }

  onZielgruppeChange(): void {
    this.highlightFlyerMaxColumn = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.highlightFlyerMaxColumn = false;
      this.cdr.markForCheck();
    }, COLUMN_HIGHLIGHT_DURATION);
    this.updateOverallValidationState();
  }

  private updateUiFlags(verteilungTyp: 'Nach PLZ' | 'Nach Perimeter'): void {
    this.showPlzUiContainer = verteilungTyp === 'Nach PLZ';
    this.showPerimeterUiContainer = verteilungTyp === 'Nach Perimeter';
  }

  private updateUiFlagsAndMapState(): void {
    const oldShowPlzUiContainer = this.showPlzUiContainer;
    this.updateUiFlags(this.currentVerteilungTyp);

    this.cdr.detectChanges();

    if (isPlatformBrowser(this.platformId)) {
      if (!this.showPlzUiContainer && oldShowPlzUiContainer && this.map) {
        this.destroyMap();
      } else if (this.showPlzUiContainer && !this.map) {
        this.scheduleMapInitialization();
      } else if (this.showPlzUiContainer && this.map) {
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
    if (!this.showPlzUiContainer) return;
    if (this.map) {
      this.ngZone.runOutsideAngular(() => {
        if (typeof google !== 'undefined' && google.maps && this.map) {
          google.maps.event.trigger(this.map, 'resize');
          this.zoomMapToSelectedEntries(this.selectionService.getSelectedEntries());
        }
      });
      return;
    }

    setTimeout(() => {
      if (this.showPlzUiContainer && this.mapDiv?.nativeElement && !this.map) {
        const rect = this.mapDiv.nativeElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
        }
        this.ngZone.run(() => this.initializeMapAndGeoXml());
      }
    }, MAP_INIT_TIMEOUT);
  }

  private destroyMap(): void {
    if (this.map && typeof google !== 'undefined' && google.maps) {
      google.maps.event.clearInstanceListeners(this.map);
      if (this.allPlacemarks && this.allPlacemarks.length > 0) {
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
    this.cdr.markForCheck();
  }

  private initializeMapAndGeoXml(): void {
    if (!this.showPlzUiContainer) return;
    if (this.map) return;

    this.loadGoogleMapsScript().then(() => {
      if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
        this.initMapInternal();
      }
    }).catch(err => {});
  }

  private initMapInternal(): void {
    if (!this.showPlzUiContainer) return;
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.mapDiv?.nativeElement) return;
    if (this.map) return;

    const mapDivElement = this.mapDiv.nativeElement;
    const rect = mapDivElement.getBoundingClientRect();

    if (!(rect.width > 0 && rect.height > 0)) {
      setTimeout(() => {
        if (this.showPlzUiContainer && !this.map && this.mapDiv?.nativeElement) {
          const currentRect = this.mapDiv.nativeElement.getBoundingClientRect();
          if(currentRect.width === 0 || currentRect.height === 0) {
          } else {
            this.initMapInternal();
          }
        }
      }, MAP_RETRY_INIT_TIMEOUT);
      return;
    }

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
      } catch (e) { this.map = null; return; }
    });

    if (!this.map) return;

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
          this.setupPlacemarkInteractions(this.allPlacemarks, this.hoverPlzDisplayDiv?.nativeElement);
          this.synchronizeMapSelectionWithService(this.selectionService.getSelectedEntries());
        } else {
          this.allPlacemarks = [];
        }
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      }),
      failedParse: (error: any) => this.ngZone.run(() => {
        if (this.loadingIndicatorDiv?.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        this.allPlacemarks = [];
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      }),
      polygonOptions: this.defaultPolygonOptions
    });

    try {
      this.geoXmlParser.parse(KML_FILE_PATH);
    }
    catch (e) { }
  }

  private setupPlacemarkInteractions(placemarks: any[], hoverPlzDisplayElement?: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return;

    placemarks.forEach((placemark) => {
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon && typeof actualPolygon.setOptions === 'function') {
        const plzIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);

        google.maps.event.clearInstanceListeners(actualPolygon);

        google.maps.event.addListener(actualPolygon, 'mouseover', () => this.ngZone.runOutsideAngular(() => {
          if (!this.showPlzUiContainer || !this.map) return;
          this.currentlyHoveredPlacemarkId = plzIdFromMap;
          this.applyAllMapHighlights();
          if (hoverPlzDisplayElement) {
            hoverPlzDisplayElement.textContent = `${this.extractPlzInfoFromPlacemark(placemark, true)}`;
            hoverPlzDisplayElement.style.display = 'block';
          }
        }));

        google.maps.event.addListener(actualPolygon, 'mouseout', () => this.ngZone.runOutsideAngular(() => {
          if (!this.showPlzUiContainer || !this.map) return;
          this.currentlyHoveredPlacemarkId = null;
          this.applyAllMapHighlights();
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
            this.handleMapPolygonClick(placemark);
          }
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
          const plz6 = entryIdFromMap;
          const plz4 = plz6.length >= 4 ? plz6.substring(0, 4) : plz6;
          const pseudoOrt = placemark.name || 'Unbekannt';
          const pseudoEntry: PlzEntry = { id: entryIdFromMap, plz6, plz4, ort: pseudoOrt, kt: 'N/A', all: 0, mfh: 0, efh: 0 };

          if (this.selectionService.validateEntry(pseudoEntry)) {
            this.selectionService.addEntry(pseudoEntry);
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

    if (!plz6) return null;

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
      return null;
    }
    return bounds.isEmpty() ? null : bounds;
  }

  searchPlzTypeahead = (text$: Observable<string>): Observable<PlzEntry[]> =>
    text$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      filter(term => {
        this.typeaheadHoverResults = [];
        const isRange = this.plzRangeRegex.test(term);
        if (isRange) {
          this.currentTypeaheadSelection = null;
          this.textInputStatus = 'valid';
          this.updateOverallValidationState();
          this.cdr.markForCheck();
        }
        if (term.length === 0) {
          this.applyAllMapHighlights();
        }
        return !isRange && term.length > 0;
      }),
      tap(() => { this.searching = true; this.searchFailed = false; this.cdr.markForCheck(); }),
      switchMap(term => {
        if (term.length < 2) {
          this.searching = false;
          if (!this.currentTypeaheadSelection) this.textInputStatus = 'invalid';
          this.typeaheadHoverResults = [];
          this.applyAllMapHighlights();
          this.updateOverallValidationState(); this.cdr.markForCheck(); return of([]);
        }
        return this.plzDataService.search(term).pipe(
          tap((results) => {
            this.searching = false; this.searchFailed = results.length === 0;
            this.typeaheadHoverResults = results.filter(r => !r.isGroupEntry);
            this.applyAllMapHighlights();
            this.cdr.markForCheck();
          }),
          catchError(() => {
            this.searching = false; this.searchFailed = true;
            this.typeaheadHoverResults = [];
            this.applyAllMapHighlights();
            this.cdr.markForCheck(); return of([]);
          })
        );
      })
    );

  resultFormatter = (entry: PlzEntry) => {
    if (entry.isGroupEntry) {
      return `Alle ${entry.all} Einträge für ${entry.ort}`;
    }
    return `${entry.plz4} ${entry.ort} (${entry.kt})`;
  }

  typeaheadInputFormatter = (entry: PlzEntry | null | undefined): string => {
    if (entry && !entry.isGroupEntry && entry.plz4 && entry.ort) {
      return `${entry.plz4} ${entry.ort}`;
    }
    if (this.plzRangeRegex.test(this.typeaheadSearchTerm)) {
      return this.typeaheadSearchTerm;
    }
    return '';
  };

  typeaheadItemSelected(event: NgbTypeaheadSelectItemEvent<PlzEntry>): void {
    event.preventDefault();
    const selectedItem = event.item;
    this.typeaheadHoverResults = [];

    if (selectedItem.isGroupEntry) {
      this.plzDataService.getEntriesByOrt(selectedItem.ort).subscribe(entries => {
        this.selectionService.addMultipleEntries(entries);
        this.typeaheadSearchTerm = '';
        this.currentTypeaheadSelection = null;
        this.textInputStatus = 'invalid';
        this.searchFailed = false;
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      });
    } else {
      this.currentTypeaheadSelection = selectedItem;
      this.typeaheadSearchTerm = this.typeaheadInputFormatter(selectedItem);
      this.textInputStatus = 'valid'; this.searchFailed = false;
      this.updateOverallValidationState();
      this.cdr.markForCheck();
    }
  }

  onTypeaheadInputChange(term: string): void {
    if (this.currentTypeaheadSelection && this.typeaheadInputFormatter(this.currentTypeaheadSelection) !== term) {
      this.currentTypeaheadSelection = null;
    }
    if (term === '' && !this.currentTypeaheadSelection) {
      this.searchFailed = false;
      this.typeaheadHoverResults = [];
      this.applyAllMapHighlights();
    }

    if (this.plzRangeRegex.test(term)) {
      this.textInputStatus = 'valid';
      this.currentTypeaheadSelection = null;
    } else if (this.currentTypeaheadSelection) { this.textInputStatus = 'valid'; }
    else if (term.length > 1) { this.textInputStatus = 'pending'; }
    else { this.textInputStatus = 'invalid'; }
    this.updateOverallValidationState(); this.cdr.markForCheck();
  }

  addCurrentSelectionToTable(): void {
    const searchTerm = this.typeaheadSearchTerm.trim();
    const rangeMatch = searchTerm.match(this.plzRangeRegex);
    this.typeaheadHoverResults = [];

    if (rangeMatch) {
      this.plzDataService.getEntriesByPlzRange(searchTerm).subscribe(entries => {
        if (entries.length > 0) {
          this.selectionService.addMultipleEntries(entries);
        } else {
          alert(`Für den Bereich "${searchTerm}" wurden keine gültigen PLZ-Gebiete gefunden.`);
        }
        this.typeaheadSearchTerm = '';
        this.currentTypeaheadSelection = null;
        this.textInputStatus = 'invalid';
        this.searchFailed = false;
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      });
    } else if (this.currentTypeaheadSelection && !this.currentTypeaheadSelection.isGroupEntry && this.selectionService.validateEntry(this.currentTypeaheadSelection)) {
      const added = this.selectionService.addEntry(this.currentTypeaheadSelection);
      if (added) {
        this.typeaheadSearchTerm = ''; this.currentTypeaheadSelection = null;
        this.textInputStatus = 'invalid'; this.searchFailed = false;
      } else {
        this.typeaheadSearchTerm = ''; this.currentTypeaheadSelection = null; this.textInputStatus = 'invalid';
      }
    }
    this.applyAllMapHighlights();
    this.updateOverallValidationState(); this.cdr.markForCheck();
  }


  removePlzFromTable(entry: PlzEntry): void { this.selectionService.removeEntry(entry.id); }
  clearPlzTable(): void {
    this.selectionService.clearEntries();
    this.typeaheadHoverResults = [];
    this.applyAllMapHighlights();
  }

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

  highlightPlacemarkOnMapFromTable(plzId: string | null, highlight: boolean): void {
    if (!this.map || !this.showPlzUiContainer) return;
    this.currentlyHoveredPlacemarkId = highlight ? plzId : null;
    this.applyAllMapHighlights();
    this.cdr.markForCheck();
  }

  public applyAllMapHighlights(): void {
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks || this.allPlacemarks.length === 0) {
      return;
    }
    const selectedEntryIds = new Set(this.selectionService.getSelectedEntries().map(e => e.id));
    const typeaheadHoverIds = new Set(this.typeaheadHoverResults.map(e => e.id));

    this.allPlacemarks.forEach(placemark => {
      const plzIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon?.setOptions && plzIdFromMap) {
        let optionsToApply = this.defaultPolygonOptions;

        if (selectedEntryIds.has(plzIdFromMap)) {
          optionsToApply = (this.currentlyHoveredPlacemarkId === plzIdFromMap || typeaheadHoverIds.has(plzIdFromMap))
            ? this.selectedHighlightedPolygonOptions
            : this.selectedPolygonOptions;
        } else if (typeaheadHoverIds.has(plzIdFromMap)) {
          optionsToApply = this.typeaheadHoverPolygonOptions;
        } else if (this.currentlyHoveredPlacemarkId === plzIdFromMap) {
          optionsToApply = this.highlightedPolygonOptions;
        }
        actualPolygon.setOptions(optionsToApply);
      }
    });
  }

  private synchronizeMapSelectionWithService(selectedEntries: PlzEntry[]): void {
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks || this.allPlacemarks.length === 0) {
      return;
    }

    this.applyAllMapHighlights();

    if (this.selectedPlzInfoSpan?.nativeElement) {
      this.updateSelectedPlzInfoText(selectedEntries);
    }
    this.zoomMapToSelectedEntries(selectedEntries);
    this.cdr.markForCheck();
  }


  private updateSelectedPlzInfoText(currentSelection: PlzEntry[]): void {
    if (!isPlatformBrowser(this.platformId) || !this.selectedPlzInfoSpan?.nativeElement) return;
    const displayPlzList = currentSelection.map(entry => entry.plz4).sort().filter((value, index, self) => self.indexOf(value) === index);
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

  getFlyerMaxForEntry(entry: PlzEntry): number {
    if (!entry) return 0;
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser':
        return entry.mfh ?? 0;
      case 'Ein- und Zweifamilienhäuser':
        return entry.efh ?? 0;
      case 'Alle Haushalte':
      default:
        return entry.all ?? 0;
    }
  }

  getZielgruppeLabel(): string {
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser': return 'MFH';
      case 'Ein- und Zweifamilienhäuser': return 'EFH/ZFH';
      case 'Alle Haushalte':
      default: return 'Alle';
    }
  }

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
      const isRangeInputValid = this.plzRangeRegex.test(this.typeaheadSearchTerm.trim());

      if (this.textInputStatus === 'valid' || mapHasSelection || isRangeInputValid) {
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
    const isRangeInputValid = this.plzRangeRegex.test(this.typeaheadSearchTerm.trim());

    if (this.showPlzUiContainer) {
      if (this.textInputStatus === 'valid' || mapHasSelection || isRangeInputValid) { currentOverallStatus = 'valid'; }
      else if (this.textInputStatus === 'pending' && !mapHasSelection) { currentOverallStatus = 'pending'; }
    } else if (this.showPerimeterUiContainer) {
      currentOverallStatus = 'valid';
    }

    this.validationChange.emit(currentOverallStatus);
    if (currentOverallStatus === 'valid') {
      this.nextStepRequest.emit();
    } else {
      const message = currentOverallStatus === 'pending'
        ? "Bitte vervollständigen Sie Ihre Eingabe im Suchfeld, wählen Sie einen Eintrag aus der Liste oder wählen Sie PLZ-Gebiete auf der Karte aus, um fortzufahren."
        : "Die Eingabe im Suchfeld ist ungültig oder unvollständig und es sind keine PLZ-Gebiete auf der Karte ausgewählt. Bitte korrigieren Sie Ihre Auswahl oder geben Sie einen gültigen PLZ-Bereich (z.B. 8000-8045) ein.";
      if (isPlatformBrowser(this.platformId)) alert(message);
    }
  }

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
            innerResolve();
          } else {
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
          innerReject(e);
          delete (window as any).angularGoogleMapsCallback;
          delete (window as any).googleMapsScriptLoadingPromise;
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
        if (center) {
          this.map.setCenter(center);
        }
        this.zoomMapToSelectedEntries(this.selectionService.getSelectedEntries());
      }
    }, WINDOW_RESIZE_DEBOUNCE);
  };

  highlight(text: string, term: string): string {
    if (!term || term.length === 0 || !text) { return text; }
    const R_SPECIAL = /[-\/\\^$*+?.()|[\]{}]/g;
    const safeTerm = term.replace(R_SPECIAL, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    try {
      return text.replace(regex, '<mark>$1</mark>');
    } catch (e) {
      return text;
    }
  }

  isAddButtonDisabled(): boolean {
    const isRange = this.plzRangeRegex.test(this.typeaheadSearchTerm.trim());
    if (isRange) return false;
    return !this.currentTypeaheadSelection || this.textInputStatus !== 'valid' || !!this.currentTypeaheadSelection?.isGroupEntry;
  }
}
