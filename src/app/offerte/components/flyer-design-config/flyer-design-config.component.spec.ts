import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlyerDesignConfigComponent } from './flyer-design-config.component';

describe('FlyerDesignConfigComponent', () => {
  let component: FlyerDesignConfigComponent;
  let fixture: ComponentFixture<FlyerDesignConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlyerDesignConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlyerDesignConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
