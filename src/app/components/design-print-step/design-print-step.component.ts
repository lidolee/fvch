import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Observable, firstValueFrom, combineLatest } from 'rxjs';
import { takeUntil, take, distinctUntilChanged } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import {
  DesignPackageType, PrintOptionType, FlyerFormatType, AnlieferungType,
  DruckGrammaturType, DruckArtType, DruckAusfuehrungType,
  ProduktionDataState, VerteilgebietDataState, VerteilungTypOption
} from '../../services/order-data.types';

@Component({
  selector: 'app-design-print-step',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-print-step.component.html',
  styleUrls: ['./design-print-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignPrintStepComponent implements OnInit, OnDestroy {
  @Output() validationChange = new EventEmitter<boolean>();

  private destroy$ = new Subject<void>();
  public produktionState$: Observable<ProduktionDataState>;
  public currentVerteilungTyp: VerteilungTypOption = 'Nach PLZ';

  public druckAuflage: number | null = 0;
  public druckReserve: number | null = 0;

  constructor(
    public orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {
    this.produktionState$ = this.orderDataService.produktion$;
  }

  ngOnInit(): void {
    //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] ngOnInit`);

    // Emit initial validation status based on the current state.
    firstValueFrom(combineLatest([this.orderDataService.verteilgebiet$, this.orderDataService.produktion$]).pipe(take(1)))
      .then(([verteilgebiet, produktion]) => {
        const isValid = this.calculateValidationStatus(verteilgebiet, produktion);
        //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] Emitting initial validation status: ${isValid}`);
        this.validationChange.emit(isValid);
      });

    combineLatest([
      this.orderDataService.verteilgebiet$,
      this.orderDataService.produktion$
    ]).pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged(([vg1, p1], [vg2, p2]) => JSON.stringify({vg1, p1}) === JSON.stringify({vg2, p2}))
    ).subscribe(([verteilgebiet, produktion]) => {
      const isValid = this.calculateValidationStatus(verteilgebiet, produktion);
      //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] State changed, emitting validation status: ${isValid}`);
      this.validationChange.emit(isValid);
      this.cdr.markForCheck();
    });
  }

  private calculateValidationStatus(verteilgebiet: VerteilgebietDataState | null, produktion: ProduktionDataState): boolean {
    //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] Calculating validation. printOption is '${produktion.printOption}', designPackage is '${produktion.designPackage}'.`);

    if (!produktion.printOption) {
      //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] Validation FAIL: printOption is null or undefined.`);
      return false;
    }

    if (produktion.printOption === 'eigenes') {
      //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] Validation PASS: printOption is 'eigenes'.`);
      return true;
    }

    if (produktion.printOption === 'anliefern') {
      const isValid = !!produktion.anlieferDetails.format && !!produktion.anlieferDetails.anlieferung;
      //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] Validation check for 'anliefern'. Result: ${isValid}`);
      return isValid;
    }

    if (produktion.printOption === 'service' && verteilgebiet) {
      // *** THE FIX ***
      // A design package must be selected when print service is chosen.
      const designPackageSelected = !!produktion.designPackage;
      if (!designPackageSelected) {
        //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] Validation FAIL for 'service': No design package selected.`);
        return false;
      }

      const auflageConditionMet = (verteilgebiet.verteilungTyp === 'Nach Perimeter') || (produktion.printServiceDetails.auflage > 0);
      const isValid = designPackageSelected &&
        !!produktion.printServiceDetails.format &&
        !!produktion.printServiceDetails.grammatur &&
        !!produktion.printServiceDetails.art &&
        !!produktion.printServiceDetails.ausfuehrung &&
        auflageConditionMet &&
        produktion.printServiceDetails.reserve !== null && produktion.printServiceDetails.reserve >= 0;
      //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] Validation check for 'service'. Result: ${isValid}`);
      return isValid;
    }

    //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] Validation FAIL: Fallback. printOption was '${produktion.printOption}'.`);
    return false;
  }

  private handleAuflageLogic(vg: VerteilgebietDataState, produktion: ProduktionDataState): void {
    if (produktion.printOption === 'service') {
      let newAuflage: number = produktion.printServiceDetails.auflage;

      if (vg.verteilungTyp === 'Nach PLZ') {
        if (vg.totalFlyersCount > 0) {
          if (produktion.printServiceDetails.auflage !== vg.totalFlyersCount) {
            newAuflage = vg.totalFlyersCount;
          }
        } else {
          if (produktion.printServiceDetails.auflage !== 0) {
            newAuflage = 0;
          }
        }
      } else { // Nach Perimeter
        if (produktion.printServiceDetails.auflage !== 0) {
          newAuflage = 0;
        }
      }

      if (newAuflage !== produktion.printServiceDetails.auflage) {
        this.orderDataService.updatePrintServiceDetails({ auflage: newAuflage });
      }

      if (this.druckAuflage !== newAuflage) {
        this.druckAuflage = newAuflage;
        this.cdr.markForCheck();
      }
    }
  }

  onDesignPackageSelect(pkg: DesignPackageType | null): void {
    this.orderDataService.updateDesignPackage(pkg);
    this.cdr.markForCheck();
  }

  onPrintOptionSelect(option: PrintOptionType | null): void {
    if (option === 'anliefern') {
      this.orderDataService.resetDesignAndPrintDetails();
    } else if (option === 'service') {
      this.orderDataService.resetAnlieferDetails();
    }
    this.orderDataService.updatePrintOption(option);
    firstValueFrom(this.orderDataService.verteilgebiet$.pipe(take(1))).then(vg => {
      firstValueFrom(this.orderDataService.produktion$.pipe(take(1))).then(prod => {
        this.handleAuflageLogic(vg, prod);
      });
    });
  }

  onFormatSelect(format: FlyerFormatType | null, isPrintService: boolean): void {
    if (isPrintService) {
      this.orderDataService.updatePrintServiceDetails({ format });
    } else {
      this.orderDataService.updateAnlieferDetails({ format });
    }
  }

  onAnlieferungSelect(type: AnlieferungType | null): void {
    this.orderDataService.updateAnlieferDetails({ anlieferung: type });
  }

  setDruckGrammatur(grammatur: DruckGrammaturType | null): void {
    this.orderDataService.updatePrintServiceDetails({ grammatur });
  }

  setDruckArt(art: DruckArtType | null): void {
    this.orderDataService.updatePrintServiceDetails({ art });
  }

  setDruckAusfuehrung(ausfuehrung: DruckAusfuehrungType | null): void {
    this.orderDataService.updatePrintServiceDetails({ ausfuehrung });
  }

  onDruckAuflageChange(): void {
    if (this.currentVerteilungTyp === 'Nach PLZ') {
      const finalAuflage = this.druckAuflage ?? 0;
      this.orderDataService.updatePrintServiceDetails({ auflage: finalAuflage });
    } else {
      if (this.druckAuflage !== 0) {
        this.druckAuflage = 0;
        this.cdr.markForCheck();
      }
      this.orderDataService.updatePrintServiceDetails({ auflage: 0 });
    }
  }

  onDruckReserveChange(): void {
    const finalReserve = this.druckReserve ?? 0;
    this.orderDataService.updatePrintServiceDetails({ reserve: finalReserve });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    //console.log(`[${new Date().toISOString()}] [DesignPrintStepComponent] ngOnDestroy`);
  }
}
