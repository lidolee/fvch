import {
  Component, OnInit, AfterViewInit, OnDestroy, ViewChild, Output, EventEmitter,
  Inject, PLATFORM_ID, NgZone, ChangeDetectorRef, Input, OnChanges, SimpleChanges, ElementRef
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
  ]
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
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
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
      return;
    }

    console.log(`[${timestamp}] [DistributionStepComponent] PLZ Data is ready. Fetching suggestions for "${stadtname}"...`);
    try {
      const potentialMatches = await firstValueFrom(
        this.plzDataService.fetchTypeaheadSuggestions(stadtname).pipe(take(1))
      );
      console.log(`[${timestamp}] [DistributionStepComponent] Potential matches for "${stadtname}":`, potentialMatches);

      if (!potentialMatches || potentialMatches.length === 0) {
        console.log(`[${timestamp}] [DistributionStepComponent] No potential matches for ${stadtname}.`);
        return;
      }

      let targetMatch: EnhancedSearchResultItem | undefined = potentialMatches.find(
        item => item.isGroupHeader && this.plzDataService.normalizeStringForSearch(item.ort) === this.plzDataService.normalizeStringForSearch(stadtname)
      );
      console.log(`[${timestamp}] [DistributionStepComponent] Target match (attempt 1 - group exact):`, targetMatch);

      if (!targetMatch) {
        targetMatch = potentialMatches.find(item => item.isGroupHeader);
        console.log(`[${timestamp}] [DistributionStepComponent] Target match (attempt 2 - first group):`, targetMatch);
      }

      if (!targetMatch && potentialMatches.length > 0) {
        targetMatch = potentialMatches.find(item => !item.isGroupHeader && this.plzDataService.normalizeStringForSearch(item.ort) === this.plzDataService.normalizeStringForSearch(stadtname));
        console.log(`[${timestamp}] [DistributionStepComponent] Target match (attempt 3 - non-group exact):`, targetMatch);
        if(!targetMatch) {
          if (potentialMatches[0].isGroupHeader || potentialMatches.length === 1) {
            targetMatch = potentialMatches[0];
            console.log(`[${timestamp}] [DistributionStepComponent] Target match (attempt 4 - first item as fallback):`, targetMatch);
          }
        }
      }

      if (targetMatch) {
        console.log(`[${timestamp}] [DistributionStepComponent] Using final targetMatch for "${stadtname}":`, JSON.stringify(targetMatch));
        const termToShowInSearchInput = targetMatch.ort || (targetMatch.plz4 ? targetMatch.plz4.toString() : stadtname);

        this.selectionService.clearEntries();
        console.log(`[${timestamp}] [DistributionStepComponent] Selection cleared. Term to show in search: ${termToShowInSearchInput}`);

        if (targetMatch.isGroupHeader && targetMatch.ort && targetMatch.kt) {
          console.log(`[${timestamp}] [DistributionStepComponent] Target is group header. Fetching entries for Ort: ${targetMatch.ort}, Kt: ${targetMatch.kt}`);
          const entries = await firstValueFrom(this.plzDataService.getEntriesByOrtAndKanton(targetMatch.ort, targetMatch.kt).pipe(take(1)));
          console.log(`[${timestamp}] [DistributionStepComponent] Entries for group:`, entries);
          if (entries.length > 0) {
            this.selectionService.addMultipleEntries(entries);
            this.quickSearch(termToShowInSearchInput);
            entriesProcessedSuccessfully = true;
            console.log(`[${timestamp}] [DistributionStepComponent] Selected ${entries.length} entries for group ${termToShowInSearchInput}`);
          } else {
            console.warn(`[${timestamp}] [DistributionStepComponent] No entries found for group ${targetMatch.ort}, ${targetMatch.kt}.`);
          }
        } else if (!targetMatch.isGroupHeader && targetMatch.id) {
          console.log(`[${timestamp}] [DistributionStepComponent] Target is single entry. ID: ${targetMatch.id}`);
          const entryToSelect: PlzEntry = { ...targetMatch } as PlzEntry;
          this.selectionService.addEntry(entryToSelect);
          this.quickSearch(termToShowInSearchInput);
          entriesProcessedSuccessfully = true;
          console.log(`[${timestamp}] [DistributionStepComponent] Selected single entry ${entryToSelect.id}`);
        } else {
          console.warn(`[${timestamp}] [DistributionStepComponent] Match found for ${stadtname} but could not be processed as group or single entry.`);
        }
      } else {
        console.log(`[${timestamp}] [DistributionStepComponent] No suitable actionable match found for ${stadtname}.`);
      }
    } catch (error) {
      console.error(`[${timestamp}] [DistributionStepComponent] Error processing stadtname ${stadtname} from URL:`, error);
    } finally {
      this.cdr.markForCheck();
      this.updateOverallValidationState();
      console.log(`[${timestamp}] [DistributionStepComponent] processStadtnameFromUrl finished for ${stadtname}.`);
      if (entriesProcessedSuccessfully) {
        if (isPlatformBrowser(this.platformId)) {
          // Nach kurzer Verzögerung, um DOM-Updates (z.B. Wert im Suchfeld) Zeit zu geben.
          setTimeout(() => {
            if (this.searchInputComponent?.typeaheadInputEl?.nativeElement) {
              this.searchInputComponent.typeaheadInputEl.nativeElement.blur(); // << HIER: Blur hinzufügen
              console.log(`[${timestamp}] [DistributionStepComponent] Blurred search input after URL processing.`);
            }
            this.scrollToMapView(); // Scrollen zur Karte
          }, 100);
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
      if (currentDate.getUTCDay() !== 0 && currentDate.getUTCDay() !== 6) {
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
      this.cdr.markForCheck();
      return;
    }
    const selectedStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minStartDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);
    if (isNaN(selectedStartDate.getTime()) || selectedStartDate.getTime() < minStartDate.getTime()) {
      this.verteilungStartdatum = this.formatDateToYyyyMmDd(minStartDate);
      this.cdr.detectChanges();
      this.onStartDateChange();
      return;
    }
    this.checkExpressSurcharge();
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  private checkExpressSurcharge(): void {
    if (!this.verteilungStartdatum || !this.defaultStandardStartDate) {
      this.showExpressSurcharge = false;
      return;
    }
    const selectedStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minAllowedStartDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);
    if (isNaN(selectedStartDate.getTime()) || isNaN(this.defaultStandardStartDate.getTime()) || isNaN(minAllowedStartDate.getTime())) {
      this.showExpressSurcharge = false;
      return;
    }
    const needsSurcharge = selectedStartDate.getTime() < this.defaultStandardStartDate.getTime() &&
      selectedStartDate.getTime() >= minAllowedStartDate.getTime();
    this.showExpressSurcharge = needsSurcharge && !this.expressSurchargeConfirmed;
  }

  public avoidExpressSurcharge(): void {
    this.expressSurchargeConfirmed = false;
    if (this.defaultStandardStartDate) {
      this.verteilungStartdatum = this.formatDateToYyyyMmDd(this.defaultStandardStartDate);
      this.onStartDateChange();
    }
    this.cdr.markForCheck();
  }

  public confirmExpressSurcharge(): void {
    this.expressSurchargeConfirmed = true;
    this.showExpressSurcharge = false;
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  ngAfterViewInit(): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DistributionStepComponent] ngAfterViewInit CALLED.`);
    // Wenn initialStadt vorhanden ist, wurde processStadtnameFromUrl bereits in ngOnInit/OnChanges aufgerufen.
    // Der Aufruf von initiateSearchForTerm hier ist nur für Fälle, in denen searchInputInitialTerm
    // auf andere Weise als durch initialStadt gesetzt wird (aktuell nicht der Fall).
    // Um Doppelverarbeitung zu vermeiden, prüfen wir, ob initialStadt bereits verarbeitet wurde.
    if (this.searchInputComponent && this.searchInputInitialTerm && !this.initialStadt) {
      console.log(`[${timestamp}] [DistributionStepComponent] ngAfterViewInit: Found initial term "${this.searchInputInitialTerm}" AND no initialStadt, initiating search.`);
      this.searchInputComponent.initiateSearchForTerm(this.searchInputInitialTerm);
      this.searchInputInitialTerm = ''; // Zurücksetzen, um erneute Verarbeitung zu verhindern
    }
    Promise.resolve().then(() => {
      this.updateOverallValidationState();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DistributionStepComponent] ngOnDestroy CALLED.`);
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInputEntriesSelected(entries: PlzEntry[]): void {
    if (entries && entries.length > 0) {
      this.selectionService.addMultipleEntries(entries);
      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => this.scrollToMapView(), 50);
      }
    }
  }

  onSearchInputTermChanged(term: string): void {
    // Placeholder
  }

  onSearchInputStatusChanged(status: SimpleValidationStatus): void {
    this.searchInputStatus = status;
    this.updateOverallValidationState();
    this.cdr.markForCheck();
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
    this.showPlzUiContainer = this.currentVerteilungTyp === 'Nach PLZ';
    this.showPerimeterUiContainer = this.currentVerteilungTyp === 'Nach Perimeter';
    this.cdr.detectChanges();
    this.updateOverallValidationState();
    this.cdr.markForCheck();
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
          this.cdr.markForCheck();
          this.updateOverallValidationState();
        });
    }
  }

  onMapLoadingStatusChanged(isLoading: boolean): void {
    this.mapIsLoading = isLoading;
    this.cdr.markForCheck();
  }

  public quickSearch(term: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DistributionStepComponent] quickSearch called with term: "${term}"`);
    if (this.searchInputComponent) {
      console.log(`[${timestamp}] [DistributionStepComponent] Calling searchInputComponent.initiateSearchForTerm`);
      this.searchInputComponent.initiateSearchForTerm(term);
    } else {
      console.warn(`[${timestamp}] [DistributionStepComponent] searchInputComponent not available yet, setting initial term for ngAfterViewInit.`);
      this.searchInputInitialTerm = term; // Wird in ngAfterViewInit verarbeitet, falls searchInputComponent noch nicht da ist
      this.cdr.markForCheck();
    }
  }

  public clearPlzTable(): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DistributionStepComponent] clearPlzTable CALLED. Clearing selection, navigating, and scrolling.`);

    this.selectionService.clearEntries();
    this.mapZoomToPlzId = null;
    this.mapZoomToPlzIdList = null;

    if (this.searchInputComponent && typeof this.searchInputComponent.clearInput === 'function') {
      this.searchInputComponent.clearInput();
    } else {
      console.warn(`[${timestamp}] [DistributionStepComponent] searchInputComponent.clearInput() nicht verfügbar oder searchInputComponent nicht bereit. Setze searchInputInitialTerm.`);
      this.searchInputInitialTerm = '';
    }

    this.router.navigate(['/']);

    this.updateOverallValidationState();
    this.cdr.markForCheck();

    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.scrollToMapView(), 100);
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
      setTimeout(() => this.scrollToMapView(), 50);
    }
    setTimeout(() => { this.mapZoomToPlzId = null; this.cdr.markForCheck(); }, 100);
  }

  highlightPlacemarkOnMapFromTable(event: TableHighlightEvent): void {
    if (event.highlight && event.plzId) {
      this.mapTableHoverPlzId = event.plzId;
    } else {
      this.mapTableHoverPlzId = null;
    }
    this.cdr.markForCheck();
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

  private updateOverallValidationState(): void {
    const newOverallStatus = this.calculateOverallValidationStatus();
    if (this.validationChange.observers && this.validationChange.observers.length > 0) {
      Promise.resolve().then(() => this.validationChange.emit(newOverallStatus));
    }
    this.cdr.markForCheck();
  }

  private calculateOverallValidationStatus(): OverallValidationStatus {
    const hasSelectedPlzEntries = this.selectionService.getSelectedEntries().length > 0;
    const startDateSelected = !!this.verteilungStartdatum && !isNaN(this.parseYyyyMmDdToDate(this.verteilungStartdatum).getTime());
    const isExpressSurchargeRelevantAndNotConfirmed = this.isExpressSurchargeRelevant() && !this.expressSurchargeConfirmed;
    const verteilungsDetailsComplete = startDateSelected && !isExpressSurchargeRelevantAndNotConfirmed;

    if (this.showPlzUiContainer) {
      if (hasSelectedPlzEntries && verteilungsDetailsComplete) {
        return 'valid';
      }
      return 'invalid';
    } else if (this.showPerimeterUiContainer) {
      return verteilungsDetailsComplete ? 'valid' : 'invalid';
    }
    return 'invalid';
  }

  private isExpressSurchargeRelevant(): boolean {
    if (!this.verteilungStartdatum || !this.defaultStandardStartDate) return false;
    const selectedStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    if (isNaN(selectedStartDate.getTime()) || isNaN(this.defaultStandardStartDate.getTime())) return false;
    const standardStartDateMs = this.defaultStandardStartDate.getTime();
    const minStartDateMs = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum).getTime();
    if (isNaN(minStartDateMs)) return false;

    return selectedStartDate.getTime() < standardStartDateMs && selectedStartDate.getTime() >= minStartDateMs;
  }

  proceedToNextStep(): void {
    const currentOverallStatus = this.calculateOverallValidationStatus();
    if (this.validationChange.observers && this.validationChange.observers.length > 0) {
      Promise.resolve().then(() => this.validationChange.emit(currentOverallStatus));
    }

    if (currentOverallStatus === 'valid') {
      this.nextStepRequest.emit();
    } else {
      let message = "Bitte vervollständigen Sie Ihre Auswahl und Angaben.";
      const hasSelectedPlzEntries = this.selectionService.getSelectedEntries().length > 0;
      const startDateSelected = !!this.verteilungStartdatum && !isNaN(this.parseYyyyMmDdToDate(this.verteilungStartdatum).getTime());
      const isExpressSurchargeRelevantAndNotConfirmed = this.isExpressSurchargeRelevant() && !this.expressSurchargeConfirmed;

      if (!startDateSelected) message = "Bitte wählen Sie ein gültiges Startdatum für die Verteilung aus.";
      else if (isExpressSurchargeRelevantAndNotConfirmed) message = "Bitte bestätigen Sie den Express-Zuschlag oder wählen Sie ein späteres Startdatum.";
      else if (this.showPlzUiContainer && !hasSelectedPlzEntries) {
        if (this.searchInputStatus === 'pending') message = "Bitte wählen Sie einen Eintrag aus der Suchliste oder vervollständigen Sie Ihre Eingabe.";
        else if (this.searchInputStatus === 'valid' && this.searchInputComponent?.typeaheadSearchTerm?.trim().length > 0) message = "Bitte übernehmen Sie Ihre Eingabe im Suchfeld (z.B. einen PLZ-Bereich mit Enter).";
        else message = "Bitte wählen Sie mindestens ein PLZ-Gebiet aus oder geben Sie einen gültigen PLZ-Bereich ein.";
      }
      if (isPlatformBrowser(this.platformId)) alert(message);
    }
  }

  private scrollToMapView(): void {
    if (isPlatformBrowser(this.platformId) && this.mapViewRef?.nativeElement) {
      const element = this.mapViewRef.nativeElement;
      const offset = 18;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      console.log(`[DistributionStepComponent] Scrolling to map. Element top relative to viewport: ${elementRect}, Target scroll position: ${offsetPosition}`);

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    } else {
      console.warn('[DistributionStepComponent] scrollToMapView: mapViewRef not available or not in browser.');
    }
  }
}
