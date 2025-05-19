import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DienstleistungenComponent } from './dienstleistungen.component';

describe('DienstleistungenComponent', () => {
  let component: DienstleistungenComponent;
  let fixture: ComponentFixture<DienstleistungenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DienstleistungenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DienstleistungenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
