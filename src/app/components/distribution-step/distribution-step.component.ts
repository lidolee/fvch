import { Component, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ValidationStatus } from '../../app.component'; // Pfad anpassen

declare var google: any;
declare var geoXML3: any;

@Component({
  selector: 'app-distribution-step',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './distribution-step.component.html',
  styleUrls: ['./distribution-step.component.scss']
})
export class DistributionStepComponent implements AfterViewInit, OnDestroy {
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  @ViewChild('mapDiv') mapDiv!: ElementRef<HTMLElement>;
  @ViewChild('hoverPlzDisplay') hoverPlzDisplayDiv!: ElementRef<HTMLElement>;
  @ViewChild('loadingIndicator') loadingIndicatorDiv!: ElementRef<HTMLElement>;
  @ViewChild('selectedPlzInfoSpan') selectedPlzInfoSpan!: ElementRef<HTMLElement>;

  private map: any = null;
  private geoXmlParser: any;
  private allPlacemarks: any[] = [];
  public selectedPolygons = new Map<number, any>();
  public selectedPlzIdentifiers: string[] = [];

  private textInputStatus: ValidationStatus = 'invalid';

  private readonly initialMapCenter = { lat: 46.8182, lng: 8.2275 };
  private readonly initialMapZoom = 8;
  private singlePolygonZoomAdjustListener: any = null;

  private readonly defaultPolygonOptions = { strokeColor: "#0063d6", strokeOpacity: 0.1, strokeWeight: 1.5, fillColor: "#0063d6", fillOpacity: 0.02 };
  private readonly highlightedPolygonOptions = { strokeColor: "#0063d6", strokeOpacity: 0.6, strokeWeight: 2, fillColor: "#0063d6", fillOpacity: 0.3 };
  private readonly selectedPolygonOptions = { strokeColor: "#D60096", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#D60096", fillOpacity: 0.4 };
  private readonly selectedHighlightedPolygonOptions = { strokeColor: "#D60096", strokeOpacity: 0.9, strokeWeight: 2.5, fillColor: "#D60096", fillOpacity: 0.6 };

  private readonly mapStyleWithCorrectedFeatures: any[];
  private readonly googleMapsApiKey = 'AIzaSyBpa1rzAIkaSS2RAlc9frw8GAPiGC1PNwc'; // Ersetze dies mit deinem API-Schlüssel

  private resizeTimeout: any; // Für Debouncing des Resize-Events
  private readonly debouncedResizeHandler = () => {
    if (!this.map || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const timestamp = `[${new Date().toLocaleTimeString()}]`;
    console.log(`${timestamp} DistributionStep: Window resized, re-zooming map.`);
    // Google Maps kann manchmal die aktuelle Center-Position benötigen, um resize korrekt zu handhaben
    const center = this.map.getCenter();
    google.maps.event.trigger(this.map, 'resize');
    if (center) {
      this.map.setCenter(center);
    }
    this.zoomToSelectedPolygons(); // Oder eine andere Logik zum Anpassen des Zooms/Zentrums
  };

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.mapStyleWithCorrectedFeatures = [
      { "stylers": [ { "saturation": -60 } ] },
      { "featureType": "water", "elementType": "geometry", "stylers": [ { "visibility": "on" }, { "color": "#66ccff" } ] },
      { "featureType": "landscape.natural", "elementType": "geometry", "stylers": [ { "color": "#f0f0f0" } ] },
      { "featureType": "landscape.natural", "elementType": "labels", "stylers": [ { "visibility": "off" } ] },
      { "featureType": "landscape.man_made", "elementType": "geometry.fill", "stylers": [ { "visibility": "on" }, { "color": "#e0e0e0" } ]},
      { "featureType": "landscape.man_made", "elementType": "geometry.stroke", "stylers": [ { "visibility": "on" }, { "color": "#c9c9c9" } ]},
      { "featureType": "road", "elementType": "geometry", "stylers": [ { "color": "#ffffff" } ] },
      { "featureType": "road", "elementType": "labels.text.fill", "stylers": [ { "color": "#525252" }, {"visibility": "on"} ] },
      { "featureType": "administrative", "elementType": "labels.text.fill", "stylers": [ { "color": "#525252" }, {"visibility": "on"} ]},
      { "elementType": "labels.icon", "stylers": [ { "visibility": "off" } ] },
      { "featureType": "administrative", "elementType": "geometry.stroke", "stylers": [ { "visibility": "off" } ] },
      { "featureType": "administrative.country", "elementType": "geometry.stroke", "stylers": [ { "color": "#777777" }, { "weight": 1.8 }, { "visibility": "on" } ]},
      { "featureType": "administrative.province", "elementType": "geometry.stroke", "stylers": [ { "color": "#999999" }, { "weight": 1.2 }, { "visibility": "on" } ]},
      { "featureType": "poi", "stylers": [ { "visibility": "off" } ] },
      { "featureType": "transit", "stylers": [ { "visibility": "off" } ] }
    ];
  }

  ngAfterViewInit(): void {
    const timestamp = `[${new Date().toLocaleTimeString()}]`;
    console.log(`${timestamp} DistributionStep: ngAfterViewInit. User: lidolee. Platform is browser: ${isPlatformBrowser(this.platformId)}`);
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        this.ngZone.run(() => {
          console.log(`${timestamp} DistributionStep: Attempting map setup after timeout.`);
          this.initializeMapAndGeoXml();
        });
      }, 150);
      // Resize-Listener hinzufügen
      window.addEventListener('resize', this.onWindowResize.bind(this));
    }
    Promise.resolve().then(() => {
      this.ngZone.run(() => {
        this.updateOverallValidationState();
      });
    });
  }

  private onWindowResize(): void {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(this.debouncedResizeHandler, 250); // 250ms debounce time
  }

  private initializeMapAndGeoXml(): void {
    const timestamp = `[${new Date().toLocaleTimeString()}]`;
    console.log(`${timestamp} DistributionStep: initializeMapAndGeoXml called.`);
    if (this.map) {
      console.warn(`${timestamp} DistributionStep: Map already initialized. Skipping.`);
      return;
    }

    this.loadGoogleMapsScript().then(() => {
      console.log(`${timestamp} DistributionStep: Google Maps script reported as loaded.`);
      if (typeof google !== 'undefined' && google.maps && typeof geoXML3 !== 'undefined' && geoXML3.parser) {
        console.log(`${timestamp} DistributionStep: google.maps and geoXML3.parser confirmed. Proceeding with initMapInternal.`);
        this.initMapInternal();
      } else {
        let errorMsg = `${timestamp} DistributionStep: Pre-init check failed. `;
        if (!(typeof google !== 'undefined' && google.maps)) errorMsg += 'google.maps not available. ';
        if (!(typeof geoXML3 !== 'undefined' && geoXML3.parser)) errorMsg += 'geoXML3.parser not available. ';
        console.error(errorMsg, 'Current google:', (window as any).google, 'Current geoXML3:', (window as any).geoXML3);
      }
    }).catch(err => {
      console.error(`${timestamp} DistributionStep: Error loading Google Maps script:`, err);
    });
  }

  updateLocalValidationStatus(statusFromInput: ValidationStatus): void {
    this.textInputStatus = statusFromInput;
    this.updateOverallValidationState();
  }

  setExampleStatus(status: ValidationStatus): void {
    if (status === 'valid') {
      this.textInputStatus = 'valid';
    } else if (status === 'pending') {
      this.textInputStatus = 'pending';
    } else {
      this.textInputStatus = 'invalid';
    }
    this.updateOverallValidationState();
  }

  private updateOverallValidationState(): void {
    const mapHasSelection = this.selectedPlzIdentifiers.length > 0;
    let newOverallStatus: ValidationStatus = 'invalid';

    if (this.textInputStatus === 'valid' || mapHasSelection) {
      newOverallStatus = 'valid';
    } else if (this.textInputStatus === 'pending' && !mapHasSelection) {
      newOverallStatus = 'pending';
    }
    this.validationChange.emit(newOverallStatus);
  }

  proceedToNextStep(): void {
    const mapHasSelection = this.selectedPlzIdentifiers.length > 0;
    let currentOverallStatus: ValidationStatus = 'invalid';

    if (this.textInputStatus === 'valid' || mapHasSelection) {
      currentOverallStatus = 'valid';
    } else if (this.textInputStatus === 'pending' && !mapHasSelection) {
      currentOverallStatus = 'pending';
    }

    this.validationChange.emit(currentOverallStatus);

    if (currentOverallStatus === 'valid') {
      this.nextStepRequest.emit();
    } else {
      const message = currentOverallStatus === 'pending' ?
        "Bitte vervollständigen Sie Ihre Eingabe für das Zielgebiet oder wählen Sie PLZ-Gebiete auf der Karte aus, um fortzufahren." :
        "Eingabe für Zielgebiet ist ungültig und keine PLZ-Gebiete auf der Karte ausgewählt. Bitte korrigieren Sie Ihre Eingabe.";

      if (isPlatformBrowser(this.platformId)) {
        alert(message);
      } else {
        console.warn("SSR Warning:", message);
      }
    }
  }

  private loadGoogleMapsScript(): Promise<void> {
    const timestamp = `[${new Date().toLocaleTimeString()}]`;
    console.log(`${timestamp} DistributionStep: loadGoogleMapsScript called.`);
    return new Promise((resolve, reject) => {
      if (!isPlatformBrowser(this.platformId)) {
        console.log(`${timestamp} DistributionStep: Not in browser, resolving loadGoogleMapsScript immediately.`);
        resolve();
        return;
      }
      if (typeof google !== 'undefined' && google.maps) {
        console.log(`${timestamp} DistributionStep: Google Maps API already loaded.`);
        resolve();
        return;
      }
      if ((window as any).googleMapsScriptLoading) {
        console.warn(`${timestamp} DistributionStep: Google Maps script is already in the process of loading. Waiting for existing load to complete.`);
        if ((window as any).resolveGoogleMapsPromise && (window as any).rejectGoogleMapsPromise) {
          (window as any).resolveGoogleMapsPromise = resolve;
          (window as any).rejectGoogleMapsPromise = reject;
        } else {
          console.error(`${timestamp} DistributionStep: Inconsistent state for googleMapsScriptLoading.`);
          reject(new Error("Inconsistent state for Google Maps script loading."));
        }
        return;
      }

      (window as any).googleMapsScriptLoading = true;
      (window as any).resolveGoogleMapsPromise = resolve;
      (window as any).rejectGoogleMapsPromise = reject;

      (window as any).angularGoogleMapsCallback = () => {
        const cbTimestamp = `[${new Date().toLocaleTimeString()}]`;
        console.log(`${cbTimestamp} DistributionStep: angularGoogleMapsCallback fired.`);
        delete (window as any).googleMapsScriptLoading;
        if ((window as any).google && (window as any).google.maps) {
          console.log(`${cbTimestamp} DistributionStep: google.maps confirmed in callback.`);
          if((window as any).resolveGoogleMapsPromise) (window as any).resolveGoogleMapsPromise();
        } else {
          console.error(`${cbTimestamp} DistributionStep: Google Maps API script loaded, but google.maps not found in callback.`);
          if((window as any).rejectGoogleMapsPromise) (window as any).rejectGoogleMapsPromise(new Error("Google Maps API script loaded, but google.maps not found in callback."));
        }
        delete (window as any).angularGoogleMapsCallback;
        delete (window as any).resolveGoogleMapsPromise;
        delete (window as any).rejectGoogleMapsPromise;
      };

      console.log(`${timestamp} DistributionStep: Appending Google Maps script to head.`);
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.googleMapsApiKey}&callback=angularGoogleMapsCallback&libraries=visualization,geometry`;
      script.async = true;
      script.defer = true;
      script.onerror = (e) => {
        const errTimestamp = `[${new Date().toLocaleTimeString()}]`;
        delete (window as any).googleMapsScriptLoading;
        console.error(`${errTimestamp} DistributionStep: Google Maps script loading error:`, e);
        if((window as any).rejectGoogleMapsPromise) (window as any).rejectGoogleMapsPromise(e);
        delete (window as any).angularGoogleMapsCallback;
        delete (window as any).resolveGoogleMapsPromise;
        delete (window as any).rejectGoogleMapsPromise;
      };
      document.head.appendChild(script);
    });
  }

  private initMapInternal(): void {
    const timestamp = `[${new Date().toLocaleTimeString()}]`;
    console.log(`${timestamp} DistributionStep: initMapInternal called.`);
    if (!isPlatformBrowser(this.platformId) || !this.mapDiv || !this.mapDiv.nativeElement) {
      console.error(`${timestamp} DistributionStep: initMapInternal - cannot proceed. Not browser or mapDiv not ready. mapDiv:`, this.mapDiv);
      return;
    }
    if (typeof google === 'undefined' || !google.maps) {
      console.error(`${timestamp} DistributionStep: initMapInternal - google.maps not available at time of map instantiation.`);
      return;
    }
    if (typeof geoXML3 === 'undefined' || !geoXML3.parser) {
      console.error(`${timestamp} DistributionStep: initMapInternal - geoXML3.parser not available at time of KML parsing setup.`);
      return;
    }
    if (this.map) {
      console.warn(`${timestamp} DistributionStep: Map is already initialized. Skipping.`);
      return;
    }

    const mapDivEl = this.mapDiv.nativeElement;
    const mapDivStyle = window.getComputedStyle(mapDivEl);
    if (parseInt(mapDivStyle.height, 10) === 0 || parseInt(mapDivStyle.width, 10) === 0) {
      console.warn(`${timestamp} DistributionStep: mapDiv (#${mapDivEl.id || 'map-angular'}) has zero height or width. Height: ${mapDivStyle.height}, Width: ${mapDivStyle.width}. Map may not be visible. Ensure CSS provides dimensions.`);
    } else {
      console.log(`${timestamp} DistributionStep: mapDiv dimensions: Height: ${mapDivStyle.height}, Width: ${mapDivStyle.width}`);
    }

    this.ngZone.runOutsideAngular(() => {
      console.log(`${timestamp} DistributionStep: Initializing Google Map in div:`, this.mapDiv.nativeElement);
      this.map = new google.maps.Map(mapDivEl, {
        center: this.initialMapCenter,
        zoom: this.initialMapZoom,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        styles: this.mapStyleWithCorrectedFeatures
      });
      console.log(`${timestamp} DistributionStep: this.map object after initialization:`, this.map ? 'Map object created' : 'Map object FAILED to create');
    });

    if (this.loadingIndicatorDiv && this.loadingIndicatorDiv.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'flex';

    const kmlFileUrl = 'assets/ch_plz.kml';
    console.log(`${timestamp} DistributionStep: Attempting to parse KML from:`, kmlFileUrl);

    this.geoXmlParser = new geoXML3.parser({
      map: this.map,
      suppressInfoWindows: true,
      singleInfoWindow: true,
      processStyles: true,
      afterParse: (docs: any) => this.ngZone.run(() => {
        const cbTimestamp = `[${new Date().toLocaleTimeString()}]`;
        console.log(`${cbTimestamp} DistributionStep: KML afterParse. Docs found:`, docs && docs.length > 0 && docs[0].placemarks ? docs[0].placemarks.length : 0);
        if (this.loadingIndicatorDiv && this.loadingIndicatorDiv.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        if (docs && docs.length > 0 && docs[0].placemarks) {
          this.allPlacemarks = docs[0].placemarks;
          this.setupPlacemarkInteractions(this.allPlacemarks, this.hoverPlzDisplayDiv?.nativeElement);
        } else {
          console.error(`${cbTimestamp} DistributionStep: KML-Parse-Fehler oder keine Placemarks (Browser).`);
        }
        this.updateOverallValidationState();
      }),
      failedParse: (error: any) => this.ngZone.run(() => {
        const cbTimestamp = `[${new Date().toLocaleTimeString()}]`;
        if (this.loadingIndicatorDiv && this.loadingIndicatorDiv.nativeElement) this.loadingIndicatorDiv.nativeElement.style.display = 'none';
        console.error(`${cbTimestamp} DistributionStep: KML failedParse. Error:`, error, 'URL:', kmlFileUrl);
        this.updateOverallValidationState();
      }),
      polygonOptions: this.defaultPolygonOptions
    });
    this.geoXmlParser.parse(kmlFileUrl);
  }

  private extractPlzInfoFromPlacemark(placemark: any, forDisplay = true): string | null {
    let plz: string | null = null;
    if (!placemark) {
      return forDisplay ? "N/A" : null;
    }

    if (placemark.name) {
      plz = String(placemark.name).trim();
    }

    if (forDisplay) {
      let displayText = "PLZ: N/A";
      if (plz) {
        if (plz.length === 6 && /^\d+$/.test(plz)) {
          displayText = `PLZ: ${plz.substring(0, 4)}`;
        } else {
          displayText = `PLZ: ${plz}`;
        }
      } else if (placemark.description) {
        displayText = `Beschreibung: ${placemark.description.substring(0, 30)}`;
      }
      return displayText;
    } else {
      return plz;
    }
  }

  private updateSelectedPlzInfo(): void {
    if (!isPlatformBrowser(this.platformId) || !this.selectedPlzInfoSpan || !this.selectedPlzInfoSpan.nativeElement) return;
    this.selectedPlzInfoSpan.nativeElement.textContent = this.selectedPlzIdentifiers.length === 0 ?
      "Keine" : this.selectedPlzIdentifiers.sort().join(', ');
  }

  private getPolygonBounds(polygon: any): google.maps.LatLngBounds | null {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return null;
    const bounds = new google.maps.LatLngBounds();
    const paths = polygon.getPaths();
    paths.forEach((path: any) => {
      const ar = path.getArray();
      for (let i = 0, l = ar.length; i < l; i++) {
        bounds.extend(ar[i]);
      }
    });
    return bounds;
  }

  private zoomToSelectedPolygons(): void {
    if (!isPlatformBrowser(this.platformId) || !this.map || typeof google === 'undefined' || !google.maps) return;

    this.ngZone.runOutsideAngular(() => {
      if (this.singlePolygonZoomAdjustListener) {
        google.maps.event.removeListener(this.singlePolygonZoomAdjustListener);
        this.singlePolygonZoomAdjustListener = null;
      }

      const totalBounds = new google.maps.LatLngBounds();
      let hasSelected = false;

      this.selectedPolygons.forEach(placemark => {
        const actualPolygon = placemark.polygon || placemark.gObject;
        if (actualPolygon) {
          const bounds = this.getPolygonBounds(actualPolygon);
          if (bounds) {
            totalBounds.union(bounds);
            hasSelected = true;
          }
        }
      });

      if (hasSelected && !totalBounds.isEmpty()) {
        this.map.fitBounds(totalBounds);
        if (this.selectedPolygons.size === 1) {
          this.singlePolygonZoomAdjustListener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
            let currentZoom = this.map.getZoom();
            if (currentZoom !== undefined) {
              this.map.setZoom(Math.max(0, currentZoom - 2));
            }
            this.singlePolygonZoomAdjustListener = null;
          });
        }
      } else {
        this.map.setCenter(this.initialMapCenter);
        this.map.setZoom(this.initialMapZoom);
      }
    });
  }

  private togglePolygonSelection(placemark: any, placemarkIndex: number): void {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return;

    const actualPolygon = placemark.polygon || placemark.gObject;
    if (!actualPolygon) return;

    const plzIdentifier = this.extractPlzInfoFromPlacemark(placemark, false);
    if (!plzIdentifier) return;

    this.ngZone.runOutsideAngular(() => {
      if (this.selectedPolygons.has(placemarkIndex)) {
        this.selectedPolygons.delete(placemarkIndex);
        actualPolygon.setOptions(this.defaultPolygonOptions);
        const indexInArray = this.selectedPlzIdentifiers.indexOf(plzIdentifier);
        if (indexInArray > -1) this.selectedPlzIdentifiers.splice(indexInArray, 1);
      } else {
        this.selectedPolygons.set(placemarkIndex, placemark);
        actualPolygon.setOptions(this.selectedPolygonOptions);
        if (!this.selectedPlzIdentifiers.includes(plzIdentifier)) {
          this.selectedPlzIdentifiers.push(plzIdentifier);
        }
      }
    });

    this.ngZone.run(() => {
      this.updateSelectedPlzInfo();
      this.updateOverallValidationState();
    });
  }

  private setupPlacemarkInteractions(placemarks: any[], hoverPlzDisplayElement?: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId) || typeof google === 'undefined' || !google.maps) return;
    const timestamp = `[${new Date().toLocaleTimeString()}]`;
    console.log(`${timestamp} DistributionStep: setupPlacemarkInteractions. Placemarks: ${placemarks.length}. Hover element: ${hoverPlzDisplayElement ? 'present' : 'absent'}`);

    placemarks.forEach((placemark, index) => {
      const actualPolygon = placemark.polygon || placemark.gObject;
      if (actualPolygon && typeof actualPolygon.setOptions === 'function') {
        google.maps.event.addListener(actualPolygon, 'mouseover', () => this.ngZone.runOutsideAngular(() => {
          if (this.selectedPolygons.has(index)) {
            actualPolygon.setOptions(this.selectedHighlightedPolygonOptions);
          } else {
            actualPolygon.setOptions(this.highlightedPolygonOptions);
          }
          if (hoverPlzDisplayElement) {
            hoverPlzDisplayElement.textContent = `${this.extractPlzInfoFromPlacemark(placemark, true)}`;
            hoverPlzDisplayElement.style.display = 'block';
          }
        }));

        google.maps.event.addListener(actualPolygon, 'mouseout', () => this.ngZone.runOutsideAngular(() => {
          if (this.selectedPolygons.has(index)) {
            actualPolygon.setOptions(this.selectedPolygonOptions);
          } else {
            actualPolygon.setOptions(this.defaultPolygonOptions);
          }
          if (hoverPlzDisplayElement) {
            hoverPlzDisplayElement.style.display = 'none';
          }
        }));

        google.maps.event.addListener(actualPolygon, 'mousemove', (event: any) => {
          if (hoverPlzDisplayElement && hoverPlzDisplayElement.style.display === 'block' && event.domEvent) {
            let x = event.domEvent.clientX;
            let y = event.domEvent.clientY;
            hoverPlzDisplayElement.style.left = (x + 15) + 'px';
            hoverPlzDisplayElement.style.top = (y + 15) + 'px';
          }
        });

        google.maps.event.addListener(actualPolygon, 'click', () => this.ngZone.run(() => {
          this.togglePolygonSelection(placemark, index);
          this.zoomToSelectedPolygons();
        }));
      }
    });
  }

  ngOnDestroy(): void {
    const timestamp = `[${new Date().toLocaleTimeString()}]`;
    console.log(`${timestamp} DistributionStep: ngOnDestroy called.`);
    if (isPlatformBrowser(this.platformId)) {
      // Resize-Listener entfernen
      window.removeEventListener('resize', this.onWindowResize.bind(this)); // Wichtig: .bind(this) verwenden, um die gleiche Referenz zu entfernen
      clearTimeout(this.resizeTimeout); // Eventuellen laufenden Timeout löschen

      if (this.singlePolygonZoomAdjustListener && typeof google !== 'undefined' && google.maps) {
        google.maps.event.removeListener(this.singlePolygonZoomAdjustListener);
        this.singlePolygonZoomAdjustListener = null;
      }
      if (this.map && typeof google !== 'undefined' && google.maps) {
        console.log(`${timestamp} DistributionStep: Clearing map listeners and nullifying map.`);
        google.maps.event.clearInstanceListeners(this.map);
      }
      this.map = null;

      this.allPlacemarks.forEach(placemark => {
        const actualPolygon = placemark.polygon || placemark.gObject;
        if (actualPolygon && typeof google !== 'undefined' && google.maps) {
          google.maps.event.clearInstanceListeners(actualPolygon);
        }
      });
      if ((window as any).googleMapsScriptLoading) {
        delete (window as any).googleMapsScriptLoading;
        delete (window as any).angularGoogleMapsCallback;
        delete (window as any).resolveGoogleMapsPromise;
        delete (window as any).rejectGoogleMapsPromise;
      }
    }
  }
}
