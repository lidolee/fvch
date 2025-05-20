import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContactdataComponent } from './contactdata.component';

describe('KontaktdatenComponent', () => {
  let component: ContactdataComponent;
  let fixture: ComponentFixture<ContactdataComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactdataComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContactdataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
