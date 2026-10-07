// @ts-check
import { BasePage } from './BasePage.js';

export class HomePage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.getStartedLink = page.getByRole('link', { name: 'Get started' });
  }

  async open() {
    await this.goto('https://playwright.dev/');
  }

  async clickGetStarted() {
    await this.getStartedLink.click();
  }
}
