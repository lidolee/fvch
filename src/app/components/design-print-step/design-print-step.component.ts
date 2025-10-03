import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Observable, firstValueFrom, combineLatest } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';
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
    console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] ngOnInit`);

    this.orderDataService.verteilgebiet$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(vg => {
      const previousVerteilungTyp = this.currentVerteilungTyp;
      this.currentVerteilungTyp = vg.verteilungTyp;
      if (previousVerteilungTyp !== this.currentVerteilungTyp) {
        firstValueFrom(this.orderDataService.produktion$.pipe(take(1))).then(prod => {
          this.handleAuflageLogic(vg, prod);
        });
      }
      this.cdr.markForCheck();
    });

    combineLatest([
      this.orderDataService.verteilgebiet$,
      this.orderDataService.produktion$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([verteilgebiet, produktion]) => {
      const isValid = this.calculateValidationStatus(verteilgebiet, produktion);
      this.validationChange.emit(isValid);

      if (this.currentVerteilungTyp === 'Nach PLZ') {
        if (this.druckAuflage !== produktion.printServiceDetails.auflage) {
          this.druckAuflage = produktion.printServiceDetails.auflage;
        }
      } else {
        if (this.druckAuflage !== 0) {
          this.druckAuflage = 0;
        }
        if (produktion.printServiceDetails.auflage !== 0) {
          this.orderDataService.updatePrintServiceDetails({ auflage: 0 });
        }
      }

      if (this.druckReserve !== produktion.printServiceDetails.reserve) {
        this.druckReserve = produktion.printServiceDetails.reserve;
      }
      this.cdr.markForCheck();
    });
  }

  private calculateValidationStatus(verteilgebiet: VerteilgebietDataState, produktion: ProduktionDataState): boolean {
    if (!produktion.printOption) {
      return false;
    }

    if (produktion.printOption === 'anliefern') {
      return !!produktion.anlieferDetails.format && !!produktion.anlieferDetails.anlieferung;
    }

    if (produktion.printOption === 'service') {
      const auflageConditionMet = (verteilgebiet.verteilungTyp === 'Nach Perimeter') || (produktion.printServiceDetails.auflage > 0);
      return !!produktion.printServiceDetails.format &&
        !!produktion.printServiceDetails.grammatur &&
        !!produktion.printServiceDetails.art &&
        !!produktion.printServiceDetails.ausfuehrung &&
        auflageConditionMet &&
        produktion.printServiceDetails.reserve !== null && produktion.printServiceDetails.reserve >= 0;
    }

    return false; // Should not be reached if printOption is one of the valid types
  }


  private handleAuflageLogic(vg: VerteilgebietDataState, produktion: ProduktionDataState): void {
    console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] handleAuflageLogic. VerteilungTyp: ${vg.verteilungTyp}, TotalFlyers: ${vg.totalFlyersCount}, PrintOption: ${produktion.printOption}`);
    if (produktion.printOption === 'service') {
      let newAuflage: number = produktion.printServiceDetails.auflage;

      if (vg.verteilungTyp === 'Nach PLZ') {
        if (vg.totalFlyersCount > 0) {
          if (produktion.printServiceDetails.auflage !== vg.totalFlyersCount) {
            newAuflage = vg.totalFlyersCount;
            console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] Auto-setting druckAuflage to ${newAuflage} for PLZ.`);
          }
        } else {
          if (produktion.printServiceDetails.auflage !== 0) {
            newAuflage = 0;
            console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] Setting druckAuflage to 0 for PLZ as totalFlyers is 0.`);
          }
        }
      } else { // Nach Perimeter
        if (produktion.printServiceDetails.auflage !== 0) {
          newAuflage = 0;
          console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] Setting druckAuflage to 0 for Perimeter.`);
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
    console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] ngOnDestroy`);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
