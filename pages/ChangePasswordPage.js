// @ts-check
import { BasePage } from './BasePage.js';

/** Settings › Change Password (/settings/password). Save calls POST /auth/change-password { oldPassword, newPassword }. */
export class ChangePasswordPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.heading = page.getByRole('banner').getByRole('heading', { name: 'Change Password', level: 1 });
    this.subtext = page.getByRole('banner').getByText('Update your account password to keep your account secure.');
    this.subNav = page.locator('main').getByRole('navigation');
    this.changePasswordLink = this.subNav.getByRole('link', { name: 'Change Password' });
    this.notificationSettingsLink = this.subNav.getByRole('link', { name: 'Notification Settings' });

    this.oldPassword = page.locator('input[name="oldPassword"]');
    this.newPassword = page.locator('input[name="newPassword"]');
    this.confirmPassword = page.locator('input[name="confirmPassword"]');
    const eyes = page.locator('main').getByRole('button', { name: /(Show|Hide) password/ });
    this.oldEye = eyes.nth(0);
    this.newEye = eyes.nth(1);
    this.confirmEye = eyes.nth(2);

    this.cancelButton = page.locator('main').getByRole('button', { name: 'Cancel' });
    this.saveButton = page.locator('main button[type="submit"]');
    this.fieldErrors = page.locator('main [id$="-form-item-message"]');
    this.toast = page.locator('[data-sonner-toast]');
    this.toaster = page.locator('[data-sonner-toaster]');
  }

  async open() {
    await this.goto('/settings/password');
    await this.oldPassword.waitFor();
  }

  /**
   * @param {string} oldPassword
   * @param {string} newPassword
   * @param {string} [confirm]
   */
  async fill(oldPassword, newPassword, confirm = newPassword) {
    await this.oldPassword.fill(oldPassword);
    await this.newPassword.fill(newPassword);
    await this.confirmPassword.fill(confirm);
  }

  /**
   * Clicks Save Password. The field in focus is blurred first: the app ignores a Save click made
   * while the Confirm field still has focus (the first click is lost), so this mirrors a user who
   * tabs out before saving.
   */
  async save() {
    await this.blurActiveField();
    await this.saveButton.click();
  }

  /** Clicks Cancel — same first-click issue as Save, so the focused field is blurred first. */
  async cancel() {
    await this.blurActiveField();
    await this.cancelButton.click();
  }

  async blurActiveField() {
    await this.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
  }
}
