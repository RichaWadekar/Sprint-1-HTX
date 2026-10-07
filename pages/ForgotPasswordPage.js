// @ts-check
import { BasePage } from './BasePage.js';

export class ForgotPasswordPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Forgot Password?' });
    this.icon = page.locator('svg.lucide-mail');
    this.subtext = page.getByText("Enter your registered email address and we'll send you a link to reset your password.");
    this.emailLabel = page.locator('label').filter({ hasText: 'Email Address' });
    this.requiredAsterisk = this.emailLabel.locator('span', { hasText: '*' });
    this.emailInput = page.getByRole('textbox', { name: /Email Address/ });
    this.emailError = page.locator('[id$="-form-item-message"]');
    this.sendResetLinkButton = page.getByRole('button', { name: /Send Reset Password Link|Sending/ });
    this.backToLoginLink = page.getByRole('link', { name: 'Back to Login' });
    this.toaster = page.locator('[data-sonner-toaster]');
    this.toast = page.locator('[data-sonner-toast]');
  }

  async open() {
    await this.goto('/forgot-password');
    await this.emailInput.waitFor();
  }

  /**
   * @param {string} email
   */
  async requestResetLink(email) {
    await this.emailInput.fill(email);
    await this.sendResetLinkButton.click();
  }
}
