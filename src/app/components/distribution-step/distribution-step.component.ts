import {
  Component, OnInit, AfterViewInit, OnDestroy, ViewChild, Output, EventEmitter,
  Inject, PLATFORM_ID, NgZone, ChangeDetectorRef
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { PlzDataService, PlzEntry } from '../../services/plz-data.service';
import { SelectionService } from '../../services/selection.service';
import { MapOptions, MapComponent } from '../map/map.component';
import { SearchInputComponent, SimpleValidationStatus } from '../search-input/search-input.component';
import { PlzSelectionTableComponent } from '../plz-selection-table/plz-selection-table.component';


const COLUMN_HIGHLIGHT_DURATION = 1500;
type VerteilungTypOption = 'Nach PLZ' | 'Nach Perimeter';
type ZielgruppeOption = 'Alle Haushalte' | 'Mehrfamilienhäuser' | 'Ein- und Zweifamilienhäuser';
type OverallValidationStatus = 'valid' | 'invalid' | 'pending';

// Definiere hier das Interface, das vom Highlight-Event der Tabelle erwartet wird
export interface TableHighlightEvent {
  plzId: string | null; // Erlaube null für plzId
  highlight: boolean;
}

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
export class DistributionStepComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() nextStepRequest = new EventEmitter<void>();
  @Output() validationChange = new EventEmitter<OverallValidationStatus>();

  @ViewChild(SearchInputComponent) searchInputComponent!: SearchInputComponent;
  @ViewChild(MapComponent) mapComponent!: MapComponent;

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
    private cdr: ChangeDetectorRef
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
        this.cdr.markForCheck();
      });
    this.updateOverallValidationState();
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
    console.error("Ungültiges Datumsformat für parseYyyyMmDdToDate:", dateString);
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

    if (selectedStartDate.getTime() < minStartDate.getTime()) {
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

    if (isNaN(this.defaultStandardStartDate.getTime())) {
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
    Promise.resolve().then(() => {
      this.updateOverallValidationState();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInputEntriesSelected(entries: PlzEntry[]): void {
    if (entries && entries.length > 0) {
      this.selectionService.addMultipleEntries(entries);
    }
    this.cdr.markForCheck();
  }

  onSearchInputTermChanged(term: string): void {
    // Logik hier, falls benötigt
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
      this.plzDataService.getEntryById(entryIdFromMap).subscribe((entry: PlzEntry | undefined) => {
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
        this.cdr.markForCheck();
      });
    }
  }

  onMapLoadingStatusChanged(isLoading: boolean): void {
    this.mapIsLoading = isLoading;
    this.cdr.markForCheck();
  }

  public quickSearch(term: string): void {
    if (this.searchInputComponent) {
      this.searchInputComponent.initiateSearchForTerm(term);
    } else {
      this.searchInputInitialTerm = term;
      this.cdr.markForCheck();
    }
  }

  public clearPlzTable(): void {
    this.selectionService.clearEntries();
    this.mapZoomToPlzId = null;
    this.mapZoomToPlzIdList = null;
    this.cdr.markForCheck();
  }

  removePlzFromTable(entry: PlzEntry): void {
    this.selectionService.removeEntry(entry.id);
  }

  zoomToTableEntryOnMap(entry: PlzEntry): void {
    this.mapZoomToPlzId = entry.id;
    this.mapZoomToPlzIdList = null;
    this.cdr.markForCheck();
    setTimeout(() => { this.mapZoomToPlzId = null; this.cdr.markForCheck(); }, 100);
  }

  // KORRIGIERT: Akzeptiert das Interface TableHighlightEvent
  highlightPlacemarkOnMapFromTable(event: TableHighlightEvent): void {
    if (event.highlight && event.plzId) {
      this.mapTableHoverPlzId = event.plzId;
    } else {
      this.mapTableHoverPlzId = null; // Highlight entfernen, wenn highlight false oder plzId null ist
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
    if (this.validationChange.observers.length > 0) {
      this.validationChange.emit(newOverallStatus);
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
    if (!this.verteilungStartdatum || !this.defaultStandardStartDate) {
      return false;
    }
    const selectedStartDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    if (isNaN(selectedStartDate.getTime()) || isNaN(this.defaultStandardStartDate.getTime())) {
      return false;
    }
    const standardStartDate = this.defaultStandardStartDate.getTime();
    const minStartDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum).getTime();
    if (isNaN(minStartDate)) return false;

    return selectedStartDate.getTime() < standardStartDate && selectedStartDate.getTime() >= minStartDate;
  }

  proceedToNextStep(): void {
    const currentOverallStatus = this.calculateOverallValidationStatus();
    this.validationChange.emit(currentOverallStatus);

    if (currentOverallStatus === 'valid') {
      this.nextStepRequest.emit();
    } else {
      let message = "Bitte vervollständigen Sie Ihre Auswahl und Angaben.";
      const hasSelectedPlzEntries = this.selectionService.getSelectedEntries().length > 0;
      const startDateSelected = !!this.verteilungStartdatum && !isNaN(this.parseYyyyMmDdToDate(this.verteilungStartdatum).getTime());
      const isExpressSurchargeRelevantAndNotConfirmed = this.isExpressSurchargeRelevant() && !this.expressSurchargeConfirmed;

      if (!startDateSelected) {
        message = "Bitte wählen Sie ein gültiges Startdatum für die Verteilung aus.";
      } else if (isExpressSurchargeRelevantAndNotConfirmed) {
        message = "Bitte bestätigen Sie den Express-Zuschlag oder wählen Sie ein späteres Startdatum.";
      } else if (this.showPlzUiContainer && !hasSelectedPlzEntries) {
        if (this.searchInputStatus === 'pending') {
          message = "Bitte wählen Sie einen Eintrag aus der Suchliste oder vervollständigen Sie Ihre Eingabe.";
        } else if (this.searchInputStatus === 'valid' && this.searchInputComponent?.typeaheadSearchTerm?.trim().length > 0) {
          message = "Bitte übernehmen Sie Ihre Eingabe im Suchfeld (z.B. einen PLZ-Bereich mit Enter).";
        } else {
          message = "Bitte wählen Sie mindestens ein PLZ-Gebiet aus oder geben Sie einen gültigen PLZ-Bereich ein.";
        }
      }
      if (isPlatformBrowser(this.platformId)) {
        alert(message);
      }
    }
  }
}
