// @ts-check
import { BasePage } from './BasePage.js';

/**
 * Clinic Management › Add New Clinic wizard (/clinics/add).
 * Step 1 is client-side apart from POST /clinics/check-duplicates (clinic name, NPI, TIN, admin email),
 * so filling Step 1 and pressing Next never creates a clinic.
 */
export class AddClinicPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.addNewClinicButton = page.getByRole('button', { name: 'Add New Clinic' });
    this.clinicSearch = page.getByRole('textbox', { name: 'Search clinic by name' });
    this.backToClinicListButton = page.getByRole('button', { name: 'Back to Clinic List' });

    // Tracker
    this.tracker = page.getByRole('complementary');
    this.stepHeading = page.locator('main h3');

    // Step 1 fields (located by placeholder — the inputs have no accessible labels)
    const field = (/** @type {string} */ ph) => page.getByPlaceholder(ph, { exact: true });
    this.clinicName = field('Enter clinic name');
    this.clinicEmail = field('Enter clinic email address');
    this.phone = field('Enter phone number');
    // Flag-only button; the selected country/code lives in its title, e.g. "United States: + 1"
    this.phoneCountryButton = page.locator('[role="button"][aria-haspopup="listbox"][title]');
    this.npi = field('10-digit NPI');
    this.tin = field('XX-XXXXXXX');
    this.street = field('Enter street address');
    this.country = page.getByRole('combobox', { name: 'Select country' });
    this.state = page.getByRole('combobox', { name: 'Select state' });
    this.city = page.getByRole('combobox', { name: 'Select city' });
    this.zip = field('12345 or 12345-6789');
    this.adminFirstName = field('Enter first name');
    this.adminLastName = field('Enter last name');
    this.adminEmail = field('Enter clinic admin email address');
    this.adminEmailHelper = page.getByText('Invite will be sent here');

    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.nextButton = page.getByRole('button', { name: 'Next' });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });

    // Discard-changes popup
    this.discardDialog = page.getByRole('dialog', { name: 'Discard changes?' });
    this.discardMessage = this.discardDialog.getByText('This action clears the form and cannot be undone.');
    this.discardButton = this.discardDialog.getByRole('button', { name: 'Discard changes' });
    this.continueButton = this.discardDialog.getByRole('button', { name: 'Continue' });

    this.toast = page.locator('[data-sonner-toast]');
  }

  async open() {
    await this.goto('/clinics/add');
    await this.clinicName.waitFor();
  }

  /**
   * Clicks Next on Step 1 and waits for the duplicate check to answer.
   * @returns {Promise<Record<string, boolean>>} the `duplicates` map, e.g. { adminEmail: true, npi: false, … }
   */
  async submitStep1() {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/clinics/check-duplicates'), { timeout: 30_000 }),
      this.nextButton.click(),
    ]);
    const body = await response.json().catch(() => ({}));
    return body.duplicates ?? {};
  }

  /**
   * @param {import('@playwright/test').Locator} combo
   * @param {string} name  option label, e.g. "Texas" (options render as "TX Texas")
   */
  async choose(combo, name) {
    await combo.click();
    await combo.fill(name);
    await this.page.getByRole('option').filter({ hasText: new RegExp(`${name}$`) }).first().click();
  }

  /**
   * Fills every Step 1 field with valid data.
   * @param {Partial<Record<keyof ClinicData, string>>} [overrides]
   * @param {(keyof ClinicData)[]} [skip]  fields to leave empty
   */
  async fillStep1(overrides = {}, skip = []) {
    const d = { ...buildClinicData(), ...overrides };
    /** @type {[keyof ClinicData, () => Promise<void>][]} */
    const steps = [
      ['clinicName', () => this.clinicName.fill(d.clinicName)],
      ['clinicEmail', () => this.clinicEmail.fill(d.clinicEmail)],
      ['phone', () => this.phone.pressSequentially(d.phone)],
      ['npi', () => this.npi.fill(d.npi)],
      ['tin', () => this.tin.pressSequentially(d.tin)],
      ['street', () => this.street.fill(d.street)],
      ['state', () => this.choose(this.state, d.state)],
      ['city', () => this.choose(this.city, d.city)],
      ['zip', () => this.zip.fill(d.zip)],
      ['adminFirstName', () => this.adminFirstName.fill(d.adminFirstName)],
      ['adminLastName', () => this.adminLastName.fill(d.adminLastName)],
      ['adminEmail', () => this.adminEmail.fill(d.adminEmail)],
    ];
    for (const [key, fill] of steps) {
      if (skip.includes(key)) continue;
      if (key === 'city' && skip.includes('state')) continue; // City needs a State
      await fill();
    }
    return d;
  }
}

/**
 * @typedef {ReturnType<typeof buildClinicData>} ClinicData
 */

/** Unique, valid Step 1 data. Clinic names reject digits, and NPI/TIN/admin email must be unused in QA. */
export function buildClinicData() {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const letters = run.slice(-7).replace(/\d/g, (d) => 'abcdefghij'[Number(d)]);
  return {
    clinicName: `QA Auto Clinic ${letters}`,
    clinicEmail: `qa.clinic.${run}@example.com`,
    phone: '2025550143',
    npi: uniqueNpi(),
    tin: String(Math.floor(100000000 + Math.random() * 899999999)),
    street: '12 Oak Street',
    state: 'Texas',
    city: 'Austin',
    zip: '78701',
    adminFirstName: 'Maria',
    adminLastName: 'Lopez',
    adminEmail: `qa.clinic.admin.${run}@example.com`,
  };
}

/** Random 10-digit NPI with a valid Luhn check digit (computed with the 80840 prefix, per CMS). */
export function uniqueNpi() {
  const body = `1${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  let sum = 0;
  `80840${body}`
    .split('')
    .map(Number)
    .reverse()
    .forEach((d, i) => {
      let v = d;
      if (i % 2 === 0) {
        v *= 2;
        if (v > 9) v -= 9;
      }
      sum += v;
    });
  return body + ((10 - (sum % 10)) % 10);
}
