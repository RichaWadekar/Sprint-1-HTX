// @ts-check
import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { uniqueNpi } from './AddClinicPage.js';

/**
 * How the app masks a (partial) US number as it is typed: "2025550199" → "(202) 555-0199", "20255" → "(202) 55".
 * @param {string} digits
 */
export function formatUsPhone(digits) {
  if (!digits) return '';
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 10);
  if (digits.length <= 3) return `(${a}`;
  if (digits.length <= 6) return `(${a}) ${b}`;
  return `(${a}) ${b}-${c}`;
}

const SPECIALTY_PATTERN = /^(Select a specialty|Cardiology|Endocrinology|Nephrology|Psychiatry|Rheumatology|Addiction Medicine|Family Medicine|Internal Medicine|Pain Medicine)$/;

/**
 * Resource Management list (/resources) and the Add New Resource modal.
 * The modal is a plain overlay (no dialog role); Type of User options are toggle buttons (aria-pressed),
 * and Specialty options render as buttons under the "Select a specialty" trigger.
 */
export class ResourcesPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.activeTab = page.getByRole('button', { name: 'Active', exact: true });
    this.pendingTab = page.getByRole('button', { name: 'Pending', exact: true });
    // The filter button's label becomes the selected type ("Physician", …) once a filter is applied.
    this.resourceTypeFilter = page.locator('main').getByRole('button', { name: /^(Resource Type|All|Physician|Registered Nurse|Digital Health Navigator)$/ });
    this.addNewResourceButton = page.getByRole('button', { name: 'Add New Resource' });
    this.search = page.getByRole('textbox', { name: 'Search resource by name' });
    this.rows = page.locator('main').getByRole('row');

    // Add New Resource modal
    this.modal = page.locator('.fixed.inset-0').filter({ hasText: 'Type of User' });
    this.overlay = this.modal;
    this.modalTitle = this.modal.getByRole('heading', { name: 'Add New Resource' });
    this.modalSubtext = this.modal.getByText('Fill in the details below to invite a new resource to the portal.');
    this.closeButton = this.modal.locator('button').first();
    this.physician = this.modal.getByRole('button', { name: 'Physician', exact: true });
    this.nurse = this.modal.getByRole('button', { name: 'Registered Nurse', exact: true });
    this.dhn = this.modal.getByRole('button', { name: 'Digital Health Navigator', exact: true });
    this.firstName = this.modal.getByPlaceholder('Enter first name');
    this.lastName = this.modal.getByPlaceholder('Enter last name');
    this.email = this.modal.getByPlaceholder('Enter email address');
    this.phone = this.modal.getByPlaceholder('Enter phone number');
    // Flag-only button; the selected country/code lives in its title, e.g. "United States: + 1"
    this.phoneCountryButton = this.modal.locator('[role="button"][aria-haspopup="listbox"][title]');
    this.npi = this.modal.getByPlaceholder('10-digit NPI');
    this.specialtyTrigger = this.modal.locator('button').filter({ has: page.locator('svg.lucide-chevron-down, svg path[d="m6 9 6 6 6-6"]') }).filter({ hasText: /specialty|Cardiology|Endocrinology|Nephrology|Psychiatry|Rheumatology|Medicine/ }).first();
    this.cancelButton = this.modal.getByRole('button', { name: 'Cancel', exact: true });
    this.sendInviteButton = this.modal.getByRole('button', { name: /Send Invite|Sending/ });

    // Invite Sent confirmation
    this.confirmation = page.locator('.fixed.inset-0').filter({ hasText: 'Invite Sent!' });
    this.confirmationHeading = this.confirmation.getByRole('heading', { name: 'Invite Sent!' });
    this.confirmationIcon = this.confirmation.locator('svg').first();
    this.viewResourceButton = this.confirmation.getByRole('button', { name: 'View Resource' });

    this.toast = page.locator('[data-sonner-toast]');

    // Active tab list
    this.deactivatedTab = page.getByRole('button', { name: 'Deactivated', exact: true });
    this.tableHeaders = page.locator('main thead th');
    this.bodyRows = page.locator('main tbody tr');
    this.footer = page.getByText(/^Showing \d+–\d+ of \d+ resources$/);
    this.prevPage = page.getByRole('button', { name: 'Previous page' });
    this.nextPage = page.getByRole('button', { name: 'Next page' });

    // Edit Resource modal
    this.editModal = page.locator('.fixed.inset-0').filter({ hasText: 'Edit Resource' });
    this.editTitle = this.editModal.getByRole('heading', { name: 'Edit Resource' });
    this.editSubtitle = this.editModal.getByText('Update the details for this resource.');
    this.editClose = this.editModal.locator('button').first();
    this.editFirstName = this.editModal.locator('input[name="firstName"]');
    this.editLastName = this.editModal.locator('input[name="lastName"]');
    this.editEmail = this.editModal.getByRole('textbox', { name: 'Email Address' });
    this.editPhone = this.editModal.locator('input[name="phone"]');
    this.editNpi = this.editModal.getByRole('textbox', { name: 'NPI Number' });
    // Trigger shows the selected specialty; it precedes the option buttons in the DOM, so .first() is the trigger.
    this.editSpecialty = this.editModal.locator('button').filter({ hasText: SPECIALTY_PATTERN }).first();
    this.editCancel = this.editModal.getByRole('button', { name: 'Cancel' });
    this.editSave = this.editModal.getByRole('button', { name: /Save Changes|Saving/ });
  }

  /** @param {import('@playwright/test').Locator} row */
  async openEdit(row) {
    await row.getByRole('button', { name: 'Edit' }).click();
    await this.editTitle.waitFor();
  }

  /**
   * Replaces the phone number in the Edit modal (the field is masked, so select-all + type).
   * @param {string} digits  e.g. "3453455457"
   */
  async setEditPhone(digits) {
    // The masked input re-renders on focus, so select-all is unreliable; delete from the end instead.
    await this.editPhone.click();
    await this.editPhone.press('End');
    for (let i = 0; i < 20 && (await this.editPhone.inputValue()) !== ''; i++) await this.editPhone.press('Backspace');
    await expect(this.editPhone, 'phone field must be empty before typing').toHaveValue('');
    if (digits) await this.editPhone.pressSequentially(digits);
    // Safety: never let a mistyped number reach Save on a real record.
    await expect(this.editPhone).toHaveValue(formatUsPhone(digits));
  }

  async open() {
    await this.goto('/resources');
    await this.addNewResourceButton.waitFor();
  }

  async openModal() {
    await this.addNewResourceButton.click();
    await this.modalTitle.waitFor();
  }

  /** @param {string} name */
  specialtyOption(name) {
    return this.modal.getByRole('button', { name, exact: true });
  }

  /** @param {string} name */
  async chooseSpecialty(name) {
    await this.specialtyTrigger.click();
    await this.specialtyOption(name).click();
  }

  /**
   * Fills the modal for the given type with valid, unique data.
   * @param {'physician' | 'nurse' | 'dhn'} type
   * @param {Partial<ResourceData>} [overrides]
   */
  async fillForm(type, overrides = {}) {
    const d = { ...buildResourceData(), ...overrides };
    await this[type].click();
    await this.firstName.fill(d.firstName);
    await this.lastName.fill(d.lastName);
    await this.email.fill(d.email);
    await this.phone.pressSequentially(d.phone);
    if (type === 'physician') {
      await this.npi.fill(d.npi);
      await this.chooseSpecialty(d.specialty);
    }
    return d;
  }

  /** Row in the list for a resource, matched by its unique email. @param {string} email */
  rowFor(email) {
    return this.rows.filter({ hasText: email });
  }
}

/**
 * @typedef {ReturnType<typeof buildResourceData>} ResourceData
 */

/** Unique resource data. The last name carries a letters-only run tag so the list search can find it. */
export function buildResourceData() {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const tag = run.slice(-7).replace(/\d/g, (d) => 'abcdefghij'[Number(d)]);
  return {
    firstName: 'Qa',
    lastName: `Auto${tag}`,
    email: `qa.resource.${run}@example.com`,
    phone: '2025550143',
    npi: uniqueNpi(),
    specialty: 'Cardiology',
  };
}
