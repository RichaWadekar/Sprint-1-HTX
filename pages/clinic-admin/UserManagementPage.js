// @ts-check
import { BasePage } from '../BasePage.js';

/**
 * Clinic Admin portal — User Management (/admin/users) and its "Add New User" modal.
 * Invite: POST /clinics/{clinicId}/users → "Invite Sent Successfully!" → Done switches to the Pending tab.
 */
export class UserManagementPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    // Sign in
    this.emailInput = page.getByRole('textbox', { name: 'Email Address' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.signInButton = page.getByRole('button', { name: 'Sign In to Dashboard' });

    // List
    this.navLink = page.getByRole('link', { name: 'User Management' });
    this.heading = page.getByRole('heading', { name: 'User Management', level: 1 });
    this.addUserButton = page.getByRole('button', { name: 'Add New User' });
    this.headerSubtext = this.heading.locator('xpath=following-sibling::p[1]');
    this.searchInput = page.getByRole('textbox', { name: 'Search by name or email...' });
    this.table = page.getByRole('main').getByRole('table');
    this.columnHeaders = this.table.getByRole('columnheader');
    this.rows = this.table.getByRole('rowgroup').nth(1).getByRole('row');
    this.noResults = page.getByText('No results found');
    // Filters: the trigger is the first matching button; the menu options follow it.
    this.userTypeFilter = page.getByRole('main').getByRole('button', { name: /^(User Type|All Types|Physician|Registered Nurse|Digital Health Navigator)$/ }).first();
    this.addedByFilter = page.getByRole('main').getByRole('button', { name: /^(Added By|All|Super Admin|You)$/ }).first();
    // Pagination
    this.footer = page.getByText(/^Showing\s/);
    this.pager = this.footer.locator('xpath=../div[last()]');
    this.prevPage = this.pager.getByRole('button').first();
    this.nextPage = this.pager.getByRole('button').last();

    // Add New User modal (not an ARIA dialog: a fixed overlay with a form)
    this.modalHeading = page.getByRole('heading', { level: 2 }).filter({ hasText: /Add New (User|Resource)/ });
    this.modal = page.locator('div').filter({ has: this.modalHeading }).filter({ has: page.locator('form') }).last();
    this.subtitle = this.modalHeading.locator('xpath=following-sibling::p[1]');
    this.form = this.modal.locator('form');
    this.closeX = this.modalHeading.locator('xpath=../following-sibling::button[1]');
    this.physician = this.modal.getByRole('button', { name: 'Physician', exact: true });
    this.nurse = this.modal.getByRole('button', { name: 'Registered Nurse', exact: true });
    this.typeOptions = this.form.locator('label', { hasText: 'Type of User' }).locator('xpath=following-sibling::div[1]').getByRole('button');
    this.title = this.modal.getByRole('combobox', { name: /Title/ }).or(this.modal.getByLabel(/^Title/));
    this.firstName = this.modal.getByRole('textbox', { name: /^First Name/ });
    this.lastName = this.modal.getByRole('textbox', { name: /^Last Name/ });
    this.email = this.modal.getByRole('textbox', { name: /^Email Address/ });
    this.phone = this.modal.getByPlaceholder('Enter phone number');
    this.countryButton = this.modal.locator('.selected-flag');
    this.npi = this.modal.getByRole('textbox', { name: /^NPI Number/ });
    this.specialty = this.form.locator('label', { hasText: 'Specialty' }).locator('xpath=following-sibling::*[1]').getByRole('button').first();
    this.cancelButton = this.modal.getByRole('button', { name: 'Cancel' });
    this.sendInviteButton = this.modal.getByRole('button', { name: /Send Invite|Sending/ });
    this.labels = this.form.locator('label');

    // Success confirmation
    this.successHeading = page.getByRole('heading', { name: 'Invite Sent Successfully!' });
    this.success = this.successHeading.locator('xpath=..');
    this.successCheck = this.success.locator('svg').first().locator('xpath=..');
    this.successSteps = this.success.getByRole('listitem');
    this.doneButton = page.getByRole('button', { name: 'Done' });

    this.toast = page.locator('[data-sonner-toast]');
  }

  /** @param {string} email @param {string} password */
  async signIn(email, password) {
    await this.goto('/admin/login');
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
    await this.page.waitForURL(/\/dashboard/);
  }

  /** @param {'Active'|'Pending'|'Deactivated'} name */
  tab(name) {
    return this.page.getByRole('main').getByRole('button', { name, exact: true });
  }

  /** @param {'Active'|'Pending'|'Deactivated'} name */
  async isTabSelected(name) {
    return /\bbg-white\b/.test((await this.tab(name).getAttribute('class')) ?? '');
  }

  /** @param {number} n */
  pageButton(n) {
    return this.pager.getByRole('button', { name: String(n), exact: true });
  }

  /** @param {string} option e.g. 'Physician', 'All Types' */
  async filterUserType(option) {
    await this.userTypeFilter.click();
    await this.page.getByRole('main').getByRole('button', { name: option, exact: true }).last().click();
  }

  /** @param {'All'|'Super Admin'|'You'} option */
  async filterAddedBy(option) {
    await this.addedByFilter.click();
    await this.page.getByRole('main').getByRole('button', { name: option, exact: true }).last().click();
  }

  /** Row by email. @param {string} email */
  row(email) {
    return this.rows.filter({ hasText: email });
  }

  /** @param {import('@playwright/test').Locator} row @param {'name'|'email'|'phone'|'npi'|'type'|'specialty'|'addedBy'|'action'} col */
  cell(row, col) {
    const i = ['name', 'email', 'phone', 'npi', 'type', 'specialty', 'addedBy', 'action'].indexOf(col);
    return row.getByRole('cell').nth(i);
  }

  async open() {
    await this.navLink.click();
    await this.heading.waitFor();
    await this.addUserButton.waitFor();
  }

  async openModal() {
    await this.addUserButton.click();
    await this.modalHeading.waitFor();
  }

  /** @param {string} display */
  async chooseSpecialty(display) {
    await this.specialty.click();
    await this.modal.getByRole('button', { name: display, exact: true }).click();
  }

  /**
   * @param {{ firstName: string, lastName: string, email: string, phone: string, npi?: string, specialty?: string }} u
   */
  async fill(u) {
    await this.firstName.fill(u.firstName);
    await this.lastName.fill(u.lastName);
    await this.email.fill(u.email);
    await this.phone.click();
    await this.phone.pressSequentially(u.phone);
    if (u.npi !== undefined) await this.npi.fill(u.npi);
    if (u.specialty) await this.chooseSpecialty(u.specialty);
  }

  /** @param {string} label e.g. 'First Name' */
  labelFor(label) {
    return this.form.locator('label').filter({ hasText: new RegExp(`^${label}\\s*\\*?$`) });
  }
}
