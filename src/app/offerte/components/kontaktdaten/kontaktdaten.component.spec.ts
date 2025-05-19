import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KontaktdatenComponent } from './kontaktdaten.component';

describe('KontaktdatenComponent', () => {
  let component: KontaktdatenComponent;
  let fixture: ComponentFixture<KontaktdatenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KontaktdatenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(KontaktdatenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
