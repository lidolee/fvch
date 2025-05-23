import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlyerDruckConfigComponent } from './flyer-druck-config.component';

describe('FlyerDruckConfigComponent', () => {
  let component: FlyerDruckConfigComponent;
  let fixture: ComponentFixture<FlyerDruckConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlyerDruckConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlyerDruckConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
