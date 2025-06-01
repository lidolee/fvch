import { Component, Output, EventEmitter, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, Inject, PLATFORM_ID, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbAlertModule, NgbTypeahead, NgbTooltip } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil, tap, map } from 'rxjs/operators';

import { ValidationStatus } from '../../app.component';
import { PlzDataService, PlzEntry, SearchResultsContainer, EnhancedSearchResultItem } from '../../services/plz-data.service';
import { SelectionService } from '../../services/selection.service';
import { MapOptions, MapComponent } from '../map/map.component';

const LOG_PREFIX_DIST = '[DistributionStep]';
const COLUMN_HIGHLIGHT_DURATION = 300;

export type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';
export type VerteilungTypOption = 'Nach PLZ' | 'Nach Perimeter';
// Removed AnlieferungOption and FormatOption as they are moved to design-print-step.component.ts


interface CloseTypeaheadOptions {
  clearSearchTerm?: boolean;
  clearSelectionModel?: boolean;
  clearResults?: boolean;
}

@Component({
  selector: 'app-distribution-step',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbTypeaheadModule, NgbAlertModule, NgbTooltip, MapComponent],
  templateUrl: './distribution-step.component.html',
  styleUrls: ['./distribution-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DistributionStepComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<ValidationStatus>();

  @ViewChild('typeaheadInstance') typeaheadInstance!: NgbTypeahead;
  @ViewChild('selectAllButtonEl') selectAllButtonEl!: ElementRef<HTMLButtonElement>;
  @ViewChild('typeaheadInputEl') typeaheadInputEl!: ElementRef<HTMLInputElement>;

  private destroy$ = new Subject<void>();

  typeaheadSearchTerm: string = '';
  currentTypeaheadSelection: EnhancedSearchResultItem | null = null;
  public typeaheadHoverResultsForMapIds: string[] = [];
  searching: boolean = false;
  selectedEntries$: Observable<PlzEntry[]>;
  currentVerteilungTyp: VerteilungTypOption = 'Nach PLZ';
  showPlzUiContainer: boolean = true;
  showPerimeterUiContainer: boolean = false;
  currentZielgruppe: ZielgruppeOption = 'Alle Haushalte';
  highlightFlyerMaxColumn: boolean = false;
  textInputStatus: ValidationStatus = 'invalid';

  // Removed currentAnlieferung and currentFormat
  // currentAnlieferung: AnlieferungOption = 'selbst';
  // currentFormat: FormatOption = 'A5_A6';

  // Datum Properties
  verteilungStartdatum: string = '';
  verteilungEnddatum: string = '';
  minVerteilungStartdatum: string = '';
  showExpressSurcharge: boolean = false;
  expressSurchargeConfirmed: boolean = false;
  public defaultStandardStartDate!: Date;


  currentSearchResultsContainer: SearchResultsContainer | null = null;
  isTypeaheadListOpen = false;
  isCustomHeaderOpen = false;
  isMouseOverPopupOrHeader = false;
  private focusEmitter = new Subject<string>();

  public mapSelectedPlzIds: string[] = [];
  public mapZoomToPlzId: string | null = null;
  public mapZoomToPlzIdList: string[] | null = null;
  public mapTableHoverPlzId: string | null = null;
  public mapIsLoading: boolean = false;
  public mapConfig: MapOptions;
  public readonly kmlPathConstant: string = 'assets/ch_plz.kml';
  public readonly apiKeyConstant: string = 'AIzaSyBpa1rzAIkaSS2RAlc9frw8GAPiGC1PNwc';

  public readonly plzRangeRegex = /^\s*(\d{4,6})\s*-\s*(\d{4,6})\s*$/;

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
    private plzDataService: PlzDataService,
    public selectionService: SelectionService,
    private cdr: ChangeDetectorRef
  ) {
    this.selectedEntries$ = this.selectionService.selectedEntries$;
    this.updateUiFlags(this.currentVerteilungTyp);

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
        this.cdr.markForCheck();
      });
    this.updateOverallValidationState();
  }

  private initializeDates(): void {
    const today = new Date("2025-06-01T18:53:56Z"); // Verwende das von GitHub Copilot bereitgestellte UTC-Datum
    today.setUTCHours(0, 0, 0, 0);

    const minStartDate = new Date(today.getTime());
    minStartDate.setUTCDate(today.getUTCDate() + 1);
    this.minVerteilungStartdatum = this.formatDateToYyyyMmDd(minStartDate);

    this.defaultStandardStartDate = this.addWorkingDays(new Date(today.getTime()), 4);

    let initialStartDate = new Date(this.defaultStandardStartDate.getTime());
    if (initialStartDate.getTime() < minStartDate.getTime()) {
      initialStartDate = new Date(minStartDate.getTime());
    }
    this.verteilungStartdatum = this.formatDateToYyyyMmDd(initialStartDate);

    const initialEndDate = new Date(initialStartDate.getTime());
    initialEndDate.setUTCDate(initialStartDate.getUTCDate() + 7);
    this.verteilungEnddatum = this.formatDateToYyyyMmDd(initialEndDate);

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
    return new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  }


  private addWorkingDays(baseDate: Date, daysToAdd: number): Date {
    let currentDate = new Date(baseDate.getTime());
    let workingDaysAdded = 0;
    while (workingDaysAdded < daysToAdd) {
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      if (currentDate.getUTCDay() !== 0) { // 0 = Sonntag in UTC
        workingDaysAdded++;
      }
    }
    return currentDate;
  }


  onStartDateChange(): void {
    this.expressSurchargeConfirmed = false;
    if (!this.verteilungStartdatum) {
      this.verteilungEnddatum = '';
      this.showExpressSurcharge = false;
      this.updateOverallValidationState();
      this.cdr.markForCheck();
      return;
    }

    const selectedStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minStartDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);

    if (selectedStartDate.getTime() < minStartDate.getTime()) {
      this.verteilungStartdatum = this.formatDateToYyyyMmDd(minStartDate);
      this.cdr.detectChanges(); // Ensure change is picked up before recursive call
      this.onStartDateChange(); // Re-trigger logic with corrected date
      return;
    }

    const newEndDate = new Date(selectedStartDate.getTime());
    newEndDate.setUTCDate(selectedStartDate.getUTCDate() + 7);
    this.verteilungEnddatum = this.formatDateToYyyyMmDd(newEndDate);

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

    const needsSurcharge = selectedStartDate.getTime() < this.defaultStandardStartDate.getTime() && selectedStartDate.getTime() >= minAllowedStartDate.getTime();

    if (needsSurcharge) {
      this.showExpressSurcharge = !this.expressSurchargeConfirmed;
    } else {
      this.showExpressSurcharge = false;
      this.expressSurchargeConfirmed = false; // Reset if no longer applicable
    }
  }

  public avoidExpressSurcharge(): void {
    this.expressSurchargeConfirmed = false; // Ensure this is reset
    if (this.defaultStandardStartDate) {
      this.verteilungStartdatum = this.formatDateToYyyyMmDd(this.defaultStandardStartDate);
      this.onStartDateChange(); // This will call checkExpressSurcharge and updateOverallValidationState
    }
    // this.showExpressSurcharge = false; // onStartDateChange will handle this via checkExpressSurcharge
    // this.updateOverallValidationState(); // onStartDateChange handles this
    this.cdr.markForCheck();
  }

  public confirmExpressSurcharge(): void {
    this.expressSurchargeConfirmed = true;
    this.showExpressSurcharge = false; // Hide the surcharge UI
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }


  ngAfterViewInit(): void {
    Promise.resolve().then(() => { this.updateOverallValidationState(); this.cdr.markForCheck(); });
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
  }

  setVerteilungTyp(typ: VerteilungTypOption): void {
    if (this.currentVerteilungTyp !== typ) {
      this.currentVerteilungTyp = typ;
      this.onVerteilungTypChangeFromTemplate(typ);
    }
  }

  setZielgruppe(zielgruppe: ZielgruppeOption): void {
    if (this.currentZielgruppe !== zielgruppe) {
      this.currentZielgruppe = zielgruppe;
      this.onZielgruppeChange();
    }
  }

  // Removed setAnlieferung and setFormat methods

  onVerteilungTypChangeFromTemplate(newVerteilungTyp: VerteilungTypOption): void {
    this.updateUiFlagsAndMapState();
  }

  onZielgruppeChange(): void {
    this.highlightFlyerMaxColumn = true; this.cdr.markForCheck();
    setTimeout(() => { this.highlightFlyerMaxColumn = false; this.cdr.markForCheck(); }, COLUMN_HIGHLIGHT_DURATION);
    this.updateOverallValidationState();
  }

  private updateUiFlags(verteilungTyp: VerteilungTypOption): void {
    this.showPlzUiContainer = verteilungTyp === 'Nach PLZ';
    this.showPerimeterUiContainer = verteilungTyp === 'Nach Perimeter';
  }

  private updateUiFlagsAndMapState(): void {
    this.updateUiFlags(this.currentVerteilungTyp);
    this.cdr.detectChanges(); // Allow UI to update based on flags
    this.updateOverallValidationState(); // Then validate
    this.cdr.markForCheck();
  }

  onPlzClickedOnMap(event: { id: string; name?: string }): void {
    const entryIdFromMap = event.id;
    if (!entryIdFromMap) return;

    const isCurrentlySelected = this.selectionService.getSelectedEntries().some(e => e.id === entryIdFromMap);

    if (isCurrentlySelected) {
      this.selectionService.removeEntry(entryIdFromMap);
    } else {
      this.plzDataService.getEntryById(entryIdFromMap).subscribe(entry => {
        if (entry && this.selectionService.validateEntry(entry)) {
          this.selectionService.addEntry(entry);
        } else {
          // Fallback for entries not in PlzDataService, e.g., custom KML entries if applicable
          const plz6 = entryIdFromMap; // Assuming ID is PLZ6 or similar unique ID
          const plz4 = plz6.length >= 4 ? plz6.substring(0, 4) : plz6;
          const pseudoOrt = event.name || 'Unbekannt'; // Use name from map event if available
          const pseudoEntry: PlzEntry = { id: entryIdFromMap, plz6, plz4, ort: pseudoOrt, kt: 'N/A', all: 0, mfh: 0, efh: 0 };
          if (this.selectionService.validateEntry(pseudoEntry)) { // Ensure validation still applies
            this.selectionService.addEntry(pseudoEntry);
          }
        }
        this.cdr.markForCheck(); // Update UI after async operation
      });
    }
    // No need to call updateOverallValidationState here, as it's called by selectedEntries$ subscription
  }

  onMapLoadingStatusChanged(isLoading: boolean): void {
    this.mapIsLoading = isLoading;
    this.cdr.markForCheck();
  }

  quickSearch(term: string): void {
    this.typeaheadSearchTerm = term;
    this.currentTypeaheadSelection = null; // Clear any previous selection
    this.focusEmitter.next(''); // Trigger typeahead update
    this.focusEmitter.next(term); // Trigger typeahead update
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
    this.isTypeaheadListOpen = false; // Explicitly set

    if (clearResults) {
      this.currentSearchResultsContainer = null;
      this.isCustomHeaderOpen = false; // Explicitly set
    } else if (!this.currentSearchResultsContainer || !this.currentSearchResultsContainer.headerText) {
      // If not clearing results, but there's no container or header, ensure header is closed
      this.isCustomHeaderOpen = false;
    }
    // If clearResults is false and there IS a header, isCustomHeaderOpen remains as is.

    if (clearSearchTerm) this.typeaheadSearchTerm = '';
    if (clearSelectionModel) this.currentTypeaheadSelection = null;

    this.cdr.markForCheck();
  }

  searchPlzTypeahead = (text$: Observable<string>): Observable<EnhancedSearchResultItem[]> =>
    merge(text$, this.focusEmitter).pipe(
      debounceTime(text$ === this.focusEmitter ? 0 : 250), // No debounce for focus, 250ms for text input
      distinctUntilChanged(),
      switchMap(term => {
        this.typeaheadHoverResultsForMapIds = []; // Clear map highlights

        if (this.plzRangeRegex.test(term)) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
          this.textInputStatus = 'valid'; // Range is a valid input type
          this.updateOverallValidationState();
          return of([]); // Don't show typeahead list for ranges
        }

        if (term === '' || term.length < 2) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: term === '', clearSelectionModel: true, clearResults: true });
          this.textInputStatus = 'invalid';
          this.updateOverallValidationState();
          return of([]);
        }

        this.searching = true;
        this.textInputStatus = 'pending'; // Input is being processed
        this.updateOverallValidationState();
        this.cdr.markForCheck();

        return this.plzDataService.searchEnhanced(term).pipe(
          tap(resultsContainer => {
            this.searching = false;
            this.currentSearchResultsContainer = resultsContainer;

            const hasItems = resultsContainer.itemsForDisplay.length > 0;
            const hasHeaderMessage = !!resultsContainer.headerText && resultsContainer.headerText !== `Keine Einträge für "${term}" gefunden.`;
            const hasActionableHeader = hasHeaderMessage && resultsContainer.showSelectAllButton && resultsContainer.entriesForSelectAllAction.length > 0;

            this.isCustomHeaderOpen = hasItems || hasHeaderMessage; // Show header if items or a message exists
            this.isTypeaheadListOpen = hasItems; // Open list only if there are items

            if (hasItems) {
              this.textInputStatus = 'pending'; // Still pending until an item is selected or input cleared
              this.typeaheadHoverResultsForMapIds = resultsContainer.itemsForDisplay
                .filter(item => !item.isGroupHeader && item.id) // Ensure id exists
                .map(item => item.id!); // Use non-null assertion if id is guaranteed
            } else if (hasActionableHeader) {
              this.textInputStatus = 'pending'; // Header provides an action
            } else {
              this.textInputStatus = 'invalid'; // No items, no actionable header
            }
            // Explicitly set to invalid if term is too short for a non-range search and no results/header
            if (term.length >=2 && !this.plzRangeRegex.test(term) && !hasItems && !hasActionableHeader) {
              this.textInputStatus = 'invalid';
            }


            this.cdr.markForCheck();

            // Focus management after results are processed
            if (this.isTypeaheadListOpen || this.isCustomHeaderOpen) {
              setTimeout(() => this.setInitialFocusInTypeahead(), 0); // Ensure UI is updated before focus
            }
            this.updateOverallValidationState(); // Re-validate with new search state
          }),
          map(resultsContainer => resultsContainer.itemsForDisplay),
          catchError(() => {
            this.searching = false;
            this.currentSearchResultsContainer = { searchTerm: term, searchTypeDisplay: 'none', itemsForDisplay: [], headerText: 'Fehler bei der Suche.', showSelectAllButton: false, entriesForSelectAllAction: [] };
            this.isCustomHeaderOpen = true; this.isTypeaheadListOpen = false;
            this.textInputStatus = 'invalid';
            this.typeaheadHoverResultsForMapIds = [];
            this.updateOverallValidationState();
            this.cdr.markForCheck(); return of([]);
          })
        );
      })
    );

  onTypeaheadInputChange(term: string): void {
    // If a selection was made and then input changes, clear the selection model
    if (this.currentTypeaheadSelection && this.typeaheadInputFormatter(this.currentTypeaheadSelection) !== term) {
      this.currentTypeaheadSelection = null;
    }

    if (term === '') {
      this.currentTypeaheadSelection = null; // Clear selection if input is empty
      this.typeaheadHoverResultsForMapIds = [];
      this.textInputStatus = 'invalid';
    } else if (this.plzRangeRegex.test(term)) {
      this.textInputStatus = 'valid'; // A range is a valid input state
      this.currentTypeaheadSelection = null; // No specific item selected for a range
    } else if (term.length < 2) {
      this.textInputStatus = 'invalid'; // Too short for a meaningful search (unless it's a range)
    } else {
      // If term is >= 2 chars and not a range, it's 'pending' until a selection or it's confirmed invalid by search results
      this.textInputStatus = this.currentTypeaheadSelection ? 'valid' : 'pending';
    }
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }


  typeaheadItemSelected(event: NgbTypeaheadSelectItemEvent<EnhancedSearchResultItem>): void {
    event.preventDefault(); // Prevent ngbTypeahead from putting the object in the input
    const selectedItem = event.item;
    if (!selectedItem) return;
    this.handleTakeItemFromTypeahead(selectedItem);
  }

  handleTakeItemFromTypeahead(item: EnhancedSearchResultItem, event?: MouseEvent): void {
    event?.stopPropagation(); event?.preventDefault(); // Prevent default actions if called from click
    if (!item) return;

    if (item.isGroupHeader) {
      // If it's a group header, attempt to add all related entries
      if (this.currentSearchResultsContainer?.entriesForSelectAllAction && this.currentSearchResultsContainer.entriesForSelectAllAction.length > 0 && this.currentSearchResultsContainer.searchTypeDisplay === 'ort' && this.currentSearchResultsContainer.searchTerm.toLowerCase() === item.ort.toLowerCase()) {
        // Use pre-fetched entries if available and relevant to the clicked group header
        this.selectionService.addMultipleEntries(this.currentSearchResultsContainer.entriesForSelectAllAction);
      } else {
        // Fallback to fetching entries by Ort if specific group entries aren't pre-loaded
        this.plzDataService.getEntriesByOrt(item.ort).subscribe(entries => {
          if (entries.length > 0) {
            this.selectionService.addMultipleEntries(entries);
          }
        });
      }
    } else {
      // Add single entry
      const entryToAdd: PlzEntry = {
        id: item.id, plz6: item.plz6, plz4: item.plz4, ort: item.ort, kt: item.kt,
        all: item.all, mfh: item.mfh, efh: item.efh, isGroupEntry: item.isGroupEntry ?? false
      };
      this.selectionService.addEntry(entryToAdd);
    }
    this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
    this.typeaheadHoverResultsForMapIds = []; // Clear highlights
    // No need to call updateOverallValidationState, selectedEntries$ subscription handles it
  }

  handleSelectAllFromTypeaheadHeader(): void {
    if (this.currentSearchResultsContainer?.showSelectAllButton && this.currentSearchResultsContainer.entriesForSelectAllAction.length > 0) {
      this.selectionService.addMultipleEntries(this.currentSearchResultsContainer.entriesForSelectAllAction);
    }
    this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
    this.typeaheadHoverResultsForMapIds = [];
    // No need to call updateOverallValidationState, selectedEntries$ subscription handles it
  }


  onSearchFocus(): void {
    const term = this.typeaheadSearchTerm;
    // Re-trigger search on focus if term is valid for search or if results were previously shown
    if ((term.length >= 2 && !this.plzRangeRegex.test(term)) || term === '' || this.currentSearchResultsContainer) {
      this.focusEmitter.next(term); // Use current term to re-open/refresh typeahead
    }
    this.cdr.markForCheck();
  }

  onSearchBlur(): void {
    setTimeout(() => {
      if (!this.isMouseOverPopupOrHeader) { // Don't close if mouse is over popup/header
        const isRange = this.plzRangeRegex.test(this.typeaheadSearchTerm.trim());
        if ((isRange && this.textInputStatus === 'valid') || this.currentTypeaheadSelection) {
          // If input is a valid range or an item is selected, keep the input text but close popup
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: false, clearResults: false });
        } else {
          // Otherwise, clear everything (or just the popup and selection model)
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
        }
        this.typeaheadHoverResultsForMapIds = []; // Clear map highlights on blur
      }
    }, 200); // Delay to allow click on typeahead/header
  }

  addCurrentSelectionToTable(): void {
    const searchTerm = this.typeaheadSearchTerm.trim();
    const rangeMatch = searchTerm.match(this.plzRangeRegex);

    if (rangeMatch && searchTerm !== '') { // It's a PLZ range
      this.plzDataService.getEntriesByPlzRange(searchTerm).subscribe(entries => {
        if (entries.length > 0) {
          this.selectionService.addMultipleEntries(entries);
        } else {
          if (isPlatformBrowser(this.platformId)) alert(`Für den Bereich "${searchTerm}" wurden keine gültigen PLZ-Gebiete gefunden.`);
        }
        this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
        this.typeaheadHoverResultsForMapIds = [];
      });
    } else if (this.currentTypeaheadSelection) { // An item was selected from typeahead
      this.handleTakeItemFromTypeahead(this.currentTypeaheadSelection);
      // handleTakeItemFromTypeahead already closes typeahead and clears term
    }
    // No action if neither condition is met (e.g. invalid text input)
    // updateOverallValidationState is handled by selectedEntries$ subscription
  }

  removePlzFromTable(entry: PlzEntry): void {
    this.selectionService.removeEntry(entry.id);
    // updateOverallValidationState is handled by selectedEntries$ subscription
  }

  clearPlzTable(): void {
    this.selectionService.clearEntries();
    this.typeaheadHoverResultsForMapIds = []; // Clear any lingering highlights
    // updateOverallValidationState is handled by selectedEntries$ subscription
  }

  zoomToTableEntryOnMap(entry: PlzEntry): void {
    this.mapZoomToPlzId = entry.id;
    this.mapZoomToPlzIdList = null; // Clear list zoom if single zoom is triggered
    this.cdr.markForCheck();
    setTimeout(() => { this.mapZoomToPlzId = null; this.cdr.markForCheck(); }, 100); // Reset after a short delay
  }

  highlightPlacemarkOnMapFromTable(plzId: string | null, highlight: boolean): void {
    this.mapTableHoverPlzId = highlight ? plzId : null;
    this.cdr.markForCheck();
  }

  getFlyerMaxForEntry(entry: PlzEntry): number {
    if (!entry) return 0;
    switch (this.currentZielgruppe) {
      case 'Mehrfamilienhäuser': return entry.mfh ?? 0;
      case 'Ein- und Zweifamilienhäuser': return entry.efh ?? 0;
      default: return entry.all ?? 0; // Alle Haushalte
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
      this.currentTypeaheadSelection = null; // Clear selection if status is forced to invalid
      this.typeaheadSearchTerm = ''; // Optionally clear search term too
    }
    this.updateOverallValidationState();
    this.cdr.markForCheck();
  }

  private updateOverallValidationState(): void {
    const mapHasSelection = this.selectionService.getSelectedEntries().length > 0;
    let newOverallStatus: ValidationStatus = 'invalid';

    // const anlieferungSelected = !!this.currentAnlieferung; // Removed
    // const formatSelected = !!this.currentFormat; // Removed
    const startDateSelected = !!this.verteilungStartdatum;
    const endDateSelected = !!this.verteilungEnddatum; // This is derived, so start date is key

    // Verteilungsdetails now only depend on dates and express surcharge confirmation
    const verteilungsDetailsCompleteBasic = startDateSelected && endDateSelected;
    const isExpressRelevant = this.verteilungStartdatum && this.defaultStandardStartDate &&
      this.parseYyyyMmDdToDate(this.verteilungStartdatum).getTime() < this.defaultStandardStartDate.getTime() &&
      this.parseYyyyMmDdToDate(this.verteilungStartdatum).getTime() >= this.parseYyyyMmDdToDate(this.minVerteilungStartdatum).getTime();
    const expressConditionMet = !isExpressRelevant || (isExpressRelevant && this.expressSurchargeConfirmed);

    const verteilungsDetailsComplete = verteilungsDetailsCompleteBasic && expressConditionMet;


    if (this.showPlzUiContainer) {
      const searchTerm = this.typeaheadSearchTerm.trim();
      const isRangeInputValid = this.plzRangeRegex.test(searchTerm);
      // Valid if: (item selected OR map has items OR valid range input) AND distribution details are complete
      if ((this.currentTypeaheadSelection || mapHasSelection || (isRangeInputValid && searchTerm !== '')) && verteilungsDetailsComplete) {
        newOverallStatus = 'valid';
      } else if (this.textInputStatus === 'pending' && !mapHasSelection && verteilungsDetailsComplete) {
        // If input is pending (e.g. typing) but other conditions for 'valid' are not met (no map selection yet)
        // and distribution details are complete, overall can be pending.
        newOverallStatus = 'pending';
      } else {
        newOverallStatus = 'invalid';
      }
    } else if (this.showPerimeterUiContainer) {
      // For perimeter, only distribution details matter for this step's validation
      if (verteilungsDetailsComplete) {
        newOverallStatus = 'valid';
      } else {
        newOverallStatus = 'invalid';
      }
    }

    // Refined pending state: if overall is invalid due to text input, but text input itself is 'pending'
    // and other criteria (like date selection) are met, then overall should be 'pending'.
    if (newOverallStatus === 'invalid' && this.textInputStatus === 'pending' && this.showPlzUiContainer && !mapHasSelection && !this.currentTypeaheadSelection && !this.plzRangeRegex.test(this.typeaheadSearchTerm.trim()) && verteilungsDetailsComplete) {
      newOverallStatus = 'pending';
    }


    if (this.validationChange.observers.length > 0) {
      this.validationChange.emit(newOverallStatus);
    }
    this.cdr.markForCheck(); // Ensure UI updates with validation changes
  }

  proceedToNextStep(): void {
    // Re-run validation before proceeding to ensure latest state
    this.updateOverallValidationState(); // This will emit the latest status

    // Use a local variable to check the status after re-validation
    // This avoids race conditions if validationChange emission is async or has side effects
    // For this direct check, we re-evaluate conditions similarly to updateOverallValidationState
    let currentOverallStatusForProceed: ValidationStatus = 'invalid'; // Default to invalid

    const mapHasSelection = this.selectionService.getSelectedEntries().length > 0;
    const searchTerm = this.typeaheadSearchTerm.trim();
    const isRangeInputValid = this.plzRangeRegex.test(searchTerm);
    const startDateSelected = !!this.verteilungStartdatum;
    const endDateSelected = !!this.verteilungEnddatum;

    const verteilungsDetailsCompleteBasic = startDateSelected && endDateSelected;
    const isExpressRelevant = this.verteilungStartdatum && this.defaultStandardStartDate &&
      this.parseYyyyMmDdToDate(this.verteilungStartdatum).getTime() < this.defaultStandardStartDate.getTime() &&
      this.parseYyyyMmDdToDate(this.verteilungStartdatum).getTime() >= this.parseYyyyMmDdToDate(this.minVerteilungStartdatum).getTime();
    const expressConditionMet = !isExpressRelevant || (isExpressRelevant && this.expressSurchargeConfirmed);
    const verteilungsDetailsComplete = verteilungsDetailsCompleteBasic && expressConditionMet;


    if (this.showPlzUiContainer) {
      if ((this.currentTypeaheadSelection || mapHasSelection || (isRangeInputValid && searchTerm !== '')) && verteilungsDetailsComplete) {
        currentOverallStatusForProceed = 'valid';
      } else if (this.textInputStatus === 'pending' && !mapHasSelection && verteilungsDetailsComplete) {
        currentOverallStatusForProceed = 'pending';
      } else {
        currentOverallStatusForProceed = 'invalid';
      }
    } else if (this.showPerimeterUiContainer) {
      if (verteilungsDetailsComplete) {
        currentOverallStatusForProceed = 'valid';
      } else {
        currentOverallStatusForProceed = 'invalid';
      }
    }

    // If overall status is pending solely due to text input, but dates are not complete, it's invalid.
    if (currentOverallStatusForProceed === 'pending' && !verteilungsDetailsComplete){
      currentOverallStatusForProceed = 'invalid';
    }
    // If status is valid, but text input is pending (e.g. user typed valid chars but didn't select/confirm range)
    // and there's no map selection or confirmed typeahead selection or valid range, it should be pending.
    if (currentOverallStatusForProceed === 'valid' && this.textInputStatus === 'pending' && this.showPlzUiContainer && !mapHasSelection && !this.currentTypeaheadSelection && !this.plzRangeRegex.test(searchTerm.trim())) {
      currentOverallStatusForProceed = 'pending';
    }


    this.validationChange.emit(currentOverallStatusForProceed); // Emit final decision

    if (currentOverallStatusForProceed === 'valid') {
      // If a valid PLZ range is typed but not yet processed into selectionService, do it now.
      if (this.showPlzUiContainer && isRangeInputValid && searchTerm !== '' && !this.currentTypeaheadSelection && !mapHasSelection) {
        this.plzDataService.getEntriesByPlzRange(searchTerm).subscribe(entries => {
          if (entries.length > 0) {
            this.selectionService.addMultipleEntries(entries);
            this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
            this.typeaheadHoverResultsForMapIds = [];
            this.nextStepRequest.emit();
          } else {
            // Range was valid format but yielded no results.
            if (isPlatformBrowser(this.platformId)) alert(`Für den Bereich "${searchTerm}" wurden keine gültigen PLZ-Gebiete gefunden. Ihre Auswahl wurde nicht geändert.`);
            this.textInputStatus = 'invalid'; // Mark input as invalid now
            this.updateOverallValidationState(); // Re-validate
          }
        });
      } else {
        this.nextStepRequest.emit();
      }
    } else {
      // Construct and show alert message
      let message = "Bitte vervollständigen Sie Ihre Auswahl. Stellen Sie sicher, dass ein Zielgebiet definiert und alle Verteilungsdetails (Zeitraum) ausgewählt sind.";
      if (currentOverallStatusForProceed === 'pending') {
        message = "Bitte vervollständigen Sie Ihre Eingabe im Suchfeld oder wählen Sie einen Eintrag aus der Liste.";
      } else if (!verteilungsDetailsCompleteBasic) { // Check basic date selection first
        const missingDetails: string[] = [];
        if (!startDateSelected) missingDetails.push("Startdatum");
        // Removed Anlieferart and Format from here
        message = `Bitte wählen Sie folgende Details aus: ${missingDetails.join(', ')}.`;
      } else if (isExpressRelevant && !this.expressSurchargeConfirmed) {
        message = "Bitte bestätigen Sie den Express-Zuschlag oder wählen Sie ein späteres Startdatum.";
      }
      // Message for invalid PLZ input if other details are fine
      else if (this.showPlzUiContainer && !mapHasSelection && !(isRangeInputValid && searchTerm !== '') && !this.currentTypeaheadSelection) {
        message = "Die Eingabe im Suchfeld ist ungültig oder unvollständig und es sind keine PLZ-Gebiete auf der Karte ausgewählt. Bitte korrigieren Sie Ihre Auswahl oder geben Sie einen gültigen PLZ-Bereich ein (z.B. 8000-8045).";
      }
      if (isPlatformBrowser(this.platformId)) alert(message);
    }
  }

  highlight(text: string, term: string): string {
    if (!term || term.length === 0 || !text) return text;
    const R_SPECIAL = /[-\/\\^$*+?.()|[\]{}]/g;
    const safeTerm = term.replace(R_SPECIAL, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    try { return text.replace(regex, '<mark>$1</mark>'); } catch (e) { return text; } // Fallback for safety
  }

  isAddButtonDisabled(): boolean {
    const searchTerm = this.typeaheadSearchTerm.trim();
    const isRange = this.plzRangeRegex.test(searchTerm);
    if (isRange && searchTerm !== '') return false; // Can add if it's a valid range format
    if (this.currentTypeaheadSelection) return false; // Can add if an item is selected
    // Disable if neither of above and text input is not in a 'valid' (but unselected) state
    return !(this.textInputStatus === 'valid' && searchTerm !== '');
  }

  isOrtSearchForTemplate(): boolean { return this.currentSearchResultsContainer?.searchTypeDisplay === 'ort'; }
  isPlzSearchForTemplate(): boolean { return this.currentSearchResultsContainer?.searchTypeDisplay === 'plz'; }
  isMixedSearchForTemplate(): boolean { return this.currentSearchResultsContainer?.searchTypeDisplay === 'mixed'; }

  private setInitialFocusInTypeahead(): void {
    // Focus selectAllButton if it's visible and relevant
    if (this.isCustomHeaderOpen && this.currentSearchResultsContainer?.showSelectAllButton && this.selectAllButtonEl?.nativeElement) {
      this.selectAllButtonEl.nativeElement.focus({ preventScroll: true });
    }
    // else if (this.isTypeaheadListOpen && this.typeaheadInstance?.popupId) {
    // Potentially focus the first item in the typeahead list if selectAllButton is not available
    // This is often handled by ngbTypeahead's focusFirst option, but can be customized here if needed.
    // }
  }

  resultFormatter = (result: EnhancedSearchResultItem): string => {
    if (!result) return '';
    if (result.isGroupHeader) {
      return `${result.ort || result.plz4}${result.childPlzCount ? ` (${result.childPlzCount} PLZ)` : ''}`;
    }
    // For individual items, show PLZ, Ort, and KT
    return `${result.plz4 ? result.plz4 + ' ' : ''}${result.ort}${result.kt && result.kt !== 'N/A' ? ' - ' + result.kt : ''}`;
  };

  typeaheadInputFormatter = (item: EnhancedSearchResultItem | string | null): string => {
    if (typeof item === 'string') return item; // Handles direct string input (e.g., when typing a range)
    if (item) { // If item is an EnhancedSearchResultItem object
      if (item.isGroupHeader) {
        return `${item.ort || item.plz4}`; // For group headers, display Ort or PLZ4
      }
      // For individual items, format similarly to resultFormatter
      return `${item.plz4 ? item.plz4 + ' ' : ''}${item.ort}${item.kt && item.kt !== 'N/A' ? ' - ' + item.kt : ''}`;
    }
    // If no item is selected (e.g. currentTypeaheadSelection is null)
    // and the current search term is a valid PLZ range, display the search term itself.
    if (this.currentTypeaheadSelection === null && this.plzRangeRegex.test(this.typeaheadSearchTerm)) {
      return this.typeaheadSearchTerm;
    }
    return ''; // Default to empty string if no item or specific condition met
  };

  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.isTypeaheadListOpen || this.isCustomHeaderOpen) {
      event.preventDefault();
      this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
      this.typeaheadHoverResultsForMapIds = [];
      this.onTypeaheadInputChange(this.typeaheadSearchTerm); // Re-evaluate input state
    }
  }

  // Handles Enter key on the "Select All" button in the typeahead header
  @HostListener('keydown', ['$event'])
  handleFormKeyDown(event: KeyboardEvent) {
    if (this.isCustomHeaderOpen && this.currentSearchResultsContainer?.showSelectAllButton) {
      if (document.activeElement === this.selectAllButtonEl?.nativeElement && event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission or other default Enter behavior
        this.handleSelectAllFromTypeaheadHeader();
      }
    }
  }
}
