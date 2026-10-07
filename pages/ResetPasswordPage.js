// @ts-check
import { BasePage } from './BasePage.js';

export class ResetPasswordPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Reset Password', level: 1 });
    this.icon = page.locator('svg.lucide-key-round');
    this.subtext = page.getByText('Create a strong new password for your account.');
    this.newPasswordInput = page.locator('input[name="newPassword"]');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    const eyes = page.getByRole('button', { name: /(Show|Hide) password/ });
    this.newPasswordEye = eyes.nth(0);
    this.confirmPasswordEye = eyes.nth(1);
    this.submitButton = page.locator('button[type="submit"]');
    this.fieldErrors = page.locator('[id$="-form-item-message"]');
    this.strength = page.getByText('Password strength:').locator('..');
    this.toast = page.locator('[data-sonner-toast]');

    // Rule checklist — each item's check icon is grey (neutral-300) until met, then green (success-500)
    const rule = (/** @type {string} */ text) => page.locator(':has(> svg.lucide-check)').filter({ hasText: text });
    this.rules = {
      length: rule('At least 8 characters'),
      lowercase: rule('One lowercase letter'),
      uppercase: rule('One uppercase letter'),
      number: rule('One number'),
      special: rule('One special character'),
    };

    // Success pop-up (rendered without role="dialog", so located by its heading)
    this.successDialog = page.getByRole('heading', { name: /password reset successful/i });
    this.goToLoginButton = page.getByRole('button', { name: /go to log-?in/i });

    // Invalid / expired link state
    this.linkErrorHeading = page.getByRole('heading', { name: /Reset link is/, level: 1 });
    this.requestNewLinkLink = page.getByRole('link', { name: 'Request a new link' });
  }

  /**
   * @param {string} token
   */
  async open(token) {
    await this.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  }

  /**
   * @param {import('@playwright/test').Locator} rule
   */
  ruleIcon(rule) {
    return rule.locator('> svg.lucide-check');
  }

  /**
   * @param {string} password
   * @param {string} [confirm]
   */
  async fill(password, confirm = password) {
    await this.newPasswordInput.fill(password);
    await this.confirmPasswordInput.fill(confirm);
  }
}
