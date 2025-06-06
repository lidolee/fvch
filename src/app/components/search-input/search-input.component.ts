import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef,
  ChangeDetectionStrategy, ChangeDetectorRef, forwardRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { NgbTypeaheadModule, NgbTypeaheadSelectItemEvent, NgbTypeahead } from '@ng-bootstrap/ng-bootstrap';
import { Observable, of, Subject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, tap, takeUntil, take } from 'rxjs/operators';
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

  private onChangeFn: (value: string) => void = () => { };
  private onTouchedFn: () => void = () => { };

  private readonly plzRangeRegex = /^\s*(\d{4,6})\s*-\s*(\d{4,6})\s*$/;

  constructor(
    private plzDataService: PlzDataService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.updateAndEmitStatus(this.typeaheadSearchTerm ? 'pending' : 'empty');
    if (this.initialSearchTerm) {
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
      this.currentStatus = newStatus;
      this.inputStatusChanged.emit(this.currentStatus);
    }
    this.searching = (this.currentStatus === 'pending');
    this.cdr.markForCheck();
  }

  public setSearchTerm(term: string, triggerSearchAndFocus: boolean = true, isInitial: boolean = false): void {
    this.typeaheadSearchTerm = term;
    this.onChangeFn(term);
    this.searchTermChanged.emit(term.trim());
    this.isProgrammaticallySet = true;
    this.itemJustSelected = false;

    if (triggerSearchAndFocus) {
      setTimeout(() => {
        this.typeaheadInputEl?.nativeElement?.focus();
      }, 0);
    } else {
      this.updateAndEmitStatus(term.trim().length > 0 ? 'valid' : 'empty');
    }
    this.cdr.markForCheck();
  }

  onSearchTermChange(term: string): void {
    this.searchTermChanged.emit(term.trim());
    this.onChangeFn(term);

    if (!this.isProgrammaticallySet && !this.itemJustSelected) {
      const trimmedTerm = term.trim();
      if (trimmedTerm.length === 0) {
        this.updateAndEmitStatus('empty');
      } else if (this.currentStatus !== 'pending') {
        this.updateAndEmitStatus('pending');
      }
    }

    this.isProgrammaticallySet = false;
  }

  searchSuggestions = (text$: Observable<string>): Observable<EnhancedSearchResultItem[]> =>
    merge(text$, this.focusEmitter).pipe(
      takeUntil(this.destroy$),
      debounceTime(250),
      distinctUntilChanged(),
      tap(() => this.updateAndEmitStatus('pending')),
      switchMap(term => {
        const normalizedTermForAPI = term.trim();
        if (this.plzRangeRegex.test(normalizedTermForAPI) || normalizedTermForAPI.length < 2) {
          return of([]);
        }
        return this.plzDataService.fetchTypeaheadSuggestions(normalizedTermForAPI).pipe(
          tap(suggestions => {
            if (suggestions.length === 0) {
              this.updateAndEmitStatus('invalid');
            }
          }),
          catchError(() => {
            this.updateAndEmitStatus('invalid');
            return of([]);
          })
        );
      })
    );

  typeaheadItemSelected(event: NgbTypeaheadSelectItemEvent<EnhancedSearchResultItem>): void {
    event.preventDefault();
    const selectedItem = event.item;
    if (!selectedItem) return;

    this.itemJustSelected = true;
    this.isProgrammaticallySet = true;

    const displayValue = this.typeaheadInputFormatter(selectedItem);
    this.typeaheadSearchTerm = displayValue;
    this.onChangeFn(displayValue);

    if (selectedItem.isGroupHeader) {
      this.plzDataService.getEntriesByOrtAndKanton(selectedItem.ort, selectedItem.kt)
        .pipe(take(1))
        .subscribe((entries: PlzEntry[]) => {
          this.entriesSelected.emit(entries);
          this.updateAndEmitStatus('valid');
          this.finalizeSelection();
        });
    } else {
      this.plzDataService.getEntryById(selectedItem.id)
        .pipe(take(1))
        .subscribe((fullEntry: PlzEntry | undefined) => {
          if (fullEntry) {
            this.entriesSelected.emit([fullEntry]);
            this.updateAndEmitStatus('valid');
          } else {
            this.updateAndEmitStatus('invalid');
          }
          this.finalizeSelection();
        });
    }
  }

  private finalizeSelection(): void {
    this.typeaheadInstance?.dismissPopup();
    this.typeaheadInputEl?.nativeElement?.blur();
  }

  handleInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      if (this.typeaheadInstance?.isPopupOpen()) return;

      const term = this.typeaheadSearchTerm.trim();
      const rangeMatch = term.match(this.plzRangeRegex);

      if (rangeMatch) {
        event.preventDefault();
        const startPlz = parseInt(rangeMatch[1], 10);
        const endPlz = parseInt(rangeMatch[2], 10);

        if (!isNaN(startPlz) && !isNaN(endPlz) && startPlz <= endPlz) {
          this.updateAndEmitStatus('pending');
          this.plzDataService.getEntriesByPlzRange(startPlz, endPlz)
            .pipe(take(1))
            .subscribe((entries: PlzEntry[]) => {
              this.entriesSelected.emit(entries);
              this.updateAndEmitStatus(entries.length > 0 ? 'valid' : 'invalid');
              this.finalizeSelection();
            });
        } else {
          this.updateAndEmitStatus('invalid');
        }
      }
    }
  }

  public clearInput(): void {
    this.isProgrammaticallySet = true;
    this.itemJustSelected = false;
    this.typeaheadSearchTerm = '';
    this.onChangeFn('');
    this.searchTermChanged.emit('');
    this.typeaheadInstance?.dismissPopup();
    this.updateAndEmitStatus('empty');
    this.cdr.markForCheck();
  }

  public blurInput(): void {
    this.typeaheadInputEl?.nativeElement?.blur();
  }

  onFocus(): void {
    this.onTouchedFn();
    this.focusEmitter.next(this.typeaheadSearchTerm);
  }

  onBlur(): void {
    this.onTouchedFn();
    setTimeout(() => {
      if (!this.itemJustSelected && !this.typeaheadInstance.isPopupOpen()) {
        const term = this.typeaheadSearchTerm.trim();
        if(this.currentStatus !== 'valid') {
          this.updateAndEmitStatus(term.length > 0 ? 'invalid' : 'empty');
        }
      }
      this.itemJustSelected = false;
    }, 250);
  }

  resultFormatter = (result: EnhancedSearchResultItem): string => {
    if (result.isGroupHeader) {
      return `${result.ort} (${result.kt || ''}) - ${result.childPlzCount || 0} PLZ Gebiete`;
    }
    return `${result.plz4 || ''} ${result.ort || ''}`;
  };

  typeaheadInputFormatter = (item: EnhancedSearchResultItem | string | null): string => {
    if (typeof item === 'object' && item !== null) {
      if (item.isGroupHeader) return item.ort || '';
      return `${item.plz4 || ''} ${item.ort || ''}`;
    }
    return item || '';
  };
}
