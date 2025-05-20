export interface ContactData {
  salutation: 'Herr' | 'Frau';
  name: string;
  email: string;
  phone?: string;
  company?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  website?: string;
}
