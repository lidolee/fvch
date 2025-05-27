import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OverviewStepComponent } from './overview-step.component';

describe('OverviewStepComponent', () => {
  let component: OverviewStepComponent;
  let fixture: ComponentFixture<OverviewStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverviewStepComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OverviewStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
