import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BestTigungComponent } from './confirmation.component';

describe('ZusammenfassungComponent', () => {
  let component: BestTigungComponent;
  let fixture: ComponentFixture<BestTigungComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BestTigungComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BestTigungComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
