import {
  Component, Input, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
// *** FIX: Added 'take' to the imports ***
import { concatMap, takeUntil, take } from 'rxjs/operators';

declare var google: any;
declare var geoXML3: any;

const MAP_INIT_RETRY_DELAY_MS = 250;
const MAX_MAP_INIT_ATTEMPTS = 25;
const WINDOW_RESIZE_DEBOUNCE_MS = 250;

// --- NEW COMMAND ARCHITECTURE ---
type MapCommandType = 'PROCESS_UPDATES' | 'RESIZE';
interface MapCommand {
  type: MapCommandType;
  payload?: any;
}

// *** FIX: Re-added the module-level singleton promise ***
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
  private placemarkMap = new Map<string, any>();
  private destroy$ = new Subject<void>();
  private resizeTimeoutId: any;
  private previouslyStyledPlacemarkIds = new Set<string>();

  private mapInitializationScheduled = false;
  public mapInitAttempts = 0;
  private mapInitRetryTimer: any = null;
  public mapIsLoadingInternal = false;
  private kmlDataLoaded: boolean = false;

  private commandQueue$ = new Subject<MapCommand>();
  private commandProcessorSubscription: Subscription | null = null;

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.commandProcessorSubscription = this.commandQueue$.pipe(
        takeUntil(this.destroy$),
        concatMap(command => this.executeCommand(command))
      ).subscribe();
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => this.scheduleMapInitialization());
        window.addEventListener('resize', this.onWindowResize);
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.kmlDataLoaded) {
      this.commandQueue$.next({ type: 'PROCESS_UPDATES' });
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

  private async executeCommand(command: MapCommand): Promise<void> {
    if (!this.map || !this.kmlDataLoaded) return;

    switch (command.type) {
      case 'PROCESS_UPDATES':
        this.applyAllMapHighlights();
        if (this.zoomToPlzId) {
          await this.handleZoomToSinglePlz(this.zoomToPlzId);
        } else if (this.zoomToPlzIdList && this.zoomToPlzIdList.length > 0) {
          await this.handleZoomToPlzList(this.zoomToPlzIdList);
        } else if (this.selectedPlzIds.length === 0) {
          await this.resetMapZoom();
        }
        break;
      case 'RESIZE':
        await this.handleResize();
        break;
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
      if (this.map || !this.mapDivRef?.nativeElement) {
        this.mapInitializationScheduled = false;
        this.setInternalLoadingState(false);
        return;
      }
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => this.ngZone.run(() => this.initializeMapAndGeoXml()));
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
    this.placemarkMap.clear();
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
    }).catch(() => {
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
    const mapDivElement = this.mapDivRef?.nativeElement;
    if (!mapDivElement) {
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
          restriction: { latLngBounds: { north: 47.8084, south: 45.818, west: 5.9563, east: 10.4921 }, strictBounds: false }
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
        suppressInfoWindows: true,
        singleInfoWindow: true,
        processStyles: true,
        afterParse: (docs: any) => this.ngZone.run(() => {
          if (docs?.[0]?.placemarks?.length > 0) {
            this.allPlacemarks = docs[0].placemarks;
            this.setupPlacemarkInteractions(this.allPlacemarks);
          } else {
            this.allPlacemarks = [];
          }
          this.kmlDataLoaded = true;
          this.setInternalLoadingState(false);
          this.mapReady.emit();
          this.commandQueue$.next({ type: 'PROCESS_UPDATES' });
        }),
        failedParse: () => this.ngZone.run(() => {
          this.setInternalLoadingState(false);
          this.allPlacemarks = [];
          this.kmlDataLoaded = false;
          this.mapInitializationScheduled = false;
        }),
        polygonOptions: this.mapOptions.defaultPolygonOptions
      });

      try { this.geoXmlParser.parse(this.kmlPath); }
      catch (e) {
        this.ngZone.run(() => {
          this.setInternalLoadingState(false);
          this.kmlDataLoaded = false;
          this.mapInitializationScheduled = false;
        });
      }
    });
  }

  private setupPlacemarkInteractions(placemarks: any[]): void {
    this.placemarkMap.clear();
    this.ngZone.runOutsideAngular(() => {
      placemarks.forEach((placemark) => {
        const plzInfo = this.extractPlzInfoFromPlacemark(placemark);
        if (plzInfo.id) {
          this.placemarkMap.set(plzInfo.id, placemark);
          const actualPolygon = placemark.polygon || placemark.gObject;
          if (actualPolygon?.setOptions) {
            google.maps.event.clearInstanceListeners(actualPolygon);
            google.maps.event.addListener(actualPolygon, 'mouseover', (event: any) => {
              this.applyAllMapHighlights(plzInfo.id);
              if (this.hoverPlzDisplayRef?.nativeElement && plzInfo.displayText) {
                this.hoverPlzDisplayRef.nativeElement.textContent = plzInfo.displayText;
                this.hoverPlzDisplayRef.nativeElement.style.display = 'block';
                this.hoverPlzDisplayRef.nativeElement.style.left = (event.domEvent.clientX + 15) + 'px';
                this.hoverPlzDisplayRef.nativeElement.style.top = (event.domEvent.clientY + 15) + 'px';
              }
            });
            google.maps.event.addListener(actualPolygon, 'mouseout', () => {
              this.applyAllMapHighlights();
              if (this.hoverPlzDisplayRef?.nativeElement) {
                this.hoverPlzDisplayRef.nativeElement.style.display = 'none';
              }
            });
            google.maps.event.addListener(actualPolygon, 'mousemove', (event: any) => {
              if (this.hoverPlzDisplayRef?.nativeElement?.style.display === 'block' && event.domEvent) {
                this.hoverPlzDisplayRef.nativeElement.style.left = (event.domEvent.clientX + 15) + 'px';
                this.hoverPlzDisplayRef.nativeElement.style.top = (event.domEvent.clientY + 15) + 'px';
              }
            });
            google.maps.event.addListener(actualPolygon, 'click', () => this.ngZone.run(() => {
              this.plzClicked.emit({ id: plzInfo.id!, name: placemark.name });
            }));
          }
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
      if (descriptionMatch?.[1]) plz6 = descriptionMatch[1];
    }
    if (!plz6) return { id: null, displayText: null };
    const plz4 = plz6.length >= 4 ? plz6.substring(0, 4) : plz6;
    return { id: plz6, displayText: `PLZ ${plz4}` };
  }

  private applyAllMapHighlights(currentMouseOverId: string | null = null): void {
    if (!this.map || !this.kmlDataLoaded) return;

    this.ngZone.runOutsideAngular(() => {
      const selectedSet = new Set(this.selectedPlzIds);
      const hoverSet = new Set(this.highlightOnHoverPlzIds || []);
      const newStyledIds = new Set<string>();

      selectedSet.forEach(id => newStyledIds.add(id));
      hoverSet.forEach(id => newStyledIds.add(id));
      if (this.highlightFromTablePlzId) newStyledIds.add(this.highlightFromTablePlzId);
      if (currentMouseOverId) newStyledIds.add(currentMouseOverId);

      this.previouslyStyledPlacemarkIds.forEach(id => {
        if (!newStyledIds.has(id)) {
          const placemark = this.placemarkMap.get(id);
          const polygon = placemark?.polygon || placemark?.gObject;
          if (polygon?.setOptions) {
            polygon.setOptions(this.mapOptions.defaultPolygonOptions);
          }
        }
      });

      newStyledIds.forEach(id => {
        const placemark = this.placemarkMap.get(id);
        const polygon = placemark?.polygon || placemark?.gObject;
        if (polygon?.setOptions) {
          const isSelected = selectedSet.has(id);
          const isHovered = currentMouseOverId === id || hoverSet.has(id) || this.highlightFromTablePlzId === id;
          let optionsToApply = this.mapOptions.defaultPolygonOptions;
          if (isSelected) {
            optionsToApply = isHovered ? this.mapOptions.selectedHighlightedPolygonOptions : this.mapOptions.selectedPolygonOptions;
          } else if (isHovered) {
            optionsToApply = hoverSet.has(id) ? this.mapOptions.typeaheadHoverPolygonOptions : this.mapOptions.highlightedPolygonOptions;
          }
          polygon.setOptions(optionsToApply);
        }
      });
      this.previouslyStyledPlacemarkIds = newStyledIds;
    });
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

  private animateTo(bounds: google.maps.LatLngBounds): Promise<void> {
    return new Promise(resolve => {
      if (!this.map) return resolve();
      this.ngZone.runOutsideAngular(() => {
        google.maps.event.trigger(this.map, 'resize');
        this.map.panTo(bounds.getCenter());
        const listener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
          this.map.fitBounds(bounds, 15);
          const finalListener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
            resolve();
          });
          setTimeout(() => google.maps.event.removeListener(finalListener), 2000);
        });
        setTimeout(() => google.maps.event.removeListener(listener), 2000);
      });
    });
  }

  private async handleZoomToSinglePlz(plzId: string): Promise<void> {
    if (!this.map || !this.kmlDataLoaded) return;
    const placemark = this.placemarkMap.get(plzId);
    const polygon = placemark?.polygon || placemark?.gObject;
    if (polygon) {
      const bounds = this.getPolygonBounds(polygon);
      if (bounds) await this.animateTo(bounds);
    }
  }

  private async handleZoomToPlzList(plzIdList: string[]): Promise<void> {
    if (!this.map || !this.kmlDataLoaded || plzIdList.length === 0) return;

    const totalBounds = new google.maps.LatLngBounds();
    let foundPlacemarksForBounds = 0;
    plzIdList.forEach(id => {
      const placemark = this.placemarkMap.get(id);
      const polygon = placemark?.polygon || placemark?.gObject;
      if (polygon) {
        const bounds = this.getPolygonBounds(polygon);
        if (bounds) {
          totalBounds.union(bounds);
          foundPlacemarksForBounds++;
        }
      }
    });

    if (foundPlacemarksForBounds > 0 && !totalBounds.isEmpty()) {
      await this.animateTo(totalBounds);
    }
  }

  private async resetMapZoom(): Promise<void> {
    return new Promise(resolve => {
      if (this.map && this.mapOptions) {
        this.ngZone.runOutsideAngular(() => {
          this.map.panTo(this.mapOptions.initialCenter);
          const listener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
            this.map.setZoom(this.mapOptions.initialZoom);
            const finalListener = google.maps.event.addListenerOnce(this.map, 'idle', () => resolve());
            setTimeout(() => google.maps.event.removeListener(finalListener), 2000);
          });
          setTimeout(() => google.maps.event.removeListener(listener), 2000);
        });
      } else {
        resolve();
      }
    });
  }

  private loadGoogleMapsScriptOnce(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) return Promise.resolve();
    if (googleMapsScriptLoadingPromise) return googleMapsScriptLoadingPromise;

    googleMapsScriptLoadingPromise = new Promise<void>((resolve, reject) => {
      const callbackName = `angularGoogleMapsCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      (window as any)[callbackName] = () => {
        try {
          if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
            resolve();
          } else {
            reject(new Error("Google Maps API or geoXML3 not in global scope after callback."));
          }
        } catch (e) { reject(e); }
        finally { try { delete (window as any)[callbackName]; } catch (e) {} }
      };

      const geoXmlScriptPath = 'assets/js/geoxml3.js';
      const mapsScriptSrc = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=visualization,geometry&language=de&region=CH`;

      const loadGeoXmlAndResolve = () => {
        const geoScript = document.createElement('script');
        geoScript.src = geoXmlScriptPath;
        geoScript.async = true;
        geoScript.defer = true;
        geoScript.onload = () => {
          if (typeof (window as any)[callbackName] === 'function') (window as any)[callbackName]();
          else reject(new Error("Original Google Maps callback not found after geoXML3 load."));
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

  private async handleResize(): Promise<void> {
    return new Promise(resolve => {
      if (!this.map || !this.kmlDataLoaded) return resolve();
      const center = this.map.getCenter();
      google.maps.event.trigger(this.map, 'resize');
      if (center) this.map.setCenter(center);
      this.commandQueue$.next({ type: 'PROCESS_UPDATES' });
      resolve();
    });
  }

  private readonly onWindowResize = (): void => {
    clearTimeout(this.resizeTimeoutId);
    this.resizeTimeoutId = setTimeout(() => {
      this.commandQueue$.next({ type: 'RESIZE' });
    }, WINDOW_RESIZE_DEBOUNCE_MS);
  };
}
