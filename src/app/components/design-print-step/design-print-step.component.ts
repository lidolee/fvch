import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { takeUntil, distinctUntilChanged, map, withLatestFrom, take } from 'rxjs/operators';
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
  @ViewChild('pdfFileUpload') pdfFileUploadInputRef!: ElementRef<HTMLInputElement>;

  private destroy$ = new Subject<void>();
  public produktionState$: Observable<ProduktionDataState>;
  public currentStatus$: Observable<'valid' | 'invalid' | 'pending'>;
  public currentVerteilungTyp: VerteilungTypOption = 'Nach PLZ';

  public druckAuflage: number | null = 0;
  public druckReserve: number | null = 0;
  public pdfFileName: string | null = null;

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

    this.orderDataService.produktion$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
      console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] produktionState$ emitted:`, JSON.parse(JSON.stringify(state)));

      if (this.currentVerteilungTyp === 'Nach PLZ') {
        if (this.druckAuflage !== state.printServiceDetails.auflage) {
          this.druckAuflage = state.printServiceDetails.auflage;
        }
      } else {
        if (this.druckAuflage !== 0) {
          this.druckAuflage = 0;
        }
        if (state.printServiceDetails.auflage !== 0) {
          this.orderDataService.updatePrintServiceDetails({ auflage: 0 });
        }
      }

      if (this.druckReserve !== state.printServiceDetails.reserve) {
        this.druckReserve = state.printServiceDetails.reserve;
      }

      if (state.designPackage !== 'eigenes' && this.pdfFileName !== null) {
        this.pdfFileName = null;
        if (this.pdfFileUploadInputRef?.nativeElement) {
          this.pdfFileUploadInputRef.nativeElement.value = '';
        }
      }
      this.cdr.markForCheck();
    });

    this.currentStatus$.pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged()
    ).subscribe(status => {
      // Schedule the emission to the next JavaScript microtask queue
      Promise.resolve().then(() => {
        this.validationChange.emit(status === 'valid');
      });
    });

    this.orderDataService.verteilgebiet$.pipe(
      withLatestFrom(this.orderDataService.produktion$),
      takeUntil(this.destroy$)
    ).subscribe(([vg, produktion]) => {
      this.handleAuflageLogic(vg, produktion);
    });
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
    if (pkg !== 'eigenes') {
      this.pdfFileName = null;
      if (this.pdfFileUploadInputRef?.nativeElement) {
        this.pdfFileUploadInputRef.nativeElement.value = '';
      }
      this.orderDataService.updateEigenesDesignPdfStatus(false);
    }
    this.cdr.markForCheck();
  }

  onPrintOptionSelect(option: PrintOptionType | null): void {
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

  public triggerPdfUpload(): void {
    if (this.pdfFileUploadInputRef?.nativeElement) {
      this.pdfFileUploadInputRef.nativeElement.click();
    } else {
      console.error(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] PDF file input ref not available.`);
    }
  }

  public async onPdfFileSelected(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const produktionState = await firstValueFrom(this.produktionState$);

    if (!produktionState) {
      console.error(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] Production state not available.`);
      this.pdfFileName = null;
      this.orderDataService.updateEigenesDesignPdfStatus(false);
      if (inputElement) inputElement.value = '';
      this.cdr.markForCheck();
      return;
    }

    if (produktionState.designPackage !== 'eigenes') {
      console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] PDF upload attempt while design package is not 'eigenes'.`);
      alert('PDF-Upload ist nur beim Design-Paket "eigenes" erlaubt.');
      this.pdfFileName = null;
      this.orderDataService.updateEigenesDesignPdfStatus(false);
      if (inputElement) inputElement.value = '';
      this.cdr.markForCheck();
      return;
    }

    const files = inputElement?.files;

    if (files && files.length > 0) {
      const file = files[0];
      const maxFileSize = 30 * 1024 * 1024; // 30MB
      const allowedFileType = '.pdf';
      const allowedMimeType = 'application/pdf';

      if (!(file.name.toLowerCase().endsWith(allowedFileType) || file.type === allowedMimeType)) {
        console.warn(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] Invalid PDF file type: ${file.name} (type: ${file.type}).`);
        alert(`Ungültiger Dateityp. Nur ${allowedFileType}-Dateien sind erlaubt.`);
        this.pdfFileName = null;
        this.orderDataService.updateEigenesDesignPdfStatus(false);
        if (inputElement) inputElement.value = '';
        this.cdr.markForCheck();
        return;
      }

      if (file.size > maxFileSize) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxFileSizeMB = (maxFileSize / (1024 * 1024)).toFixed(2);
        console.warn(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] PDF file too large: ${fileSizeMB}MB. Max size is ${maxFileSizeMB}MB.`);
        alert(`Datei ist zu groß (${fileSizeMB}MB). Maximale Dateigröße beträgt ${maxFileSizeMB}MB.`);
        this.pdfFileName = null;
        this.orderDataService.updateEigenesDesignPdfStatus(false);
        if (inputElement) inputElement.value = '';
        this.cdr.markForCheck();
        return;
      }

      this.pdfFileName = file.name;
      this.orderDataService.updateEigenesDesignPdfStatus(true);
      console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] PDF file "${file.name}" selected and status updated.`);
    } else {
      this.pdfFileName = null;
      this.orderDataService.updateEigenesDesignPdfStatus(false);
    }
    this.cdr.markForCheck();
  }

  public removePdfFile(): void {
    console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] PDF file removed.`);
    this.pdfFileName = null;
    if (this.pdfFileUploadInputRef?.nativeElement) {
      this.pdfFileUploadInputRef.nativeElement.value = '';
    }
    this.orderDataService.updateEigenesDesignPdfStatus(false);
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    console.log(`[${"2025-06-10 12:53:55"}] [DesignPrintStepComponent] ngOnDestroy`);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
