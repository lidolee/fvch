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
    this.cdr.detectChanges();
    this.updateOverallValidationState();
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
          const plz6 = entryIdFromMap;
          const plz4 = plz6.length >= 4 ? plz6.substring(0, 4) : plz6;
          const pseudoOrt = event.name || 'Unbekannt';
          const pseudoEntry: PlzEntry = { id: entryIdFromMap, plz6, plz4, ort: pseudoOrt, kt: 'N/A', all: 0, mfh: 0, efh: 0 };
          if (this.selectionService.validateEntry(pseudoEntry)) {
            this.selectionService.addEntry(pseudoEntry);
          }
        }
        this.cdr.markForCheck();
      });
    }
  }

  onMapLoadingStatusChanged(isLoading: boolean): void {
    this.mapIsLoading = isLoading;
    this.cdr.markForCheck();
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
      this.isCustomHeaderOpen = false;
    } else if (!this.currentSearchResultsContainer || !this.currentSearchResultsContainer.headerText) {
      this.isCustomHeaderOpen = false;
    }

    if (clearSearchTerm) this.typeaheadSearchTerm = '';
    if (clearSelectionModel) this.currentTypeaheadSelection = null;

    this.cdr.markForCheck();
  }

  searchPlzTypeahead = (text$: Observable<string>): Observable<EnhancedSearchResultItem[]> =>
    merge(text$, this.focusEmitter).pipe(
      debounceTime(text$ === this.focusEmitter ? 0 : 250),
      distinctUntilChanged(),
      switchMap(term => {
        this.typeaheadHoverResultsForMapIds = [];

        if (this.plzRangeRegex.test(term)) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
          this.textInputStatus = 'valid';
          this.updateOverallValidationState();
          return of([]);
        }

        if (term === '' || term.length < 2) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: term === '', clearSelectionModel: true, clearResults: true });
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
            this.currentSearchResultsContainer = resultsContainer;

            const hasItems = resultsContainer.itemsForDisplay.length > 0;
            const hasHeaderMessage = !!resultsContainer.headerText && resultsContainer.headerText !== `Keine Einträge für "${term}" gefunden.`;
            const hasActionableHeader = hasHeaderMessage && resultsContainer.showSelectAllButton && resultsContainer.entriesForSelectAllAction.length > 0;

            this.isCustomHeaderOpen = hasItems || hasHeaderMessage;
            this.isTypeaheadListOpen = hasItems;

            if (hasItems) {
              this.textInputStatus = 'pending';
              this.typeaheadHoverResultsForMapIds = resultsContainer.itemsForDisplay
                .filter(item => !item.isGroupHeader && item.id)
                .map(item => item.id!);
            } else if (hasActionableHeader) {
              this.textInputStatus = 'pending';
            } else {
              this.textInputStatus = 'invalid';
            }
            if (term.length >=2 && !this.plzRangeRegex.test(term) && !hasItems && !hasActionableHeader) {
              this.textInputStatus = 'invalid';
            }

            this.cdr.markForCheck();

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
            this.typeaheadHoverResultsForMapIds = [];
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
      this.typeaheadHoverResultsForMapIds = [];
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
        this.plzDataService.getEntriesByOrt(item.ort).subscribe(entries => {
          if (entries.length > 0) {
            this.selectionService.addMultipleEntries(entries);
          }
        });
      }
    } else {
      const entryToAdd: PlzEntry = {
        id: item.id, plz6: item.plz6, plz4: item.plz4, ort: item.ort, kt: item.kt,
        all: item.all, mfh: item.mfh, efh: item.efh, isGroupEntry: item.isGroupEntry ?? false
      };
      this.selectionService.addEntry(entryToAdd);
    }
    this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
    this.typeaheadHoverResultsForMapIds = [];
  }

  handleSelectAllFromTypeaheadHeader(): void {
    if (this.currentSearchResultsContainer?.showSelectAllButton && this.currentSearchResultsContainer.entriesForSelectAllAction.length > 0) {
      this.selectionService.addMultipleEntries(this.currentSearchResultsContainer.entriesForSelectAllAction);
    }
    this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
    this.typeaheadHoverResultsForMapIds = [];
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
        this.typeaheadHoverResultsForMapIds = [];
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
        this.typeaheadHoverResultsForMapIds = [];
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
    this.typeaheadHoverResultsForMapIds = [];
  }

  zoomToTableEntryOnMap(entry: PlzEntry): void {
    this.mapZoomToPlzId = entry.id;
    this.mapZoomToPlzIdList = null;
    this.cdr.markForCheck();
    setTimeout(() => { this.mapZoomToPlzId = null; this.cdr.markForCheck(); }, 100);
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

      if (this.currentTypeaheadSelection || mapHasSelection || (isRangeInputValid && searchTerm !== '')) {
        newOverallStatus = 'valid';
      }
      else if (this.textInputStatus === 'pending' && !mapHasSelection) {
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
      if (this.currentTypeaheadSelection || mapHasSelection || (isRangeInputValid && searchTerm !== '')) {
        currentOverallStatusForProceed = 'valid';
      } else if (this.textInputStatus === 'pending' && !mapHasSelection && searchTerm.length >=2) {
        currentOverallStatusForProceed = 'pending';
      }
    } else if (this.showPerimeterUiContainer) {
      currentOverallStatusForProceed = 'valid';
    }
    this.validationChange.emit(currentOverallStatusForProceed);

    if (currentOverallStatusForProceed === 'valid') {
      if (this.showPlzUiContainer && isRangeInputValid && searchTerm !== '' && !this.currentTypeaheadSelection && !mapHasSelection) {
        this.plzDataService.getEntriesByPlzRange(searchTerm).subscribe(entries => {
          if (entries.length > 0) {
            this.selectionService.addMultipleEntries(entries);
            this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
            this.typeaheadHoverResultsForMapIds = [];
            this.nextStepRequest.emit();
          } else {
            if (isPlatformBrowser(this.platformId)) alert(`Für den Bereich "${searchTerm}" wurden keine gültigen PLZ-Gebiete gefunden. Ihre Auswahl wurde nicht geändert.`);
            this.textInputStatus = 'invalid';
            this.updateOverallValidationState();
          }
        });
      } else {
        this.nextStepRequest.emit();
      }
    } else {
      const message = currentOverallStatusForProceed === 'pending'
        ? "Bitte vervollständigen Sie Ihre Eingabe im Suchfeld, wählen Sie einen Eintrag aus der Liste oder wählen Sie PLZ-Gebiete auf der Karte aus, um fortzufahren."
        : "Die Eingabe im Suchfeld ist ungültig oder unvollständig und es sind keine PLZ-Gebiete auf der Karte ausgewählt. Bitte korrigieren Sie Ihre Auswahl oder geben Sie einen gültigen PLZ-Bereich ein (z.B. 8000-8045).";
      if (isPlatformBrowser(this.platformId)) alert(message);
    }
  }

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
    if (isRange && searchTerm !== '') return false;
    if (this.currentTypeaheadSelection) return false;
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
    if (typeof item === 'string') return item;
    if (item) {
      if (item.isGroupHeader) {
        return `${item.ort || item.plz4}`;
      }
      return `${item.plz4 ? item.plz4 + ' ' : ''}${item.ort}${item.kt && item.kt !== 'N/A' ? ' - ' + item.kt : ''}`;
    }
    if (this.currentTypeaheadSelection === null && this.plzRangeRegex.test(this.typeaheadSearchTerm)) {
      return this.typeaheadSearchTerm;
    }
    return '';
  };

  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (this.isTypeaheadListOpen || this.isCustomHeaderOpen) {
      event.preventDefault();
      this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
      this.typeaheadHoverResultsForMapIds = [];
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
