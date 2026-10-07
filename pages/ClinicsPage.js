// @ts-check
import { BasePage } from './BasePage.js';

/** Clinic Management list (/clinics): tabs, search, table, footer and the Deactivate Clinic modal. */
export class ClinicsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.activeTab = page.getByRole('button', { name: 'Active', exact: true });
    this.pendingTab = page.getByRole('button', { name: 'Pending', exact: true });
    this.deactivatedTab = page.getByRole('button', { name: 'Deactivated', exact: true });
    this.search = page.getByRole('textbox', { name: /Search clinic/ });
    this.addNewClinicButton = page.getByRole('button', { name: 'Add New Clinic' });
    this.table = page.locator('main table');
    this.headers = page.locator('main thead th');
    this.rows = page.locator('main tbody tr');
    // e.g. "Showing 1–9 of 9 clinics" (Active) or "Showing 1–10 of 61 pending clinics" (Pending)
    this.footer = page.getByText(/^Showing \d+–\d+ of \d+ (\w+ )?clinics$/);
    this.prevPage = page.getByRole('button', { name: 'Previous page' });
    this.nextPage = page.getByRole('button', { name: 'Next page' });
    this.deactivateDialog = page.getByRole('dialog', { name: 'Deactivate Clinic' });
    this.toast = page.locator('[data-sonner-toast]');
  }

  async open() {
    await this.goto('/clinics');
    await this.rows.first().waitFor();
  }

  /** Row for a clinic, matched by its (unique) email. @param {string} email */
  rowFor(email) {
    return this.rows.filter({ hasText: email });
  }

  /** @param {'ACTIVE' | 'PENDING' | 'DEACTIVATED'} status */
  tab(status) {
    return { ACTIVE: this.activeTab, PENDING: this.pendingTab, DEACTIVATED: this.deactivatedTab }[status];
  }
}
