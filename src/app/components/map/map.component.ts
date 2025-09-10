import {
  Component, Input, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';

declare var google: any;
declare var geoXML3: any;

const MAP_INIT_RETRY_DELAY_MS = 250;
const MAX_MAP_INIT_ATTEMPTS = 25;
const WINDOW_RESIZE_DEBOUNCE_MS = 250;

let googleMapsScriptLoadingPromise: Promise<void> | null = null;

export interface MapOptions {
  initialCenter: { lat: number; lng: number };
  initialZoom: number;
  minZoom?: number;
  styles?: any[];
  defaultPolygonOptions: any;
  highlightedPolygonOptions: any;
  selectedPolygonOptions: any;
  selectedHighlightedPolygonOptions: any;
  typeaheadHoverPolygonOptions: any;
}

export interface PlzInfo {
  id: string | null;
  name?: string;
  displayText?: string;
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() selectedPlzIds: string[] = [];
  @Input() highlightOnHoverPlzIds: string[] = [];
  @Input() highlightFromTablePlzId: string | null = null;
  @Input() zoomToPlzId: string | null = null;
  @Input() zoomToPlzIdList: string[] | null = null;
  @Input() kmlPath!: string;
  @Input() apiKey!: string;
  @Input() mapOptions!: MapOptions;

  @Output() plzClicked = new EventEmitter<{ id: string; name?: string }>();
  @Output() mapReady = new EventEmitter<void>();
  @Output() loading = new EventEmitter<boolean>();

  @ViewChild('mapDivRef') mapDivRef!: ElementRef<HTMLElement>;
  @ViewChild('hoverPlzDisplayRef') hoverPlzDisplayRef!: ElementRef<HTMLElement>;


  public map: any = null;
  private geoXmlParser: any;
  private allPlacemarks: any[] = [];
  private destroy$ = new Subject<void>();
  private singlePolygonZoomAdjustListener: any = null;
  private resizeTimeoutId: any;
  private currentHoveredPlacemarkIdForHighlight: string | null = null;

  private mapInitializationScheduled = false;
  public mapInitAttempts = 0;
  private mapInitRetryTimer: any = null;
  public mapIsLoadingInternal = false;
  private lastViewportWidth: number = 0;
  private kmlDataLoaded: boolean = false;

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.lastViewportWidth = window.innerWidth;
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.scheduleMapInitialization();
        });
        window.addEventListener('resize', this.onWindowResize);
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (!this.map || !this.kmlDataLoaded) {
      if (!this.map && !this.mapInitializationScheduled) {
        this.ngZone.runOutsideAngular(() => {
          requestAnimationFrame(() => this.scheduleMapInitialization());
        });
      }
      return;
    }

    let zoomHandled = false;

    if (changes['zoomToPlzId'] && this.zoomToPlzId) {
      this.handleZoomToSinglePlz(this.zoomToPlzId);
      zoomHandled = true;
    }
    else if (changes['zoomToPlzIdList']) {
      if (this.zoomToPlzIdList && this.zoomToPlzIdList.length > 0) {
        this.handleZoomToPlzList(this.zoomToPlzIdList);
      } else {
        if (!this.zoomToPlzId) {
          this.resetMapZoom();
        }
      }
      zoomHandled = true;
    }

    if (changes['selectedPlzIds'] || changes['highlightOnHoverPlzIds'] || changes['highlightFromTablePlzId']) {
      this.applyAllMapHighlights(true);
    } else if (!zoomHandled && this.map && this.kmlDataLoaded) {
      this.applyAllMapHighlights(false);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.mapInitRetryTimer);
    this.destroyMap();
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.onWindowResize);
      clearTimeout(this.resizeTimeoutId);
    }
  }

  private setInternalLoadingState(isLoading: boolean): void {
    if (this.mapIsLoadingInternal !== isLoading) {
      this.mapIsLoadingInternal = isLoading;
      this.loading.emit(isLoading);
      this.cdr.detectChanges();
    }
  }

  private scheduleMapInitialization(): void {
    if (this.mapInitializationScheduled || this.map || !isPlatformBrowser(this.platformId)) {
      if (this.map) this.mapInitializationScheduled = false;
      return;
    }

    this.mapInitializationScheduled = true;
    this.mapInitAttempts = 0;
    this.kmlDataLoaded = false;
    this.setInternalLoadingState(true);

    this.ngZone.onStable.pipe(take(1), takeUntil(this.destroy$)).subscribe(() => {
      const currentHostEl = this.elementRef.nativeElement;
      const currentMapDiv = this.mapDivRef?.nativeElement;

      if (this.map || !currentHostEl || !currentMapDiv) {
        this.mapInitializationScheduled = false;
        this.setInternalLoadingState(false);
        return;
      }

      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => this.initializeMapAndGeoXml());
        });
      });
    });
  }

  private destroyMap(): void {
    this.setInternalLoadingState(false);
    if (this.map && typeof google !== 'undefined' && google.maps) {
      google.maps.event.clearInstanceListeners(this.map);
      if (this.allPlacemarks) {
        this.allPlacemarks.forEach(p => {
          const actualPolygon = p.polygon || p.gObject;
          if (actualPolygon) google.maps.event.clearInstanceListeners(actualPolygon);
        });
      }
    }
    this.allPlacemarks = [];
    this.map = null;
    this.geoXmlParser = null;
    this.mapInitializationScheduled = false;
    this.kmlDataLoaded = false;
  }

  private initializeMapAndGeoXml(): void {
    if (this.map || !isPlatformBrowser(this.platformId)) {
      this.mapInitializationScheduled = false;
      if (!this.map) this.setInternalLoadingState(false);
      return;
    }

    this.loadGoogleMapsScriptOnce().then(() => {
      if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
        this.initMapInternal();
      } else {
        this.ngZone.run(() => {
          this.setInternalLoadingState(false);
          this.mapInitializationScheduled = false;
        });
      }
    }).catch(error => {
      this.ngZone.run(() => {
        this.setInternalLoadingState(false);
        this.mapInitializationScheduled = false;
      });
    });
  }

  private initMapInternal(): void {
    if (this.map) {
      this.mapInitializationScheduled = false;
      this.setInternalLoadingState(false);
      return;
    }

    const hostElement = this.elementRef.nativeElement;
    const mapDivElement = this.mapDivRef?.nativeElement;

    if (!hostElement || !mapDivElement) {
      this.ngZone.run(() => this.setInternalLoadingState(false));
      this.mapInitializationScheduled = false;
      return;
    }

    clearTimeout(this.mapInitRetryTimer);

    if (mapDivElement.offsetParent === null) {
      this.mapInitAttempts++;
      if (this.mapInitAttempts >= MAX_MAP_INIT_ATTEMPTS) {
        this.ngZone.run(() => this.setInternalLoadingState(false));
        this.mapInitializationScheduled = false;
        return;
      }
      this.mapInitRetryTimer = setTimeout(() => this.ngZone.run(() => this.initMapInternal()), MAP_INIT_RETRY_DELAY_MS);
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      try {
        this.map = new google.maps.Map(mapDivElement, {
          center: this.mapOptions.initialCenter,
          zoom: this.mapOptions.initialZoom,
          minZoom: this.mapOptions.minZoom,
          mapTypeControl: false, fullscreenControl: false, streetViewControl: false,
          styles: this.mapOptions.styles,
          gestureHandling: 'cooperative',
          restriction: {
            latLngBounds: { north: 47.8084, south: 45.818, west: 5.9563, east: 10.4921 },
            strictBounds: false,
          }
        });
      } catch (e) {
        this.map = null;
        this.ngZone.run(() => {
          this.setInternalLoadingState(false);
          this.mapInitializationScheduled = false;
        });
        return;
      }

      this.geoXmlParser = new geoXML3.parser({
        map: this.map,
        suppressInfoWindows: true, singleInfoWindow: true, processStyles: true,
        afterParse: (docs: any) => this.ngZone.run(() => {
          this.setInternalLoadingState(false);
          if (docs?.[0]?.placemarks?.length > 0) {
            this.allPlacemarks = docs[0].placemarks;
            this.setupPlacemarkInteractions(this.allPlacemarks);
          } else {
            this.allPlacemarks = [];
          }
          this.kmlDataLoaded = true;

          this.applyAllMapHighlights(true);

          if (this.zoomToPlzId) {
            this.handleZoomToSinglePlz(this.zoomToPlzId);
          } else if (this.zoomToPlzIdList && this.zoomToPlzIdList.length > 0) {
            this.handleZoomToPlzList(this.zoomToPlzIdList);
          } else if (this.selectedPlzIds && this.selectedPlzIds.length > 0 && this.allPlacemarks.length > 0 ) {
            this.handleZoomToPlzList(this.selectedPlzIds);
          }
          else {
            this.resetMapZoom();
          }
          this.mapReady.emit();
          this.mapInitializationScheduled = false;
        }),
        failedParse: (error: any) => this.ngZone.run(() => {
          this.setInternalLoadingState(false);
          this.allPlacemarks = [];
          this.kmlDataLoaded = false;
          this.mapInitializationScheduled = false;
        }),
        polygonOptions: this.mapOptions.defaultPolygonOptions
      });

      try {
        this.geoXmlParser.parse(this.kmlPath);
      } catch (e) {
        this.ngZone.run(() => {
          this.setInternalLoadingState(false);
          this.kmlDataLoaded = false;
          this.mapInitializationScheduled = false;
        });
      }
    });
  }

  private setupPlacemarkInteractions(placemarks: any[]): void {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return;
    this.ngZone.runOutsideAngular(() => {
      placemarks.forEach((placemark) => {
        const actualPolygon = placemark.polygon || placemark.gObject;
        if (actualPolygon && typeof actualPolygon.setOptions === 'function') {
          const plzInfo = this.extractPlzInfoFromPlacemark(placemark);
          google.maps.event.clearInstanceListeners(actualPolygon);
          google.maps.event.addListener(actualPolygon, 'mouseover', () => {
            if (!this.map) return;
            this.currentHoveredPlacemarkIdForHighlight = plzInfo.id;
            this.applyAllMapHighlights();
            if (this.hoverPlzDisplayRef?.nativeElement && plzInfo.displayText) {
              this.hoverPlzDisplayRef.nativeElement.textContent = plzInfo.displayText;
              this.hoverPlzDisplayRef.nativeElement.style.display = 'block';
            }
          });
          google.maps.event.addListener(actualPolygon, 'mouseout', () => {
            if (!this.map) return;
            this.currentHoveredPlacemarkIdForHighlight = null;
            this.applyAllMapHighlights();
            if (this.hoverPlzDisplayRef?.nativeElement) {
              this.hoverPlzDisplayRef.nativeElement.style.display = 'none';
            }
          });
          google.maps.event.addListener(actualPolygon, 'mousemove', (event: any) => {
            if (!this.map || !this.hoverPlzDisplayRef?.nativeElement || this.hoverPlzDisplayRef.nativeElement.style.display !== 'block' || !event.domEvent) return;
            this.hoverPlzDisplayRef.nativeElement.style.left = (event.domEvent.clientX + 15) + 'px';
            this.hoverPlzDisplayRef.nativeElement.style.top = (event.domEvent.clientY + 15) + 'px';
          });
          google.maps.event.addListener(actualPolygon, 'click', () => this.ngZone.run(() => {
            if (this.map && plzInfo.id) {
              this.plzClicked.emit({ id: plzInfo.id, name: placemark.name });
            }
          }));
        }
      });
    });
  }

  private extractPlzInfoFromPlacemark(placemark: any): { id: string | null; displayText: string | null } {
    let plz6: string | null = null;
    if (placemark?.name) {
      const nameMatch = String(placemark.name).trim().match(/^(\d{6})$/);
      if (nameMatch) plz6 = nameMatch[1];
    }
    if (!plz6 && placemark?.description) {
      const descriptionMatch = String(placemark.description).match(/PLZCH:\s*(\d{6})/i);
      if (descriptionMatch && descriptionMatch[1]) plz6 = descriptionMatch[1];
    }
    if (!plz6) return { id: null, displayText: null };
    const plz4 = plz6.length >= 4 ? plz6.substring(0, 4) : plz6;
    return { id: plz6, displayText: `PLZ ${plz4}` };
  }

  public applyAllMapHighlights(forceAngularUpdate: boolean = false): void {
    if (!this.map || !this.allPlacemarks || this.allPlacemarks.length === 0 || !isPlatformBrowser(this.platformId) || !this.kmlDataLoaded) return;

    this.ngZone.runOutsideAngular(() => {
      const selectedSet = new Set(this.selectedPlzIds);
      const hoverSet = new Set(this.highlightOnHoverPlzIds || []);
      this.allPlacemarks.forEach(placemark => {
        const plzInfo = this.extractPlzInfoFromPlacemark(placemark);
        const actualPolygon = placemark.polygon || placemark.gObject;
        if (actualPolygon?.setOptions && plzInfo.id) {
          let optionsToApply = { ...this.mapOptions.defaultPolygonOptions };
          const id = plzInfo.id;
          const isSelected = selectedSet.has(id);
          const isHovered = this.currentHoveredPlacemarkIdForHighlight === id ||
            hoverSet.has(id) ||
            this.highlightFromTablePlzId === id;
          if (isSelected) {
            optionsToApply = isHovered
              ? { ...this.mapOptions.selectedHighlightedPolygonOptions }
              : { ...this.mapOptions.selectedPolygonOptions };
          } else if (isHovered) {
            if (hoverSet.has(id) && this.mapOptions.typeaheadHoverPolygonOptions) {
              optionsToApply = { ...this.mapOptions.typeaheadHoverPolygonOptions };
            } else {
              optionsToApply = { ...this.mapOptions.highlightedPolygonOptions };
            }
          }
          actualPolygon.setOptions(optionsToApply);
        }
      });
    });

    if (forceAngularUpdate) {
      this.ngZone.run(() => {
        this.cdr.detectChanges();
      });
    }
  }

  private getPolygonBounds(polygon: any): google.maps.LatLngBounds | null {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return null;
    const bounds = new google.maps.LatLngBounds();
    if (polygon?.getPaths) {
      polygon.getPaths().forEach((path: any) => path?.getArray().forEach((latLng: any) => bounds.extend(latLng)));
    } else if (polygon?.getPath) {
      polygon.getPath()?.getArray().forEach((latLng: any) => bounds.extend(latLng));
    } else {
      return null;
    }
    return bounds.isEmpty() ? null : bounds;
  }

  private handleZoomToSinglePlz(plzId: string): void {
    if (!this.map || !this.allPlacemarks || !this.kmlDataLoaded ) return;
    const placemarkToZoom = this.allPlacemarks.find(p => this.extractPlzInfoFromPlacemark(p).id === plzId);
    if (placemarkToZoom) {
      const actualPolygon = placemarkToZoom.polygon || placemarkToZoom.gObject;
      if (actualPolygon) {
        const bounds = this.getPolygonBounds(actualPolygon);
        if (bounds && !bounds.isEmpty()) {
          this.ngZone.runOutsideAngular(() => {
            google.maps.event.trigger(this.map, 'resize'); // HINZUGEFÜGT: Stellt korrekte Viewport-Grösse sicher
            this.map.fitBounds(bounds, 10);
            if (this.singlePolygonZoomAdjustListener) google.maps.event.removeListener(this.singlePolygonZoomAdjustListener);
            this.singlePolygonZoomAdjustListener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
              let currentZoom = this.map.getZoom();
              if (currentZoom !== undefined && currentZoom > (this.mapOptions.initialZoom + 5)) {
                this.map.setZoom(Math.max(0, currentZoom - 2));
              }
              this.singlePolygonZoomAdjustListener = null;
              this.applyAllMapHighlights(true);
            });
          });
        }
      }
    }
  }

  private handleZoomToPlzList(plzIdList: string[] | null): void {
    if (!this.map || !this.allPlacemarks || !this.kmlDataLoaded || !plzIdList || plzIdList.length === 0) {
      if (this.kmlDataLoaded || !plzIdList || plzIdList.length === 0) {
        this.resetMapZoom();
      }
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      if (this.singlePolygonZoomAdjustListener) {
        google.maps.event.removeListener(this.singlePolygonZoomAdjustListener);
        this.singlePolygonZoomAdjustListener = null;
      }
      const totalBounds = new google.maps.LatLngBounds();
      const idSet = new Set(plzIdList);
      let foundPlacemarksForBounds = 0;
      this.allPlacemarks.forEach(placemark => {
        const plzInfo = this.extractPlzInfoFromPlacemark(placemark);
        if (plzInfo.id && idSet.has(plzInfo.id)) {
          const bounds = this.getPolygonBounds(placemark.polygon || placemark.gObject);
          if (bounds) {
            totalBounds.union(bounds);
            foundPlacemarksForBounds++;
          }
        }
      });

      if (foundPlacemarksForBounds > 0 && !totalBounds.isEmpty()) {
        google.maps.event.trigger(this.map, 'resize'); // HINZUGEFÜGT: Stellt korrekte Viewport-Grösse sicher
        this.map.fitBounds(totalBounds, 15);
        google.maps.event.addListenerOnce(this.map, 'idle', () => {
          if (plzIdList.length === 1) {
            let currentZoom = this.map.getZoom();
            if (currentZoom !== undefined && currentZoom > (this.mapOptions.initialZoom + 5)) {
              this.map.setZoom(Math.max(0, currentZoom - 2));
            }
          }
          this.applyAllMapHighlights(true);
        });
      }
    });
  }

  private resetMapZoom(): void {
    if (this.map && this.mapOptions) {
      this.ngZone.runOutsideAngular(() => {
        this.map.setCenter(this.mapOptions.initialCenter);
        this.map.setZoom(this.mapOptions.initialZoom);
        if (this.kmlDataLoaded) {
          google.maps.event.addListenerOnce(this.map, 'idle', () => this.applyAllMapHighlights(true));
        }
      });
    }
  }

  private loadGoogleMapsScriptOnce(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.resolve();
    }
    if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
      return Promise.resolve();
    }
    if (googleMapsScriptLoadingPromise) {
      return googleMapsScriptLoadingPromise;
    }

    googleMapsScriptLoadingPromise = new Promise<void>((resolve, reject) => {
      const callbackName = `angularGoogleMapsCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      (window as any)[callbackName] = () => {
        try {
          if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
            resolve();
          } else {
            reject(new Error("Google Maps API or geoXML3 not in global scope after callback."));
          }
        } catch (e) {
          reject(e);
        } finally {
          try { delete (window as any)[callbackName]; } catch (e) {}
        }
      };

      const geoXmlScriptPath = 'assets/js/geoxml3.js';
      const mapsScriptSrc = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=visualization,geometry&language=de&region=CH`;

      const loadGeoXmlAndResolve = () => {
        const geoScript = document.createElement('script');
        geoScript.src = geoXmlScriptPath;
        geoScript.async = true;
        geoScript.defer = true;
        geoScript.onload = () => {
          if (typeof (window as any)[callbackName] === 'function') {
            (window as any)[callbackName]();
          } else {
            reject(new Error("Original Google Maps callback not found after geoXML3 load."));
          }
        };
        geoScript.onerror = (e) => reject(new Error(`Failed to load ${geoXmlScriptPath}: ${e}`));
        document.head.appendChild(geoScript);
      };

      const tempMapsCallbackName = `temp_${callbackName}`;
      (window as any)[tempMapsCallbackName] = () => {
        loadGeoXmlAndResolve();
        try { delete (window as any)[tempMapsCallbackName]; } catch (e) {}
      };

      const script = document.createElement('script');
      script.src = `${mapsScriptSrc}&callback=${tempMapsCallbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = (e) => reject(new Error(`Failed to load Google Maps API script: ${e}`));
      document.head.appendChild(script);
    });
    return googleMapsScriptLoadingPromise;
  }

  public triggerResize(): void {
    if (!this.map || !isPlatformBrowser(this.platformId) || !google.maps) return;
    this.ngZone.runOutsideAngular(() => {
      google.maps.event.trigger(this.map, 'resize');
    });
  }

  private readonly onWindowResize = (): void => {
    clearTimeout(this.resizeTimeoutId);
    this.resizeTimeoutId = setTimeout(() => {
      if (!this.map || !isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps || !this.kmlDataLoaded) return;

      this.ngZone.runOutsideAngular(() => {
        const center = this.map.getCenter();
        google.maps.event.trigger(this.map, 'resize');
        if (center) {
          this.map.setCenter(center);
        }
        google.maps.event.addListenerOnce(this.map, 'idle', () => {
          if (this.zoomToPlzId) {
            this.handleZoomToSinglePlz(this.zoomToPlzId);
          } else if (this.zoomToPlzIdList?.length) {
            this.handleZoomToPlzList(this.zoomToPlzIdList);
          } else if (this.selectedPlzIds?.length) {
            this.handleZoomToPlzList(this.selectedPlzIds);
          } else {
            this.resetMapZoom();
          }
        });
      });
    }, WINDOW_RESIZE_DEBOUNCE_MS);
  };
}
