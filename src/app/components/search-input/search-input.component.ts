import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef,
  ChangeDetectionStrategy, ChangeDetectorRef, forwardRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbTypeahead } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil, tap, map } from 'rxjs/operators';
import { PlzDataService, SearchResultsContainer, EnhancedSearchResultItem, PlzEntry } from '../../services/plz-data.service';

export interface CloseTypeaheadOptions {
  clearSearchTerm?: boolean;
  clearSelectionModel?: boolean;
  clearResults?: boolean;
}

export type ValidationStatus = 'valid' | 'invalid' | 'pending';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NgbTypeaheadModule
  ],
  templateUrl: './search-input.component.html',
  styleUrls: ['./search-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchInputComponent),
      multi: true
    }
  ]
})
export class SearchInputComponent implements OnInit, OnDestroy, ControlValueAccessor {
  @ViewChild('typeaheadInstance') typeaheadInstance!: NgbTypeahead;
  @ViewChild('typeaheadInputEl') typeaheadInputEl!: ElementRef<HTMLInputElement>;
  @ViewChild('selectAllButtonEl') selectAllButtonEl!: ElementRef<HTMLButtonElement>;

  @Input() placeholder: string = 'Suchen...';
  @Input() placeholderText: string = 'Suchen...';
  @Input() plzRangeRegex: RegExp = /^\s*(\d{4,6})\s*-\s*(\d{4,6})\s*$/;

  @Output() searchTermChange = new EventEmitter<string>();
  @Output() selectionChange = new EventEmitter<EnhancedSearchResultItem | null>();
  @Output() statusChange = new EventEmitter<ValidationStatus>();
  @Output() hoveredPlzIdsChanged = new EventEmitter<string[]>();
  @Output() quickSearchRequest = new EventEmitter<string>();
  @Output() takeItem = new EventEmitter<EnhancedSearchResultItem>();
  @Output() itemSelected = new EventEmitter<EnhancedSearchResultItem>();
  @Output() selectAllRequest = new EventEmitter<PlzEntry[]>();
  @Output() searchFocus = new EventEmitter<void>();
  @Output() searchBlur = new EventEmitter<void>();
  @Output() searchInProgress = new EventEmitter<boolean>();
  @Output() isCurrentlyValidToSubmitSearch = new EventEmitter<boolean>();

  private destroy$ = new Subject<void>();
  private focusEmitter = new Subject<string>();
  private onChange: any = () => {};
  private onTouched: any = () => {};
  private suppressNextBlur = false;
  // Flag to prevent infinite recursion
  private isHandlingExternalQuickSearch = false;

  typeaheadSearchTerm: string = '';
  currentTypeaheadSelection: EnhancedSearchResultItem | null = null;
  searching: boolean = false;
  typeaheadHoverResultsForMapIds: string[] = [];
  textInputStatus: ValidationStatus = 'invalid';

  currentSearchResultsContainer: SearchResultsContainer | null = null;
  isTypeaheadListOpen = false;
  isCustomHeaderOpen = false;
  isMouseOverPopupOrHeader = false;

  private isInputFocused = false;
  private blurBlockTimeout: any = null;

  constructor(
    private plzDataService: PlzDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.blurBlockTimeout) {
      clearTimeout(this.blurBlockTimeout);
    }
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.typeaheadSearchTerm = value || '';
    this.cdr.markForCheck();
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    // Not needed for now
  }

  // Public methods
  focus(): void {
    if (this.typeaheadInputEl?.nativeElement) {
      this.typeaheadInputEl.nativeElement.focus();
    }
  }

  onTypeaheadPopupMouseEnter(): void {
    this.isMouseOverPopupOrHeader = true;
  }

  onTypeaheadPopupMouseLeave(): void {
    this.isMouseOverPopupOrHeader = false;
  }

  closeTypeaheadAndHeader(options: CloseTypeaheadOptions = {}): void {
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
    if (clearSearchTerm) {
      this.typeaheadSearchTerm = '';
      this.onChange('');
    }
    if (clearSelectionModel) {
      this.currentTypeaheadSelection = null;
      this.selectionChange.emit(null);
    }
    this.cdr.markForCheck();
  }

  searchPlzTypeahead = (text$: Observable<string>): Observable<EnhancedSearchResultItem[]> =>
    merge(text$, this.focusEmitter).pipe(
      debounceTime(150),
      distinctUntilChanged(),
      switchMap(term => {
        this.typeaheadHoverResultsForMapIds = [];
        this.hoveredPlzIdsChanged.emit([]);
        if (!term || term.trim().length < 2) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: term === '', clearSelectionModel: true, clearResults: true });
          this.textInputStatus = 'invalid';
          this.statusChange.emit(this.textInputStatus);
          this.isCurrentlyValidToSubmitSearch.emit(false);
          return of([]);
        }
        this.searching = true;
        this.searchInProgress.emit(true);
        this.textInputStatus = 'pending';
        this.statusChange.emit(this.textInputStatus);
        this.isCurrentlyValidToSubmitSearch.emit(false);
        this.cdr.markForCheck();

        return this.plzDataService.searchEnhanced(term).pipe(
          tap(resultsContainer => {
            this.searching = false;
            this.searchInProgress.emit(false);
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
              this.hoveredPlzIdsChanged.emit(this.typeaheadHoverResultsForMapIds);
            } else if (hasActionableHeader) {
              this.textInputStatus = 'pending';
            } else {
              this.textInputStatus = 'invalid';
            }
            if (term.length >= 2 && !hasItems && !hasActionableHeader) {
              this.textInputStatus = 'invalid';
            }
            this.statusChange.emit(this.textInputStatus);
            this.isCurrentlyValidToSubmitSearch.emit(false); // Changed line
            this.cdr.markForCheck();
            if (this.isTypeaheadListOpen || this.isCustomHeaderOpen) {
              setTimeout(() => this.setInitialFocusInTypeahead(), 0);
            }
          }),
          map(resultsContainer => resultsContainer.itemsForDisplay),
          catchError(() => {
            this.searching = false;
            this.searchInProgress.emit(false);
            this.currentSearchResultsContainer = {
              searchTerm: term, searchTypeDisplay: 'none', itemsForDisplay: [],
              headerText: 'Fehler bei der Suche.', showSelectAllButton: false, entriesForSelectAllAction: []
            };
            this.isCustomHeaderOpen = true; this.isTypeaheadListOpen = false;
            this.textInputStatus = 'invalid';
            this.statusChange.emit(this.textInputStatus);
            this.isCurrentlyValidToSubmitSearch.emit(false);
            this.typeaheadHoverResultsForMapIds = [];
            this.hoveredPlzIdsChanged.emit([]);
            this.cdr.markForCheck();
            return of([]);
          })
        );
      })
    );

  onTypeaheadInputChange(term: string): void {
    this.onChange(term);
    this.searchTermChange.emit(term);

    if (this.currentTypeaheadSelection && this.typeaheadInputFormatter(this.currentTypeaheadSelection) !== term) {
      this.currentTypeaheadSelection = null;
      this.selectionChange.emit(null);
    }
    if (term === '' || term.trim().length < 2) {
      this.textInputStatus = 'invalid';
      this.currentTypeaheadSelection = null;
      this.typeaheadHoverResultsForMapIds = [];
      this.hoveredPlzIdsChanged.emit([]);
    } else if (this.plzRangeRegex.test(term)) {
      this.textInputStatus = 'valid';
      this.currentTypeaheadSelection = null;
    } else {
      this.textInputStatus = this.currentTypeaheadSelection ? 'valid' : 'pending';
    }
    this.statusChange.emit(this.textInputStatus);
    this.isCurrentlyValidToSubmitSearch.emit(this.textInputStatus === 'valid');
    this.cdr.markForCheck();
  }

  typeaheadItemSelected(event: NgbTypeaheadSelectItemEvent<EnhancedSearchResultItem>): void {
    event.preventDefault();
    const selectedItem = event.item;
    if (!selectedItem) return;
    this.handleTakeItemFromTypeahead(selectedItem);
  }

  handleTakeItemFromTypeahead(item: EnhancedSearchResultItem, event?: MouseEvent): void {
    event?.stopPropagation();
    event?.preventDefault();
    if (!item) return;

    this.itemSelected.emit(item);
    this.takeItem.emit(item);
    this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
    this.typeaheadHoverResultsForMapIds = [];
    this.hoveredPlzIdsChanged.emit([]);
  }

  handleSelectAllFromTypeaheadHeader(): void {
    if (this.currentSearchResultsContainer?.entriesForSelectAllAction) {
      this.selectAllRequest.emit(this.currentSearchResultsContainer.entriesForSelectAllAction);
    }
    this.closeTypeaheadAndHeader({ clearSearchTerm: true, clearSelectionModel: true, clearResults: true });
    this.typeaheadHoverResultsForMapIds = [];
    this.hoveredPlzIdsChanged.emit([]);
  }

  onSearchFocus(): void {
    this.isInputFocused = true;
    this.onTouched();
    this.searchFocus.emit();
    setTimeout(() => {
      this.suppressNextBlur = false;
    }, 300);
    const term = this.typeaheadSearchTerm;
    if ((term.length >= 2 && !this.plzRangeRegex.test(term)) || term === '' || this.currentSearchResultsContainer) {
      this.focusEmitter.next(term);
    }
    this.cdr.markForCheck();
  }

  onSearchBlur(): void {
    this.isInputFocused = false;
    this.searchBlur.emit();
    if (this.suppressNextBlur) {
      return;
    }
    if (this.isMouseOverPopupOrHeader) {
      // Block Blur, refocus input
      clearTimeout(this.blurBlockTimeout);
      this.blurBlockTimeout = setTimeout(() => {
        if (!this.isInputFocused && this.typeaheadInputEl?.nativeElement) {
          this.typeaheadInputEl.nativeElement.focus();
        }
      }, 0);
      return;
    }
    setTimeout(() => {
      if (!this.isMouseOverPopupOrHeader) {
        const isRange = this.plzRangeRegex.test(this.typeaheadSearchTerm.trim());
        if ((isRange && this.textInputStatus === 'valid') || this.currentTypeaheadSelection) {
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: false, clearResults: false });
        } else {
          this.closeTypeaheadAndHeader({ clearSearchTerm: false, clearSelectionModel: true, clearResults: true });
        }
        this.typeaheadHoverResultsForMapIds = [];
        this.hoveredPlzIdsChanged.emit([]);
      }
    }, 200);
  }

  triggerQuickSearch(term: string): void {
    // Prevent infinite recursion
    if (this.isHandlingExternalQuickSearch) {
      return;
    }

    this.isHandlingExternalQuickSearch = true;
    this.typeaheadSearchTerm = term;
    this.onChange(term);
    this.currentTypeaheadSelection = null;
    this.selectionChange.emit(null);
    this.focusEmitter.next(term);
    this.suppressNextBlur = true;

    // Only emit the event if this is an internal call, not from parent
    // This prevents the infinite loop
    // this.quickSearchRequest.emit(term);

    setTimeout(() => {
      if (this.typeaheadInputEl?.nativeElement) {
        this.typeaheadInputEl.nativeElement.focus();
      }
      this.isHandlingExternalQuickSearch = false;
    }, 0);

    this.cdr.markForCheck();
  }

  highlight(text: string, term: string): string {
    if (!term || term.length === 0 || !text) return text;
    const R_SPECIAL = /[-\/\\^$*+?.()|[\]{}]/g;
    const safeTerm = term.replace(R_SPECIAL, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    try { return text.replace(regex, '<mark>$1</mark>'); } catch (e) { return text; }
  }

  private setInitialFocusInTypeahead(): void {
    if (this.isCustomHeaderOpen && this.currentSearchResultsContainer?.showSelectAllButton && this.selectAllButtonEl?.nativeElement) {
      this.selectAllButtonEl.nativeElement.focus({ preventScroll: true });
    }
  }

  typeaheadInputFormatter = (item: EnhancedSearchResultItem | string | null): string => {
    if (typeof item === 'string') return item;
    if (item) {
      if (item.isGroupHeader) return `${item.ort || item.plz4}`;
      return `${item.plz4 ? item.plz4 + ' ' : ''}${item.ort}${item.kt && item.kt !== 'N/A' ? ' - ' + item.kt : ''}`;
    }
    if (this.currentTypeaheadSelection === null && this.plzRangeRegex.test(this.typeaheadSearchTerm)) {
      return this.typeaheadSearchTerm;
    }
    return '';
  };

  resultFormatter = (result: EnhancedSearchResultItem): string => {
    if (!result) return '';
    if (result.isGroupHeader) {
      return `${result.ort || result.plz4}${result.childPlzCount ? ` (${result.childPlzCount} PLZ)` : ''}`;
    }
    return `${result.plz4 ? result.plz4 + ' ' : ''}${result.ort}${result.kt && result.kt !== 'N/A' ? ' - ' + result.kt : ''}`;
  };

  getSearchResultsContainer(): SearchResultsContainer | null {
    return this.currentSearchResultsContainer;
  }

  getCurrentSelection(): EnhancedSearchResultItem | null {
    return this.currentTypeaheadSelection;
  }

  getSearchTerm(): string {
    return this.typeaheadSearchTerm;
  }

  getValidationStatus(): ValidationStatus {
    return this.textInputStatus;
  }

  getIsTypeaheadListOpen(): boolean {
    return this.isTypeaheadListOpen;
  }

  getIsCustomHeaderOpen(): boolean {
    return this.isCustomHeaderOpen;
  }
}
