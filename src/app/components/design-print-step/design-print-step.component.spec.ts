import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DesignPrintStepComponent } from './design-print-step.component';

describe('DesignPrintStepComponent', () => {
  let component: DesignPrintStepComponent;
  let fixture: ComponentFixture<DesignPrintStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DesignPrintStepComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DesignPrintStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
