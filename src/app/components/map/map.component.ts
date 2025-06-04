import {
  Component, Input, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';

declare var google: any;
declare var geoXML3: any;

const LOG_PREFIX_MAP = '[MapComponent]';
const MAP_INIT_TIMEOUT = 200;
const MAP_RETRY_INIT_TIMEOUT = 100;
const WINDOW_RESIZE_DEBOUNCE = 250;
const MOBILE_BREAKPOINT_WIDTH = 768; // Pixels

export interface MapOptions {
  initialCenter: { lat: number; lng: number };
  initialZoom: number;
  styles?: any[];
  defaultPolygonOptions: any;
  highlightedPolygonOptions: any;
  selectedPolygonOptions: any;
  selectedHighlightedPolygonOptions: any;
  typeaheadHoverPolygonOptions: any;
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

  @ViewChild('mapDivRef') mapDiv!: ElementRef<HTMLElement>;
  @ViewChild('hoverPlzDisplayRef') hoverPlzDisplayDiv!: ElementRef<HTMLElement>;
  @ViewChild('loadingIndicatorRef') loadingIndicatorDiv!: ElementRef<HTMLElement>;

  public map: any = null;
  private geoXmlParser: any;
  private allPlacemarks: any[] = [];
  private destroy$ = new Subject<void>();
  private singlePolygonZoomAdjustListener: any = null;
  private resizeTimeout: any;
  private currentHoveredPlacemarkIdForHighlight: string | null = null;
  private previousWindowWidth: number = 0; // Für die Logik der Breitenänderung

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.previousWindowWidth = window.innerWidth;
      // adjustMapAspectRatio() wird innerhalb von initMapInternal oder scheduleMapInitialization (wenn map schon existiert) aufgerufen
      this.scheduleMapInitialization();
      window.addEventListener('resize', this.onWindowResize);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map) {
      let needsHighlightUpdate = false;

      if (changes['selectedPlzIds'] || changes['highlightOnHoverPlzIds'] || changes['highlightFromTablePlzId']) {
        needsHighlightUpdate = true;
      }
      if (changes['zoomToPlzId'] && this.zoomToPlzId) {
        this.handleZoomToSinglePlz(this.zoomToPlzId);
      }
      if (changes['zoomToPlzIdList'] && this.zoomToPlzIdList) {
        this.handleZoomToPlzList(this.zoomToPlzIdList);
      } else if (changes['zoomToPlzIdList'] && !this.zoomToPlzIdList && (!this.selectedPlzIds || this.selectedPlzIds.length === 0)) {
        this.resetMapZoom();
      }

      if (needsHighlightUpdate) {
        this.applyAllMapHighlights();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyMap();
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.onWindowResize);
      clearTimeout(this.resizeTimeout);
      if (typeof (window as any).angularGoogleMapsCallback === 'function') {
        // Cleanup
      }
    }
  }

  private adjustMapAspectRatio(): void {
    if (!isPlatformBrowser(this.platformId) || !this.mapDiv?.nativeElement) {
      return;
    }
    const mapDivElement = this.mapDiv.nativeElement;
    const currentDivWidth = mapDivElement.offsetWidth;

    if (currentDivWidth === 0 && window.innerWidth > 0) {
      // console.warn(`${LOG_PREFIX_MAP} adjustMapAspectRatio: mapDiv width is 0.`);
    }

    let newHeight: number;
    if (window.innerWidth < MOBILE_BREAKPOINT_WIDTH) { // Mobile
      newHeight = currentDivWidth * (9 / 16); // 16:9
    } else { // Desktop/Tablet
      newHeight = currentDivWidth * (3 / 4);   // 4:3
    }
    mapDivElement.style.height = `${Math.round(newHeight)}px`;

    // Trigger Google Map's internal resize AFTER setting the new height
    if (this.map && typeof google !== 'undefined' && google.maps && google.maps.event) {
      this.ngZone.runOutsideAngular(() => {
        google.maps.event.trigger(this.map, 'resize');
      });
    }
  }

  private scheduleMapInitialization(): void {
    if (this.map) { // Map already initialized
      this.adjustMapAspectRatio(); // Adjust div height and trigger map.resize
      this.ngZone.runOutsideAngular(() => {
        // Re-evaluate zoom based on current selections
        if (this.zoomToPlzIdList && this.zoomToPlzIdList.length > 0) {
          this.handleZoomToPlzList(this.zoomToPlzIdList);
        } else if (this.selectedPlzIds && this.selectedPlzIds.length > 0) {
          this.handleZoomToPlzList(this.selectedPlzIds);
        } else {
          this.resetMapZoom();
        }
      });
      // After zoom/pan, re-apply highlights. Needs to be in Angular zone due to cdr.detectChanges().
      this.ngZone.run(() => {
        this.applyAllMapHighlights();
      });
      return;
    }
    // If map doesn't exist yet, schedule its full initialization
    setTimeout(() => {
      if (this.mapDiv?.nativeElement && !this.map) {
        this.ngZone.run(() => this.initializeMapAndGeoXml());
      }
    }, MAP_INIT_TIMEOUT);
  }

  private destroyMap(): void {
    this.loading.emit(false);
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
    if (this.map) return;
    this.loading.emit(true);
    this.loadGoogleMapsScript().then(() => {
      if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
        this.initMapInternal();
      } else {
        this.loading.emit(false);
      }
    }).catch(err => {
      this.loading.emit(false);
    });
  }

  private initMapInternal(): void {
    if (!isPlatformBrowser(this.platformId) || !this.mapDiv?.nativeElement || this.map) {
      if (!this.mapDiv?.nativeElement) this.loading.emit(false);
      return;
    }

    this.adjustMapAspectRatio(); // Erste Anpassung der Höhe vor Karteninitialisierung

    const mapDivElement = this.mapDiv.nativeElement;
    const rect = mapDivElement.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) {
      setTimeout(() => {
        if (!this.map && this.mapDiv?.nativeElement) { // Nur erneut versuchen, wenn Karte noch nicht erstellt wurde
          this.initMapInternal();
        }
      }, MAP_RETRY_INIT_TIMEOUT);
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      try {
        this.map = new google.maps.Map(mapDivElement, {
          center: this.mapOptions.initialCenter,
          zoom: this.mapOptions.initialZoom,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          styles: this.mapOptions.styles?.length ? this.mapOptions.styles : undefined
        });
      } catch (e) {
        this.map = null;
        this.ngZone.run(() => this.loading.emit(false));
        return;
      }
    });

    if (!this.map) return;

    if (this.loadingIndicatorDiv?.nativeElement) {
      this.loadingIndicatorDiv.nativeElement.style.display = 'flex';
    }

    this.geoXmlParser = new geoXML3.parser({
      map: this.map,
      suppressInfoWindows: true,
      singleInfoWindow: true,
      processStyles: true,
      afterParse: (docs: any) => this.ngZone.run(() => {
        if (this.loadingIndicatorDiv?.nativeElement) {
          this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        }
        this.loading.emit(false);
        if (docs?.[0]?.placemarks?.length > 0) {
          this.allPlacemarks = docs[0].placemarks;
          this.setupPlacemarkInteractions(this.allPlacemarks);
          this.applyAllMapHighlights();
          if (this.zoomToPlzIdList && this.zoomToPlzIdList.length > 0) {
            this.handleZoomToPlzList(this.zoomToPlzIdList);
          } else if (this.selectedPlzIds && this.selectedPlzIds.length > 0) {
            this.handleZoomToPlzList(this.selectedPlzIds);
          } else {
            this.resetMapZoom();
          }
        } else {
          this.allPlacemarks = [];
        }
        this.mapReady.emit();
        this.cdr.markForCheck();
      }),
      failedParse: (error: any) => this.ngZone.run(() => {
        if (this.loadingIndicatorDiv?.nativeElement) {
          this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        }
        this.loading.emit(false);
        this.allPlacemarks = [];
        this.cdr.markForCheck();
      }),
      polygonOptions: this.mapOptions.defaultPolygonOptions
    });

    try {
      this.geoXmlParser.parse(this.kmlPath);
    } catch (e) {
      this.ngZone.run(() => this.loading.emit(false));
    }
  }

  private setupPlacemarkInteractions(placemarks: any[]): void {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return;

    placemarks.forEach((placemark) => {
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon && typeof actualPolygon.setOptions === 'function') {
        const plzInfo = this.extractPlzInfoFromPlacemark(placemark);
        google.maps.event.clearInstanceListeners(actualPolygon);
        google.maps.event.addListener(actualPolygon, 'mouseover', () => this.ngZone.runOutsideAngular(() => {
          if (!this.map) return;
          this.currentHoveredPlacemarkIdForHighlight = plzInfo.id;
          this.applyAllMapHighlights();
          if (this.hoverPlzDisplayDiv?.nativeElement && plzInfo.displayText) {
            this.hoverPlzDisplayDiv.nativeElement.textContent = plzInfo.displayText;
            this.hoverPlzDisplayDiv.nativeElement.style.display = 'block';
          }
        }));
        google.maps.event.addListener(actualPolygon, 'mouseout', () => this.ngZone.runOutsideAngular(() => {
          if (!this.map) return;
          this.currentHoveredPlacemarkIdForHighlight = null;
          this.applyAllMapHighlights();
          if (this.hoverPlzDisplayDiv?.nativeElement) {
            this.hoverPlzDisplayDiv.nativeElement.style.display = 'none';
          }
        }));
        google.maps.event.addListener(actualPolygon, 'mousemove', (event: any) => {
          if (!this.map || !this.hoverPlzDisplayDiv?.nativeElement || this.hoverPlzDisplayDiv.nativeElement.style.display !== 'block' || !event.domEvent) return;
          this.hoverPlzDisplayDiv.nativeElement.style.left = (event.domEvent.clientX + 15) + 'px';
          this.hoverPlzDisplayDiv.nativeElement.style.top = (event.domEvent.clientY + 15) + 'px';
        });
        google.maps.event.addListener(actualPolygon, 'click', () => this.ngZone.run(() => {
          if (this.map && plzInfo.id) {
            this.plzClicked.emit({ id: plzInfo.id, name: placemark.name });
          }
        }));
      }
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
    return { id: plz6, displayText: `PLZ ${plz6.substring(0, 4)}` };
  }

  public applyAllMapHighlights(): void {
    if (!this.map || !this.allPlacemarks || this.allPlacemarks.length === 0 || !isPlatformBrowser(this.platformId)) return;

    const selectedSet = new Set(this.selectedPlzIds);
    const hoverSet = new Set(this.highlightOnHoverPlzIds);

    this.allPlacemarks.forEach(placemark => {
      const plzInfo = this.extractPlzInfoFromPlacemark(placemark);
      const actualPolygon = placemark.polygon || placemark.gObject;

      if (actualPolygon?.setOptions && plzInfo.id) {
        let optionsToApply = { ...this.mapOptions.defaultPolygonOptions };
        const id = plzInfo.id;

        if (selectedSet.has(id)) {
          optionsToApply = (this.currentHoveredPlacemarkIdForHighlight === id || hoverSet.has(id) || this.highlightFromTablePlzId === id)
            ? { ...this.mapOptions.selectedHighlightedPolygonOptions }
            : { ...this.mapOptions.selectedPolygonOptions };
        } else if (hoverSet.has(id)) {
          optionsToApply = { ...this.mapOptions.typeaheadHoverPolygonOptions };
        } else if (this.currentHoveredPlacemarkIdForHighlight === id || this.highlightFromTablePlzId === id) {
          optionsToApply = { ...this.mapOptions.highlightedPolygonOptions };
        }
        actualPolygon.setOptions(optionsToApply);
      }
    });
    this.cdr.detectChanges();
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

  private handleZoomToSinglePlz(plzId: string): void {
    if (!this.map || !this.allPlacemarks || this.allPlacemarks.length === 0) return;
    const placemarkToZoom = this.allPlacemarks.find(p => this.extractPlzInfoFromPlacemark(p).id === plzId);
    if (placemarkToZoom) {
      const actualPolygon = placemarkToZoom.polygon || placemarkToZoom.gObject;
      if (actualPolygon && typeof google !== 'undefined' && google.maps) {
        const bounds = this.getPolygonBounds(actualPolygon);
        if (bounds && !bounds.isEmpty()) {
          this.ngZone.runOutsideAngular(() => {
            this.map.fitBounds(bounds);
            if (this.singlePolygonZoomAdjustListener) google.maps.event.removeListener(this.singlePolygonZoomAdjustListener);
            this.singlePolygonZoomAdjustListener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
              let currentZoom = this.map.getZoom();
              if (currentZoom !== undefined) this.map.setZoom(Math.max(0, currentZoom - 2));
              this.singlePolygonZoomAdjustListener = null;
            });
          });
        }
      }
    }
  }

  private handleZoomToPlzList(plzIdList: string[]): void {
    if (!this.map || !this.allPlacemarks || !this.allPlacemarks.length || plzIdList.length === 0 || typeof google === 'undefined' || !google.maps) {
      if (plzIdList.length === 0) this.resetMapZoom();
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      if (this.singlePolygonZoomAdjustListener) {
        google.maps.event.removeListener(this.singlePolygonZoomAdjustListener);
        this.singlePolygonZoomAdjustListener = null;
      }
      const totalBounds = new google.maps.LatLngBounds();
      let hasValidBounds = false;
      const idSet = new Set(plzIdList);

      this.allPlacemarks.forEach(placemark => {
        const plzInfo = this.extractPlzInfoFromPlacemark(placemark);
        if (plzInfo.id && idSet.has(plzInfo.id)) {
          const bounds = this.getPolygonBounds(placemark.polygon || placemark.gObject);
          if (bounds) {
            totalBounds.union(bounds);
            hasValidBounds = true;
          }
        }
      });

      if (hasValidBounds && !totalBounds.isEmpty()) {
        this.map.fitBounds(totalBounds);
        if (plzIdList.length === 1) {
          this.singlePolygonZoomAdjustListener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
            let currentZoom = this.map.getZoom();
            if (currentZoom !== undefined) this.map.setZoom(Math.max(0, currentZoom - 2));
            this.singlePolygonZoomAdjustListener = null;
          });
        }
      } else {
        this.resetMapZoom();
      }
    });
  }

  private resetMapZoom(): void {
    if (this.map && this.mapOptions) {
      this.ngZone.runOutsideAngular(() => {
        this.map.setCenter(this.mapOptions.initialCenter);
        this.map.setZoom(this.mapOptions.initialZoom);
      });
    }
  }

  private loadGoogleMapsScript(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!isPlatformBrowser(this.platformId)) {
        resolve();
        return;
      }
      if (typeof google !== 'undefined' && google.maps) {
        resolve();
        return;
      }
      if ((window as any).googleMapsScriptLoadingPromise) {
        (window as any).googleMapsScriptLoadingPromise.then(resolve).catch(reject);
        return;
      }
      const promise = new Promise<void>((innerResolve, innerReject) => {
        (window as any).angularGoogleMapsCallback = () => {
          try {
            if (typeof google !== 'undefined' && google.maps) {
              innerResolve();
            } else {
              innerReject(new Error("Google Maps API geladen, aber google.maps nicht gefunden."));
            }
          } catch (e) {
            innerReject(e);
          } finally {
            delete (window as any).angularGoogleMapsCallback;
          }
        };
      });
      (window as any).googleMapsScriptLoadingPromise = promise;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&callback=angularGoogleMapsCallback&libraries=visualization,geometry&language=de&region=CH`;
      script.async = true;
      script.onerror = (e) => {
        (window as any).googleMapsScriptLoadingPromise = null;
        delete (window as any).angularGoogleMapsCallback;
        reject(e);
      };
      document.head.appendChild(script);
      promise.then(resolve).catch(reject);
    });
  }

  private readonly onWindowResize = () => {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (!this.map || !isPlatformBrowser(this.platformId)) return;

      const currentWindowWidth = window.innerWidth;
      this.adjustMapAspectRatio(); // Passt die Höhe des mapDiv an und löst map.resize aus

      if (currentWindowWidth !== this.previousWindowWidth) {
        this.previousWindowWidth = currentWindowWidth;

        // Nur wenn sich die Breite ändert, den Karteninhalt (Zoom/Center) neu anpassen
        this.ngZone.runOutsideAngular(() => {
          if (this.zoomToPlzIdList && this.zoomToPlzIdList.length > 0) {
            this.handleZoomToPlzList(this.zoomToPlzIdList);
          } else if (this.selectedPlzIds && this.selectedPlzIds.length > 0) {
            this.handleZoomToPlzList(this.selectedPlzIds);
          } else {
            this.resetMapZoom();
          }
        });
        // Highlights neu anwenden (innerhalb der Angular-Zone, da cdr.detectChanges() aufgerufen wird)
        this.ngZone.run(() => {
          this.applyAllMapHighlights();
        });
      }
      // Wenn sich nur die Höhe des Fensters geändert hat, wurde die Kartenhöhe bereits durch
      // adjustMapAspectRatio angepasst. Der Inhalt (Zoom/Center) wird nicht neu berechnet.
    }, WINDOW_RESIZE_DEBOUNCE);
  };
}
