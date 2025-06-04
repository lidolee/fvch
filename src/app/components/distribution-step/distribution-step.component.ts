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

export interface TableHighlightEvent {
  plzId: string | null;
  highlight: boolean;
}
type VerteilungTypOption = 'Nach PLZ' | 'Nach Perimeter';
type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';
export type OverallValidationStatus = 'valid' | 'invalid';


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
  private activeProcessingStadt: string | undefined = undefined;


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
  public kmlFileName: string | null = null;

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
    this.initializeDates();
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
    if (changes['initialStadt']) {
      const newStadtInputValue = changes['initialStadt'].currentValue;
      let effectiveNewStadt: string | undefined;

      if (newStadtInputValue && typeof newStadtInputValue === 'string' &&
        newStadtInputValue.trim() !== '' && newStadtInputValue.toLowerCase() !== 'undefined') {
        effectiveNewStadt = decodeURIComponent(newStadtInputValue);
      } else {
        effectiveNewStadt = undefined;
      }

      if (this.activeProcessingStadt !== effectiveNewStadt) {
        this.activeProcessingStadt = effectiveNewStadt;

        if (effectiveNewStadt) {
          this.processStadtnameFromUrl(effectiveNewStadt);
        } else {
          this.selectionService.clearEntries();
          this.mapZoomToPlzId = null;
          this.mapZoomToPlzIdList = null;
          if (this.searchInputComponent && typeof this.searchInputComponent.clearInput === 'function') {
            this.searchInputComponent.clearInput();
          } else {
            this.searchInputInitialTerm = '';
          }
        }
      }
    }
  }

  // TrackBy function for *ngFor lists of PlzEntry
  trackByPlzId(index: number, item: PlzEntry): string {
    return item.id;
  }

  private async processStadtnameFromUrl(stadtname: string): Promise<void> {
    if (!stadtname || stadtname.trim() === '') { return; }

    const dataReady = await this.plzDataService.ensureDataReady();
    if (!dataReady) {
      this.updateOverallValidationState();
      return;
    }

    this.selectionService.clearEntries();
    this.mapZoomToPlzId = null;
    this.mapZoomToPlzIdList = null;

    let termToUseForSearchInput = stadtname;
    let plzEntriesToSelect: PlzEntry[] = [];

    try {
      const potentialMatches = await firstValueFrom(
        this.plzDataService.fetchTypeaheadSuggestions(stadtname).pipe(take(1))
      );

      if (potentialMatches && potentialMatches.length > 0) {
        let targetMatch: EnhancedSearchResultItem | undefined = potentialMatches.find(
          item => item.isGroupHeader && this.plzDataService.normalizeStringForSearch(item.ort) === this.plzDataService.normalizeStringForSearch(stadtname)
        );
        if (!targetMatch) {
          targetMatch = potentialMatches.find(item => item.isGroupHeader);
        }
        if (!targetMatch) {
          targetMatch = potentialMatches.find(item => !item.isGroupHeader && this.plzDataService.normalizeStringForSearch(item.ort) === this.plzDataService.normalizeStringForSearch(stadtname));
        }
        if (!targetMatch && potentialMatches.length > 0 && (potentialMatches[0].isGroupHeader || potentialMatches.length === 1)) {
          targetMatch = potentialMatches[0];
        }

        if (targetMatch) {
          termToUseForSearchInput = targetMatch.ort || (targetMatch.plz4 ? targetMatch.plz4.toString() : stadtname);

          if (targetMatch.isGroupHeader && targetMatch.ort && targetMatch.kt) {
            plzEntriesToSelect = await firstValueFrom(this.plzDataService.getEntriesByOrtAndKanton(targetMatch.ort, targetMatch.kt).pipe(take(1)));
          } else if (!targetMatch.isGroupHeader && targetMatch.id) {
            const entry: PlzEntry = {
              id: targetMatch.id,
              plz6: targetMatch.plz6 || targetMatch.id,
              plz4: targetMatch.plz4 || (targetMatch.id ? targetMatch.id.substring(0,4) : ''),
              ort: targetMatch.ort || '',
              kt: targetMatch.kt || '',
              all: targetMatch.all || 0
            };
            plzEntriesToSelect = [entry];
          }
        }
      }

      if (this.searchInputComponent) {
        this.searchInputComponent.setSearchTerm(termToUseForSearchInput, false);
      } else {
        this.searchInputInitialTerm = termToUseForSearchInput;
      }

      if (plzEntriesToSelect.length > 0) {
        this.selectionService.addMultipleEntries(plzEntriesToSelect);
      }

    } catch (error) {
      if (this.searchInputComponent) {
        this.searchInputComponent.setSearchTerm(stadtname, false);
      } else {
        this.searchInputInitialTerm = stadtname;
      }
    } finally {
      this.cdr.markForCheck();
      if (isPlatformBrowser(this.platformId)) {
        this.ngZone.onStable.pipe(take(1)).subscribe(() => {
          if (this.searchInputComponent) { this.searchInputComponent.blurInput(); }
          setTimeout(() => this.scrollToMapView(), 50);
        });
      }
    }
  }

  public async selectCityAndFetchPlz(stadtName: string): Promise<void> {
    if (!stadtName || stadtName.trim() === '') { return; }

    const dataReady = await this.plzDataService.ensureDataReady();
    if (!dataReady) {
      this.cdr.markForCheck();
      return;
    }

    this.activeProcessingStadt = stadtName;
    this.selectionService.clearEntries();
    this.mapZoomToPlzId = null;
    this.mapZoomToPlzIdList = null;

    let termToUseForSearchInput = stadtName;
    let plzEntriesToSelect: PlzEntry[] = [];

    try {
      const suggestions = await firstValueFrom(
        this.plzDataService.fetchTypeaheadSuggestions(stadtName).pipe(take(1))
      );

      if (suggestions && suggestions.length > 0) {
        let cityGroupHeader = suggestions.find(
          item => item.isGroupHeader && this.plzDataService.normalizeStringForSearch(item.ort) === this.plzDataService.normalizeStringForSearch(stadtName)
        );
        if (!cityGroupHeader) {
          cityGroupHeader = suggestions.find(item => item.isGroupHeader);
        }

        if (cityGroupHeader && cityGroupHeader.ort && cityGroupHeader.kt) {
          termToUseForSearchInput = cityGroupHeader.ort;
          plzEntriesToSelect = await firstValueFrom(
            this.plzDataService.getEntriesByOrtAndKanton(cityGroupHeader.ort, cityGroupHeader.kt).pipe(take(1))
          );
        } else {
          const singlePlzMatch = suggestions.find(item => !item.isGroupHeader && this.plzDataService.normalizeStringForSearch(item.ort) === this.plzDataService.normalizeStringForSearch(stadtName));
          if (singlePlzMatch) {
            termToUseForSearchInput = singlePlzMatch.ort || stadtName;
            const entry: PlzEntry = {
              id: singlePlzMatch.id,
              plz6: singlePlzMatch.plz6 || singlePlzMatch.id,
              plz4: singlePlzMatch.plz4 || (singlePlzMatch.id ? singlePlzMatch.id.substring(0,4) : ''),
              ort: singlePlzMatch.ort || '',
              kt: singlePlzMatch.kt || '',
              all: singlePlzMatch.all || 0
            };
            plzEntriesToSelect = [entry];
          }
        }
      }

      if (this.searchInputComponent) {
        this.searchInputComponent.setSearchTerm(termToUseForSearchInput, false);
      } else {
        this.searchInputInitialTerm = termToUseForSearchInput;
      }

      if (plzEntriesToSelect.length > 0) {
        this.selectionService.addMultipleEntries(plzEntriesToSelect);
      }

    } catch (error) {
      if (this.searchInputComponent) { this.searchInputComponent.setSearchTerm(stadtName, false); }
      else { this.searchInputInitialTerm = stadtName; }
    } finally {
      this.cdr.markForCheck();
      if (isPlatformBrowser(this.platformId)) {
        this.ngZone.onStable.pipe(take(1)).subscribe(() => {
          if (this.searchInputComponent) { this.searchInputComponent.blurInput(); }
          setTimeout(() => this.scrollToMapView(), 150);
        });
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
      if (this.showExpressSurcharge) { this.showExpressSurcharge = false; this.cdr.markForCheck(); }
      return;
    }
    const selectedStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minAllowedStartDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);

    if (isNaN(selectedStartDate.getTime()) || isNaN(this.defaultStandardStartDate.getTime()) || isNaN(minAllowedStartDate.getTime())) {
      if (this.showExpressSurcharge) { this.showExpressSurcharge = false; this.cdr.markForCheck(); }
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
    } else { this.cdr.markForCheck(); }
  }

  public confirmExpressSurcharge(): void {
    this.expressSurchargeConfirmed = true;
    this.showExpressSurcharge = false;
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  ngAfterViewInit(): void {
    if (this.searchInputComponent && this.searchInputInitialTerm && !this.activeProcessingStadt) {
      this.searchInputComponent.initiateSearchForTerm(this.searchInputInitialTerm);
      this.searchInputInitialTerm = '';
    }
    Promise.resolve().then(() => { this.updateOverallValidationState(); });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInputEntriesSelected(entries: PlzEntry[]): void {
    if (entries && entries.length > 0) {
      this.selectionService.addMultipleEntries(entries);
      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => this.scrollToMapView(), 100);
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
        .catch(error => { /* Handle error */ });
    }
  }

  onMapLoadingStatusChanged(isLoading: boolean): void {
    if (this.mapIsLoading !== isLoading) {
      this.mapIsLoading = isLoading;
      this.updateOverallValidationState();
    }
  }

  public quickSearch(term: string): void {
    this.selectCityAndFetchPlz(term);
  }

  public clearPlzTable(): void {
    this.selectionService.clearEntries();
    this.mapZoomToPlzId = null;
    this.mapZoomToPlzIdList = null;
    this.activeProcessingStadt = undefined;

    if (this.searchInputComponent && typeof this.searchInputComponent.clearInput === 'function') {
      this.searchInputComponent.clearInput();
    } else {
      this.searchInputInitialTerm = '';
    }
    this.router.navigate(['/']);

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
      setTimeout(() => this.scrollToMapView(), 100);
    }
    setTimeout(() => { this.mapZoomToPlzId = null; this.cdr.markForCheck(); }, 250);
  }

  highlightPlacemarkOnMapFromTable(event: TableHighlightEvent): void {
    const newHoverId = (event.highlight && event.plzId) ? event.plzId : null;
    if (this.mapTableHoverPlzId !== newHoverId) {
      this.mapTableHoverPlzId = newHoverId;
      this.cdr.markForCheck();
    }
  }

  triggerKmlUpload(): void { /* Implement KML */ }

  getFlyerMaxForEntry(entry: PlzEntry): number { return 0; }
  getZielgruppeLabel(): string { return ''; }

  private updateOverallValidationState(): void {
    const newStatus = this.calculateOverallValidationStatus();
    this.validationChange.emit(newStatus);
    this.cdr.markForCheck();
  }

  private calculateOverallValidationStatus(): OverallValidationStatus {
    const hasSelectedPlz = this.selectionService.getSelectedEntries().length > 0;
    const isDateValid = !!this.verteilungStartdatum && !isNaN(this.parseYyyyMmDdToDate(this.verteilungStartdatum).getTime());
    const isExpressConfirmedIfNeeded = !this.isExpressSurchargeRelevant() || this.expressSurchargeConfirmed;

    if (this.currentVerteilungTyp === 'Nach PLZ') {
      const isSearchInputStateAcceptable = this.searchInputStatus === 'valid' ||
        this.searchInputStatus === 'empty' ||
        (this.activeProcessingStadt && this.searchInputStatus !== 'invalid');

      if (hasSelectedPlz && isDateValid && isExpressConfirmedIfNeeded && isSearchInputStateAcceptable) {
        return 'valid';
      }
    } else {
      if (isDateValid && isExpressConfirmedIfNeeded /* && kmlIsValid */) {
        return 'invalid'; // Until KML is implemented
      }
    }
    return 'invalid';
  }

  private isExpressSurchargeRelevant(): boolean {
    if (!this.verteilungStartdatum || !this.defaultStandardStartDate) return false;
    const selected = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minAllowed = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);
    if (isNaN(selected.getTime()) || isNaN(this.defaultStandardStartDate.getTime()) || isNaN(minAllowed.getTime())) return false;
    return selected.getTime() < this.defaultStandardStartDate.getTime() && selected.getTime() >= minAllowed.getTime();
  }

  proceedToNextStep(): void {
    if (this.calculateOverallValidationStatus() === 'valid') {
      this.nextStepRequest.emit();
    }
    this.cdr.markForCheck();
  }

  private scrollToMapView(): void {
    if (!isPlatformBrowser(this.platformId)) { return; }
    this.ngZone.onStable.pipe(take(1)).subscribe(() => {
      if (!this.mapViewRef?.nativeElement) return;
      const element = this.mapViewRef.nativeElement;
      if (element.offsetParent === null || element.offsetWidth === 0 || element.offsetHeight === 0) return;
      const offset = 18;
      const elementScrollY = window.pageYOffset + element.getBoundingClientRect().top;
      const targetScrollPosition = elementScrollY - offset;
      window.scrollTo({ top: targetScrollPosition, behavior: 'smooth' });
    });
  }
}
