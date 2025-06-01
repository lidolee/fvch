import { Component, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbAlertModule, NgbTypeahead, NgbTooltip } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil, tap, map } from 'rxjs/operators';

import { ValidationStatus } from '../../app.component';
import { PlzDataService, PlzEntry, SearchResultsContainer, EnhancedSearchResultItem } from '../../services/plz-data.service';
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
const COLUMN_HIGHLIGHT_DURATION = 300;

export type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';

interface CloseTypeaheadOptions {
  clearSearchTerm?: boolean;
  clearSelectionModel?: boolean;
  clearResults?: boolean;
}

@Component({
  selector: 'app-distribution-step',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbTypeaheadModule, NgbAlertModule, NgbTooltip],
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
  @ViewChild('typeaheadInstance') typeaheadInstance!: NgbTypeahead;
  @ViewChild('selectAllButtonEl') selectAllButtonEl!: ElementRef<HTMLButtonElement>;
  @ViewChild('typeaheadInputEl') typeaheadInputEl!: ElementRef<HTMLInputElement>;

  map: any = null;
  private geoXmlParser: any;
  allPlacemarks: any[] = [];
  private currentlyHoveredPlacemarkId: string | null = null;
  private destroy$ = new Subject<void>();

  typeaheadSearchTerm: string = '';
  currentTypeaheadSelection: EnhancedSearchResultItem | null = null;
  public typeaheadHoverResultsForMap: EnhancedSearchResultItem[] = [];
  searching: boolean = false;
  selectedEntries$: Observable<PlzEntry[]>;
  currentVerteilungTyp: 'Nach PLZ' | 'Nach Perimeter' = 'Nach PLZ';
  showPlzUiContainer: boolean = true;
  showPerimeterUiContainer: boolean = false;
  currentZielgruppe: ZielgruppeOption = 'Alle Haushalte';
  highlightFlyerMaxColumn: boolean = false;
  textInputStatus: ValidationStatus = 'invalid';

  currentSearchResultsContainer: SearchResultsContainer | null = null;
  isTypeaheadListOpen = false;
  isCustomHeaderOpen = false;
  isMouseOverPopupOrHeader = false;
  private focusEmitter = new Subject<string>();

  private readonly initialMapCenter = { lat: 46.8182, lng: 8.2275 };
  private readonly initialMapZoom = 8;
  private readonly mapStyleWithCorrectedFeatures: any[];
  private readonly defaultPolygonOptions = { strokeColor: "#0063D6", strokeOpacity: 0.1, strokeWeight: 1.5, fillColor: "#0063D6", fillOpacity: 0.05 };
  private readonly highlightedPolygonOptions = { strokeColor: "#0063D6", strokeOpacity: 0.6, strokeWeight: 2, fillColor: "#0063D6", fillOpacity: 0.3 };
  private readonly selectedPolygonOptions = { strokeColor: "#D60096", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#D60096", fillOpacity: 0.4 };
  private readonly selectedHighlightedPolygonOptions = { strokeColor: "#D60096", strokeOpacity: 0.9, strokeWeight: 2.5, fillColor: "#D60096", fillOpacity: 0.6 };
  private readonly typeaheadHoverPolygonOptions = { strokeColor: "#0063D6", strokeOpacity: 0.7, strokeWeight: 2, fillColor: "#0063D6", fillOpacity: 0.25 };
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
    this.mapStyleWithCorrectedFeatures = [];
    this.updateUiFlags(this.currentVerteilungTyp);
  }

  ngOnInit(): void {
    this.selectedEntries$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        if (this.showPlzUiContainer && this.map) {
          this.synchronizeMapSelectionWithService(entries);
        }
        this.updateOverallValidationState();
        this.cdr.markForCheck();
      });
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.showPlzUiContainer) this.scheduleMapInitialization();
      window.addEventListener('resize', this.onWindowResize);
    }
    Promise.resolve().then(() => { this.updateOverallValidationState(); this.cdr.markForCheck(); });
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
    this.destroyMap();
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.onWindowResize);
      clearTimeout(this.resizeTimeout);
      if (typeof (window as any).angularGoogleMapsCallback === 'function') delete (window as any).angularGoogleMapsCallback;
      if ((window as any).googleMapsScriptLoadingPromise) delete (window as any).googleMapsScriptLoadingPromise;
    }
  }

  onVerteilungTypChangeFromTemplate(newVerteilungTyp: 'Nach PLZ' | 'Nach Perimeter'): void {
    this.currentVerteilungTyp = newVerteilungTyp;
    this.updateUiFlagsAndMapState();
  }

  onZielgruppeChange(): void {
    this.highlightFlyerMaxColumn = true; this.cdr.markForCheck();
    setTimeout(() => { this.highlightFlyerMaxColumn = false; this.cdr.markForCheck(); }, COLUMN_HIGHLIGHT_DURATION);
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
          if (actualPolygon) google.maps.event.clearInstanceListeners(actualPolygon);
        });
      }
    }
    this.allPlacemarks = []; this.map = null; this.geoXmlParser = null;
    this.cdr.markForCheck();
  }

  private initializeMapAndGeoXml(): void {
    if (!this.showPlzUiContainer || this.map) return;
    this.loadGoogleMapsScript().then(() => {
      if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
        this.initMapInternal();
      }
    }).catch(err => console.error(`${LOG_PREFIX_DIST} Error loading Google Maps script:`, err));
  }

  private initMapInternal(): void {
    if (!this.showPlzUiContainer || !isPlatformBrowser(this.platformId) || !this.mapDiv?.nativeElement || this.map) return;
    const mapDivElement = this.mapDiv.nativeElement;
    const rect = mapDivElement.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) {
      setTimeout(() => {
        if (this.showPlzUiContainer && !this.map && this.mapDiv?.nativeElement) this.initMapInternal();
      }, MAP_RETRY_INIT_TIMEOUT);
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      try {
        this.map = new google.maps.Map(mapDivElement, {
          center: this.initialMapCenter, zoom: this.initialMapZoom, mapTypeControl: false,
          fullscreenControl: false, streetViewControl: false,
          styles: this.mapStyleWithCorrectedFeatures.length > 0 ? this.mapStyleWithCorrectedFeatures : undefined
        });
      } catch (e) { console.error(`${LOG_PREFIX_DIST} Google Maps initialization failed:`, e); this.map = null; return; }
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
        console.error(`${LOG_PREFIX_DIST} KML parsing failed:`, error);
        if (this.loadingIndicatorDiv?.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        this.allPlacemarks = []; this.updateOverallValidationState(); this.cdr.markForCheck();
      }),
      polygonOptions: this.defaultPolygonOptions
    });
    try { this.geoXmlParser.parse(KML_FILE_PATH); }
    catch (e) { console.error(`${LOG_PREFIX_DIST} Exception during geoXmlParser.parse():`, e); }
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
          this.currentlyHoveredPlacemarkId = plzIdFromMap; this.applyAllMapHighlights();
          if (hoverPlzDisplayElement) {
            hoverPlzDisplayElement.textContent = `${this.extractPlzInfoFromPlacemark(placemark, true)}`;
            hoverPlzDisplayElement.style.display = 'block';
          }
        }));
        google.maps.event.addListener(actualPolygon, 'mouseout', () => this.ngZone.runOutsideAngular(() => {
          if (!this.showPlzUiContainer || !this.map) return;
          this.currentlyHoveredPlacemarkId = null; this.applyAllMapHighlights();
          if (hoverPlzDisplayElement) hoverPlzDisplayElement.style.display = 'none';
        }));
        google.maps.event.addListener(actualPolygon, 'mousemove', (event: any) => {
          if (!this.showPlzUiContainer || !this.map || !hoverPlzDisplayElement || hoverPlzDisplayElement.style.display !== 'block' || !event.domEvent) return;
          hoverPlzDisplayElement.style.left = (event.domEvent.clientX + 15) + 'px';
          hoverPlzDisplayElement.style.top = (event.domEvent.clientY + 15) + 'px';
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
      if (descriptionMatch && descriptionMatch[1]) plz6 = descriptionMatch[1];
    }
    if (!plz6) return null;
    return forDisplay ? `PLZ: ${plz6.substring(0, 4)}` : plz6;
  }

  private getPolygonBounds(polygon: any): google.maps.LatLngBounds | null {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return null;
    const bounds = new google.maps.LatLngBounds();
    if (polygon?.getPaths) {
      polygon.getPaths().forEach((path: any) => path?.getArray().forEach((latLng: any) => bounds.extend(latLng)));
    } else if (polygon?.getPath) {
      polygon.getPath()?.getArray().forEach((latLng: any) => bounds.extend(latLng));
    } else { return null; }
    return bounds.isEmpty() ? null : bounds;
  }

  quickSearch(term: string): void {
    this.typeaheadSearchTerm = term;
    this.currentTypeaheadSelection = null;
    this.focusEmitter.next('');
    this.focusEmitter.next(term);
    if (this.typeaheadInputEl?.nativeElement) {
      this.typeaheadInputEl.nativeElement.focus();
    }
    this.cdr.markForCheck();
  }

  private closeTypeaheadAndHeader(options: CloseTypeaheadOptions = {}): void {
    const { clearSearchTerm = false, clearSelectionModel = false, clearResults = true } = options;

    if (this.typeaheadInstance && this.typeaheadInstance.isPopupOpen()) {
      this.typeaheadInstance.dismissPopup();
    }
    this.isTypeaheadListOpen = false;

    if (clearResults) {
      this.currentSearchResultsContainer = null;
      this.isCustomHeaderOpen = false; // If results are cleared, custom header must close
    } else if (!this.currentSearchResultsContainer || !this.currentSearchResultsContainer.headerText) {
      // If not clearing results, but current container is invalid for a header, also close custom header
      this.isCustomHeaderOpen = false;
    }
    // Note: If clearResults is false, isCustomHeaderOpen's state depends on currentSearchResultsContainer *before* this call.
    // The searchPlzTypeahead tap operator is responsible for setting isCustomHeaderOpen based on new results.

    if (clearSearchTerm) this.typeaheadSearchTerm = '';
    if (clearSelectionModel) this.currentTypeaheadSelection = null;

    // Avoid re-triggering input change from here if it causes loops.
    // The caller of this method should handle follow-up state updates.
    this.cdr.markForCheck();
  }

  searchPlzTypeahead = (text$: Observable<string>): Observable<EnhancedSearchResultItem[]> =>
    merge(text$, this.focusEmitter).pipe(
      debounceTime(text$ === this.focusEmitter ? 0 : 250),
      distinctUntilChanged(),
      switchMap(term => {
        this.typeaheadHoverResultsForMap = [];

        if (this.plzRangeRegex.test(term)) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
          this.applyAllMapHighlights();
          this.textInputStatus = 'valid';
          this.updateOverallValidationState();
          return of([]);
        }

        if (term === '' || term.length < 2) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: term === '', clearSelectionModel: true, clearResults: true });
          this.applyAllMapHighlights();
          this.textInputStatus = 'invalid';
          this.updateOverallValidationState();
          return of([]);
        }

        this.searching = true;
        this.textInputStatus = 'pending';
        this.updateOverallValidationState();
        this.cdr.markForCheck();

        return this.plzDataService.searchEnhanced(term).pipe(
          tap(resultsContainer => {
            this.searching = false;
            this.currentSearchResultsContainer = resultsContainer; // Set this first

            const hasItems = resultsContainer.itemsForDisplay.length > 0;
            const hasHeaderMessage = !!resultsContainer.headerText && resultsContainer.headerText !== `Keine Einträge für "${term}" gefunden.`;
            const hasActionableHeader = hasHeaderMessage && resultsContainer.showSelectAllButton && resultsContainer.entriesForSelectAllAction.length > 0;

            this.isCustomHeaderOpen = hasItems || hasHeaderMessage;
            this.isTypeaheadListOpen = hasItems;

            if (hasItems) {
              this.textInputStatus = 'pending'; // Items in list, waiting for selection
            } else if (hasActionableHeader) {
              this.textInputStatus = 'pending'; // No list items, but custom header offers action
            } else {
              this.textInputStatus = 'invalid'; // No items, no actionable header
            }
            // Further refinement for invalid state if a search term was entered but yielded nothing actionable
            if (term.length >=2 && !this.plzRangeRegex.test(term) && !hasItems && !hasActionableHeader) {
              this.textInputStatus = 'invalid';
            }

            this.cdr.markForCheck();
            this.applyAllMapHighlights();

            if (this.isTypeaheadListOpen || this.isCustomHeaderOpen) {
              setTimeout(() => this.setInitialFocusInTypeahead(), 0);
            }
            this.updateOverallValidationState();
          }),
          map(resultsContainer => resultsContainer.itemsForDisplay),
          catchError(() => {
            this.searching = false;
            this.currentSearchResultsContainer = { searchTerm: term, searchTypeDisplay: 'none', itemsForDisplay: [], headerText: 'Fehler bei der Suche.', showSelectAllButton: false, entriesForSelectAllAction: [] };
            this.isCustomHeaderOpen = true; this.isTypeaheadListOpen = false;
            this.textInputStatus = 'invalid';
            this.typeaheadHoverResultsForMap = []; this.applyAllMapHighlights();
            this.updateOverallValidationState();
            this.cdr.markForCheck(); return of([]);
          })
        );
      })
    );

  onTypeaheadInputChange(term: string): void {
    if (this.currentTypeaheadSelection && this.typeaheadInputFormatter(this.currentTypeaheadSelection) !== term) {
      this.currentTypeaheadSelection = null;
    }

    if (term === '') {
      this.currentTypeaheadSelection = null;
      this.typeaheadHoverResultsForMap = [];
      this.applyAllMapHighlights();
      this.textInputStatus = 'invalid';
    } else if (this.plzRangeRegex.test(term)) {
      this.textInputStatus = 'valid';
      this.currentTypeaheadSelection = null;
    } else if (term.length < 2) {
      this.textInputStatus = 'invalid';
    } else {
      this.textInputStatus = this.currentTypeaheadSelection ? 'valid' : 'pending';
    }
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  typeaheadItemSelected(event: NgbTypeaheadSelectItemEvent<EnhancedSearchResultItem>): void {
    event.preventDefault();
    const selectedItem = event.item;
    if (!selectedItem) return;
    this.handleTakeItemFromTypeahead(selectedItem);
  }

  handleTakeItemFromTypeahead(item: EnhancedSearchResultItem, event?: MouseEvent): void {
    event?.stopPropagation(); event?.preventDefault();
    if (!item) return;

    if (item.isGroupHeader) {
      if (this.currentSearchResultsContainer?.entriesForSelectAllAction && this.currentSearchResultsContainer.entriesForSelectAllAction.length > 0) {
        this.selectionService.addMultipleEntries(this.currentSearchResultsContainer.entriesForSelectAllAction);
      } else {
        console.warn(`${LOG_PREFIX_DIST} Ortsgruppe "${item.ort || item.plz4}" ausgewählt, aber keine 'entriesForSelectAllAction' gefunden.`);
      }
    } else {
      const entryToAdd: PlzEntry = {
        id: item.id, plz6: item.plz6, plz4: item.plz4, ort: item.ort, kt: item.kt,
        all: item.all, mfh: item.mfh, efh: item.efh, isGroupEntry: item.isGroupEntry ?? false
      };
      this.selectionService.addEntry(entryToAdd);
    }
    this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
    this.typeaheadHoverResultsForMap = [];
    this.applyAllMapHighlights();
    // textInputStatus and overall validation updated via closeTypeaheadAndHeader -> onTypeaheadInputChange('') and selectedEntries$ subscription
  }

  handleSelectAllFromTypeaheadHeader(): void {
    if (this.currentSearchResultsContainer?.showSelectAllButton && this.currentSearchResultsContainer.entriesForSelectAllAction.length > 0) {
      this.selectionService.addMultipleEntries(this.currentSearchResultsContainer.entriesForSelectAllAction);
    }
    this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
    this.typeaheadHoverResultsForMap = [];
    this.applyAllMapHighlights();
  }

  onSearchFocus(): void {
    const term = this.typeaheadSearchTerm;
    if ((term.length >= 2 && !this.plzRangeRegex.test(term)) || term === '' || this.currentSearchResultsContainer) {
      this.focusEmitter.next(term);
    }
    this.cdr.markForCheck();
  }

  onSearchBlur(): void {
    setTimeout(() => {
      if (!this.isMouseOverPopupOrHeader) {
        const isRange = this.plzRangeRegex.test(this.typeaheadSearchTerm.trim());
        if ((isRange && this.textInputStatus === 'valid') || this.currentTypeaheadSelection) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: false, clearResults: false });
        } else {
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
        }
        this.typeaheadHoverResultsForMap = [];
        this.applyAllMapHighlights();
      }
    }, 200);
  }

  addCurrentSelectionToTable(): void {
    const searchTerm = this.typeaheadSearchTerm.trim();
    const rangeMatch = searchTerm.match(this.plzRangeRegex);

    if (rangeMatch && searchTerm !== '') {
      this.plzDataService.getEntriesByPlzRange(searchTerm).subscribe(entries => {
        if (entries.length > 0) {
          this.selectionService.addMultipleEntries(entries);
        } else {
          if (isPlatformBrowser(this.platformId)) alert(`Für den Bereich "${searchTerm}" wurden keine gültigen PLZ-Gebiete gefunden.`);
        }
        this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
        this.typeaheadHoverResultsForMap = [];
        this.applyAllMapHighlights();
      });
    } else if (this.currentTypeaheadSelection) {
      this.handleTakeItemFromTypeahead(this.currentTypeaheadSelection);
    }
  }

  removePlzFromTable(entry: PlzEntry): void {
    this.selectionService.removeEntry(entry.id);
  }

  clearPlzTable(): void {
    this.selectionService.clearEntries();
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
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks || this.allPlacemarks.length === 0) return;
    const selectedEntryIds = new Set(this.selectionService.getSelectedEntries().map(e => e.id));
    const typeaheadHoverIds = new Set(this.typeaheadHoverResultsForMap.filter(e => e && e.id).map(e => e.id));
    this.allPlacemarks.forEach(placemark => {
      const plzIdFromMap = this.extractPlzInfoFromPlacemark(placemark, false);
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon?.setOptions && plzIdFromMap) {
        let optionsToApply = {...this.defaultPolygonOptions};
        if (selectedEntryIds.has(plzIdFromMap)) {
          optionsToApply = (this.currentlyHoveredPlacemarkId === plzIdFromMap || typeaheadHoverIds.has(plzIdFromMap))
            ? {...this.selectedHighlightedPolygonOptions} : {...this.selectedPolygonOptions};
        } else if (typeaheadHoverIds.has(plzIdFromMap)) {
          optionsToApply = {...this.typeaheadHoverPolygonOptions};
        } else if (this.currentlyHoveredPlacemarkId === plzIdFromMap) {
          optionsToApply = {...this.highlightedPolygonOptions};
        }
        actualPolygon.setOptions(optionsToApply);
      }
    });
  }

  private synchronizeMapSelectionWithService(selectedEntries: PlzEntry[]): void {
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks || this.allPlacemarks.length === 0) return;
    this.applyAllMapHighlights();
    if (this.selectedPlzInfoSpan?.nativeElement) {
      this.updateSelectedPlzInfoText(selectedEntries);
    }
    this.zoomMapToSelectedEntries(selectedEntries);
    this.cdr.markForCheck();
  }

  private updateSelectedPlzInfoText(currentSelection: PlzEntry[]): void {
    if (!isPlatformBrowser(this.platformId) || !this.selectedPlzInfoSpan?.nativeElement) return;
    const displayPlzList = currentSelection
      .map(entry => entry.plz4).sort().filter((value, index, self) => self.indexOf(value) === index);
    this.selectedPlzInfoSpan.nativeElement.textContent = displayPlzList.length === 0 ? "Keine" : displayPlzList.join(', ');
  }

  private zoomMapToSelectedEntries(entriesToZoom: PlzEntry[]): void {
    if (!this.map || !this.showPlzUiContainer || !this.allPlacemarks || !this.allPlacemarks.length || typeof google === 'undefined' || !google.maps) return;
    this.ngZone.runOutsideAngular(() => {
      if (this.singlePolygonZoomAdjustListener) { google.maps.event.removeListener(this.singlePolygonZoomAdjustListener); this.singlePolygonZoomAdjustListener = null; }
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
      } else { this.map.setCenter(this.initialMapCenter); this.map.setZoom(this.initialMapZoom); }
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

  getZielgruppeLabel(): string {
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser': return 'MFH';
      case 'Ein- und Zweifamilienhäuser': return 'EFH/ZFH';
      default: return 'Alle';
    }
  }

  setExampleStatus(status: ValidationStatus): void {
    this.textInputStatus = status;
    if (status === 'invalid') {
      this.currentTypeaheadSelection = null;
      this.typeaheadSearchTerm = '';
    }
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  private updateOverallValidationState(): void {
    const mapHasSelection = this.selectionService.getSelectedEntries().length > 0;
    let newOverallStatus: ValidationStatus = 'invalid';
    if (this.showPlzUiContainer) {
      const searchTerm = this.typeaheadSearchTerm.trim();
      const isRangeInputValid = this.plzRangeRegex.test(searchTerm);
      if (this.textInputStatus === 'valid' || mapHasSelection || (isRangeInputValid && searchTerm !== '')) {
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
    this.cdr.markForCheck();
  }

  proceedToNextStep(): void {
    let currentOverallStatusForProceed: ValidationStatus = 'invalid';
    const mapHasSelection = this.selectionService.getSelectedEntries().length > 0;
    const searchTerm = this.typeaheadSearchTerm.trim();
    const isRangeInputValid = this.plzRangeRegex.test(searchTerm);

    if (this.showPlzUiContainer) {
      if (this.textInputStatus === 'valid' || mapHasSelection || (isRangeInputValid && searchTerm !== '')) {
        currentOverallStatusForProceed = 'valid';
      } else if (this.textInputStatus === 'pending' && !mapHasSelection) {
        currentOverallStatusForProceed = 'pending';
      }
    } else if (this.showPerimeterUiContainer) {
      currentOverallStatusForProceed = 'valid';
    }
    this.validationChange.emit(currentOverallStatusForProceed);

    if (currentOverallStatusForProceed === 'valid') {
      if (this.showPlzUiContainer && isRangeInputValid && searchTerm !== '' && this.currentTypeaheadSelection === null && !mapHasSelection) {
        this.plzDataService.getEntriesByPlzRange(searchTerm).subscribe(entries => {
          if (entries.length > 0) {
            this.selectionService.addMultipleEntries(entries);
            this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
            this.typeaheadHoverResultsForMap = [];
            this.applyAllMapHighlights();
            this.nextStepRequest.emit();
          } else {
            if (isPlatformBrowser(this.platformId)) alert(`Für den Bereich "${searchTerm}" wurden keine gültigen PLZ-Gebiete gefunden. Ihre Auswahl wurde nicht geändert.`);
            this.textInputStatus = 'invalid'; this.updateOverallValidationState();
          }
        });
      } else { this.nextStepRequest.emit(); }
    } else {
      const message = currentOverallStatusForProceed === 'pending'
        ? "Bitte vervollständigen Sie Ihre Eingabe im Suchfeld, wählen Sie einen Eintrag aus der Liste oder wählen Sie PLZ-Gebiete auf der Karte aus, um fortzufahren."
        : "Die Eingabe im Suchfeld ist ungültig oder unvollständig und es sind keine PLZ-Gebiete auf der Karte ausgewählt. Bitte korrigieren Sie Ihre Auswahl oder geben Sie einen gültigen PLZ-Bereich ein (z.B. 8000-8045).";
      if (isPlatformBrowser(this.platformId)) alert(message);
    }
  }

  private loadGoogleMapsScript(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!isPlatformBrowser(this.platformId)) { resolve(); return; }
      if (typeof google !== 'undefined' && google.maps) { resolve(); return; }
      if ((window as any).googleMapsScriptLoadingPromise) {
        return (window as any).googleMapsScriptLoadingPromise.then(resolve).catch(reject);
      }
      (window as any).googleMapsScriptLoadingPromise = new Promise<void>((innerResolve, innerReject) => {
        (window as any).angularGoogleMapsCallback = () => {
          if ((window as any).google?.maps) { innerResolve(); }
          else { innerReject(new Error("Google Maps API geladen, aber google.maps nicht gefunden.")); }
          delete (window as any).angularGoogleMapsCallback;
        };
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=angularGoogleMapsCallback&libraries=visualization,geometry&language=de&region=CH`;
        script.async = true; script.defer = true;
        script.onerror = (e) => {
          innerReject(e);
          delete (window as any).angularGoogleMapsCallback; delete (window as any).googleMapsScriptLoadingPromise;
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
    if (!term || term.length === 0 || !text) return text;
    const R_SPECIAL = /[-\/\\^$*+?.()|[\]{}]/g;
    const safeTerm = term.replace(R_SPECIAL, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    try { return text.replace(regex, '<mark>$1</mark>'); } catch (e) { return text; }
  }

  isAddButtonDisabled(): boolean {
    const searchTerm = this.typeaheadSearchTerm.trim();
    const isRange = this.plzRangeRegex.test(searchTerm);
    if (isRange && searchTerm !== '') return false; // Enable for non-empty valid range
    if (this.currentTypeaheadSelection) return false; // Enable if an item is selected via model
    // Disable if not a range, no selection model, and input status is not 'valid'
    // (e.g. pending or invalid text not matching a specific item)
    return !(this.textInputStatus === 'valid' && searchTerm !== '');
  }

  isOrtSearchForTemplate(): boolean { return this.currentSearchResultsContainer?.searchTypeDisplay === 'ort'; }
  isPlzSearchForTemplate(): boolean { return this.currentSearchResultsContainer?.searchTypeDisplay === 'plz'; }
  isMixedSearchForTemplate(): boolean { return this.currentSearchResultsContainer?.searchTypeDisplay === 'mixed'; }

  private setInitialFocusInTypeahead(): void {
    if (this.isCustomHeaderOpen && this.currentSearchResultsContainer?.showSelectAllButton && this.selectAllButtonEl?.nativeElement) {
      this.selectAllButtonEl.nativeElement.focus({ preventScroll: true });
    }
  }

  resultFormatter = (result: EnhancedSearchResultItem): string => {
    if (!result) return '';
    if (result.isGroupHeader) {
      return `${result.ort || result.plz4}${result.childPlzCount ? ` (${result.childPlzCount} PLZ)` : ''}`;
    }
    return `${result.plz4 ? result.plz4 + ' ' : ''}${result.ort}${result.kt && result.kt !== 'N/A' ? ' - ' + result.kt : ''}`;
  };

  typeaheadInputFormatter = (item: EnhancedSearchResultItem | string | null): string => {
    if (typeof item === 'string') return item; // Allow string for direct input by user
    if (item) { // If item is an EnhancedSearchResultItem object
      if (item.isGroupHeader) {
        return `${item.ort || item.plz4}`;
      }
      return `${item.plz4 ? item.plz4 + ' ' : ''}${item.ort}${item.kt && item.kt !== 'N/A' ? ' - ' + item.kt : ''}`;
    }
    // If item is null (e.g. input cleared or no specific selection model)
    // but the text in the input field is a valid range, preserve that text.
    if (this.currentTypeaheadSelection === null && this.plzRangeRegex.test(this.typeaheadSearchTerm)) {
      return this.typeaheadSearchTerm;
    }
    return ''; // Default to empty if no specific item and not a range in text
  };

  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.isTypeaheadListOpen || this.isCustomHeaderOpen) {
      event.preventDefault();
      // When escaping, keep the current search term for potential correction,
      // clear selection model, and clear results (which closes custom header).
      this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
      this.typeaheadHoverResultsForMap = [];
      this.applyAllMapHighlights();
      // Manually update textInputStatus as onTypeaheadInputChange might not be triggered by this.
      this.onTypeaheadInputChange(this.typeaheadSearchTerm);
    }
  }

  @HostListener('keydown', ['$event'])
  handleFormKeyDown(event: KeyboardEvent) {
    if (this.isCustomHeaderOpen && this.currentSearchResultsContainer?.showSelectAllButton) {
      if (document.activeElement === this.selectAllButtonEl?.nativeElement && event.key === 'Enter') {
        event.preventDefault();
        this.handleSelectAllFromTypeaheadHeader();
      }
    }
  }
}
