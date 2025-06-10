import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { takeUntil, distinctUntilChanged, map, withLatestFrom } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import {
  DesignPackageType, PrintOptionType, FlyerFormatType, AnlieferungType,
  DruckGrammaturType, DruckArtType, DruckAusfuehrungType,
  ProduktionDataState, VerteilgebietDataState // Added VerteilgebietDataState for withLatestFrom
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
  @ViewChild('pdfFileUpload') pdfFileUploadInputRef!: ElementRef<HTMLInputElement>; // Added for PDF Upload

  private destroy$ = new Subject<void>();
  public produktionState$: Observable<ProduktionDataState>;
  public currentStatus$: Observable<'valid' | 'invalid' | 'pending'>;

  public druckAuflage: number | null = 0;
  public druckReserve: number | null = 0;
  public pdfFileName: string | null = null; // Added for PDF upload UI

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
      withLatestFrom(this.produktionState$), // Ensure VerteilgebietDataState is imported for vg type
      takeUntil(this.destroy$)
    ).subscribe(([vg, produktion]: [VerteilgebietDataState, ProduktionDataState]) => {
      console.log('[DesignPrintStepComponent] verteilgebiet$ emitted, totalFlyersCount:', vg.totalFlyersCount);
      if (produktion.printOption === 'service' && produktion.printServiceDetails.auflage === 0 && vg.totalFlyersCount > 0) {
        console.log(`[DesignPrintStepComponent] Auto-setting druckAuflage to ${vg.totalFlyersCount}.`);
        this.orderDataService.updatePrintServiceDetails({ auflage: vg.totalFlyersCount });
      }
    });
  }

  onDesignPackageSelect(pkg: DesignPackageType | null): void {
    this.orderDataService.updateDesignPackage(pkg);
    if (pkg !== 'eigenes') { // Reset PDF if design package changes from 'eigenes'
      this.pdfFileName = null;
      if (this.pdfFileUploadInputRef?.nativeElement) {
        this.pdfFileUploadInputRef.nativeElement.value = '';
      }
    }
    this.cdr.markForCheck();
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

  public async triggerPdfUpload(): Promise<void> {
    const produktionState = await firstValueFrom(this.produktionState$);

    if (!produktionState) {
      console.error('[DesignPrintStepComponent] Production state not available for PDF upload check.');
      this.pdfFileName = null;
      if (this.pdfFileUploadInputRef?.nativeElement) this.pdfFileUploadInputRef.nativeElement.value = '';
      this.cdr.markForCheck();
      return;
    }

    // Condition: Show upload only if designPackage is "eigenes"
    if (produktionState.designPackage !== 'eigenes') {
      console.log('[DesignPrintStepComponent] PDF upload is only allowed for design package "eigenes".');
      // UI should ideally prevent this, but as a safeguard:
      alert('PDF-Upload ist nur beim Design-Paket "eigenes" erlaubt.');
      this.pdfFileName = null;
      if (this.pdfFileUploadInputRef?.nativeElement) this.pdfFileUploadInputRef.nativeElement.value = '';
      this.cdr.markForCheck();
      return;
    }

    if (!this.pdfFileUploadInputRef?.nativeElement) {
      console.error('[DesignPrintStepComponent] PDF file input (pdfFileUpload) not found in DOM via ViewChild.');
      this.pdfFileName = null;
      this.cdr.markForCheck();
      return;
    }

    const inputElement = this.pdfFileUploadInputRef.nativeElement;
    const files = inputElement.files;

    if (files && files.length > 0) {
      const file = files[0];
      const maxFileSize = 30 * 1024 * 1024; // 30MB
      const allowedFileType = '.pdf';
      const allowedMimeType = 'application/pdf';

      // Validate file type
      if (!(file.name.toLowerCase().endsWith(allowedFileType) || file.type === allowedMimeType)) {
        console.warn(`[DesignPrintStepComponent] Invalid PDF file type: ${file.name} (type: ${file.type}). Expected ${allowedFileType} or ${allowedMimeType}.`);
        alert(`Ungültiger Dateityp. Nur ${allowedFileType}-Dateien sind erlaubt.`);
        this.pdfFileName = null;
        inputElement.value = ''; // Reset file input
        this.cdr.markForCheck();
        return;
      }

      // Validate file size
      if (file.size > maxFileSize) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxFileSizeMB = (maxFileSize / (1024 * 1024)).toFixed(2);
        console.warn(`[DesignPrintStepComponent] PDF file too large: ${fileSizeMB}MB. Max size is ${maxFileSizeMB}MB.`);
        alert(`Datei ist zu groß (${fileSizeMB}MB). Maximale Dateigröße beträgt ${maxFileSizeMB}MB.`);
        this.pdfFileName = null;
        inputElement.value = ''; // Reset file input
        this.cdr.markForCheck();
        return;
      }

      this.pdfFileName = file.name;
      console.log(`[DesignPrintStepComponent] PDF file "${file.name}" selected.`);
      // Implement actual PDF file processing/upload to service if needed here
    } else {
      this.pdfFileName = null;
    }
    inputElement.value = ''; // Reset file input
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    console.log('[DesignPrintStepComponent] ngOnDestroy');
    this.destroy$.next();
    this.destroy$.complete();
  }
}
