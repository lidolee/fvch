export interface ConfirmationData {
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  newsletter: boolean;
  preferredContact: 'email' | 'phone';
}
