import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef,
  ChangeDetectionStrategy, ChangeDetectorRef, forwardRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbTypeahead } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, tap, takeUntil, take, map } from 'rxjs/operators';
import { PlzDataService, EnhancedSearchResultItem, PlzEntry } from '../../services/plz-data.service';

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
  private isProgrammaticallySet: boolean = false;
  private itemJustSelected: boolean = false;

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
      console.log(`[SearchInputComponent] ngOnInit: Processing initialSearchTerm @Input: "${this.initialSearchTerm}"`);
      this.setSearchTerm(this.initialSearchTerm, true, false);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  writeValue(value: string | null): void {
    this.typeaheadSearchTerm = value || '';
    if (this.typeaheadSearchTerm) {
      this.isProgrammaticallySet = true;
      this.updateAndEmitStatus('valid');
    } else {
      this.updateAndEmitStatus('empty');
    }
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

  public updateAndEmitStatus(newStatus: SimpleValidationStatus): void {
    const oldStatus = this.currentStatus;
    if (oldStatus !== newStatus || newStatus === 'pending') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [SearchInputComponent] Status change from ${oldStatus} to ${newStatus}. Term: "${this.typeaheadSearchTerm}", ItemSelected: ${this.itemJustSelected}`);
      this.currentStatus = newStatus;
      this.inputStatusChanged.emit(this.currentStatus);
    }
    this.searching = (this.currentStatus === 'pending');
    this.cdr.markForCheck();
  }

  public setSearchTerm(term: string, triggerSearchAndFocus: boolean = true, isInitial: boolean = false): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SearchInputComponent] setSearchTerm called with term: "${term}", triggerSearchAndFocus: ${triggerSearchAndFocus}, isInitial: ${isInitial}`);
    this.typeaheadSearchTerm = term;
    this.onChangeFn(term);
    this.searchTermChanged.emit(term.trim());
    this.isProgrammaticallySet = true;
    this.itemJustSelected = false;

    if (triggerSearchAndFocus) {
      setTimeout(() => {
        if (this.typeaheadInputEl?.nativeElement) {
          this.typeaheadInputEl.nativeElement.focus();
          if (this.typeaheadInputEl.nativeElement.value !== this.typeaheadSearchTerm) {
            this.typeaheadInputEl.nativeElement.value = this.typeaheadSearchTerm;
          }
        } else {
          console.warn(`[${timestamp}] [SearchInputComponent] setSearchTerm (triggerSearchAndFocus): typeaheadInputEl not available.`);
        }
      }, 0);
    } else { // term is set programmatically, e.g. from parent component due to URL or click
      if (term.trim().length > 0) {
        this.updateAndEmitStatus('valid'); // Assume the programmatically set term is valid
      } else {
        this.updateAndEmitStatus('empty');
      }
      // DO NOT blur here automatically. Parent component should decide when to blur.
    }
    this.cdr.markForCheck();
  }

  public initiateSearchForTerm(term: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SearchInputComponent] initiateSearchForTerm called with term: "${term}" (will use setSearchTerm)`);
    this.setSearchTerm(term, true, false);
  }

  searchSuggestions = (text$: Observable<string>): Observable<EnhancedSearchResultItem[]> =>
    merge(text$, this.focusEmitter).pipe(
      takeUntil(this.destroy$),
      debounceTime(250),
      distinctUntilChanged(),
      tap((termFromStream: string) => {
        if (!this.itemJustSelected) {
          this.isProgrammaticallySet = false;
        }
        const currentTermInBox = this.typeaheadSearchTerm.trim();
        if (currentTermInBox.length === 0) {
          this.updateAndEmitStatus('empty');
        } else if (this.plzRangeRegex.test(currentTermInBox)) {
          this.updateAndEmitStatus('valid');
        } else if (currentTermInBox.length >= 2) {
          this.updateAndEmitStatus('pending');
        } else {
          this.updateAndEmitStatus('empty');
        }
      }),
      switchMap((termFromStream: string) => {
        const normalizedTermForAPI = termFromStream.trim();

        if (this.plzRangeRegex.test(normalizedTermForAPI)) {
          return of([]);
        }
        if (normalizedTermForAPI.length < 2) {
          return of([]);
        }
        if(this.currentStatus !== 'pending' && normalizedTermForAPI.length >=2) {
          console.warn(`[SearchInputComponent] switchMap: Status was not 'pending' for term "${normalizedTermForAPI}". Forcing to 'pending'.`);
          this.updateAndEmitStatus('pending');
        }

        return this.plzDataService.fetchTypeaheadSuggestions(normalizedTermForAPI).pipe(
          map(allSuggestions => allSuggestions.slice(0, 5)),
          tap(limitedSuggestions => {
            if (this.currentStatus === 'pending') {
              const currentSearchBoxTerm = this.typeaheadSearchTerm.trim();
              if (limitedSuggestions.length === 0 && currentSearchBoxTerm.length >=2 && !this.plzRangeRegex.test(currentSearchBoxTerm)) {
                this.updateAndEmitStatus('invalid');
              }
            }
          }),
          catchError((error) => {
            console.error('[SearchInputComponent] Error fetching typeahead suggestions:', error);
            if (this.currentStatus === 'pending') {
              this.updateAndEmitStatus('invalid');
            }
            return of([]);
          })
        );
      })
    );

  onSearchTermChange(term: string): void {
    this.typeaheadSearchTerm = term;
    this.onChangeFn(term);
    this.searchTermChanged.emit(term.trim());
    if (!this.itemJustSelected) {
      this.isProgrammaticallySet = false;
    }
  }

  typeaheadItemSelected(event: NgbTypeaheadSelectItemEvent<EnhancedSearchResultItem>): void {
    event.preventDefault();
    const selectedItem = event.item;
    if (!selectedItem) return;

    this.itemJustSelected = true;
    this.isProgrammaticallySet = true;

    const displayValue = this.typeaheadInputFormatter(selectedItem);
    this.typeaheadSearchTerm = displayValue;
    this.onChangeFn(displayValue);

    console.log('[SearchInputComponent] Typeahead item selected. ID:', selectedItem.id, 'DisplayValue:', displayValue);

    if (selectedItem.isGroupHeader && selectedItem.ort && selectedItem.kt) {
      this.plzDataService.getEntriesByOrtAndKanton(selectedItem.ort, selectedItem.kt)
        .pipe(take(1))
        .subscribe((entries: PlzEntry[]) => {
          if (entries.length > 0) {
            this.entriesSelected.emit(entries);
            this.updateAndEmitStatus('valid');
          } else {
            this.entriesSelected.emit([]);
            this.updateAndEmitStatus('invalid');
          }
          this.finalizeSelection();
        });
    } else if (!selectedItem.isGroupHeader && selectedItem.id) {
      const entryToEmit: PlzEntry = {
        id: selectedItem.id,
        plz6: selectedItem.plz6 || selectedItem.id,
        plz4: selectedItem.plz4 || selectedItem.id.substring(0,4),
        ort: selectedItem.ort || '',
        kt: selectedItem.kt || '',
        all: selectedItem.all || 0
      };
      this.entriesSelected.emit([entryToEmit]);
      this.updateAndEmitStatus('valid');
      this.finalizeSelection();
    } else {
      console.warn('[SearchInputComponent] Selected item is not a group header and has no ID, or is invalid:', selectedItem);
      this.updateAndEmitStatus('invalid');
      this.finalizeSelection(false);
    }
  }

  private finalizeSelection(isValidSelection: boolean = true): void {
    if (this.typeaheadInstance?.isPopupOpen()) {
      this.typeaheadInstance.dismissPopup();
    }
    if (this.typeaheadInputEl?.nativeElement) {
      if (this.typeaheadInputEl.nativeElement.value !== this.typeaheadSearchTerm) {
        this.typeaheadInputEl.nativeElement.value = this.typeaheadSearchTerm;
      }
      this.typeaheadInputEl.nativeElement.blur();
    }
  }


  handleInputKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== 'Escape' && event.key !== 'Tab') {
      if (!this.itemJustSelected) {
        this.isProgrammaticallySet = false;
      }
    }

    if (event.key === 'Enter') {
      if (this.typeaheadInstance && this.typeaheadInstance.isPopupOpen()) {
        console.log("[SearchInputComponent] Enter pressed with open popup. Letting ngbTypeahead handle item selection via (selectItem).");
        return;
      }

      const term = this.typeaheadSearchTerm.trim();
      const rangeMatch = term.match(this.plzRangeRegex);

      if (rangeMatch) {
        event.preventDefault();
        this.itemJustSelected = true;
        this.isProgrammaticallySet = true;
        const startPlz = parseInt(rangeMatch[1], 10);
        const endPlz = parseInt(rangeMatch[2], 10);

        if (!isNaN(startPlz) && !isNaN(endPlz) && String(startPlz).length >=4 && String(endPlz).length >=4 && startPlz <= endPlz) {
          this.updateAndEmitStatus('pending');
          this.plzDataService.getEntriesByPlzRange(startPlz, endPlz)
            .pipe(take(1))
            .subscribe((entries: PlzEntry[]) => {
              if (entries.length > 0) {
                this.entriesSelected.emit(entries);
                this.updateAndEmitStatus('valid');
              } else {
                this.entriesSelected.emit([]);
                this.updateAndEmitStatus('invalid');
              }
              this.finalizeSelection(entries.length > 0);
            });
        } else {
          this.updateAndEmitStatus('invalid');
          this.finalizeSelection(false);
        }
      } else if (term.length > 0 && term.length < 2) {
        this.updateAndEmitStatus('empty');
      } else if (term.length >= 2) {
        this.updateAndEmitStatus('invalid');
      } else {
        this.updateAndEmitStatus('empty');
      }
    } else if (event.key === 'Escape') {
      if (this.typeaheadInstance && this.typeaheadInstance.isPopupOpen()) {
        console.log(`[${new Date().toISOString()}] [SearchInputComponent] Escape detected, popup was open. Dismissing popup and setting status to 'empty'.`);
        this.typeaheadInstance.dismissPopup();
        this.updateAndEmitStatus('empty');
      }
    }
  }

  public clearInput(): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SearchInputComponent] public clearInput() called.`);
    this.isProgrammaticallySet = true;
    this.itemJustSelected = false;
    this.typeaheadSearchTerm = '';
    this.onChangeFn('');
    this.searchTermChanged.emit('');
    if (this.typeaheadInstance?.isPopupOpen()) {
      this.typeaheadInstance.dismissPopup();
    }
    this.updateAndEmitStatus('empty');
    this.cdr.markForCheck();
  }

  // NEUE ÖFFENTLICHE METHODE
  public blurInput(): void {
    if (this.typeaheadInputEl?.nativeElement) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [SearchInputComponent] Explicit public blurInput() called.`);
      this.typeaheadInputEl.nativeElement.blur(); // This will trigger the component's onBlur() handler
    }
  }


  onFocus(): void {
    this.onTouchedFn();
    const term = this.typeaheadSearchTerm.trim();
    console.log(`[SearchInputComponent] onFocus. Term: "${term}", Current Status: ${this.currentStatus}, isProgSet: ${this.isProgrammaticallySet}, itemSelected: ${this.itemJustSelected}`);

    if (document.activeElement === this.typeaheadInputEl.nativeElement) {
      if (this.itemJustSelected && this.currentStatus === 'valid') {
      } else if (this.isProgrammaticallySet && this.currentStatus === 'valid') {
      } else if (term.length >= 2 && !this.plzRangeRegex.test(term)) {
        this.focusEmitter.next(term);
      } else if (this.plzRangeRegex.test(term)) {
        this.updateAndEmitStatus('valid');
      } else {
        this.updateAndEmitStatus('empty');
      }
    }
  }

  onBlur(): void {
    this.onTouchedFn();
    setTimeout(() => {
      const timestamp = new Date().toISOString();
      const initialStatusInBlur = this.currentStatus;
      console.log(`[${timestamp}] [SearchInputComponent] onBlur - INSIDE TIMEOUT START. Term: "${this.typeaheadSearchTerm}", CurrentStatus (at timeout start): ${initialStatusInBlur}, ProgSet: ${this.isProgrammaticallySet}, ItemJustSelected (before reset): ${this.itemJustSelected}`);
      const wasItemJustSelected = this.itemJustSelected;
      this.itemJustSelected = false;

      if (wasItemJustSelected) {
        if (this.currentStatus !== 'valid') {
          console.warn(`[${timestamp}] [SearchInputComponent] onBlur: Item was just selected, but status is ${this.currentStatus}. Forcing to 'valid'.`);
          this.updateAndEmitStatus('valid');
        } else {
          console.log(`[${timestamp}] [SearchInputComponent] onBlur: Item was just selected and status is 'valid'. Doing nothing to status.`);
        }
        this.cdr.markForCheck();
        return;
      }

      if (this.typeaheadInstance && !this.typeaheadInstance.isPopupOpen()) {
        const term = this.typeaheadSearchTerm.trim();
        console.log(`[${timestamp}] [SearchInputComponent] onBlur (NO item was just selected, popup closed). Term: "${term}", CurrentStatus (real-time): ${this.currentStatus}, InitialStatusInBlur: ${initialStatusInBlur}`);

        if (this.isProgrammaticallySet && this.currentStatus === 'valid') {
          console.log(`[${timestamp}] [SearchInputComponent] onBlur: Programmatically set and valid. Status remains 'valid'.`);
        } else if (term.length === 0) {
          this.updateAndEmitStatus('empty');
        } else if (this.plzRangeRegex.test(term)) {
          this.updateAndEmitStatus('valid');
        } else if (initialStatusInBlur === 'pending' && term.length >= 2) {
          console.log(`[${timestamp}] [SearchInputComponent] onBlur: Was 'pending' (initialStatusInBlur) with term "${term}", no selection. Setting status to 'empty'.`);
          this.updateAndEmitStatus('empty');
        } else if (term.length > 0 && this.currentStatus !== 'valid' && this.currentStatus !== 'empty') {
          if (term.length >= 2) {
            this.updateAndEmitStatus('invalid');
          } else {
            this.updateAndEmitStatus('empty');
          }
        } else if (term.length === 1 && this.currentStatus !== 'empty') {
          this.updateAndEmitStatus('empty');
        }
      }
      this.cdr.markForCheck();
    }, 250);
  }

  public highlight(text: string | null | undefined, termToHighlight: string): string {
    if (!termToHighlight || termToHighlight.length === 0 || !text) {
      return text || '';
    }
    const R_SPECIAL = /[-\\/\\\\^$*+?.()|[\\]{}]/g;
    const safeTerm = termToHighlight.replace(R_SPECIAL, '\\$&');
    try {
      const regex = new RegExp(`(${safeTerm})`, 'gi');
      return text.replace(regex, '<mark>$1</mark>');
    } catch (e) {
      console.warn('[SearchInputComponent] Highlight regex error:', e);
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
      if (item.isGroupHeader) return item.ort || '';
      return `${item.plz6 || item.plz4 || ''} ${item.ort || ''}${item.kt ? ' (' + item.kt + ')' : ''}`.trim();
    }
    if (typeof item === 'string') {
      return item;
    }
    return '';
  };
}
