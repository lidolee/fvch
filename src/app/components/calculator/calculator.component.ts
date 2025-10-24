import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { takeUntil, map, distinctUntilChanged } from 'rxjs/operators';
import { OrderDataService } from '../../services/order-data.service';
import { KostenState, ZielgruppeOption } from '../../services/order-data.types';
import { CommonModule } from '@angular/common';
import { CalculatorService } from '../../services/calculator.service';

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss']
})
export class CalculatorComponent implements OnInit, OnDestroy {
  @Input() activeStep: number = 1;
  @Input() isOfferProcessValid: boolean = false; // HINZUGEFÜGT

  private _currentStepIsValid: boolean = false;
  @Input()
  set currentStepIsValid(value: boolean) {
    this._currentStepIsValid = value;
    this.currentStepValidationStatus = value ? 'valid' : 'invalid';
  }
  get currentStepIsValid(): boolean {
    return this._currentStepIsValid;
  }
  public currentStepValidationStatus: 'valid' | 'invalid' = 'invalid';

  @Input() zielgruppe: ZielgruppeOption | undefined;

  @Output() requestNextStep = new EventEmitter<void>();
  @Output() requestPreviousStep = new EventEmitter<void>();
  @Output() requestSubmit = new EventEmitter<void>();

  // ... Rest der Datei bleibt unverändert ...
  private destroy$ = new Subject<void>();

  public kosten$: Observable<KostenState>;
  public mindestAbnahmePauschalePrice: number = 0;

  public zuschlagFormatAnzeige$: Observable<boolean>;
  public mindestAbnahmePauschaleApplicable$: Observable<boolean>;


  constructor(
    public orderDataService: OrderDataService,
    private cdr: ChangeDetectorRef,
    private calculatorServiceInstance: CalculatorService
  ) {
    this.kosten$ = this.orderDataService.kosten$;

    this.zuschlagFormatAnzeige$ = this.kosten$.pipe(
      map(kosten => !!(kosten.zuschlagFormatAnzeigeText && kosten.zuschlagFormatAnzeigeText.length > 0)),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    );
    this.mindestAbnahmePauschaleApplicable$ = this.kosten$.pipe(
      map(kosten => !!(kosten.mindestbestellwertHinweis && kosten.mindestbestellwertHinweis.length > 0)),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    );
  }

  ngOnInit(): void {
    this.kosten$.pipe(takeUntil(this.destroy$)).subscribe(kosten => {
      // Typsichere Überprüfung, bevor auf grandTotalCalculated und mindestbestellwert zugegriffen wird
      if (kosten && typeof kosten.grandTotalCalculated === 'number') {
        // kosten.mindestbestellwert ist laut Typdefinition immer eine Zahl (number)
        if (kosten.mindestbestellwertHinweis && kosten.mindestbestellwert > 0) { // Dieser Vergleich ist OK
          if (kosten.grandTotalCalculated < kosten.mindestbestellwert) { // Beide sind hier als 'number' bekannt
            const bruttoDifferenz = kosten.mindestbestellwert - kosten.grandTotalCalculated; // Operation zwischen zwei 'number'
            this.mindestAbnahmePauschalePrice = this.calculatorServiceInstance.roundCurrency(bruttoDifferenz);
          } else {
            this.mindestAbnahmePauschalePrice = 0;
          }
        } else {
          this.mindestAbnahmePauschalePrice = 0;
        }
      } else {
        // Fallback, wenn grandTotalCalculated keine Zahl ist (z.B. bei Perimeter-Offerte)
        // oder kosten.mindestbestellwert unerwartet keine Zahl wäre.
        this.mindestAbnahmePauschalePrice = 0;
      }
      this.cdr.markForCheck();
    });
  }

  public onRequestPrevious(): void {
    this.requestPreviousStep.emit();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  public onRequestNext(): void {
    if (this.activeStep === 3) {
      this.requestSubmit.emit();
    } else {
      this.requestNextStep.emit();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  public onRequestSubmit(): void {
    this.requestSubmit.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
