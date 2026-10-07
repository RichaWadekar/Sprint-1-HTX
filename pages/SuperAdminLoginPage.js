// @ts-check
import { BasePage } from './BasePage.js';

export class SuperAdminLoginPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    // Branding panel
    this.brandName = page.getByText('Health Telematix', { exact: true }).first();
    this.portalLabel = page.getByText(/super admin portal/i);
    this.brandingImages = page.getByRole('img');
    this.valueProps = ['HIPAA Compliant & Secure', 'Real-Time RPM Monitoring', 'Multi-Clinic Management'].map((t) => page.getByText(t));

    // Form
    this.welcomeHeading = page.getByRole('heading', { level: 1 });
    this.welcomeSubtext = page.getByText('Sign in to manage platform operations across your care network.');
    this.emailInput = page.getByRole('textbox', { name: 'Email Address' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.showPasswordButton = page.getByRole('button', { name: 'Show password' });
    this.hidePasswordButton = page.getByRole('button', { name: 'Hide password' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
    this.signInButton = page.getByRole('button', { name: 'Sign In to Dashboard' });
    this.emailError = page.locator('[id$="-form-item-message"]').filter({ hasText: /email/i });
    this.formError = page.getByText('Invalid email or password.');

    // Footer
    this.privacyPolicyLink = page.getByRole('button', { name: 'Privacy Policy' });
    this.termsLink = page.getByRole('button', { name: 'Terms of Service' });
    this.footer = page.getByRole('contentinfo');
    this.legalDialog = page.getByRole('dialog', { name: 'Terms & Privacy Policy' });
  }

  async open() {
    await this.goto('/login');
    await this.emailInput.waitFor();
  }

  /**
   * @param {string} email
   * @param {string} password
   */
  async fill(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  /**
   * @param {string} email
   * @param {string} password
   */
  async signIn(email, password) {
    await this.fill(email, password);
    await this.signInButton.click();
  }
}
