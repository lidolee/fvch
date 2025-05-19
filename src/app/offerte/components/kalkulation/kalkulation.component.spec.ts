import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KalkulationComponent } from './kalkulation.component';

describe('KalkulationComponent', () => {
  let component: KalkulationComponent;
  let fixture: ComponentFixture<KalkulationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KalkulationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(KalkulationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
