import { Component, OnInit, ViewChild, ChangeDetectorRef, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbNav, NgbNavChangeEvent, NgbNavModule } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router, NavigationExtras } from '@angular/router';
import { DistributionStepComponent } from '../distribution-step/distribution-step.component';
import { DesignPrintStepComponent } from '../design-print-step/design-print-step.component';
import { SummaryStepComponent } from '../summary-step/summary-step.component';
import { CalculatorComponent } from '../calculator/calculator.component';
import { OrderDataService } from '../../services/order-data.service';
import { ZielgruppeOption } from '../../services/order-data.types';
import { Subject, Subscription } from 'rxjs';
import { takeUntil, distinctUntilChanged, map as rxjsMap } from 'rxjs/operators';

export type ValidationStatus = 'valid' | 'invalid' | 'pending' | 'unchecked';

@Component({
  selector: 'app-offer-process',
  standalone: true,
  imports: [ CommonModule, NgbNavModule, DistributionStepComponent, DesignPrintStepComponent, SummaryStepComponent, CalculatorComponent ],
  templateUrl: './offer-process.component.html',
  styleUrls: ['./offer-process.component.scss']
})
export class OfferProcessComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('nav') public nav!: NgbNav;
  @ViewChild(DistributionStepComponent) private distributionStepComponent!: DistributionStepComponent;
  @ViewChild(DesignPrintStepComponent) private designPrintStepComponent!: DesignPrintStepComponent;
  @ViewChild(SummaryStepComponent) private summaryStepComponent!: SummaryStepComponent;

  public activeStepId: number = 1;
  public stepValidationStatus: { [key: number]: ValidationStatus } = {
    1: 'unchecked', 2: 'unchecked', 3: 'unchecked'
  };
  public initialStadtnameForDistribution: string | undefined;
  public zielgruppe: ZielgruppeOption = 'Alle Haushalte';

  private componentDestroyed$ = new Subject<void>();
  private currentStadtname: string | null = null;
  private paramMapSubscription: Subscription | undefined;
  private queryParamMapSubscription: Subscription | undefined;
  private isNavigatingInternally = false;

  constructor(
    private orderDataService: OrderDataService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.paramMapSubscription = this.route.paramMap.pipe(
      takeUntil(this.componentDestroyed$),
      rxjsMap(params => params.get('stadtname')),
      distinctUntilChanged()
    ).subscribe(stadtname => {
      this.currentStadtname = stadtname;
      if (stadtname) this.initialStadtnameForDistribution = stadtname;
    });

    this.queryParamMapSubscription = this.route.queryParamMap.pipe(
      takeUntil(this.componentDestroyed$),
    ).subscribe(params => {
      const stadtQueryParam = params.get('stadt');
      if (stadtQueryParam && !this.initialStadtnameForDistribution) {
        this.initialStadtnameForDistribution = stadtQueryParam;
      }
    });

    const initialFragment = this.route.snapshot.fragment;
    if (initialFragment) {
      const stepNum = parseInt(initialFragment.replace('step', ''), 10);
      if (stepNum >= 1 && stepNum <= 3) {
        if (this.activeStepId !== stepNum) {
          this.activeStepId = stepNum;
        }
      }
    }
    this.zielgruppe = this.orderDataService.getCurrentVerteilart();
  }

  ngAfterViewInit(): void {
    Promise.resolve().then(() => {
      this.ngZone.run(() => {
        if (this.componentDestroyed$.isStopped) return;
        if (this.nav && this.nav.activeId !== this.activeStepId) {
          this.isNavigatingInternally = true;
          this.nav.select(this.activeStepId);
        } else {
          this.triggerActiveStepValidation();
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.componentDestroyed$.next(); this.componentDestroyed$.complete();
    if (this.paramMapSubscription) this.paramMapSubscription.unsubscribe();
    if (this.queryParamMapSubscription) this.queryParamMapSubscription.unsubscribe();
  }

  private triggerActiveStepValidation(): void {
    if (this.componentDestroyed$.isStopped) return;
    if (this.activeStepId === 1 && this.distributionStepComponent) this.distributionStepComponent.triggerValidationDisplay();
    else if (this.activeStepId === 2 && this.designPrintStepComponent) this.designPrintStepComponent.triggerValidationDisplay();
    else if (this.activeStepId === 3 && this.summaryStepComponent) this.summaryStepComponent.triggerValidationDisplay();
  }

  public onNavChange(event: NgbNavChangeEvent): void {
    if (this.componentDestroyed$.isStopped) { event.preventDefault(); return; }
    const targetStepId = event.nextId;

    if (this.isNavigatingInternally) {
      this.isNavigatingInternally = false;
      if (this.activeStepId !== targetStepId) this.activeStepId = targetStepId;
      this.updateUrlFragment();
      Promise.resolve().then(() => this.ngZone.run(() => { if (!this.componentDestroyed$.isStopped) this.triggerActiveStepValidation(); }));
      return;
    }

    if (this.activeStepId === targetStepId) {
      if (this.route.snapshot.fragment !== `step${this.activeStepId}`) this.updateUrlFragment();
      return;
    }

    if (targetStepId < event.activeId) {
      this.activeStepId = targetStepId;
      this.updateUrlFragment();
      Promise.resolve().then(() => this.ngZone.run(() => { if (!this.componentDestroyed$.isStopped) this.triggerActiveStepValidation(); }));
    } else {
      let canProceed = true;
      for (let i = 1; i < targetStepId; i++) {
        if (this.stepValidationStatus[i] !== 'valid') { canProceed = false; break; }
      }
      if (canProceed) {
        this.activeStepId = targetStepId;
        this.updateUrlFragment();
        Promise.resolve().then(() => this.ngZone.run(() => { if (!this.componentDestroyed$.isStopped) this.triggerActiveStepValidation(); }));
      } else {
        event.preventDefault();
      }
    }
  }

  public updateValidationStatus(step: number, status: ValidationStatus): void {
    if (this.stepValidationStatus[step] !== status) {
      this.stepValidationStatus[step] = status;
      Promise.resolve().then(() => {
        this.ngZone.run(() => {
          if (!this.componentDestroyed$.isStopped) {
            this.cdr.detectChanges();
          }
        });
      });
    }
  }

  public getValidationIconClass(step: number): string {
    return this.stepValidationStatus[step] === 'valid' ? 'mdi-check-circle text-success' :
      this.stepValidationStatus[step] === 'invalid' ? 'mdi-alert-circle text-danger' :
        this.stepValidationStatus[step] === 'pending' ? 'mdi-timer-sand text-warning' :
          'mdi-checkbox-blank-circle-outline text-muted';
  }

  public onZielgruppeChange(neueZielgruppe: ZielgruppeOption): void {
    this.zielgruppe = neueZielgruppe;
    this.orderDataService.updateVerteilart(neueZielgruppe);
    if (this.distributionStepComponent) this.distributionStepComponent.currentZielgruppe = neueZielgruppe;
  }

  public navigateToStep(stepId: number): void {
    if (this.componentDestroyed$.isStopped) return;
    if (this.nav && stepId >= 1 && stepId <= 3) {
      let canProceed = true;
      if (stepId > this.activeStepId) {
        for (let i = this.activeStepId; i < stepId; i++) {
          if (this.stepValidationStatus[i] !== 'valid') { canProceed = false; break; }
        }
      }
      if (canProceed) {
        if (this.activeStepId !== stepId && this.nav.activeId !== stepId) {
          this.isNavigatingInternally = true; this.nav.select(stepId);
        } else if (this.activeStepId !== stepId) {
          this.activeStepId = stepId; this.updateUrlFragment();
          Promise.resolve().then(() => this.ngZone.run(() => { if (!this.componentDestroyed$.isStopped) this.triggerActiveStepValidation(); }));
        } else {
          Promise.resolve().then(() => this.ngZone.run(() => { if (!this.componentDestroyed$.isStopped) this.triggerActiveStepValidation(); }));
        }
      } else {
        Promise.resolve().then(() => this.ngZone.run(() => { if (!this.componentDestroyed$.isStopped) this.triggerActiveStepValidation(); }));
      }
    }
  }

  private updateUrlFragment(): void {
    if (this.componentDestroyed$.isStopped) return;
    const commands: any[] = this.currentStadtname ? [this.currentStadtname] : [];
    const navigationExtras: NavigationExtras = { fragment: `step${this.activeStepId}`, replaceUrl: true, queryParamsHandling: 'preserve' };
    if (this.route.snapshot.fragment !== navigationExtras.fragment) {
      this.router.navigate(commands, navigationExtras);
    }
  }

  public onCalculatorPrevious(): void { if (this.activeStepId > 1) this.navigateToStep(this.activeStepId - 1); }
  public onCalculatorNext(): void {
    if (this.stepValidationStatus[this.activeStepId] === 'valid') {
      if (this.activeStepId < 3) this.navigateToStep(this.activeStepId + 1);
      else if (this.activeStepId === 3) this.onCalculatorSubmit();
    } else this.triggerActiveStepValidation();
  }
  public onCalculatorSubmit(): void {
    let allStepsValid = true;
    for (let i = 1; i <= 3; i++) {
      if (this.stepValidationStatus[i] !== 'valid') { allStepsValid = false; this.navigateToStep(i); return; }
    }
    if (allStepsValid && this.summaryStepComponent) {
      this.summaryStepComponent.triggerContactFormSubmit();
      if(this.stepValidationStatus[3] === 'valid') this.orderDataService.getAllOrderData();
    }
  }
}
