// @ts-check
import { BasePage } from './BasePage.js';

export class InstallationPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Installation' });
  }

  async isLoaded() {
    return this.heading.isVisible();
  }
}
