// @ts-check
// Qase: HTM › Super Admin › Resource Management › Add New Resource (suite 13). Titles carry Qase case IDs via qase(id, title).
// Signs in with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env against the QA portal.
//
// Invite cases send REAL invites (POST /resources) with unique @example.com emails, then verify them in the Pending tab.
// Every resource a test creates is cancelled afterwards (DELETE /resources/{id}/invite), so runs leave no data behind.
// Type of User defaults to Physician by design, so the form can never be submitted with no type selected.
// New resources are located in the Pending list (newest first) by their unique email rather than via the list search,
// because the search does not match full last names longer than ~6 letters.
import { test, expect } from '../../fixtures/pages.js';
import { buildResourceData } from '../../pages/ResourcesPage.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '', SUPER_ADMIN_PASSWORD = '', SUPER_ADMIN_BASE_URL = '' } = process.env;
const API_BASE = SUPER_ADMIN_BASE_URL.replace('://superadmin.', '://api.') + '/api/v1';
const EXISTING_RESOURCE_EMAIL = 'molly@yopmail.com'; // active Registered Nurse in QA
const isCreate = (/** @type {import('@playwright/test').Request} */ r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/api/v1/resources');

/** Tracks the auth header and every resource created during a test, so afterEach can cancel them. */
const session = { authorization: '', created: /** @type {string[]} */ ([]), createRequests: 0 };

test.describe('Super Admin — Add New Resource', () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, 'Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env');

  test.beforeEach(async ({ page, loginPage, resourcesPage }) => {
    session.authorization = '';
    session.created = [];
    session.createRequests = 0;
    page.on('request', (r) => {
      const auth = r.headers()['authorization'];
      if (auth && r.url().startsWith(API_BASE)) session.authorization = auth;
      if (isCreate(r)) session.createRequests++;
    });
    page.on('response', async (r) => {
      if (isCreate(r.request()) && r.status() === 201) {
        const body = await r.json().catch(() => ({}));
        if (body.userId) session.created.push(body.userId);
      }
    });
    await loginPage.open();
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
    await resourcesPage.open();
  });

  test.afterEach(async ({ playwright }) => {
    if (!session.created.length) return;
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: session.authorization } });
    for (const id of session.created) {
      const res = await api.delete(`${API_BASE}/resources/${id}/invite`);
      if (!res.ok()) console.warn(`Cleanup: could not cancel invite ${id} (${res.status()})`);
    }
    await api.dispose();
  });

  test.describe('@smoke', () => {
    test(qase(259, '[SMOKE] | Successfully inviting a Physician with all required fields sends the invite and shows confirmation'), async ({ page, resourcesPage: r }) => {
      await test.step('Tap "+ Add New Resource"', async () => {
        await r.openModal();
        await expect(r.overlay).toHaveClass(/bg-black/);
      });
      await test.step('Select "Physician"', async () => {
        await r.physician.click();
        await expect(r.npi).toBeVisible();
        await expect(r.specialtyTrigger).toBeVisible();
      });
      let d;
      await test.step('Fill all fields', async () => {
        d = await r.fillForm('physician');
        await expect(r.sendInviteButton).toBeEnabled();
      });
      await test.step('Tap "Send Invite"', async () => {
        await page.route('**/api/v1/resources', async (route) => {
          if (route.request().method() === 'POST') await new Promise((res) => setTimeout(res, 1000));
          await route.continue();
        });
        await r.sendInviteButton.click();
        await expect(r.sendInviteButton).toHaveText(/Sending/);
        await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
        await expect(r.confirmation.locator('.font-semibold', { hasText: `${d.firstName} ${d.lastName}` })).toBeVisible();
        await expect(r.confirmation.locator('.font-semibold', { hasText: d.email })).toBeVisible();
      });
    });

    test(qase(260, '[SMOKE] | Successfully inviting a Registered Nurse or Digital Health Navigator sends the invite and shows confirmation'), async ({ resourcesPage: r }) => {
      await r.openModal();
      await test.step('Select "Registered Nurse"', async () => {
        await r.nurse.click();
        await expect(r.npi).toHaveCount(0);
        await expect(r.specialtyTrigger).toHaveCount(0);
      });
      const d = await r.fillForm('nurse');
      await expect(r.sendInviteButton).toBeEnabled();
      await r.sendInviteButton.click();
      await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
      await expect(r.confirmation.locator('.font-semibold', { hasText: `${d.firstName} ${d.lastName}` })).toBeVisible();
      await expect(r.confirmation.locator('.font-semibold', { hasText: d.email })).toBeVisible();
    });

    test(qase(261, '[SMOKE] | Tapping "View Resource" on the confirmation navigates to the Pending tab where the new resource appears'), async ({ resourcesPage: r }) => {
      await r.openModal();
      const d = await r.fillForm('nurse');
      await r.sendInviteButton.click();
      await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
      await r.viewResourceButton.click();
      await expect(r.pendingTab).toHaveClass(/font-semibold/);
      await expect(r.rowFor(d.email)).toBeVisible();
    });
  });

  test(qase(262, '[Functional] | "+ Add New Resource" button is positioned top-right beside the Resource Type filter, consistent with Add New Clinic placement'), async ({ page, resourcesPage: r }) => {
    const add = await r.addNewResourceButton.boundingBox();
    const filter = await r.resourceTypeFilter.boundingBox();
    const main = await page.locator('main').boundingBox();
    expect(add && filter && main).toBeTruthy();
    if (!add || !filter || !main) return;
    expect(Math.abs(add.y - filter.y)).toBeLessThan(10); // same row
    expect(add.x).toBeGreaterThan(filter.x); // to its right
    expect(add.x + add.width).toBeGreaterThan(main.x + main.width * 0.75); // top-right
    await page.goto('/clinics');
    const clinicAdd = await page.getByRole('button', { name: 'Add New Clinic' }).boundingBox();
    if (clinicAdd) expect(Math.abs(clinicAdd.x + clinicAdd.width - (add.x + add.width))).toBeLessThan(20);
  });

  test(qase(263, '[Functional] | Add New Resource popup displays title, subtext, and close (X) icon'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await expect(r.modalTitle).toBeVisible();
    await expect(r.modalSubtext).toBeVisible();
    const close = await r.closeButton.boundingBox();
    const title = await r.modalTitle.boundingBox();
    expect(close && title).toBeTruthy();
    if (close && title) expect(close.x).toBeGreaterThan(title.x + title.width);
  });

  test(qase(264, '[Functional] | Type of User field displays three side-by-side radio buttons: Physician, Registered Nurse, Digital Health Navigator'), async ({ resourcesPage: r }) => {
    await r.openModal();
    const boxes = await Promise.all([r.physician, r.nurse, r.dhn].map((b) => b.boundingBox()));
    expect(boxes.every(Boolean)).toBe(true);
    const [a, b, c] = /** @type {{x:number,y:number}[]} */ (boxes);
    expect(Math.abs(a.y - b.y)).toBeLessThan(5);
    expect(Math.abs(b.y - c.y)).toBeLessThan(5);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
  });

  test(qase(265, '[Functional] | Only one Type of User option can be selected at a time'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await expect(r.physician).toHaveAttribute('aria-pressed', 'true');
    await expect(r.nurse).toHaveAttribute('aria-pressed', 'false');
    await expect(r.dhn).toHaveAttribute('aria-pressed', 'false');
    await r.nurse.click();
    await expect(r.nurse).toHaveAttribute('aria-pressed', 'true');
    await expect(r.physician).toHaveAttribute('aria-pressed', 'false');
    await expect(r.dhn).toHaveAttribute('aria-pressed', 'false');
  });

  test(qase(266, '[Functional] | First Name and Last Name fields are displayed side by side'), async ({ resourcesPage: r }) => {
    await r.openModal();
    const [f, l] = await Promise.all([r.firstName.boundingBox(), r.lastName.boundingBox()]);
    expect(f && l).toBeTruthy();
    if (f && l) {
      expect(Math.abs(f.y - l.y)).toBeLessThan(5);
      expect(f.x).toBeLessThan(l.x);
    }
  });

  test(qase(267, '[Functional] | Email Address and Phone Number fields are displayed side by side, with Phone including a country code selector defaulting to US +1'), async ({ resourcesPage: r }) => {
    await r.openModal();
    const [e, p] = await Promise.all([r.email.boundingBox(), r.phone.boundingBox()]);
    expect(e && p).toBeTruthy();
    if (e && p) {
      expect(Math.abs(e.y - p.y)).toBeLessThan(5);
      expect(e.x).toBeLessThan(p.x);
    }
    await expect(r.phoneCountryButton).toHaveAttribute('title', /United States: \+ ?1$/);
  });

  test(qase(268, '[Functional] | NPI Number and Specialty fields appear below the Email/Phone row when Physician is selected'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await expect(r.npi).toBeVisible();
    await expect(r.specialtyTrigger).toBeVisible();
    const [email, npi, spec] = await Promise.all([r.email.boundingBox(), r.npi.boundingBox(), r.specialtyTrigger.boundingBox()]);
    if (email && npi && spec) {
      expect(npi.y).toBeGreaterThan(email.y + email.height);
      expect(spec.y).toBeGreaterThan(email.y + email.height);
    }
  });

  test(qase(269, '[Functional] | Switching Type of User away from Physician clears and hides the NPI Number and Specialty fields'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await r.npi.fill('1234567893');
    await r.chooseSpecialty('Cardiology');
    await expect(r.specialtyTrigger).toHaveText(/Cardiology/);
    await r.nurse.click();
    await expect(r.npi).toHaveCount(0);
    await expect(r.specialtyTrigger).toHaveCount(0);
    await r.physician.click();
    await expect(r.npi).toHaveValue('');
    await expect(r.specialtyTrigger).toHaveText(/Select a specialty/);
  });

  test(qase(270, '[Functional] | NPI Number and Specialty values are retained when Physician remains selected while other fields are edited'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await r.npi.fill('1234567893');
    await r.chooseSpecialty('Nephrology');
    await r.firstName.fill('Edited');
    await expect(r.npi).toHaveValue('1234567893');
    await expect(r.specialtyTrigger).toHaveText(/Nephrology/);
  });

  test(qase(271, '[Functional] | Form shows only First/Last Name, Email, and Phone fields when Registered Nurse or Digital Health Navigator is selected'), async ({ resourcesPage: r }) => {
    await r.openModal();
    for (const type of [r.nurse, r.dhn]) {
      await type.click();
      for (const f of [r.firstName, r.lastName, r.email, r.phone]) await expect(f).toBeVisible();
      await expect(r.npi).toHaveCount(0);
      await expect(r.specialtyTrigger).toHaveCount(0);
    }
  });

  test(qase(272, '[Functional] | Cancel and Send Invite buttons display at bottom-right, with Send Invite showing a paper-plane icon'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await expect(r.cancelButton).toBeVisible();
    await expect(r.sendInviteButton.locator('svg.lucide-send')).toBeVisible();
    const [cancel, send, phone] = await Promise.all([r.cancelButton.boundingBox(), r.sendInviteButton.boundingBox(), r.phone.boundingBox()]);
    if (cancel && send && phone) {
      expect(send.x).toBeGreaterThan(cancel.x);
      expect(cancel.y).toBeGreaterThan(phone.y);
    }
  });

  test(qase(273, '[Functional] | Send Invite button is disabled/greyed-out by default'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await expect(r.sendInviteButton).toBeDisabled();
  });

  test(qase(274, '[Functional] | Send Invite button label changes to "Sending..." while the invite request is processing'), async ({ page, resourcesPage: r }) => {
    await page.route('**/api/v1/resources', async (route) => {
      if (route.request().method() === 'POST') await new Promise((res) => setTimeout(res, 1500));
      await route.continue();
    });
    await r.openModal();
    await r.fillForm('nurse');
    await r.sendInviteButton.click();
    await expect(r.sendInviteButton).toHaveText('Sending...');
    await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
  });

  test(qase(275, '[Functional] | Invite Sent confirmation popup displays teal checkmark icon, heading, and bold name/email in the confirmation text'), async ({ resourcesPage: r }) => {
    await r.openModal();
    const d = await r.fillForm('dhn');
    await r.sendInviteButton.click();
    await test.step('Teal checkmark icon and heading', async () => {
      await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
      await expect(r.confirmationIcon.locator('polyline')).toHaveAttribute('stroke', /#00C4A4|#00ECC5/i);
    });
    await test.step('Confirmation text with bold name and email', async () => {
      await expect(r.confirmation.getByText(`An invitation has been sent to ${d.firstName} ${d.lastName} at ${d.email}. The resource will appear in the list once they accept.`)).toBeVisible();
      for (const bold of [`${d.firstName} ${d.lastName}`, d.email]) {
        const weight = await r.confirmation.locator('span', { hasText: bold }).evaluate((el) => Number(getComputedStyle(el).fontWeight));
        expect(weight).toBeGreaterThanOrEqual(600);
      }
    });
  });

  test(qase(276, '[Functional] | "View Resource" button is displayed on the Invite Sent confirmation popup'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await r.fillForm('nurse');
    await r.sendInviteButton.click();
    await expect(r.viewResourceButton).toBeVisible({ timeout: 15_000 });
  });

  for (const [id, label, close] of /** @type {const} */ ([
    [277, 'Tapping Cancel closes the modal without creating a resource', 'cancel'],
    [278, 'Tapping the X icon closes the modal without creating a resource', 'x'],
  ])) {
    test(qase(id, `[Functional] | ${label}`), async ({ page, resourcesPage: r }) => {
      const countText = page.getByText(/Showing .* resources/);
      const before = await countText.innerText();
      await r.openModal();
      await r.fillForm('nurse');
      await (close === 'cancel' ? r.cancelButton : r.closeButton).click();
      await expect(r.modal).toBeHidden();
      expect(session.createRequests).toBe(0);
      await expect(countText).toHaveText(before);
    });
  }

  test(qase(279, '[Functional] | Newly invited resource is created unassigned to any clinic'), async ({ page, resourcesPage: r }) => {
    await r.openModal();
    const d = await r.fillForm('nurse');
    const [req] = await Promise.all([page.waitForRequest(isCreate), r.sendInviteButton.click()]);
    const payload = req.postDataJSON();
    expect(Object.keys(payload).filter((k) => /clinic/i.test(k))).toEqual([]); // no clinic linkage at creation
    await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
    await r.viewResourceButton.click();
    await expect(r.rowFor(d.email)).toBeVisible();
    await expect(r.rowFor(d.email)).not.toContainText(/clinic/i);
  });

  test(qase(280, '[Negative] | Form cannot be submitted without first selecting a Type of User'), async ({ resourcesPage: r }) => {
    // Type of User defaults to Physician and cannot be deselected, so it can never be empty.
    await r.openModal();
    await expect(r.physician).toHaveAttribute('aria-pressed', 'true');
    await r.physician.click();
    await expect(r.physician).toHaveAttribute('aria-pressed', 'true');
    await r.firstName.fill('Qa');
    await r.lastName.fill('Auto');
    await r.email.fill(buildResourceData().email);
    await r.phone.pressSequentially('2025550143');
    await expect(r.sendInviteButton).toBeDisabled(); // Physician still needs NPI + Specialty
  });

  test(qase(281, '[Negative] | Send Invite stays disabled until all required fields for the selected user type are filled'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await test.step('Registered Nurse with only First and Last Name', async () => {
      await r.nurse.click();
      await r.firstName.fill('Qa');
      await r.lastName.fill('Auto');
      await expect(r.sendInviteButton).toBeDisabled();
    });
    await test.step('Fill Email and Phone', async () => {
      await r.email.fill(buildResourceData().email);
      await r.phone.pressSequentially('2025550143');
      await expect(r.sendInviteButton).toBeEnabled();
    });
    await test.step('Switch to Physician without NPI / Specialty', async () => {
      await r.physician.click();
      await expect(r.sendInviteButton).toBeDisabled();
    });
    await test.step('Fill NPI and Specialty', async () => {
      await r.npi.fill('1234567893');
      await r.chooseSpecialty('Cardiology');
      await expect(r.sendInviteButton).toBeEnabled();
    });
  });

  test(qase(282, '[Negative] | Submitting an email that already exists for another resource shows an inline error and blocks submission'), async ({ page, resourcesPage: r }) => {
    await r.openModal();
    await r.fillForm('nurse', { email: EXISTING_RESOURCE_EMAIL });
    const [res] = await Promise.all([page.waitForResponse((x) => isCreate(x.request())), r.sendInviteButton.click()]);
    expect(res.status()).toBe(409);
    await expect(r.confirmationHeading).toHaveCount(0);
    await expect(r.modal).toBeVisible();
    const emailBox = await r.email.boundingBox();
    const inline = r.modal.locator('p').filter({ hasText: /already exists|already in use/i });
    await expect(inline, 'duplicate-email error should be shown inline under the Email field').toBeVisible();
    const errBox = await inline.boundingBox();
    if (emailBox && errBox) expect(errBox.y).toBeGreaterThanOrEqual(emailBox.y + emailBox.height);
  });

  test(qase(283, '[Negative] | NPI Number field rejects input that is not exactly 10 numeric digits'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await r.fillForm('physician');
    const npiError = r.modal.getByText('Enter a valid 10-digit NPI number.');
    await test.step('Fewer than 10 digits', async () => {
      await r.npi.fill('12345');
      await r.firstName.click();
      await expect(npiError).toBeVisible();
      await expect(r.sendInviteButton).toBeDisabled();
    });
    await test.step('More than 10 digits — extra digits rejected', async () => {
      await r.npi.fill('');
      await r.npi.pressSequentially('123456789012');
      await expect(r.npi).toHaveValue('1234567890');
    });
    await test.step('Non-numeric characters — rejected', async () => {
      await r.npi.fill('');
      await r.npi.pressSequentially('12345ABCDE');
      await expect(r.npi).toHaveValue('12345');
      await r.firstName.click();
      await expect(npiError).toBeVisible();
      await expect(r.sendInviteButton).toBeDisabled();
    });
  });

  test(qase(284, '[Negative] | Specialty field only accepts a value selected from the dropdown; free-text entry is not possible'), async ({ page, resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await r.specialtyTrigger.click();
    await expect(r.specialtyOption('Cardiology')).toBeVisible();
    await expect(r.modal.locator('input[name*="special" i], [role="combobox"]')).toHaveCount(0); // no text input
    await page.keyboard.type('Neurosurgery');
    await expect(r.specialtyTrigger).toHaveText(/Select a specialty/);
  });

  test(qase(285, '[Negative] | Send Invite API/network failure keeps the user on the form with no resource created'), async ({ page, resourcesPage: r }) => {
    await r.openModal();
    const d = await r.fillForm('nurse');
    await test.step('Simulate an API failure and tap "Send Invite"', async () => {
      await page.route('**/api/v1/resources', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500,"message":"Something went wrong. Please try again later."}' })
          : route.continue()
      );
      await r.sendInviteButton.click();
      await expect(r.toast.first()).toBeVisible();
      await expect(r.confirmationHeading).toHaveCount(0);
      await expect(r.modal).toBeVisible();
      await expect(r.firstName).toHaveValue(d.firstName);
      await expect(r.email).toHaveValue(d.email);
      expect(session.created).toEqual([]);
    });
    await test.step('Restore connectivity and resubmit', async () => {
      await page.unroute('**/api/v1/resources');
      await r.sendInviteButton.click();
      await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
    });
  });

  test(qase(286, '[Negative] | Switching Type of User from Physician to Nurse/DHN does not submit stale NPI/Specialty data'), async ({ page, resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await r.npi.fill('1234567893');
    await r.chooseSpecialty('Cardiology');
    await r.nurse.click();
    await expect(r.npi).toHaveCount(0);
    const d = await r.fillForm('nurse');
    const [req] = await Promise.all([page.waitForRequest(isCreate), r.sendInviteButton.click()]);
    const payload = req.postDataJSON();
    expect(payload.role).toBe('NURSE');
    expect(Object.keys(payload).filter((k) => /npi|special/i.test(k))).toEqual([]);
    await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
    await r.viewResourceButton.click();
    await expect(r.rowFor(d.email)).toContainText('Registered Nurse');
  });

  test(qase(287, '[Edge] | NPI Number field accepts a value of exactly 10 numeric digits'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await r.npi.fill('1234567890');
    await r.firstName.click();
    await expect(r.npi).toHaveValue('1234567890');
    await expect(r.modal.getByText('Enter a valid 10-digit NPI number.')).toHaveCount(0);
  });

  test(qase(288, '[Edge] | Rapid double-tap on "Send Invite" does not send duplicate invites'), async ({ page, resourcesPage: r }) => {
    await page.route('**/api/v1/resources', async (route) => {
      if (route.request().method() === 'POST') await new Promise((res) => setTimeout(res, 1000));
      await route.continue();
    });
    await r.openModal();
    await r.fillForm('nurse');
    await r.sendInviteButton.dblclick();
    await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    expect(session.createRequests).toBe(1);
    await expect(r.confirmationHeading).toHaveCount(1);
  });

  test(qase(289, '[Edge] | Rapidly switching Type of User between all three options does not cause field-state or layout glitches'), async ({ resourcesPage: r }) => {
    await r.openModal();
    for (const t of [r.physician, r.nurse, r.dhn, r.physician]) await t.click({ delay: 0 });
    await expect(r.physician).toHaveAttribute('aria-pressed', 'true');
    await expect(r.npi).toHaveCount(1);
    await expect(r.specialtyTrigger).toHaveCount(1);
    await expect(r.firstName).toHaveCount(1);
    await expect(r.sendInviteButton).toBeInViewport();
  });

  test(qase(290, '[Edge] | Selecting a non-default country code on the Phone Number field is accepted and saved correctly'), async ({ page, resourcesPage: r }) => {
    await r.openModal();
    await test.step('Change the country code from +1 to +91', async () => {
      await r.phoneCountryButton.click();
      await page.getByRole('option').filter({ hasText: 'India' }).click();
      await expect(r.phoneCountryButton).toHaveAttribute('title', /India: \+ ?91$/);
    });
    await test.step('Complete and submit the form', async () => {
      const d = await r.fillForm('nurse', { phone: '9876543210' });
      const [req] = await Promise.all([page.waitForRequest(isCreate), r.sendInviteButton.click()]);
      expect(req.postDataJSON().phoneNumber).toBe('+919876543210');
      await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
      await r.viewResourceButton.click();
      await expect(r.rowFor(d.email)).toContainText('+91');
    });
  });

  test(qase(291, '[Security] | Add New Resource action is not accessible to unauthenticated or unauthorized users'), async ({ browser, playwright }) => {
    const ctx = await browser.newContext({ baseURL: SUPER_ADMIN_BASE_URL });
    const anon = await ctx.newPage();
    await anon.goto('/resources');
    await expect(anon).toHaveURL(/\/login/);
    await ctx.close();
    const api = await playwright.request.newContext();
    const d = buildResourceData();
    const res = await api.post(`${API_BASE}/resources`, { data: { role: 'NURSE', firstName: d.firstName, lastName: d.lastName, email: d.email, phoneNumber: '+12025550143' } });
    expect(res.status()).toBe(401);
    await api.dispose();
  });

  test(qase(292, '[Security] | Email uniqueness is enforced server-side even if client-side validation is bypassed'), async ({ playwright }) => {
    expect(session.authorization, 'auth header captured from the signed-in session').not.toBe('');
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: session.authorization } });
    const res = await api.post(`${API_BASE}/resources`, {
      data: { role: 'NURSE', firstName: 'Qa', lastName: 'Auto', email: EXISTING_RESOURCE_EMAIL, phoneNumber: '+12025550143' },
    });
    expect(res.status()).toBe(409);
    await api.dispose();
  });

  test(qase(293, '[UI] | Selected vs. unselected Type of User radio buttons are visually distinguishable'), async ({ resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    const style = (/** @type {import('@playwright/test').Locator} */ l) => l.evaluate((el) => `${getComputedStyle(el).borderColor}|${getComputedStyle(el).backgroundColor}`);
    const selected = await style(r.physician);
    expect(selected).not.toBe(await style(r.nurse));
    expect(await style(r.nurse)).toBe(await style(r.dhn));
  });

  test(qase(294, "[UI] | Send Invite button's disabled and enabled states are visually distinct"), async ({ resourcesPage: r }) => {
    await r.openModal();
    const bg = () => r.sendInviteButton.evaluate((el) => `${getComputedStyle(el).backgroundColor}|${getComputedStyle(el).opacity}|${getComputedStyle(el).color}`);
    await expect(r.sendInviteButton).toBeDisabled();
    const disabled = await bg();
    await r.fillForm('nurse');
    await expect(r.sendInviteButton).toBeEnabled();
    await expect.poll(bg).not.toBe(disabled);
  });

  test(qase(295, '[UI] | Background screen is dimmed and non-interactive while the Add New Resource form or Invite Sent confirmation is open'), async ({ page, resourcesPage: r }) => {
    const filterBox = await r.resourceTypeFilter.boundingBox();
    expect(filterBox).toBeTruthy();
    const clickFilter = () => filterBox && page.mouse.click(filterBox.x + filterBox.width / 2, filterBox.y + filterBox.height / 2);
    await test.step('With the form open, click the Resource Type filter', async () => {
      await r.openModal();
      await expect(r.overlay).toHaveClass(/bg-black/);
      await clickFilter();
      await expect(r.modal).toBeVisible();
      await expect(page.getByRole('menu').or(page.getByRole('listbox'))).toHaveCount(0);
    });
    await test.step('With the confirmation open, click the Resource Type filter', async () => {
      await r.fillForm('nurse');
      await r.sendInviteButton.click();
      await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
      await expect(r.confirmation).toHaveClass(/bg-black/);
      await clickFilter();
      await expect(r.confirmationHeading).toBeVisible();
      await expect(page.getByRole('menu').or(page.getByRole('listbox'))).toHaveCount(0);
    });
  });

  test(qase(296, '[E2E] | Full lifecycle: invite a Physician with NPI/Specialty, confirm, and verify unassigned in Pending tab'), async ({ page, resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await expect(r.npi).toBeVisible();
    const d = await r.fillForm('physician', { specialty: 'Endocrinology' });
    await expect(r.sendInviteButton).toBeEnabled();
    const [req] = await Promise.all([page.waitForRequest(isCreate), r.sendInviteButton.click()]);
    const payload = req.postDataJSON();
    expect(JSON.stringify(payload)).toContain(d.npi);
    expect(Object.keys(payload).filter((k) => /clinic/i.test(k))).toEqual([]);
    await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
    await expect(r.confirmation.locator('.font-semibold', { hasText: d.email })).toBeVisible();
    await r.viewResourceButton.click();
    await expect(r.pendingTab).toHaveClass(/font-semibold/);
    await expect(r.rowFor(d.email)).toContainText('Physician');
  });

  test(qase(297, '[E2E] | Full lifecycle: switch Type of User mid-fill, verify field clearing/retention, then complete a valid Nurse invite'), async ({ page, resourcesPage: r }) => {
    await r.openModal();
    await r.physician.click();
    await r.npi.fill('1234567893');
    await r.chooseSpecialty('Psychiatry');
    await r.nurse.click();
    await expect(r.npi).toHaveCount(0);
    await expect(r.specialtyTrigger).toHaveCount(0);
    const d = await r.fillForm('nurse');
    await expect(r.sendInviteButton).toBeEnabled();
    const [req] = await Promise.all([page.waitForRequest(isCreate), r.sendInviteButton.click()]);
    expect(Object.keys(req.postDataJSON()).filter((k) => /npi|special/i.test(k))).toEqual([]);
    await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
    await r.viewResourceButton.click();
    await expect(r.rowFor(d.email)).toContainText('Registered Nurse');
  });
});
