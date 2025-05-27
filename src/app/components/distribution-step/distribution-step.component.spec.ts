import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DistributionStepComponent } from './distribution-step.component';

describe('DistributionStepComponent', () => {
  let component: DistributionStepComponent;
  let fixture: ComponentFixture<DistributionStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DistributionStepComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DistributionStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
