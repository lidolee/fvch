import { Component, OnInit, Output, EventEmitter, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { FlyerDruckConfig } from '../../interfaces/flyer-druck-config.interface';

interface SelectOption {
  value: string | null;
  label: string;
}

@Component({
  selector: 'app-flyer-druck-config',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './flyer-druck-config.component.html',
  styleUrls: ['./flyer-druck-config.component.scss']
})
export class FlyerDruckConfigComponent implements OnInit, OnChanges {
  @Input() initialConfig: FlyerDruckConfig | undefined;
  @Output() druckKonfigurationChanged = new EventEmitter<FlyerDruckConfig>();

  public druckForm: FormGroup;

  public formate: SelectOption[] = [
    { value: 'A6', label: 'A6' }, { value: 'A5', label: 'A5' }, { value: 'A4', label: 'A4' },
    { value: 'A3 auf A4 gefaltet', label: 'A3 auf A4 gefaltet' }, { value: 'A4 auf A5 gefaltet', label: 'A4 auf A5 gefaltet' },
    { value: 'Falzflyer (mehrseitig)', label: 'Falzflyer (mehrseitig)' }, { value: 'Prospekt/Booklet', label: 'Prospekt/Booklet' },
    { value: 'Warenmuster', label: 'Warenmuster' }, { value: 'Anderes Format', label: 'anderes Format' },
    { value: 'unbekannt', label: 'unbekannt' }
  ];
  public grammaturen: SelectOption[] = [
    { value: '90g/m2', label: '90g/m2' }, { value: '100g/m2', label: '100g/m2' }, { value: '135g/m2', label: '135g/m2' },
    { value: '170g/m2', label: '170g/m2' }, { value: '250g/m2', label: '250g/m2' }, { value: '300g/m2', label: '300g/m2' },
    { value: '350g/m2', label: '350g/m2' }, { value: 'Anderes Gewicht', label: 'anderes Gewicht' },
    { value: 'unbekannt', label: 'unbekannt' }
  ];
  public druckarten: SelectOption[] = [
    { value: 'Beidseitig verschieden bedruckt', label: 'Beidseitig verschieden bedruckt' },
    { value: 'Beidseitig gleich bedruckt', label: 'Beidseitig gleich bedruckt' },
    { value: 'Einseitig bedruckt', label: 'Einseitig bedruckt' }
  ];

  constructor(private fb: FormBuilder) {
    this.druckForm = this.fb.group({
      format: [null, Validators.required],
      grammatur: [null, Validators.required],
      druckart: [null, Validators.required],
      auflage: [null, [Validators.required, Validators.min(1), Validators.pattern('^[0-9]*$')]]
    });
  }

  ngOnInit(): void {
    this.applyInitialConfig();
    this.druckForm.valueChanges.subscribe(() => {
      this.emitDruckKonfiguration();
    });
    if (this.initialConfig || !this.druckForm.valid) {
      this.emitDruckKonfiguration();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialConfig']) {
      this.applyInitialConfig();
      this.emitDruckKonfiguration();
    }
  }

  private applyInitialConfig(): void {
    this.druckForm.enable();
    if (this.initialConfig) {
      this.druckForm.patchValue({
        format: this.initialConfig.format,
        grammatur: this.initialConfig.grammatur,
        druckart: this.initialConfig.druckart,
        auflage: this.initialConfig.auflage
      }, { emitEvent: false });
    } else {
      this.druckForm.reset({ format: null, grammatur: null, druckart: null, auflage: null }, { emitEvent: false });
    }
  }

  private emitDruckKonfiguration(): void {
    const config: FlyerDruckConfig = {
      druckAktiv: true,
      isValid: this.druckForm.valid,
      format: this.druckForm.value.format,
      grammatur: this.druckForm.value.grammatur,
      druckart: this.druckForm.value.druckart,
      auflage: this.druckForm.value.auflage,
    };
    this.druckKonfigurationChanged.emit(config);
  }

  // HILFSMETHODEN für das Template
  public isControlInvalid(controlName: string): boolean {
    const control = this.druckForm.get(controlName);
    return !!control && control.invalid;
  }

  public isControlTouched(controlName: string): boolean {
    const control = this.druckForm.get(controlName);
    return !!control && control.touched;
  }

  public isControlDirty(controlName: string): boolean {
    const control = this.druckForm.get(controlName);
    return !!control && control.dirty;
  }

  public getControlErrors(controlName: string): ValidationErrors | null {
    const control = this.druckForm.get(controlName);
    return control ? control.errors : null;
  }

  // Der Getter 'f' ist jetzt nicht mehr zwingend notwendig für die Validierungslogik im Template,
  // aber ich lasse ihn drin, falls er an anderer Stelle verwendet wird oder du ihn bevorzugst für den Zugriff auf .value etc.
  public get f(): { [key: string]: AbstractControl } {
    return this.druckForm.controls;
  }
}
