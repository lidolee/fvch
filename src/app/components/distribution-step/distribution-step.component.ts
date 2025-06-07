import { Component, OnInit, OnDestroy, ViewChild, Output, EventEmitter, Inject, PLATFORM_ID, NgZone, ChangeDetectorRef, Input, OnChanges, SimpleChanges, ElementRef, ChangeDetectionStrategy, AfterViewInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Router } from '@angular/router';
import { PlzDataService, PlzEntry } from '../../services/plz-data.service';
import { SelectionService } from '../../services/selection.service';
import { OrderDataService } from '../../services/order-data.service';
import { ZielgruppeOption, PlzSelectionDetail } from '../../services/order-data.types';
import { MapComponent, MapOptions } from '../map/map.component';
import { SearchInputComponent, SimpleValidationStatus } from '../search-input/search-input.component';
import { PlzSelectionTableComponent } from '../plz-selection-table/plz-selection-table.component';
import { ValidationStatus as OverallValidationStatusOfferProcess } from '../offer-process/offer-process.component';

export interface TableHighlightEvent {
  plzId: string | null;
  highlight: boolean;
}
export type VerteilungTypOption = 'Nach PLZ' | 'Nach Perimeter';

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
  @Input() public initialStadt: string | undefined;
  @Input() public currentZielgruppe: ZielgruppeOption = 'Alle Haushalte';
  @Output() public validationChange = new EventEmitter<OverallValidationStatusOfferProcess>();
  @Output() public zielgruppeChange = new EventEmitter<ZielgruppeOption>();

  @ViewChild('searchInputComponent') public searchInputComponentRef!: SearchInputComponent;
  @ViewChild(MapComponent) public mapComponentRef!: MapComponent;
  @ViewChild('mapView') public mapViewRef!: ElementRef<HTMLDivElement>;

  private destroy$ = new Subject<void>();
  private activeProcessingStadt: string | undefined = undefined;

  public searchInputInitialTerm: string = '';
  public searchInputStatus: SimpleValidationStatus = 'empty';
  public selectedEntries: PlzSelectionDetail[] = [];
  private selectedEntriesFromService$: Observable<PlzEntry[]>;

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
    this.selectedEntriesFromService$ = this.selectionService.selectedEntries$;
    this.apiKeyConstant = 'AIzaSyBpa1rzAIkaSS2RAlc9frw8GAPiGC1PNwc';
    this.kmlPathConstant = 'assets/ch_plz.kml';
    this.mapConfig = {
      initialCenter: DEFAULT_MAP_CENTER, initialZoom: DEFAULT_MAP_ZOOM,
      defaultPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.1, strokeWeight: 1.5, fillColor: "#0063D6", fillOpacity: 0.05 },
      highlightedPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.6, strokeWeight: 2, fillColor: "#0063D6", fillOpacity: 0.3 },
      selectedPolygonOptions: { strokeColor: "#D60096", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#D60096", fillOpacity: 0.4 },
      selectedHighlightedPolygonOptions: { strokeColor: "#D60096", strokeOpacity: 0.9, strokeWeight: 2.5, fillColor: "#D60096", fillOpacity: 0.6 },
      typeaheadHoverPolygonOptions: { strokeColor: "#0063D6", strokeOpacity: 0.7, strokeWeight: 2, fillColor: "#0063D6", fillOpacity: 0.25 }
    };
  }

  ngOnInit(): void {
    this.expressSurchargeConfirmed = this.orderDataService.getCurrentExpressConfirmed();
    const orderStartDate = this.orderDataService.getCurrentVerteilungStartdatum();
    if (orderStartDate) this.verteilungStartdatum = orderStartDate;
    this.initializeDates();

    this.selectedEntriesFromService$
      .pipe(takeUntil(this.destroy$))
      .subscribe((serviceEntries: PlzEntry[]) => {
        this.mapSelectedPlzIds = serviceEntries.map(e => e.id);
        this.transformServiceEntriesToLocalFormat(serviceEntries);
        if (!this.mapZoomToPlzId && (!this.mapZoomToPlzIdList || this.mapZoomToPlzIdList.length === 0)) {
          this.mapZoomToPlzIdList = this.mapSelectedPlzIds.length > 0 ? [...this.mapSelectedPlzIds] : null;
        }
        this.updateAndEmitOverallValidationState();
        this.cdr.markForCheck();
      });

    if (this.initialStadt) {
      this.processStadtnameFromUrl(this.initialStadt);
    } else {
      this.transformServiceEntriesToLocalFormat(this.selectionService.getSelectedEntries());
    }

    Promise.resolve().then(() => {
      this.selectionService.updateFlyerCountsForAudience(this.currentZielgruppe);
      this.updateOrderDataServiceExpressStatus();
      this.updateAndEmitOverallValidationState();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialStadt']) {
      const newStadt = changes['initialStadt'].currentValue;
      const effectiveNewStadt = (newStadt && typeof newStadt === 'string' && newStadt.trim() !== '' && newStadt.toLowerCase() !== 'undefined') ? decodeURIComponent(newStadt.trim()) : undefined;
      if (this.activeProcessingStadt !== effectiveNewStadt) {
        this.activeProcessingStadt = effectiveNewStadt;
        if (effectiveNewStadt) {
          this._processAndSelectLocation(effectiveNewStadt, true);
        } else {
          this.selectionService.clearEntries(); this.mapZoomToPlzId = null; this.mapZoomToPlzIdList = null;
          this.searchInputInitialTerm = ''; this.updateAndEmitOverallValidationState();
        }
      }
    }
    if (changes['currentZielgruppe'] && !changes['currentZielgruppe'].firstChange) {
      this.selectionService.updateFlyerCountsForAudience(this.currentZielgruppe);
      this.transformServiceEntriesToLocalFormat(this.selectionService.getSelectedEntries());
      this.highlightFlyerMaxColumnAndEmitValidation();
    }
  }

  ngAfterViewInit(): void {}

  private transformServiceEntriesToLocalFormat(serviceEntries: PlzEntry[]): void {
    let gesamtAnzahlFlyer = 0;
    this.selectedEntries = serviceEntries.map(entry => {
      let anzahlFuerDiesePlz: number;
      switch (this.currentZielgruppe) {
        case 'Alle Haushalte': anzahlFuerDiesePlz = entry.all || 0; break;
        case 'Ein- und Zweifamilienhäuser': anzahlFuerDiesePlz = entry.efh || 0; break;
        case 'Mehrfamilienhäuser': anzahlFuerDiesePlz = entry.mfh || 0; break;
        default: anzahlFuerDiesePlz = entry.all || 0;
      }
      gesamtAnzahlFlyer += anzahlFuerDiesePlz;
      const existingDetail = this.selectedEntries.find(se => se.id === entry.id);

      return {
        id: entry.id, plz6: entry.plz6, plz4: entry.plz4, ort: entry.ort, kt: entry.kt,
        preisKategorie: entry.preisKategorie, all: entry.all, efh: entry.efh, mfh: entry.mfh,
        anzahl: anzahlFuerDiesePlz,
        selected_display_flyer_count: existingDetail?.is_manual_count ? (existingDetail.selected_display_flyer_count) : anzahlFuerDiesePlz,
        is_manual_count: existingDetail?.is_manual_count || false,
        zielgruppe: this.currentZielgruppe
      };
    });
    this.orderDataService.updateSelectedPlzDetails(this.selectedEntries);
    this.orderDataService.updateTotalFlyersCount(gesamtAnzahlFlyer);
    this.cdr.markForCheck();
  }

  public async _processAndSelectLocation(locationName: string, isFromUrl: boolean): Promise<void> {
    if (!locationName || locationName.trim() === '') return;
    this.mapIsLoading = true; this.cdr.markForCheck();
    const dataReady = await this.plzDataService.ensureDataReady();
    if (!dataReady) { this.mapIsLoading = false; this.updateAndEmitOverallValidationState(); this.cdr.markForCheck(); return; }
    if (isFromUrl || this.activeProcessingStadt !== locationName) { this.selectionService.clearEntries(); this.mapZoomToPlzId = null; this.mapZoomToPlzIdList = null; }
    this.activeProcessingStadt = locationName;
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
          if (target.isGroupHeader && target.ort && target.kt) plzToSelect = await firstValueFrom(this.plzDataService.getEntriesByOrtAndKanton(target.ort, target.kt).pipe(takeUntil(this.destroy$)));
          else if (!target.isGroupHeader && target.id) { const single = await firstValueFrom(this.plzDataService.getEntryById(target.id).pipe(takeUntil(this.destroy$))); if (single) plzToSelect = [single]; else plzToSelect = [{ ...target } as PlzEntry]; }
        }
      }
      this.searchInputInitialTerm = termToUse;
      if (plzToSelect.length > 0) this.selectionService.addMultipleEntries(plzToSelect, this.currentZielgruppe);
    } catch (e) { this.searchInputInitialTerm = locationName; }
    finally {
      this.mapIsLoading = false;
      this.updateAndEmitOverallValidationState();
      if (isPlatformBrowser(this.platformId)) {
        this.ngZone.onStable.pipe(takeUntil(this.destroy$)).subscribe(() => {
          if (this.searchInputComponentRef?.blurInput) this.searchInputComponentRef.blurInput();
          if (isFromUrl || plzToSelect.length > 0) setTimeout(() => this.scrollToMapView(), 250);
        });
      }
      this.cdr.markForCheck();
    }
  }
  private processStadtnameFromUrl(s: string): void { this._processAndSelectLocation(s, true); }
  public selectCityAndFetchPlz(s: string): void { this._processAndSelectLocation(s, false); }
  private initializeDates(): void {
    const today = new Date(); today.setUTCHours(0,0,0,0); const minStart = new Date(today); minStart.setUTCDate(today.getUTCDate() + 1);
    this.minVerteilungStartdatum = this.formatDateToYyyyMmDd(minStart);
    this.defaultStandardStartDate = this.addWorkingDays(new Date(today), 3);
    let initial = new Date(this.defaultStandardStartDate);
    if (this.verteilungStartdatum) { const preselected = this.parseYyyyMmDdToDate(this.verteilungStartdatum); if (preselected && preselected >= minStart) initial = preselected; }
    if (initial < minStart) initial = new Date(minStart);
    this.verteilungStartdatum = this.formatDateToYyyyMmDd(initial);
    this.orderDataService.updateVerteilungStartdatum(this.verteilungStartdatum); this.checkExpressSurcharge();
  }
  private formatDateToYyyyMmDd(d: Date): string { return `${d.getUTCFullYear()}-${('0'+(d.getUTCMonth()+1)).slice(-2)}-${('0'+d.getUTCDate()).slice(-2)}`; }
  public getFormattedDefaultStandardDateForDisplay(): string { if (!this.defaultStandardStartDate) return ''; return `${('0'+this.defaultStandardStartDate.getUTCDate()).slice(-2)}.${('0'+(this.defaultStandardStartDate.getUTCMonth()+1)).slice(-2)}.${this.defaultStandardStartDate.getUTCFullYear()}`; }
  private parseYyyyMmDdToDate(s: string): Date|null { if(!s) return null; const p=s.split('-'); if(p.length===3){const y=parseInt(p[0]),m=parseInt(p[1])-1,d=parseInt(p[2]);if(!isNaN(y)&&!isNaN(m)&&!isNaN(d)){const dt=new Date(Date.UTC(y,m,d));if(dt.getUTCFullYear()===y&&dt.getUTCMonth()===m&&dt.getUTCDate()===d)return dt;}} return null;}
  private addWorkingDays(base:Date,days:number):Date{let curr=new Date(base);let added=0;while(added<days){curr.setUTCDate(curr.getUTCDate()+1);const day=curr.getUTCDay();if(day!==0&&day!==6)added++;}return curr;}
  public onStartDateChange(): void {
    this.expressSurchargeConfirmed = false;
    if (!this.verteilungStartdatum) { this.showExpressSurcharge = false; this.updateOrderDataServiceExpressStatus(); this.updateAndEmitOverallValidationState(); return; }
    let selDate = this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const minDate = this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);
    if (!minDate) { this.showExpressSurcharge = false; this.updateOrderDataServiceExpressStatus(); this.updateAndEmitOverallValidationState(); return; }
    if (!selDate || selDate < minDate) this.verteilungStartdatum = this.formatDateToYyyyMmDd(minDate);
    this.orderDataService.updateVerteilungStartdatum(this.verteilungStartdatum);
    this.checkExpressSurcharge(); this.updateOrderDataServiceExpressStatus(); this.updateAndEmitOverallValidationState();
  }
  private checkExpressSurcharge(): void {
    if (!this.verteilungStartdatum||!this.defaultStandardStartDate){if(this.showExpressSurcharge){this.showExpressSurcharge=false;this.cdr.markForCheck();}return;}
    const sel=this.parseYyyyMmDdToDate(this.verteilungStartdatum); const minAllowed=this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);
    if(!sel||isNaN(sel.getTime())||!minAllowed||isNaN(minAllowed.getTime())||isNaN(this.defaultStandardStartDate.getTime())){if(this.showExpressSurcharge){this.showExpressSurcharge=false;this.cdr.markForCheck();}return;}
    const needs=sel<this.defaultStandardStartDate&&sel>=minAllowed; const newShow=needs&&!this.expressSurchargeConfirmed;
    if(this.showExpressSurcharge!==newShow){this.showExpressSurcharge=newShow;this.cdr.markForCheck();}
  }
  public avoidExpressSurcharge(): void { this.expressSurchargeConfirmed=false; if(this.defaultStandardStartDate){this.verteilungStartdatum=this.formatDateToYyyyMmDd(this.defaultStandardStartDate);this.onStartDateChange();}else this.cdr.markForCheck(); }
  public confirmExpressSurcharge(): void { this.expressSurchargeConfirmed=true;this.showExpressSurcharge=false;this.updateOrderDataServiceExpressStatus();this.updateAndEmitOverallValidationState(); }
  private updateOrderDataServiceExpressStatus(): void { this.orderDataService.updateExpressConfirmed(this.expressSurchargeConfirmed); }
  public onSearchInputEntriesSelected(e: PlzEntry[]): void { if(e&&e.length>0){this.selectionService.addMultipleEntries(e,this.currentZielgruppe);if(isPlatformBrowser(this.platformId))setTimeout(()=>this.scrollToMapView(),100);}}
  public onSearchInputTermChanged(term: string): void {}
  public onSearchInputStatusChanged(s: SimpleValidationStatus): void { if(this.searchInputStatus!==s){this.searchInputStatus=s;this.updateAndEmitOverallValidationState();}}
  public setVerteilungTyp(typ: VerteilungTypOption): void { if(this.currentVerteilungTyp!==typ){this.currentVerteilungTyp=typ;this.updateUiFlagsAndMapState();this.updateAndEmitOverallValidationState();}}
  private updateUiFlagsAndMapState(): void { const op=this.showPlzUiContainer,opc=this.showPerimeterUiContainer;this.showPlzUiContainer=this.currentVerteilungTyp==='Nach PLZ';this.showPerimeterUiContainer=this.currentVerteilungTyp==='Nach Perimeter';if(op!==this.showPlzUiContainer||opc!==this.showPerimeterUiContainer)this.cdr.markForCheck();}
  public setZielgruppe(zg: ZielgruppeOption): void { if (this.currentZielgruppe !== zg) { this.zielgruppeChange.emit(zg); }}
  private highlightFlyerMaxColumnAndEmitValidation(): void { this.highlightFlyerMaxColumn=true;this.cdr.markForCheck();setTimeout(()=>{this.highlightFlyerMaxColumn=false;this.cdr.markForCheck();},COLUMN_HIGHLIGHT_DURATION);this.updateAndEmitOverallValidationState();}
  public onPlzClickedOnMap(evt: {id:string;name?:string}): void { const id=evt.id;if(!id)return;const sel=this.selectionService.getSelectedEntries().some(e=>e.id===id);if(sel)this.selectionService.removeEntry(id);else{firstValueFrom(this.plzDataService.getEntryById(id).pipe(takeUntil(this.destroy$))).then(e=>{if(e&&this.selectionService.validateEntry(e))this.selectionService.addEntry(e,this.currentZielgruppe);else{const p6=id,p4=p6.substring(0,4),o=evt.name||'Unbekannt';const pe:PlzEntry={id,plz6:p6,plz4:p4,ort:o,kt:'N/A',preisKategorie:'A',all:0};if(this.selectionService.validateEntry(pe))this.selectionService.addEntry(pe,this.currentZielgruppe);}}).catch(err=>{});}}
  public onMapLoadingStatusChanged(l: boolean): void { if(this.mapIsLoading!==l){this.mapIsLoading=l;this.updateAndEmitOverallValidationState();}}
  public onMapReady(event: any): void {}
  public clearPlzTable(): void { this.selectionService.clearEntries();this.mapZoomToPlzId=null;this.mapZoomToPlzIdList=null;this.activeProcessingStadt=undefined;this.searchInputInitialTerm='';this.router.navigate(['/']);if(isPlatformBrowser(this.platformId))setTimeout(()=>this.scrollToMapView(),100);}
  public removePlzFromTable(entry: PlzSelectionDetail): void { this.selectionService.removeEntry(entry.id); }
  public zoomToTableEntryOnMap(entry: PlzSelectionDetail): void { this.mapZoomToPlzId=entry.id;this.mapZoomToPlzIdList=null;this.cdr.markForCheck();if(isPlatformBrowser(this.platformId))setTimeout(()=>this.scrollToMapView(),100);setTimeout(()=>{this.mapZoomToPlzId=null;this.cdr.markForCheck();},250);}
  public highlightPlacemarkOnMapFromTable(event: TableHighlightEvent): void { const nid=(event.highlight&&event.plzId)?event.plzId:null;if(this.mapTableHoverPlzId!==nid){this.mapTableHoverPlzId=nid;this.cdr.markForCheck();}}
  public onPlzFlyerCountChanged(event: {entryId: string, newCount: number}): void { this.selectionService.updateFlyerCountForEntry(event.entryId, event.newCount, this.currentZielgruppe); }
  public triggerKmlUpload(): void {this.kmlFileName='test.kml';this.updateAndEmitOverallValidationState();}

  private updateAndEmitOverallValidationState(): void {
    const currentStatus = this.calculateOverallValidationStatus();
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.ngZone.run(() => {
          this.validationChange.emit(currentStatus);
        });
      }, 0);
    });
    this.cdr.markForCheck();
  }

  private calculateOverallValidationStatus():OverallValidationStatusOfferProcess{
    const selE=this.selectionService.getSelectedEntries();
    const hasSel=selE&&selE.length>0;
    const pDate=this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const dateOk=!!pDate&&!isNaN(pDate.getTime());
    const expressOk=!this.isExpressSurchargeRelevant()||this.expressSurchargeConfirmed;

    if(this.currentVerteilungTyp==='Nach PLZ'){
      const searchOk=this.searchInputStatus==='valid'||this.searchInputStatus==='empty'||(!!this.activeProcessingStadt&&this.searchInputStatus!=='invalid');
      if(hasSel&&dateOk&&expressOk&&searchOk)return'valid';
    } else {
      if(this.kmlFileName&&dateOk&&expressOk)return'valid';
      return'invalid';
    }
    return'invalid';
  }

  private isExpressSurchargeRelevant():boolean{
    if(!this.verteilungStartdatum||!this.defaultStandardStartDate)return false;
    const s=this.parseYyyyMmDdToDate(this.verteilungStartdatum);
    const m=this.parseYyyyMmDdToDate(this.minVerteilungStartdatum);
    if(!s||isNaN(s.getTime())||!m||isNaN(m.getTime())||isNaN(this.defaultStandardStartDate.getTime()))return false;
    return s<this.defaultStandardStartDate&&s>=m;
  }

  public triggerValidationDisplay(): void {
    this.updateAndEmitOverallValidationState();
  }

  private scrollToMapView(): void { if(!isPlatformBrowser(this.platformId))return;this.ngZone.onStable.pipe(takeUntil(this.destroy$)).subscribe(()=>{if(!this.mapViewRef?.nativeElement)return;const el=this.mapViewRef.nativeElement;if(el.offsetParent===null||el.offsetWidth===0||el.offsetHeight===0)return;const off=90;const sy=window.pageYOffset+el.getBoundingClientRect().top;const tsp=sy-off;window.scrollTo({top:tsp,behavior:'smooth'});});}
}
