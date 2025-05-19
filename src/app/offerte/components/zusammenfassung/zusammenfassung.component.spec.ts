import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZusammenfassungComponent } from './zusammenfassung.component';

describe('ZusammenfassungComponent', () => {
  let component: ZusammenfassungComponent;
  let fixture: ComponentFixture<ZusammenfassungComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZusammenfassungComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ZusammenfassungComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
