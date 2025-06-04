import {
  Component, OnInit, AfterViewInit, OnDestroy, ViewChild, Output, EventEmitter,
  Inject, PLATFORM_ID, NgZone, ChangeDetectorRef, Input, OnChanges, SimpleChanges, ElementRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';
import { Router } from '@angular/router';

import { PlzDataService, PlzEntry, EnhancedSearchResultItem } from '../../services/plz-data.service';
import { SelectionService } from '../../services/selection.service';
import { MapOptions, MapComponent } from '../map/map.component';
import { SearchInputComponent, SimpleValidationStatus } from '../search-input/search-input.component';
import { PlzSelectionTableComponent } from '../plz-selection-table/plz-selection-table.component';
import { ValidationStatus as OfferProcessValidationStatus } from '../offer-process/offer-process.component';

export interface TableHighlightEvent {
  plzId: string | null;
  highlight: boolean;
}
type VerteilungTypOption = 'Nach PLZ' | 'Nach Perimeter';
type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';
type OverallValidationStatus = OfferProcessValidationStatus;


const COLUMN_HIGHLIGHT_DURATION = 1500;

@Component({
  selector: 'app-distribution-step',
  templateUrl: './distribution-step.component.html',
  styleUrls: ['./distribution-step.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SearchInputComponent,
    MapComponent,
    PlzSelectionTableComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DistributionStepComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() initialStadt: string | undefined;

  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<OverallValidationStatus>();

  @ViewChild(SearchInputComponent) searchInputComponent!: SearchInputComponent;
  @ViewChild(MapComponent) mapComponent!: MapComponent;
  @ViewChild('mapView') mapViewRef!: ElementRef<HTMLDivElement>;

  private destroy$ = new Subject<void>();

  public searchInputInitialTerm: string = '';
  public searchInputStatus: SimpleValidationStatus = 'empty';

  selectedEntries$: Observable<PlzEntry[]>;
  currentVerteilungTyp: VerteilungTypOption = 'Nach PLZ';
  showPlzUiContainer: boolean = true;
  showPerimeterUiContainer: boolean = false;
  currentZielgruppe: ZielgruppeOption = 'Alle Haushalte';
  highlightFlyerMaxColumn: boolean = false;

  verteilungStartdatum: string = '';
  minVerteilungStartdatum: string = '';
  showExpressSurcharge: boolean = false;
  expressSurchargeConfirmed: boolean = false;
  public defaultStandardStartDate!: Date;

  public mapSelectedPlzIds: string[] = [];
  public mapZoomToPlzId: string | null = null;
  public mapZoomToPlzIdList: string[] | null = null;
  public mapTableHoverPlzId: string | null = null;
  public mapIsLoading: boolean = false;
  public mapConfig: MapOptions;
  public readonly kmlPathConstant: string = 'assets/ch_plz.kml';
  public readonly apiKeyConstant: string = 'AIzaSyBpa1rzAIkaSS2RAlc9frw8GAPiGC1PNwc';

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
    private plzDataService: PlzDataService,
    public selectionService: SelectionService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.selectedEntries$ = this.selectionService.selectedEntries$;
    this.mapConfig = {
      initialCenter: { lat: 46.8182, lng: 8.2275 },
      initialZoom: 8,
      defaultPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.1, strokeWeight: 1.5, fillColor: "#0063D6", fillOpacity: 0.05 },
      highlightedPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.6, strokeWeight: 2, fillColor: "#0063D6", fillOpacity: 0.3 },
      selectedPolygonOptions: { strokeColor: "#D60096", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#D60096", fillOpacity: 0.4 },
      selectedHighlightedPolygonOptions: { strokeColor: "#D60096", strokeOpacity: 0.9, strokeWeight: 2.5, fillColor: "#D60096", fillOpacity: 0.6 },
      typeaheadHoverPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.7, strokeWeight: 2, fillColor: "#0063D6", fillOpacity: 0.25 }
    };
  }

  ngOnInit(): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DistributionStepComponent] ngOnInit CALLED. initialStadt: ${this.initialStadt}`);
    this.initializeDates();

    if (this.initialStadt) {
      const decodedStadt = decodeURIComponent(this.initialStadt);
      console.log(`[${timestamp}] [DistributionStepComponent] "initialStadt" (from @Input in ngOnInit) FOUND. Decoded: ${decodedStadt}. Processing...`);
      this.processStadtnameFromUrl(decodedStadt);
    } else {
      console.log(`[${timestamp}] [DistributionStepComponent] "initialStadt" (from @Input in ngOnInit) NOT FOUND. Clearing selection.`);
      this.selectionService.clearEntries();
      this.updateOverallValidationState();
    }

    this.selectedEntries$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        this.mapSelectedPlzIds = entries.map(e => e.id);
        if (!this.mapZoomToPlzId && (!this.mapZoomToPlzIdList || this.mapZoomToPlzIdList.length === 0)) {
          this.mapZoomToPlzIdList = this.mapSelectedPlzIds.length > 0 ? [...this.mapSelectedPlzIds] : null;
        }
        this.updateOverallValidationState();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    const timestamp = new Date().toISOString();
    if (changes['initialStadt']) {
      const newStadtValue = changes['initialStadt'].currentValue;
      const prevStadtValue = changes['initialStadt'].previousValue;
      console.log(`[${timestamp}] [DistributionStepComponent] ngOnChanges: "initialStadt" CHANGED. Neu: ${newStadtValue}, Alt: ${prevStadtValue}`);

      if (newStadtValue) {
        const decodedStadt = decodeURIComponent(newStadtValue);
        console.log(`[${timestamp}] [DistributionStepComponent] ngOnChanges: Decoded newStadt: ${decodedStadt}. Reprocessing...`);
        this.processStadtnameFromUrl(decodedStadt);
      } else {
        console.log(`[${timestamp}] [DistributionStepComponent] ngOnChanges: "initialStadt" ist jetzt leer. Clearing selection and search input.`);
        this.selectionService.clearEntries();
        this.mapZoomToPlzId = null;
        this.mapZoomToPlzIdList = null;
        if (this.searchInputComponent && typeof this.searchInputComponent.clearInput === 'function') {
          this.searchInputComponent.clearInput();
        } else {
          console.warn(`[${timestamp}] [DistributionStepComponent] searchInputComponent.clearInput() nicht verfügbar oder searchInputComponent nicht bereit.`);
          this.searchInputInitialTerm = '';
        }
        this.updateOverallValidationState();
      }
    }
  }


  private async processStadtnameFromUrl(stadtname: string): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DistributionStepComponent] processStadtnameFromUrl called with: ${stadtname}`);
    if (!stadtname || stadtname.trim() === '') {
      console.log(`[${timestamp}] [DistributionStepComponent] processStadtnameFromUrl: stadtname is empty or undefined. Aborting.`);
      return;
    }

    let entriesProcessedSuccessfully = false;

    const dataReady = await this.plzDataService.ensureDataReady();
    console.log(`[${timestamp}] [DistributionStepComponent] ensureDataReady result: ${dataReady}`);

    if (!dataReady) {
      console.error(`[${timestamp}] [DistributionStepComponent] PLZ Data could not be loaded for deep link.`);
      this.updateOverallValidationState(); // Sicherstellen, dass CDR aufgerufen wird
      return;
    }

    console.log(`[${timestamp}] [DistributionStepComponent] PLZ Data is ready. Fetching suggestions for "${stadtname}"...`);
    try {
      const potentialMatches = await firstValueFrom(
        this.plzDataService.fetchTypeaheadSuggestions(stadtname).pipe(take(1))
      );
      // ... (Logik zum Finden von targetMatch bleibt gleich)
      if (!potentialMatches || potentialMatches.length === 0) {
        console.log(`[${timestamp}] [DistributionStepComponent] No potential matches for ${stadtname}.`);
        this.updateOverallValidationState();
        return;
      }
      let targetMatch: EnhancedSearchResultItem | undefined = potentialMatches.find(
        item => item.isGroupHeader && this.plzDataService.normalizeStringForSearch(item.ort) === this.plzDataService.normalizeStringForSearch(stadtname)
      );
      if (!targetMatch) {
        targetMatch = potentialMatches.find(item => item.isGroupHeader);
      }
      if (!targetMatch && potentialMatches.length > 0) {
        targetMatch = potentialMatches.find(item => !item.isGroupHeader && this.plzDataService.normalizeStringForSearch(item.ort) === this.plzDataService.normalizeStringForSearch(stadtname));
        if(!targetMatch) {
          if (potentialMatches[0].isGroupHeader || potentialMatches.length === 1) {
            targetMatch = potentialMatches[0];
          }
        }
      }
      // ... (Ende Logik targetMatch)

      if (targetMatch) {
        const termToShowInSearchInput = targetMatch.ort || (targetMatch.plz4 ? targetMatch.plz4.toString() : stadtname);
        this.selectionService.clearEntries();

        if (targetMatch.isGroupHeader && targetMatch.ort && targetMatch.kt) {
          const entries = await firstValueFrom(this.plzDataService.getEntriesByOrtAndKanton(targetMatch.ort, targetMatch.kt).pipe(take(1)));
          if (entries.length > 0) {
            this.selectionService.addMultipleEntries(entries);
            this.quickSearch(termToShowInSearchInput);
            entriesProcessedSuccessfully = true;
          }
        } else if (!targetMatch.isGroupHeader && targetMatch.id) {
          const entryToSelect: PlzEntry = { ...targetMatch } as PlzEntry;
          this.selectionService.addEntry(entryToSelect);
          this.quickSearch(termToShowInSearchInput);
          entriesProcessedSuccessfully = true;
        }
      }
    } catch (error) {
      console.error(`[${timestamp}] [DistributionStepComponent] Error processing stadtname ${stadtname} from URL:`, error);
    } finally {
      this.updateOverallValidationState(); // Ruft cdr.markForCheck()
      console.log(`[${timestamp}] [DistributionStepComponent] processStadtnameFromUrl finished for ${stadtname}. Entries processed: ${entriesProcessedSuccessfully}`);

      if (entriesProcessedSuccessfully) {
        if (isPlatformBrowser(this.platformId)) {
          // Warten bis Angular stabil ist (nach CD-Zyklen)
          this.ngZone.onStable.pipe(take(1)).subscribe(() => {
            console.log(`[${timestamp}] [DistributionStepComponent] Angular is stable. Proceeding with blur and scroll for URL city.`);
            if (this.searchInputComponent?.typeaheadInputEl?.nativeElement) {
              this.searchInputComponent.typeaheadInputEl.nativeElement.blur();
              console.log(`[${timestamp}] [DistributionStepComponent] Blurred search input (onStable).`);
            }
            // Scrollen im nächsten Microtask, nachdem Blur-Effekte (falls vorhanden) verarbeitet wurden.
            Promise.resolve().then(() => {
              console.log(`[${timestamp}] [DistributionStepComponent] Attempting scroll in microtask.`);
              this.scrollToMapView();
            }).catch(scrollError => console.error("Error in promise for scrollToMapView:", scrollError));
          });
        }
      }
    }
  }

  private initializeDates(): void {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const minStartDate = new Date(today.getTime());
    minStartDate.setUTCDate(today.getUTCDate() + 1);
    this.minVerteilungStartdatum = this.formatDateToYyyyMmDd(minStartDate);
    this.defaultStandardStartDate = this.addWorkingDays(new Date(today.getTime()), 3);
    let initialStartDate = new Date(this.defaultStandardStartDate.getTime());
    if (initialStartDate.getTime() < minStartDate.getTime()) {
      initialStartDate = new Date(minStartDate.getTime());
    }
    this.verteilungStartdatum = this.formatDateToYyyyMmDd(initialStartDate);
    this.checkExpressSurcharge();
    this.updateOverallValidationState();
  }

  private formatDateToYyyyMmDd(date: Date): string {
    const year = date.getUTCFullYear();
    const month = ('0' + (date.getUTCMonth() + 1)).slice(-2);
    const day = ('0' + date.getUTCDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  public getFormattedDefaultStandardDateForDisplay(): string {
    if (!this.defaultStandardStartDate) return '';
    const day = ('0' + this.defaultStandardStartDate.getUTCDate()).slice(-2);
    const month = ('0' + (this.defaultStandardStartDate.getUTCMonth() + 1)).slice(-2);
    const year = this.defaultStandardStartDate.getUTCFullYear();
    return `${day}.${month}.${year}`;
  }

  private parseYyyyMmDdToDate(dateString: string): Date {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    }
    const invalidDate = new Date(0);
    invalidDate.setTime(NaN);
    return invalidDate;
  }

  private addWorkingDays(baseDate: Date, daysToAdd: number): Date {
    let currentDate = new Date(baseDate.getTime());
    let workingDaysAdded = 0;
    while (workingDaysAdded < daysToAdd) {
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      const dayOfWeek = currentDate.getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysAdded++;
      }
    }
    return currentDate;
  }

  onStartDateChange(): void {
    this.expressSurchargeConfirmed = false;
    if (!this.verteilungStartdatum) {
      this.showExpressSurcharge = false;
      this.updateOverallValidationState();
      return;
    }
    const selectedStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minStartDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);

    if (isNaN(selectedStartDate.getTime()) || selectedStartDate.getTime() < minStartDate.getTime()) {
      this.verteilungStartdatum = this.formatDateToYyyyMmDd(minStartDate);
      this.onStartDateChange();
      return;
    }
    this.checkExpressSurcharge();
    this.updateOverallValidationState();
  }

  private checkExpressSurcharge(): void {
    if (!this.verteilungStartdatum || !this.defaultStandardStartDate) {
      if (this.showExpressSurcharge) { // Nur markForCheck, wenn sich der Wert ändert
        this.showExpressSurcharge = false;
        this.cdr.markForCheck();
      }
      return;
    }
    const selectedStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minAllowedStartDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);

    if (isNaN(selectedStartDate.getTime()) || isNaN(this.defaultStandardStartDate.getTime()) || isNaN(minAllowedStartDate.getTime())) {
      if (this.showExpressSurcharge) {
        this.showExpressSurcharge = false;
        this.cdr.markForCheck();
      }
      return;
    }
    const needsSurcharge = selectedStartDate.getTime() < this.defaultStandardStartDate.getTime() &&
      selectedStartDate.getTime() >= minAllowedStartDate.getTime();
    const newShowExpressSurcharge = needsSurcharge && !this.expressSurchargeConfirmed;
    if (this.showExpressSurcharge !== newShowExpressSurcharge) {
      this.showExpressSurcharge = newShowExpressSurcharge;
      this.cdr.markForCheck();
    }
  }

  public avoidExpressSurcharge(): void {
    this.expressSurchargeConfirmed = false;
    if (this.defaultStandardStartDate) {
      this.verteilungStartdatum = this.formatDateToYyyyMmDd(this.defaultStandardStartDate);
      this.onStartDateChange();
    } else {
      this.cdr.markForCheck();
    }
  }

  public confirmExpressSurcharge(): void {
    this.expressSurchargeConfirmed = true;
    this.showExpressSurcharge = false; // Wird durch checkExpressSurcharge in onStartDateChange oder direkt hier aktualisiert
    this.updateOverallValidationState();
    this.cdr.markForCheck(); // explizit für showExpressSurcharge
  }

  ngAfterViewInit(): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DistributionStepComponent] ngAfterViewInit CALLED.`);
    if (this.searchInputComponent && this.searchInputInitialTerm && !this.initialStadt) {
      this.searchInputComponent.initiateSearchForTerm(this.searchInputInitialTerm);
      this.searchInputInitialTerm = '';
    }
    Promise.resolve().then(() => {
      this.updateOverallValidationState();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInputEntriesSelected(entries: PlzEntry[]): void {
    if (entries && entries.length > 0) {
      this.selectionService.addMultipleEntries(entries);
      if (isPlatformBrowser(this.platformId)) {
        // Scrollen mit kurzer Verzögerung, um DOM-Updates Zeit zu geben
        // ngZone.onStable wäre hier auch eine Option für mehr Robustheit
        setTimeout(() => this.scrollToMapView(), 100); // Erhöhte Verzögerung für mehr Stabilität
      }
    }
  }

  onSearchInputTermChanged(term: string): void { /* No-op */ }

  onSearchInputStatusChanged(status: SimpleValidationStatus): void {
    if (this.searchInputStatus !== status) {
      this.searchInputStatus = status;
      this.updateOverallValidationState();
    }
  }

  setVerteilungTyp(typ: VerteilungTypOption): void {
    if (this.currentVerteilungTyp !== typ) {
      this.currentVerteilungTyp = typ;
      this.updateUiFlagsAndMapState();
    }
  }

  setZielgruppe(zielgruppe: ZielgruppeOption): void {
    if (this.currentZielgruppe !== zielgruppe) {
      this.currentZielgruppe = zielgruppe;
      this.onZielgruppeChange();
    }
  }

  private updateUiFlagsAndMapState(): void {
    const oldPlzFlag = this.showPlzUiContainer;
    const oldPerimeterFlag = this.showPerimeterUiContainer;
    this.showPlzUiContainer = this.currentVerteilungTyp === 'Nach PLZ';
    this.showPerimeterUiContainer = this.currentVerteilungTyp === 'Nach Perimeter';

    if (oldPlzFlag !== this.showPlzUiContainer || oldPerimeterFlag !== this.showPerimeterUiContainer) {
      this.cdr.markForCheck();
    }
    this.updateOverallValidationState();
  }

  private onZielgruppeChange(): void {
    this.highlightFlyerMaxColumn = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.highlightFlyerMaxColumn = false;
      this.cdr.markForCheck();
    }, COLUMN_HIGHLIGHT_DURATION);
    this.updateOverallValidationState();
  }

  onPlzClickedOnMap(event: { id: string; name?: string }): void {
    const entryIdFromMap = event.id;
    if (!entryIdFromMap) return;

    const isCurrentlySelected = this.selectionService.getSelectedEntries().some(e => e.id === entryIdFromMap);

    if (isCurrentlySelected) {
      this.selectionService.removeEntry(entryIdFromMap);
    } else {
      firstValueFrom(this.plzDataService.getEntryById(entryIdFromMap))
        .then(entry => {
          if (entry && this.selectionService.validateEntry(entry)) {
            this.selectionService.addEntry(entry);
          } else {
            const plz6 = entryIdFromMap;
            const plz4 = plz6.length >= 4 ? plz6.substring(0, 4) : plz6;
            const pseudoOrt = event.name || 'Unbekannt';
            const pseudoEntry: PlzEntry = { id: entryIdFromMap, plz6, plz4, ort: pseudoOrt, kt: 'N/A', all: 0 };
            if (this.selectionService.validateEntry(pseudoEntry)) {
              this.selectionService.addEntry(pseudoEntry);
            }
          }
        })
        .catch(error => {
          console.error(`[${new Date().toISOString()}] [DistributionStepComponent] Error fetching/adding entry from map click:`, error);
        })
        .finally(() => {
          this.updateOverallValidationState();
        });
    }
  }

  onMapLoadingStatusChanged(isLoading: boolean): void {
    if (this.mapIsLoading !== isLoading) {
      this.mapIsLoading = isLoading;
      this.updateOverallValidationState(); // Oder direkt cdr.markForCheck(), wenn Validierung nicht betroffen
    }
  }

  public quickSearch(term: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DistributionStepComponent] quickSearch called with term: "${term}"`);
    if (this.searchInputComponent) {
      this.searchInputComponent.initiateSearchForTerm(term);
    } else {
      if (this.searchInputInitialTerm !== term) {
        this.searchInputInitialTerm = term;
        this.cdr.markForCheck();
      }
    }
  }

  public clearPlzTable(): void {
    const timestamp = new Date().toISOString();
    this.selectionService.clearEntries();
    this.mapZoomToPlzId = null;
    this.mapZoomToPlzIdList = null;

    if (this.searchInputComponent && typeof this.searchInputComponent.clearInput === 'function') {
      this.searchInputComponent.clearInput();
    } else {
      this.searchInputInitialTerm = '';
    }
    this.router.navigate(['/']);
    this.updateOverallValidationState();

    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.scrollToMapView(), 100); // Erhöhte Verzögerung
    }
  }

  removePlzFromTable(entry: PlzEntry): void {
    this.selectionService.removeEntry(entry.id);
  }

  zoomToTableEntryOnMap(entry: PlzEntry): void {
    this.mapZoomToPlzId = entry.id;
    this.mapZoomToPlzIdList = null;
    this.cdr.markForCheck();
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.scrollToMapView(), 100); // Erhöhte Verzögerung
    }
    setTimeout(() => {
      this.mapZoomToPlzId = null;
      this.cdr.markForCheck();
    }, 150); // Etwas längere Verzögerung für Zoom-Reset
  }

  highlightPlacemarkOnMapFromTable(event: TableHighlightEvent): void {
    const newHoverId = (event.highlight && event.plzId) ? event.plzId : null;
    if (this.mapTableHoverPlzId !== newHoverId) {
      this.mapTableHoverPlzId = newHoverId;
      this.cdr.markForCheck();
    }
  }

  getFlyerMaxForEntry(entry: PlzEntry): number { /* unverändert */ return 0; }
  getZielgruppeLabel(): string { /* unverändert */ return ''; }
  private updateOverallValidationState(): void { /* unverändert, ruft cdr.markForCheck() */ }
  private calculateOverallValidationStatus(): OverallValidationStatus { /* unverändert */ return 'invalid'; }
  private isExpressSurchargeRelevant(): boolean { /* unverändert */ return false; }
  proceedToNextStep(): void { /* unverändert, ruft cdr.markForCheck() am Ende*/ }

  private scrollToMapView(): void {
    if (!isPlatformBrowser(this.platformId)) {
      console.warn('[DistributionStepComponent] scrollToMapView: Not in browser.');
      return;
    }
    if (!this.mapViewRef?.nativeElement) {
      console.warn('[DistributionStepComponent] scrollToMapView: mapViewRef not available.');
      // Optional: Retry, falls es ein sehr spätes Timing-Problem ist
      // setTimeout(() => { if (this.mapViewRef?.nativeElement) this.scrollToMapView(); }, 200);
      return;
    }

    const element = this.mapViewRef.nativeElement;
    if (element.offsetParent === null || element.offsetWidth === 0 || element.offsetHeight === 0) {
      console.warn('[DistributionStepComponent] scrollToMapView: mapViewRef element is not visible or has no dimensions. Retrying in 200ms.');
      // Erneuter Versuch nach kurzer Verzögerung, falls das Element gerade erst sichtbar wird
      this.ngZone.runOutsideAngular(() => { // setTimeout außerhalb von Angular Zone, um keine unnötige CD auszulösen
        setTimeout(() => {
          console.log('[DistributionStepComponent] Retrying scrollToMapView...');
          this.scrollToMapView(); // Ruft sich selbst erneut auf
        }, 200);
      });
      return;
    }

    const offset = 18;
    const elementScrollY = window.pageYOffset + element.getBoundingClientRect().top;
    const targetScrollPosition = elementScrollY - offset;

    console.log(`[${new Date().toISOString()}] [DistributionStepComponent] Scrolling to map. Element scrollY: ${elementScrollY}, Target scroll position: ${targetScrollPosition}`);
    window.scrollTo({
      top: targetScrollPosition,
      behavior: 'smooth'
    });
  }
}
