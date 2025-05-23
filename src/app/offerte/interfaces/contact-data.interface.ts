export interface ContactData {
  gender: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName?: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  houseNumber: string | null;
  zip: string | null;
  city: string | null;
  notes?: string | null;
}
