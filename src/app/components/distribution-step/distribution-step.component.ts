import { Component, OnInit, OnDestroy, ViewChild, Output, EventEmitter, Inject, PLATFORM_ID, NgZone, ChangeDetectorRef, Input, OnChanges, SimpleChanges, ElementRef, ChangeDetectionStrategy, AfterViewInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { PlzDataService, PlzEntry } from '../../services/plz-data.service';
import { SelectionService } from '../../services/selection.service';
import { OrderDataService } from '../../services/order-data.service';
import { ZielgruppeOption, PlzSelectionDetail, VerteilgebietDataState } from '../../services/order-data.types';
import { MapComponent, MapOptions } from '../map/map.component';
import { SearchInputComponent, SimpleValidationStatus as SearchInputValidationStatus } from '../search-input/search-input.component';
import { PlzSelectionTableComponent } from '../plz-selection-table/plz-selection-table.component';

export interface TableHighlightEvent {
  plzId: string | null;
  highlight: boolean;
}
export type VerteilungTypOption = 'Nach PLZ' | 'Nach Perimeter';
export type DistributionStepValidationState = 'valid' | 'invalid' | 'pending';

const COLUMN_HIGHLIGHT_DURATION = 1500;
const DEFAULT_MAP_CENTER = { lat: 46.8182, lng: 8.2275 };
const DEFAULT_MAP_ZOOM = 8;

@Component({
  selector: 'app-distribution-step',
  templateUrl: './distribution-step.component.html',
  styleUrls: ['./distribution-step.component.scss'],
  standalone: true,
  imports: [ CommonModule, FormsModule, SearchInputComponent, MapComponent, PlzSelectionTableComponent ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DistributionStepComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {

  @Input({transform: (value: string | null | undefined): string | undefined => (value === null ? undefined : value)})
  public initialStadt: string | undefined;

  @Output() public validationChange = new EventEmitter<DistributionStepValidationState>();
  @Output() public zielgruppeChange = new EventEmitter<ZielgruppeOption>();

  @ViewChild('searchInputComponent') public searchInputComponentRef!: SearchInputComponent;
  @ViewChild(MapComponent) public mapComponentRef!: MapComponent;
  @ViewChild('mapView') public mapViewRef!: ElementRef<HTMLDivElement>;
  @ViewChild('kmlFileUpload') kmlFileUploadInputRef!: ElementRef<HTMLInputElement>; // Added for KML Upload

  private destroy$ = new Subject<void>();
  private activeProcessingStadt: string | undefined = undefined;
  public searchInputInitialTerm: string = '';
  public searchInputStatus: SearchInputValidationStatus = 'empty';
  public selectedEntriesForTable: PlzSelectionDetail[] = [];
  public currentZielgruppeState: ZielgruppeOption = 'Alle Haushalte';
  public currentVerteilungTyp: VerteilungTypOption = 'Nach PLZ';
  public showPlzUiContainer: boolean = true;
  public showPerimeterUiContainer: boolean = false;
  public highlightFlyerMaxColumn: boolean = false;
  public verteilungStartdatum: string = '';
  public minVerteilungStartdatum: string = '';
  public showExpressSurcharge: boolean = false;
  public expressSurchargeConfirmed: boolean = false;
  public defaultStandardStartDate!: Date;
  public mapSelectedPlzIds: string[] = [];
  public mapTableHoverPlzId: string | null = null;
  public mapZoomToPlzId: string | null = null;
  public mapZoomToPlzIdList: string[] | null = null;
  public kmlPathConstant: string;
  public apiKeyConstant: string;
  public mapConfig: MapOptions;
  public mapIsLoading: boolean = false;
  public kmlFileName: string | null = null;

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
    private plzDataService: PlzDataService,
    public selectionService: SelectionService,
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.apiKeyConstant = 'AIzaSyBpa1rzAIkaSS2RAlc9frw8GAPiGC1PNwc';
    this.kmlPathConstant = 'assets/ch_plz.kml';
    this.mapConfig = {
      initialCenter: DEFAULT_MAP_CENTER,
      initialZoom: DEFAULT_MAP_ZOOM,
      defaultPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.1, strokeWeight: 1.5, fillColor: "#0063D6", fillOpacity: 0.05 },
      highlightedPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.6, strokeWeight: 2, fillColor: "#0063D6", fillOpacity: 0.3 },
      selectedPolygonOptions: { strokeColor: "#D60096", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#D60096", fillOpacity: 0.4 },
      selectedHighlightedPolygonOptions: { strokeColor: "#D60096", strokeOpacity: 0.9, strokeWeight: 2.5, fillColor: "#D60096", fillOpacity: 0.6 },
      typeaheadHoverPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.7, strokeWeight: 2, fillColor: "#0063D6", fillOpacity: 0.25 }
    };
    console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] Constructor`); // Updated timestamp
  }

  ngOnInit(): void {
    console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] ngOnInit`); // Updated timestamp

    this.initializeDates();

    this.orderDataService.verteilgebiet$.pipe(
      takeUntil(this.destroy$),
    ).subscribe(
      (verteilgebiet: VerteilgebietDataState) => {
        console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] orderDataService.verteilgebiet$ emitted:`, JSON.parse(JSON.stringify(verteilgebiet))); // Updated timestamp

        this.expressSurchargeConfirmed = verteilgebiet.expressConfirmed;

        if (verteilgebiet.verteilungStartdatum) {
          const orderStartDate = new Date(verteilgebiet.verteilungStartdatum);
          if (orderStartDate && !isNaN(orderStartDate.getTime())) {
            this.verteilungStartdatum = this.formatDateToYyyyMmDd(orderStartDate);
          }
        } else if (this.defaultStandardStartDate) {
          this.verteilungStartdatum = this.formatDateToYyyyMmDd(this.defaultStandardStartDate);
        }

        this.currentZielgruppeState = verteilgebiet.zielgruppe;
        this.selectedEntriesForTable = [...verteilgebiet.selectedPlzEntries];
        this.mapSelectedPlzIds = this.selectedEntriesForTable.map(e => e.id);

        if (!this.mapZoomToPlzId && (!this.mapZoomToPlzIdList || this.mapZoomToPlzIdList.length === 0)) {
          this.mapZoomToPlzIdList = this.mapSelectedPlzIds.length > 0 ? [...this.mapSelectedPlzIds] : null;
        }

        this.checkExpressSurcharge();
        this.updateAndEmitOverallValidationState();
        this.cdr.markForCheck();
      }
    );

    if (this.initialStadt && !this.activeProcessingStadt) {
      console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] initialStadt provided on init: ${this.initialStadt}. Processing...`); // Updated timestamp
      this.processStadtnameFromInput(this.initialStadt);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
    console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] ngOnDestroy`); // Updated timestamp
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] ngOnChanges called:`, changes); // Updated timestamp
    if (changes['initialStadt'] && changes['initialStadt'].currentValue !== changes['initialStadt'].previousValue) {
      const newStadt = changes['initialStadt'].currentValue as string | undefined;
      console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] initialStadt changed to: ${newStadt}. Previous: ${changes['initialStadt'].previousValue}`); // Updated timestamp
      this.processStadtnameFromInput(newStadt);
    }
  }

  private processStadtnameFromInput(stadtName: string | undefined): void {
    const effectiveStadt = (stadtName && stadtName.trim() !== '' && stadtName.toLowerCase() !== 'undefined')
      ? decodeURIComponent(stadtName.trim())
      : undefined;


    if (this.activeProcessingStadt === effectiveStadt) {
      console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] processStadtnameFromInput: Stadt ${effectiveStadt} is already being processed or is the same. Skipping.`); // Updated timestamp
      return;
    }
    this.activeProcessingStadt = effectiveStadt;

    if (effectiveStadt) {
      console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] Processing stadt from input: ${effectiveStadt}`); // Updated timestamp
      this._processAndSelectLocation(effectiveStadt, true).then(() => {});
    } else {
      console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] initialStadt is effectively empty. Clearing selection.`); // Updated timestamp
      this.selectionService.clearEntries();
      this.mapZoomToPlzId = null; this.mapZoomToPlzIdList = null;
      this.searchInputInitialTerm = '';
      this.updateAndEmitOverallValidationState();
    }
  }

  ngAfterViewInit(): void {
    console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] ngAfterViewInit`); // Updated timestamp
  }

  private initializeDates(): void {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const minStartDate = new Date(today);
    minStartDate.setUTCDate(today.getUTCDate() + 1);
    this.minVerteilungStartdatum = this.formatDateToYyyyMmDd(minStartDate);
    this.defaultStandardStartDate = this.addWorkingDays(new Date(today), 4);

    firstValueFrom(this.orderDataService.verteilgebiet$).then(serviceState => {
      let initialDateToSet: Date | null = null;
      if (serviceState.verteilungStartdatum && !isNaN(new Date(serviceState.verteilungStartdatum).getTime())) {
        const date = new Date(serviceState.verteilungStartdatum);
        if (date >= minStartDate) {
          initialDateToSet = date;
        }
      }

      if (!initialDateToSet) {
        initialDateToSet = new Date(this.defaultStandardStartDate);
      }

      if (initialDateToSet < minStartDate) {
        initialDateToSet = new Date(minStartDate);
      }

      const serviceDateHasTime = serviceState.verteilungStartdatum ? new Date(serviceState.verteilungStartdatum).getTime() : 0;
      if (serviceDateHasTime !== initialDateToSet.getTime()) {
        this.orderDataService.updateVerteilungStartdatum(initialDateToSet);
      } else {
        this.verteilungStartdatum = this.formatDateToYyyyMmDd(initialDateToSet);
        this.checkExpressSurcharge();
        this.cdr.markForCheck();
      }
    });
  }

  private formatDateToYyyyMmDd(d: Date): string {
    if (!d || isNaN(d.getTime())) return '';
    return `${d.getUTCFullYear()}-${('0' + (d.getUTCMonth() + 1)).slice(-2)}-${('0' + d.getUTCDate()).slice(-2)}`;
  }

  public getFormattedDefaultStandardDateForDisplay(): string {
    if (!this.defaultStandardStartDate || isNaN(this.defaultStandardStartDate.getTime())) return '';
    return `${('0' + this.defaultStandardStartDate.getUTCDate()).slice(-2)}.${('0' + (this.defaultStandardStartDate.getUTCMonth() + 1)).slice(-2)}.${this.defaultStandardStartDate.getUTCFullYear()}`;
  }

  private parseYyyyMmDdToDate(s: string): Date | null {
    if (!s) return null;
    const p = s.split('-');
    if (p.length === 3) {
      const y = parseInt(p[0], 10);
      const m = parseInt(p[1], 10) - 1;
      const d = parseInt(p[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        const dt = new Date(Date.UTC(y, m, d));
        if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d) {
          return dt;
        }
      }
    }
    return null;
  }

  private addWorkingDays(baseDate: Date, daysToAdd: number): Date {
    let currentDate = new Date(baseDate.getTime());
    let addedDays = 0;
    while (addedDays < daysToAdd) {
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      const dayOfWeek = currentDate.getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        addedDays++;
      }
    }
    return currentDate;
  }

  public onStartDateChange(): void {
    let selectedDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);

    if (!selectedDate || (minDate && selectedDate < minDate)) {
      selectedDate = minDate;
    }

    this.orderDataService.updateVerteilungStartdatum(selectedDate);
  }

  private checkExpressSurcharge(): void {
    if (!this.verteilungStartdatum || !this.defaultStandardStartDate) {
      if (this.showExpressSurcharge) { this.showExpressSurcharge = false; }
      return;
    }
    const selectedDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minAllowedDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);

    if (!selectedDate || isNaN(selectedDate.getTime()) ||
      !minAllowedDate || isNaN(minAllowedDate.getTime()) ||
      isNaN(this.defaultStandardStartDate.getTime())) {
      if (this.showExpressSurcharge) { this.showExpressSurcharge = false; }
      return;
    }

    const needsExpress = selectedDate < this.defaultStandardStartDate && selectedDate >= minAllowedDate;
    this.showExpressSurcharge = needsExpress && !this.expressSurchargeConfirmed;
  }

  public avoidExpressSurcharge(): void {
    if (this.defaultStandardStartDate) {
      this.orderDataService.updateVerteilungStartdatum(this.defaultStandardStartDate);
    } else {
      console.error(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] defaultStandardStartDate not set for avoidExpressSurcharge`); // Updated timestamp
    }
  }

  public confirmExpressSurcharge(): void {
    this.orderDataService.updateExpressConfirmed(true);
  }

  public async _processAndSelectLocation(locationName: string, isFromUrlOrInitial: boolean): Promise<void> {
    if (!locationName || locationName.trim() === '') {
      this.activeProcessingStadt = undefined;
      return;
    }
    this.mapIsLoading = true; this.cdr.markForCheck();
    const dataReady = await this.plzDataService.ensureDataReady();
    if (!dataReady) { this.mapIsLoading = false; this.updateAndEmitOverallValidationState(); this.cdr.markForCheck(); this.activeProcessingStadt = undefined; return; }

    if (isFromUrlOrInitial) {
      this.selectionService.clearEntries();
      this.mapZoomToPlzId = null;
      this.mapZoomToPlzIdList = null;
    }

    let termToUse = locationName; let plzToSelect: PlzEntry[] = [];
    try {
      const matches = await firstValueFrom(this.plzDataService.fetchTypeaheadSuggestions(locationName).pipe(takeUntil(this.destroy$)));
      if (matches && matches.length > 0) {
        let target = matches.find(m => m.isGroupHeader && this.plzDataService.normalizeStringForSearch(m.ort) === this.plzDataService.normalizeStringForSearch(locationName));
        if (!target) target = matches.find(m => m.isGroupHeader);
        if (!target) target = matches.find(m => !m.isGroupHeader && this.plzDataService.normalizeStringForSearch(m.ort) === this.plzDataService.normalizeStringForSearch(locationName));
        if (!target && (matches[0].isGroupHeader || matches.length === 1)) target = matches[0];

        if (target) {
          termToUse = target.ort || (target.plz4 ? target.plz4.toString() : locationName);
          if (target.isGroupHeader && target.ort && target.kt) {
            plzToSelect = await firstValueFrom(this.plzDataService.getEntriesByOrtAndKanton(target.ort, target.kt).pipe(takeUntil(this.destroy$)));
          } else if (!target.isGroupHeader && target.id) {
            const single = await firstValueFrom(this.plzDataService.getEntryById(target.id).pipe(takeUntil(this.destroy$)));
            if (single) plzToSelect = [single];
            else plzToSelect = [{ ...target } as PlzEntry];
          }
        }
      }
      this.searchInputInitialTerm = termToUse;
      if (plzToSelect.length > 0) this.selectionService.addMultipleEntries(plzToSelect);
    } catch (e) { console.error(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] Error in _processAndSelectLocation: `, e); this.searchInputInitialTerm = locationName; } // Updated timestamp
    finally {
      this.mapIsLoading = false;
      this.updateAndEmitOverallValidationState();
      if (isPlatformBrowser(this.platformId)) {
        firstValueFrom(this.ngZone.onStable.pipe(takeUntil(this.destroy$))).then(() => {
          if (this.searchInputComponentRef?.blurInput) this.searchInputComponentRef.blurInput();
          if (isFromUrlOrInitial || plzToSelect.length > 0) setTimeout(() => this.scrollToMapView(), 250);
        });
      }
      this.cdr.markForCheck();
    }
  }

  public selectCityAndFetchPlz(s: string): void {
    this.activeProcessingStadt = s;
    this._processAndSelectLocation(s, false);
  }

  public onSearchInputEntriesSelected(e: PlzEntry[]): void {
    if(e && e.length > 0) {
      this.selectionService.addMultipleEntries(e);
      if(isPlatformBrowser(this.platformId)) setTimeout(()=>this.scrollToMapView(),100);
    }
  }
  public onSearchInputTermChanged(term: string): void { }
  public onSearchInputStatusChanged(s: SearchInputValidationStatus): void {
    if(this.searchInputStatus !== s) {
      this.searchInputStatus = s;
      this.updateAndEmitOverallValidationState();
    }
  }

  public setVerteilungTyp(typ: VerteilungTypOption): void {
    if(this.currentVerteilungTyp !== typ) {
      this.currentVerteilungTyp = typ;
      this.kmlFileName = null; // Reset KML file name when switching type
      if (this.kmlFileUploadInputRef?.nativeElement) { // Reset file input if it exists
        this.kmlFileUploadInputRef.nativeElement.value = '';
      }
      this.updateUiFlagsAndMapState();
      this.updateAndEmitOverallValidationState();
    }
  }
  private updateUiFlagsAndMapState(): void {
    const oldPlzUi = this.showPlzUiContainer;
    const oldPerimeterUi = this.showPerimeterUiContainer;
    this.showPlzUiContainer = this.currentVerteilungTyp === 'Nach PLZ';
    this.showPerimeterUiContainer = this.currentVerteilungTyp === 'Nach Perimeter';
    if(oldPlzUi !== this.showPlzUiContainer || oldPerimeterUi !== this.showPerimeterUiContainer) {
      this.cdr.markForCheck();
    }
  }

  public setZielgruppe(neueZielgruppe: ZielgruppeOption): void {
    if (this.currentZielgruppeState !== neueZielgruppe) {
      console.log(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] User changed Zielgruppe in UI to: ${neueZielgruppe}`); // Updated timestamp
      this.orderDataService.updateZielgruppe(neueZielgruppe);
      this.zielgruppeChange.emit(neueZielgruppe);
      this.highlightFlyerMaxColumnAndEmitValidation();
    }
  }

  private highlightFlyerMaxColumnAndEmitValidation(): void {
    this.highlightFlyerMaxColumn = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.highlightFlyerMaxColumn = false;
      this.cdr.markForCheck();
    }, COLUMN_HIGHLIGHT_DURATION);
    this.updateAndEmitOverallValidationState();
  }

  public onPlzClickedOnMap(evt: {id: string; name?: string}): void {
    const id = evt.id;
    if(!id) return;
    const isSelected = this.selectionService.getSelectedEntriesSnapshot().some(e => e.id === id);
    if(isSelected) {
      this.selectionService.removeEntry(id);
    } else {
      firstValueFrom(this.plzDataService.getEntryById(id).pipe(takeUntil(this.destroy$)))
        .then(entry => {
          if(entry && this.selectionService.validateEntry(entry)) {
            this.selectionService.addEntry(entry);
          } else {

            const plz6 = id;
            const plz4 = plz6.substring(0, 4);
            const ort = evt.name || 'Unbekannt';
            const fallbackEntry: PlzEntry = { id, plz6, plz4, ort, kt: 'N/A', preisKategorie: 'A', all: 0, mfh: 0, efh: 0 };
            if(this.selectionService.validateEntry(fallbackEntry)) {
              this.selectionService.addEntry(fallbackEntry);
            }
          }
        }).catch(err => {
        console.error(`[${"2025-06-10 00:11:46"}] [DistributionStepComponent] Error fetching PLZ by ID for map click:`, err); // Updated timestamp
      });
    }
  }

  public onMapLoadingStatusChanged(isLoading: boolean): void {
    if(this.mapIsLoading !== isLoading) {
      this.mapIsLoading = isLoading;
      this.updateAndEmitOverallValidationState();
    }
  }
  public onMapReady(event: any): void { }

  public clearPlzTable(): void {
    this.selectionService.clearEntries();
    this.mapZoomToPlzId = null;
    this.mapZoomToPlzIdList = null;
    this.activeProcessingStadt = undefined;
    this.searchInputInitialTerm = '';
    if (isPlatformBrowser(this.platformId)) {

      this.router.navigate(['/']);
      setTimeout(()=>this.scrollToMapView(),100);
    }
    this.updateAndEmitOverallValidationState();
  }

  public removePlzFromTable(entry: PlzSelectionDetail): void {
    this.selectionService.removeEntry(entry.id);
  }
  public zoomToTableEntryOnMap(entry: PlzSelectionDetail): void {
    this.mapZoomToPlzId = entry.id;
    this.mapZoomToPlzIdList = null;
    this.cdr.markForCheck();
    if(isPlatformBrowser(this.platformId)) setTimeout(()=>this.scrollToMapView(),100);
    setTimeout(() => {
      this.mapZoomToPlzId = null;
      this.cdr.markForCheck();
    }, 250);
  }
  public highlightPlacemarkOnMapFromTable(event: TableHighlightEvent): void {
    const newHoverId = (event.highlight && event.plzId) ? event.plzId : null;
    if(this.mapTableHoverPlzId !== newHoverId) {
      this.mapTableHoverPlzId = newHoverId;
      this.cdr.markForCheck();
    }
  }

  public onPlzFlyerCountChanged(event: { entryId: string, type: 'mfh' | 'efh', newCount: number | null }): void {
    console.log(`[DistributionStepComponent] onPlzFlyerCountChanged event received:`, event);
    this.selectionService.updateFlyerCountForEntry(event.entryId, event.newCount, event.type);
  }

  public triggerKmlUpload(): void {
    // Ensure the ViewChild is available
    if (!this.kmlFileUploadInputRef?.nativeElement) {
      console.error('[DistributionStepComponent] KML file input (kmlFileUpload) not found in DOM via ViewChild.');
      this.kmlFileName = null;
      this.updateAndEmitOverallValidationState();
      this.cdr.markForCheck();
      return;
    }

    const inputElement = this.kmlFileUploadInputRef.nativeElement;
    const files = inputElement.files;

    if (files && files.length > 0) {
      const file = files[0];
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      const allowedFileType = '.kml';

      // Validate file type
      if (!file.name.toLowerCase().endsWith(allowedFileType)) {
        console.warn(`[DistributionStepComponent] Invalid KML file type: ${file.name}. Expected: ${allowedFileType}`);
        alert(`Ungültiger Dateityp. Nur ${allowedFileType}-Dateien sind erlaubt.`);
        this.kmlFileName = null;
        inputElement.value = ''; // Reset file input to allow re-selection of the same file
        this.updateAndEmitOverallValidationState();
        this.cdr.markForCheck();
        return;
      }

      // Validate file size
      if (file.size > maxFileSize) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxFileSizeMB = (maxFileSize / (1024 * 1024)).toFixed(2);
        console.warn(`[DistributionStepComponent] KML file too large: ${fileSizeMB}MB. Max size is ${maxFileSizeMB}MB.`);
        alert(`Datei ist zu groß (${fileSizeMB}MB). Maximale Dateigröße beträgt ${maxFileSizeMB}MB.`);
        this.kmlFileName = null;
        inputElement.value = ''; // Reset file input
        this.updateAndEmitOverallValidationState();
        this.cdr.markForCheck();
        return;
      }

      this.kmlFileName = file.name;
      console.log(`[DistributionStepComponent] KML file "${file.name}" selected.`);
      // Implement actual KML file processing/upload to service if needed here
      // For now, it just updates the UI and validation state.
    } else {
      // This branch is hit if the button is clicked but no file was selected in the input.
      // Or if the input was cleared by the browser.
      this.kmlFileName = null; // Ensure filename is cleared if no file is present
    }
    // It's good practice to reset the input so a 'change' event fires even if the same file is selected again.
    inputElement.value = '';
    this.updateAndEmitOverallValidationState();
    this.cdr.markForCheck();
  }

  private updateAndEmitOverallValidationState(): void {
    const currentStatus = this.calculateOverallValidationStatus();

    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.ngZone.run(() => {
          this.validationChange.emit(currentStatus);
          this.cdr.markForCheck();
        });
      }, 0);
    });
  }

  private calculateOverallValidationStatus(): DistributionStepValidationState {
    const selectedServiceEntries = this.selectionService.getSelectedEntriesSnapshot();
    const hasSelectedEntries = selectedServiceEntries && selectedServiceEntries.length > 0;
    const parsedVerteilungStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const isDateOk = !!parsedVerteilungStartDate && !isNaN(parsedVerteilungStartDate.getTime());
    const isExpressOk = !this.isExpressSurchargeRelevant() || this.expressSurchargeConfirmed;

    if (this.currentVerteilungTyp === 'Nach PLZ') {
      const isSearchOk = this.searchInputStatus === 'valid' || this.searchInputStatus === 'empty' || (!!this.activeProcessingStadt && this.searchInputStatus !== 'invalid');
      if (hasSelectedEntries && isDateOk && isExpressOk && isSearchOk) return 'valid';
    } else { // Nach Perimeter
      if (this.kmlFileName && isDateOk && isExpressOk) return 'valid'; // kmlFileName indicates a valid KML selection
      return 'invalid';
    }
    return 'invalid';
  }

  private isExpressSurchargeRelevant(): boolean {
    if (!this.verteilungStartdatum || !this.defaultStandardStartDate) return false;
    const selectedDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minAllowedDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);

    if (!selectedDate || isNaN(selectedDate.getTime()) ||
      !minAllowedDate || isNaN(minAllowedDate.getTime()) ||
      isNaN(this.defaultStandardStartDate.getTime())) {
      return false;
    }
    return selectedDate < this.defaultStandardStartDate && selectedDate >= minAllowedDate;
  }

  public triggerValidationDisplay(): void {
    this.updateAndEmitOverallValidationState();
  }

  private scrollToMapView(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    firstValueFrom(this.ngZone.onStable.pipe(takeUntil(this.destroy$))).then(() => {
      if (!this.mapViewRef?.nativeElement) return;
      const element = this.mapViewRef.nativeElement;

      if (element.offsetParent === null || element.offsetWidth === 0 || element.offsetHeight === 0) return;
      const headerOffset = 90;
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - headerOffset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    });
  }
}
