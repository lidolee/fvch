import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef,
  ChangeDetectionStrategy, ChangeDetectorRef, forwardRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbTypeahead } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, tap } from 'rxjs/operators';
import { PlzDataService, EnhancedSearchResultItem, PlzEntry } from '../../services/plz-data.service'; // Pfad anpassen falls nötig

export type SimpleValidationStatus = 'valid' | 'invalid' | 'pending' | 'empty';

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

  @Input() placeholder: string = 'PLZ, Ort oder PLZ-Bereich (z.B. 8000-8045)';
  @Input() initialSearchTerm: string | null = null;

  @Output() entriesSelected = new EventEmitter<PlzEntry[]>();
  @Output() searchTermChanged = new EventEmitter<string>();
  @Output() inputStatusChanged = new EventEmitter<SimpleValidationStatus>();

  private destroy$ = new Subject<void>();
  public focusEmitter = new Subject<string>();

  public typeaheadSearchTerm: string = '';
  public searching: boolean = false;
  public currentStatus: SimpleValidationStatus = 'empty';

  private onChangeFn: (value: string) => void = () => {};
  private onTouchedFn: () => void = () => {};

  private readonly plzRangeRegex = /^\s*(\d{4,6})\s*-\s*(\d{4,6})\s*$/;

  constructor(
    private plzDataService: PlzDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.updateAndEmitStatus(this.typeaheadSearchTerm ? 'pending' : 'empty');
    if (this.initialSearchTerm) {
      setTimeout(() => this.initiateSearchForTerm(this.initialSearchTerm!), 0);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  writeValue(value: string | null): void {
    this.typeaheadSearchTerm = value || '';
    this.updateAndEmitStatus(this.typeaheadSearchTerm ? 'pending' : 'empty');
    this.cdr.markForCheck();
  }

  registerOnChange(fn: any): void { this.onChangeFn = fn; }
  registerOnTouched(fn: any): void { this.onTouchedFn = fn; }

  setDisabledState?(isDisabled: boolean): void {
    if (this.typeaheadInputEl?.nativeElement) {
      this.typeaheadInputEl.nativeElement.disabled = isDisabled;
    }
    this.cdr.markForCheck();
  }

  private updateAndEmitStatus(newStatus: SimpleValidationStatus): void {
    if (this.currentStatus !== newStatus) {
      this.currentStatus = newStatus;
      this.inputStatusChanged.emit(this.currentStatus);
    }
    this.cdr.markForCheck();
  }

  public initiateSearchForTerm(term: string): void {
    console.log('[SearchInputComponent] initiateSearchForTerm called with term:', term);
    this.typeaheadSearchTerm = term;
    this.onChangeFn(term);
    this.searchTermChanged.emit(term);
    this.cdr.detectChanges();

    setTimeout(() => {
      if (this.typeaheadInputEl?.nativeElement) {
        this.typeaheadInputEl.nativeElement.focus();
        if (this.typeaheadInputEl.nativeElement.value !== this.typeaheadSearchTerm) {
          this.typeaheadInputEl.nativeElement.value = this.typeaheadSearchTerm;
        }
      }
    }, 0);
  }

  searchSuggestions = (text$: Observable<string>): Observable<EnhancedSearchResultItem[]> =>
    merge(text$, this.focusEmitter).pipe(
      debounceTime(250),
      distinctUntilChanged(),
      tap(termFromStream => {
        const currentTermInBox = this.typeaheadSearchTerm.trim();
        if (currentTermInBox.length === 0) this.updateAndEmitStatus('empty');
        else if (this.plzRangeRegex.test(currentTermInBox)) this.updateAndEmitStatus('valid');
        else if (currentTermInBox.length < 2) this.updateAndEmitStatus('invalid');
        else this.updateAndEmitStatus('pending');
      }),
      switchMap(termFromStream => {
        const normalizedTermForAPI = termFromStream.trim();
        if (normalizedTermForAPI.length < 2 && !this.plzRangeRegex.test(normalizedTermForAPI)) {
          this.searching = false; this.cdr.markForCheck(); return of([]);
        }
        if (this.plzRangeRegex.test(normalizedTermForAPI)) {
          this.searching = false; this.cdr.markForCheck(); return of([]);
        }

        this.searching = true; this.cdr.markForCheck();
        return this.plzDataService.fetchTypeaheadSuggestions(normalizedTermForAPI).pipe(
          tap(suggestions => {
            this.searching = false;
            const currentSearchBoxTerm = this.typeaheadSearchTerm.trim();
            if (!this.plzRangeRegex.test(currentSearchBoxTerm) && suggestions.length === 0 && currentSearchBoxTerm.length >=2) {
              this.updateAndEmitStatus('invalid');
            } else if (suggestions.length > 0) {
              this.updateAndEmitStatus('pending');
            }
            this.cdr.markForCheck();
          }),
          catchError((error) => {
            console.error('[SearchInputComponent] Error fetching typeahead suggestions:', error);
            this.searching = false; this.updateAndEmitStatus('invalid'); this.cdr.markForCheck();
            return of([]);
          })
        );
      })
    );

  onSearchTermChange(term: string): void {
    this.typeaheadSearchTerm = term;
    this.onChangeFn(term);
    this.searchTermChanged.emit(term.trim());
  }

  typeaheadItemSelected(event: NgbTypeaheadSelectItemEvent<EnhancedSearchResultItem>): void {
    event.preventDefault();
    const selectedItem = event.item;
    if (!selectedItem) return;

    console.log('[SearchInputComponent] Typeahead item selected. ID:', selectedItem.id, 'Item:', JSON.stringify(selectedItem));

    if (selectedItem.isGroupHeader && selectedItem.ort && selectedItem.kt) {
      this.plzDataService.getEntriesByOrtAndKanton(selectedItem.ort, selectedItem.kt)
        .subscribe(entries => {
          if (entries.length > 0) {
            this.entriesSelected.emit(entries);
            this.updateAndEmitStatus('valid');
          } else {
            this.updateAndEmitStatus('invalid');
          }
          this.clearInputAndClosePopup();
        });
    } else if (!selectedItem.isGroupHeader) {
      const entryToEmit: PlzEntry = { ...selectedItem };
      this.entriesSelected.emit([entryToEmit]);
      this.updateAndEmitStatus('valid');
      this.clearInputAndClosePopup();
    }
  }

  handleInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const term = this.typeaheadSearchTerm.trim();
      const rangeMatch = term.match(this.plzRangeRegex);

      if (rangeMatch) {
        event.preventDefault();
        const startPlz = parseInt(rangeMatch[1], 10);
        const endPlz = parseInt(rangeMatch[2], 10);

        if (!isNaN(startPlz) && !isNaN(endPlz) && String(startPlz).length >=4 && String(endPlz).length >=4 && startPlz <= endPlz) {
          this.plzDataService.getEntriesByPlzRange(startPlz, endPlz).subscribe(entries => {
            if (entries.length > 0) {
              this.entriesSelected.emit(entries);
              this.updateAndEmitStatus('valid');
            } else {
              this.entriesSelected.emit([]);
              this.updateAndEmitStatus('invalid');
            }
            this.clearInputAndClosePopup();
          });
        } else {
          this.updateAndEmitStatus('invalid');
        }
      }
    }
  }

  private clearInputAndClosePopup(): void {
    this.typeaheadSearchTerm = '';
    this.onChangeFn('');
    this.searchTermChanged.emit('');
    if (this.typeaheadInstance?.isPopupOpen()) {
      this.typeaheadInstance.dismissPopup();
    }
    if (this.typeaheadInputEl?.nativeElement) {
      this.typeaheadInputEl.nativeElement.blur();
    }
    this.updateAndEmitStatus('empty');
    this.cdr.markForCheck();
  }

  public clearInput(): void {
    console.log('[SearchInputComponent] public clearInput() called.');
    this.typeaheadSearchTerm = '';
    this.onChangeFn('');
    this.searchTermChanged.emit('');
    if (this.typeaheadInstance?.isPopupOpen()) {
      this.typeaheadInstance.dismissPopup();
    }
    if (this.typeaheadInputEl?.nativeElement) {
      this.typeaheadInputEl.nativeElement.blur();
    }
    this.updateAndEmitStatus('empty');
    this.cdr.markForCheck();
  }


  onFocus(): void {
    this.onTouchedFn();
    const term = this.typeaheadSearchTerm.trim();

    if (document.activeElement === this.typeaheadInputEl.nativeElement) {
      if (term.length >= 2 && !this.plzRangeRegex.test(term)) {
        this.focusEmitter.next(term);
      } else if (this.plzRangeRegex.test(term)) {
        this.updateAndEmitStatus('valid');
      } else if (term.length === 0) {
        this.updateAndEmitStatus('empty');
      } else {
        this.updateAndEmitStatus('invalid');
      }
    }
  }

  onBlur(): void {
    this.onTouchedFn();
    setTimeout(() => {
      if (this.typeaheadInstance && !this.typeaheadInstance.isPopupOpen()) {
        const term = this.typeaheadSearchTerm.trim();
        if (term.length === 0) {
          this.updateAndEmitStatus('empty');
        } else if (this.plzRangeRegex.test(term)) {
          this.updateAndEmitStatus('valid');
        } else if (this.currentStatus === 'pending' && term.length >=2) {
          this.updateAndEmitStatus('invalid');
        } else if (term.length < 2) {
          this.updateAndEmitStatus('invalid');
        }
      }
    }, 200);
  }

  public highlight(text: string | null | undefined, termToHighlight: string): string {
    if (!termToHighlight || termToHighlight.length === 0 || !text) {
      return text || '';
    }
    const R_SPECIAL = /[-\/\\^$*+?.()|[\]{}]/g;
    const safeTerm = termToHighlight.replace(R_SPECIAL, '\\$&');
    try {
      const regex = new RegExp(`(${safeTerm})`, 'gi');
      return text.replace(regex, '<mark>$1</mark>');
    } catch (e) {
      return text;
    }
  }

  resultFormatter = (result: EnhancedSearchResultItem): string => {
    if (result.isGroupHeader) {
      return `${result.ort} (${result.kt || ''}) - ${result.childPlzCount || 0} PLZ Gebiete`;
    }
    return `${result.plz6 || result.plz4 || ''} ${result.ort || ''} (${result.kt || ''})`;
  };

  typeaheadInputFormatter = (item: EnhancedSearchResultItem | string | null): string => {
    if (typeof item === 'object' && item !== null) {
      return '';
    }
    return (typeof item === 'string') ? item : '';
  };
}
