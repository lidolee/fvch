import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { takeUntil, distinctUntilChanged, map } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import {
  DesignPackageType, PrintOptionType, FlyerFormatType, AnlieferungType,
  DruckGrammaturType, DruckArtType, DruckAusfuehrungType,
  ProduktionDataState
} from '../../services/order-data.types';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-design-print-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-print-step.component.html',
  styleUrls: ['./design-print-step.component.scss']
})
export class DesignPrintStepComponent implements OnInit, OnDestroy {
  @Output() validationChange = new EventEmitter<boolean>();

  private destroy$ = new Subject<void>();
  public produktionState$: Observable<ProduktionDataState>;

  public selectedDesignPackage: DesignPackageType | null = null;
  public selectedPrintOption: PrintOptionType | null = null;
  public currentFormat: FlyerFormatType | null = null; // For Anlieferung
  public currentAnlieferung: AnlieferungType | null = null;
  public druckFormat: FlyerFormatType | null = null; // For Print Service
  public druckGrammatur: DruckGrammaturType | null = null;
  public druckArt: DruckArtType | null = null;
  public druckAusfuehrung: DruckAusfuehrungType | null = null;
  public druckAuflage: number | null = 0;
  public druckReserve: number | null = 0;

  public currentStatus: 'valid' | 'invalid' | 'pending' = 'pending';
  private totalFlyersFromSelection: number = 0;

  constructor(
    private orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {
    this.produktionState$ = this.orderDataService.produktion$;
  }

  ngOnInit(): void {
    console.log('[DesignPrintStepComponent] ngOnInit');
    this.produktionState$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
      console.log('[DesignPrintStepComponent] produktionState$ emitted:', JSON.parse(JSON.stringify(state)));
      this.selectedDesignPackage = state.designPackage;
      this.selectedPrintOption = state.printOption;
      this.currentFormat = state.anlieferDetails.format;
      this.currentAnlieferung = state.anlieferDetails.anlieferung;
      this.druckFormat = state.printServiceDetails.format;
      this.druckGrammatur = state.printServiceDetails.grammatur;
      this.druckArt = state.printServiceDetails.art;
      this.druckAusfuehrung = state.printServiceDetails.ausfuehrung;

      // Nur aktualisieren, wenn sich der Wert tatsächlich geändert hat, um unnötige Zyklen zu vermeiden
      if (this.druckAuflage !== state.printServiceDetails.auflage && state.printServiceDetails.auflage !== undefined) {
        this.druckAuflage = state.printServiceDetails.auflage;
      }
      if (this.druckReserve !== state.printServiceDetails.reserve && state.printServiceDetails.reserve !== undefined) {
        this.druckReserve = state.printServiceDetails.reserve;
      }
      this.cdr.detectChanges();
    });

    this.orderDataService.validierungsStatus$.pipe(
      takeUntil(this.destroy$),
      map(vs => vs.isStep2Valid),
      distinctUntilChanged()
    ).subscribe(isValid => {
      console.log(`[DesignPrintStepComponent] validierungsStatus$ (isStep2Valid) emitted: ${isValid}`);
      this.currentStatus = isValid ? 'valid' : 'invalid';
      this.validationChange.emit(isValid);
      this.cdr.detectChanges();
    });

    this.orderDataService.verteilgebiet$.pipe(takeUntil(this.destroy$))
      .subscribe(vg => {
        console.log('[DesignPrintStepComponent] verteilgebiet$ emitted, totalFlyersCount:', vg.totalFlyersCount);
        this.totalFlyersFromSelection = vg.totalFlyersCount;
        if (this.selectedPrintOption === 'service' && (!this.druckAuflage || this.druckAuflage === 0) && this.totalFlyersFromSelection > 0) {
          console.log(`[DesignPrintStepComponent] Auto-setting druckAuflage to ${this.totalFlyersFromSelection} because printOption is 'service' and auflage is 0.`);
          // this.druckAuflage = this.totalFlyersFromSelection; // Wird durch produktionState$ aktualisiert
          this.orderDataService.updatePrintServiceDetails({ auflage: this.totalFlyersFromSelection });
        }
      });
  }

  onDesignPackageSelect(pkg: DesignPackageType | null): void {
    console.log(`[DesignPrintStepComponent] onDesignPackageSelect: ${pkg}. Current selectedDesignPackage before update: ${this.selectedDesignPackage}`);
    this.orderDataService.updateDesignPackage(pkg);
  }

  onPrintOptionSelect(option: PrintOptionType | null): void {
    console.log(`[DesignPrintStepComponent] onPrintOptionSelect: ${option}. Current selectedPrintOption before update: ${this.selectedPrintOption}`);
    this.orderDataService.updatePrintOption(option);
    if (option === 'service' && (!this.druckAuflage || this.druckAuflage === 0) && this.totalFlyersFromSelection > 0) {
      console.log(`[DesignPrintStepComponent] onPrintOptionSelect: Auto-setting druckAuflage to ${this.totalFlyersFromSelection}`);
      this.orderDataService.updatePrintServiceDetails({ auflage: this.totalFlyersFromSelection });
    }
  }

  public onFormatSelect(format: FlyerFormatType | null, isPrintService: boolean): void {
    console.log(`[DesignPrintStepComponent] onFormatSelect called with format: ${format}, isPrintService: ${isPrintService}. Current druckFormat: ${this.druckFormat}, currentAnlieferFormat (currentFormat): ${this.currentFormat}`);
    if (isPrintService) {
      this.changeDruckFormat(format);
    } else {
      this.changeAnlieferFormat(format);
    }
  }

  public onAnlieferungSelect(type: AnlieferungType | null): void {
    console.log(`[DesignPrintStepComponent] onAnlieferungSelect: ${type}. Current anlieferung: ${this.currentAnlieferung}`);
    this.changeAnlieferArt(type);
  }

  private changeAnlieferFormat(format: FlyerFormatType | null): void {
    console.log(`[DesignPrintStepComponent] changeAnlieferFormat changing to: ${format}`);
    this.orderDataService.updateAnlieferDetails({ format });
  }

  private changeAnlieferArt(type: AnlieferungType | null): void {
    console.log(`[DesignPrintStepComponent] changeAnlieferArt changing to: ${type}`);
    this.orderDataService.updateAnlieferDetails({ anlieferung: type });
  }

  private changeDruckFormat(format: FlyerFormatType | null): void {
    console.log(`[DesignPrintStepComponent] changeDruckFormat changing to: ${format}`);
    this.orderDataService.updatePrintServiceDetails({ format });
  }

  public setDruckGrammatur(grammatur: DruckGrammaturType | null): void {
    console.log(`[DesignPrintStepComponent] setDruckGrammatur: ${grammatur}`);
    this.orderDataService.updatePrintServiceDetails({ grammatur });
  }

  public setDruckArt(art: DruckArtType | null): void {
    console.log(`[DesignPrintStepComponent] setDruckArt: ${art}`);
    this.orderDataService.updatePrintServiceDetails({ art });
  }

  public setDruckAusfuehrung(ausfuehrung: DruckAusfuehrungType | null): void {
    console.log(`[DesignPrintStepComponent] setDruckAusfuehrung: ${ausfuehrung}`);
    this.orderDataService.updatePrintServiceDetails({ ausfuehrung });
  }

  public onDruckAuflageChange(event?: Event): void {
    let numValue: number | null = null;
    const target = event?.target as HTMLInputElement | null;
    if (target && typeof target.value === 'string') {
      numValue = parseInt(target.value, 10);
    } else if (typeof this.druckAuflage === 'string') {
      numValue = parseInt(this.druckAuflage, 10);
    } else if (typeof this.druckAuflage === 'number') {
      numValue = this.druckAuflage;
    }

    const finalAuflage = isNaN(numValue as number) ? 0 : (numValue ?? 0);
    console.log(`[DesignPrintStepComponent] onDruckAuflageChange. Input value: ${target?.value}, Parsed numValue: ${numValue}, Final auflage for service: ${finalAuflage}`);
    if (this.druckAuflage !== finalAuflage) { // Nur updaten wenn Wert sich geändert hat
      this.orderDataService.updatePrintServiceDetails({ auflage: finalAuflage });
    }
  }

  public onDruckReserveChange(event?: Event): void {
    let numValue: number | null = null;
    const target = event?.target as HTMLInputElement | null;
    if (target && typeof target.value === 'string') {
      numValue = parseInt(target.value, 10);
    } else if (typeof this.druckReserve === 'string') {
      numValue = parseInt(this.druckReserve, 10);
    } else if (typeof this.druckReserve === 'number') {
      numValue = this.druckReserve;
    }
    const finalReserve = isNaN(numValue as number) ? 0 : (numValue ?? 0);
    console.log(`[DesignPrintStepComponent] onDruckReserveChange. Input value: ${target?.value}, Parsed numValue: ${numValue}, Final reserve for service: ${finalReserve}`);
    if (this.druckReserve !== finalReserve) { // Nur updaten wenn Wert sich geändert hat
      this.orderDataService.updatePrintServiceDetails({ reserve: finalReserve });
    }
  }

  ngOnDestroy(): void {
    console.log('[DesignPrintStepComponent] ngOnDestroy');
    this.destroy$.next();
    this.destroy$.complete();
  }
}
