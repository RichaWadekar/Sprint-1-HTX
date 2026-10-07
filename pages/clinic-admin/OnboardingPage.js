// @ts-check
import { BasePage } from '../BasePage.js';

/**
 * Clinic Admin onboarding (invited by Super Admin) on the Clinic Admin portal:
 *   1. /admin/invite/super-admin?token=…  invitation landing (details + Terms + "Verify Email Address")
 *   2. /admin/verify-email?token=…        "Check your email" — 6-digit code, resend countdown
 *   3. /admin/set-password?token=…        "Set your password"
 * APIs: GET /clinics/invitations/{token}, POST /otp/send, POST /otp/verify, POST /clinics/invitations/{token}/accept
 */
export class OnboardingPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    // Landing
    this.heading = page.getByRole('heading', { level: 2 }).first();
    this.brandPanel = page.getByText('Clinic Admin Portal');
    this.clinicCard = page.locator('div').filter({ hasText: 'CLINIC DETAILS' }).filter({ hasText: 'TIN Number' }).last();
    this.accountCard = page.locator('div').filter({ hasText: 'YOUR ACCOUNT INFORMATION' }).filter({ hasText: 'Assigned Role' }).last();
    this.termsCheckbox = page.getByRole('checkbox', { name: 'I agree to the Terms & Privacy Policy' });
    this.termsLink = page.getByRole('button', { name: 'Terms & Privacy Policy' });
    this.verifyEmailButton = page.getByRole('button', { name: /Verify Email Address|Sending|Please wait/ });

    // Check your email (OTP)
    this.otpHeading = page.getByRole('heading', { name: 'Check your email' });
    this.otpInput = page.locator('input[autocomplete="one-time-code"]');
    this.resendText = page.getByText(/Resend code in/);
    this.resendButton = page.getByRole('button', { name: /Resend/ });
    this.validateButton = page.getByRole('button', { name: /Validate & Set Password|Validating|Please wait/ });

    // Set your password
    this.setPasswordHeading = page.getByRole('heading', { name: 'Set your password' });
    this.newPassword = page.getByRole('textbox', { name: 'New Password', exact: true });
    this.confirmPassword = page.getByRole('textbox', { name: 'Re-Enter New Password' });
    const eyes = page.getByRole('button', { name: /(Show|Hide) password/ });
    this.newEye = eyes.nth(0);
    this.confirmEye = eyes.nth(1);
    this.setPasswordButton = page.getByRole('button', { name: /^Set Password$|Setting|Please wait/ });

    this.toast = page.locator('[data-sonner-toast]');
  }

  /** @param {string} token */
  async openInvite(token) {
    await this.goto(`/admin/invite/super-admin?token=${encodeURIComponent(token)}`);
  }

  /** Physician / Nurse / DHN invitation landing (the link in the invite email). @param {string} token */
  async openResourceInvite(token) {
    await this.goto(`/resource/invite?token=${encodeURIComponent(token)}`);
  }

  /** Landing → agree → Verify Email Address → OTP screen. */
  async goToOtp() {
    await this.termsCheckbox.check();
    await this.verifyEmailButton.click();
    await this.otpHeading.waitFor();
  }

  /** @param {string} code */
  async enterOtp(code) {
    await this.otpInput.click();
    await this.otpInput.pressSequentially(code);
  }
}
