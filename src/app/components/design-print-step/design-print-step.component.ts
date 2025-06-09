import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { takeUntil, distinctUntilChanged, map, withLatestFrom } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import {
  DesignPackageType, PrintOptionType, FlyerFormatType, AnlieferungType,
  DruckGrammaturType, DruckArtType, DruckAusfuehrungType,
  ProduktionDataState
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
  public currentStatus$: Observable<'valid' | 'invalid' | 'pending'>;

  // Local state ONLY for ngModel bindings on input fields
  public druckAuflage: number | null = 0;
  public druckReserve: number | null = 0;

  constructor(
    public orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef
  ) {
    this.produktionState$ = this.orderDataService.produktion$;
    this.currentStatus$ = this.orderDataService.validierungsStatus$.pipe(
      map(vs => vs.isStep2Valid ? 'valid' : 'invalid')
    );
  }

  ngOnInit(): void {
    console.log('[DesignPrintStepComponent] ngOnInit');

    this.orderDataService.produktion$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
      console.log('[DesignPrintStepComponent] produktionState$ emitted:', JSON.parse(JSON.stringify(state)));
      this.druckAuflage = state.printServiceDetails.auflage;
      this.druckReserve = state.printServiceDetails.reserve;
      this.cdr.markForCheck();
    });

    this.currentStatus$.pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged()
    ).subscribe(status => {
      this.validationChange.emit(status === 'valid');
    });

    this.orderDataService.verteilgebiet$.pipe(
      withLatestFrom(this.produktionState$),
      takeUntil(this.destroy$)
    ).subscribe(([vg, produktion]) => {
      console.log('[DesignPrintStepComponent] verteilgebiet$ emitted, totalFlyersCount:', vg.totalFlyersCount);
      if (produktion.printOption === 'service' && produktion.printServiceDetails.auflage === 0 && vg.totalFlyersCount > 0) {
        console.log(`[DesignPrintStepComponent] Auto-setting druckAuflage to ${vg.totalFlyersCount}.`);
        this.orderDataService.updatePrintServiceDetails({ auflage: vg.totalFlyersCount });
      }
    });
  }

  onDesignPackageSelect(pkg: DesignPackageType | null): void {
    this.orderDataService.updateDesignPackage(pkg);
  }

  onPrintOptionSelect(option: PrintOptionType | null): void {
    this.orderDataService.updatePrintOption(option);
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
    const finalAuflage = this.druckAuflage ?? 0;
    this.orderDataService.updatePrintServiceDetails({ auflage: finalAuflage });
  }

  onDruckReserveChange(): void {
    const finalReserve = this.druckReserve ?? 0;
    this.orderDataService.updatePrintServiceDetails({ reserve: finalReserve });
  }

  ngOnDestroy(): void {
    console.log('[DesignPrintStepComponent] ngOnDestroy');
    this.destroy$.next();
    this.destroy$.complete();
  }
}
