// @ts-check
// Qase: HTM › Clinic Admin › User Management › Deactivated Tab (suite 30, own cases only — not the Action Buttons child
// suite 55). Titles carry Qase IDs. Runs on the Clinic Admin portal (CLINIC_ADMIN_BASE_URL).
//
// The Clinic Admin session, the user list and the Deactivate / Reactivate / Delete calls are SIMULATED
// (fixtures/clinicUsersSim.js): no Clinic Admin QA account is configured and no real user is changed.
// Real-server checks: HTM-2213 and HTM-2218 (list, reactivate and delete APIs refuse requests without a session).
// Aligned to the app where Qase differs (user confirmed): subtext "Manage Physicians, Nurses, and DHNs."; Super-Admin-added
// deactivated rows have no action buttons; avatars show initials; the DHN pill is teal.
import { test, expect } from '../../fixtures/pages.js';
import { simulateClinicUsers, simUser, SIM_ADMIN, SIM_CLINIC_ID } from '../../fixtures/clinicUsersSim.js';
import { qase } from 'playwright-qase-reporter';

const { CLINIC_ADMIN_BASE_URL = 'https://clinic.qa.healthtelematix.com' } = process.env;
const API_BASE = 'https://api.qa.healthtelematix.com/api/v1';

const deactivated = (/** @type {Parameters<typeof simUser>[0] & { deactivatedOn: string }} */ { deactivatedOn, ...u }) => ({ ...simUser({ status: 'DEACTIVATED', ...u }), deactivatedOn });
const D_PHYS = deactivated({ id: 'd1', firstName: 'Grace', lastName: 'Hopper', email: 'grace.hopper@example.com', phoneNumber: '+12025550121', type: 'PHYSICIAN', npi: '1003000126', specialties: ['Cardiology'], addedByMe: true, deactivatedOn: '2026-09-14T15:00:00Z' });
const D_NURSE = deactivated({ id: 'd2', firstName: 'Ada', lastName: 'Byron', email: 'ada.byron@example.com', phoneNumber: '+12025550122', type: 'NURSE', addedByMe: true, deactivatedOn: '2026-09-20T15:00:00Z' });
const D_DHN_SA = deactivated({ id: 'd3', firstName: 'Alan', lastName: 'Turing', email: 'alan.turing@example.com', phoneNumber: '+12025550123', type: 'DHN', addedByMe: false, deactivatedOn: '2026-08-02T15:00:00Z' });
const D_PHYS_SA = deactivated({ id: 'd4', firstName: 'Mary', lastName: 'Jackson', email: 'mary.jackson@example.com', phoneNumber: '+12025550124', type: 'PHYSICIAN', npi: '1245319599', specialties: ['Neurology'], addedByMe: false, deactivatedOn: '2026-07-11T15:00:00Z' });
const DEACTIVATED = [D_PHYS, D_NURSE, D_DHN_SA, D_PHYS_SA];
const ACTIVE = [
  simUser({ id: 'a1', firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@clinic.com', phoneNumber: '+12025550101', type: 'PHYSICIAN', npi: '1234567893', specialties: ['Cardiology'], addedByMe: true }),
  simUser({ id: 'a2', firstName: 'Liam', lastName: 'Brooks', email: 'liam.brooks@example.com', phoneNumber: '+12025550105', type: 'NURSE', addedByMe: true }),
  simUser({ id: 'a3', firstName: 'Anna', lastName: 'Chen', email: 'anna.chen@example.com', phoneNumber: '+12025550102', type: 'NURSE' }),
];
const PENDING = [{ canResend: true, ...simUser({ id: 'p1', firstName: 'Pending', lastName: 'Person', email: 'pending.person@example.com', phoneNumber: '+12025550201', type: 'NURSE', addedByMe: true, status: 'PENDING' }) }];

/** n deactivated users this Clinic Admin added. @param {number} n */
const manyDeactivated = (n) =>
  Array.from({ length: n }, (_, i) =>
    deactivated({ id: `m${i}`, firstName: `Former${String(i + 1).padStart(2, '0')}`, lastName: 'Test', email: `former${String(i + 1).padStart(2, '0')}@example.com`, phoneNumber: `+1202555${3000 + i}`, type: 'NURSE', addedByMe: true, deactivatedOn: '2026-09-01T15:00:00Z' }),
  );
/** MM/DD/YYYY as the Deactivated On column shows it (local time). @param {string | Date} d */
const usDate = (d) => new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

test.use({ baseURL: CLINIC_ADMIN_BASE_URL });
test.describe.configure({ timeout: 60_000 });

test.describe('Clinic Admin — User Management › Deactivated tab', () => {
  /** Signed-in Clinic Admin on User Management (Active tab). Data is copied so tests never touch the shared arrays. */
  const signIn = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ u, opts = {}) => {
    const o = /** @type {any} */ ({ active: ACTIVE, pending: PENDING, deactivated: DEACTIVATED, ...opts });
    const sim = await simulateClinicUsers(page, { ...o, active: [...o.active], pending: [...o.pending], deactivated: [...o.deactivated] });
    await u.signIn(SIM_ADMIN.email, SIM_ADMIN.password);
    await u.open();
    return sim;
  };
  /** …with the Deactivated tab open. */
  const openDeactivated = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ u, opts = {}) => {
    const sim = await signIn(page, u, opts);
    await u.tab('Deactivated').click();
    await expect.poll(() => u.isTabSelected('Deactivated')).toBe(true);
    const first = /** @type {any[]} */ (sim.deactivated)[0];
    if (first) await expect(u.row(first.email)).toBeVisible();
    return sim;
  };
  const emails = async (/** @type {any} */ u) => (await u.rows.allInnerTexts()).map((t) => t.match(/\S+@\S+\.\w+/)?.[0]).filter(Boolean);
  /** Deactivated tab has an extra "Deactivated On" column before Action. */
  const cellD = (/** @type {any} */ u, /** @type {string} */ email, /** @type {'name'|'npi'|'type'|'specialty'|'addedBy'|'deactivatedOn'|'action'} */ col) =>
    u.row(email).getByRole('cell').nth({ name: 0, npi: 3, type: 4, specialty: 5, addedBy: 6, deactivatedOn: 7, action: 8 }[col]);
  const btn = (/** @type {any} */ u, /** @type {string} */ email, /** @type {'Reactivate'|'Delete'|'Deactivate'|'Edit'} */ name) =>
    u.row(email).getByRole('button', { name, exact: true });
  const dialog = (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ title) => page.getByRole('dialog').filter({ hasText: title });
  /** Click the row action, then confirm in its dialog. */
  const act = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ u, /** @type {string} */ email, /** @type {'Reactivate'|'Delete'|'Deactivate'} */ action) => {
    await btn(u, email, action).click();
    await dialog(page, `${action} User`).getByRole('button', { name: `${action} User` }).click();
  };
  /** A tab's live count: its footer total ("Showing … of N users") or its empty state. */
  const expectCount = async (/** @type {any} */ u, /** @type {'Active'|'Pending'|'Deactivated'} */ tab, /** @type {number} */ n) => {
    await u.tab(tab).click();
    await expect.poll(() => u.isTabSelected(tab)).toBe(true);
    if (n === 0) await expect(u.page.getByText(`No ${tab} Users`), `${tab} count`).toBeVisible();
    else await expect(u.footer, `${tab} count`).toHaveText(new RegExp(`of ${n} users?$`));
  };
  /** Canvas-normalised rgb of a CSS colour. */
  const rgb = (/** @type {import('@playwright/test').Locator} */ el, /** @type {'color'|'backgroundColor'} */ prop = 'color') =>
    el.evaluate((node, p) => {
      const c = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
      c.fillStyle = getComputedStyle(node)[p];
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data];
    }, prop);

  // ---------- Smoke ----------

  test(qase(2194, '[SMOKE] | Deactivated tab opens with the correct header and full column set'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    expect(await u.columnHeaders.allInnerTexts()).toEqual(['NAME', 'EMAIL ADDRESS', 'PHONE NUMBER', 'NPI NUMBER', 'USER TYPE', 'SPECIALTY', 'ADDED BY', 'DEACTIVATED ON', 'ACTION']);
    expect((await emails(u)).sort()).toEqual(DEACTIVATED.map((x) => x.email).sort());
    await expect(u.heading).toHaveText('User Management');
    await expect(u.headerSubtext).toHaveText('Manage Physicians, Nurses, and DHNs.');
  });

  test(qase(2195, '[SMOKE] | Reactivating a user the Clinic Admin added moves them back to Active with live counts'), async ({ page, userManagementPage: u }) => {
    const sim = await openDeactivated(page, u);
    await btn(u, D_PHYS.email, 'Reactivate').click();
    const d = dialog(page, 'Reactivate User');
    await expect(d).toContainText(`Are you sure you want to reactivate ${D_PHYS.fullName}?`);
    await d.getByRole('button', { name: 'Reactivate User' }).click();
    await expect(u.toast.filter({ hasText: `${D_PHYS.fullName} has been reactivated.` })).toBeVisible();
    await expect(u.row(D_PHYS.email)).toHaveCount(0);
    await expect(u.footer).toHaveText(new RegExp(`of ${DEACTIVATED.length - 1} users$`));
    expect(sim.reactivations).toEqual([D_PHYS.id]);
    await expectCount(u, 'Active', ACTIVE.length + 1);
    await expect(u.row(D_PHYS.email)).toBeVisible();
  });

  test(qase(2196, '[SMOKE] | Deleting a deactivated user permanently removes their record'), async ({ page, userManagementPage: u }) => {
    const sim = await openDeactivated(page, u);
    await btn(u, D_NURSE.email, 'Delete').click();
    const d = dialog(page, 'Delete User');
    await expect(d).toContainText(`Are you sure you want to permanently delete ${D_NURSE.fullName}?`);
    await expect(d).toContainText('cannot be undone');
    await d.getByRole('button', { name: 'Delete User' }).click();
    await expect(u.toast.filter({ hasText: `${D_NURSE.fullName} has been permanently deleted.` })).toBeVisible();
    await expect(u.row(D_NURSE.email)).toHaveCount(0);
    await expect(u.footer).toHaveText(new RegExp(`of ${DEACTIVATED.length - 1} users$`));
    expect(sim.deletions).toEqual([D_NURSE.id]);
    for (const t of /** @type {const} */ (['Active', 'Pending'])) {
      await u.tab(t).click();
      await u.searchInput.fill(D_NURSE.lastName);
      await expect(u.noResults, t).toBeVisible();
      await u.searchInput.fill('');
    }
  });

  test(qase(2197, '[SMOKE] | Super-Admin-added rows offer only Delete, never Reactivate'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    for (const x of [D_DHN_SA, D_PHYS_SA]) {
      await expect(cellD(u, x.email, 'addedBy')).toHaveText('Super Admin');
      await expect(btn(u, x.email, 'Reactivate'), x.email).toHaveCount(0);
      // The app offers no action on a Super-Admin-added row: the Action cell is empty.
      await expect(btn(u, x.email, 'Delete'), x.email).toHaveCount(0);
      await expect(cellD(u, x.email, 'action').getByRole('button'), x.email).toHaveCount(0);
    }
  });

  // ---------- Functional ----------

  test(qase(2198, '[Functional] | Tab bar shows three tabs with Active highlighted by default and no badge counts'), async ({ page, userManagementPage: u }) => {
    await signIn(page, u);
    for (const t of /** @type {const} */ (['Active', 'Pending', 'Deactivated'])) {
      await expect(u.tab(t)).toHaveText(t);
      await expect(u.tab(t).locator('span')).toHaveCount(0);
    }
    expect(await u.isTabSelected('Active')).toBe(true);
    await u.tab('Deactivated').click();
    await expect.poll(() => u.isTabSelected('Deactivated')).toBe(true);
    expect(await u.isTabSelected('Active')).toBe(false);
    await expect(u.row(D_PHYS.email)).toBeVisible();
  });

  test(qase(2199, '[Functional] | Search, filters, and add button appear in the specified order'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    await expect(u.addedByFilter).toBeVisible();
    const x = async (/** @type {import('@playwright/test').Locator} */ l) => /** @type {{x:number}} */ (await l.boundingBox()).x;
    const order = [await x(u.tab('Deactivated')), await x(u.searchInput), await x(u.userTypeFilter), await x(u.addedByFilter), await x(u.addUserButton)];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const [r, g, b] = await rgb(u.addUserButton, 'backgroundColor');
    expect(b > r && b > g, `add button is blue (rgb ${r},${g},${b})`).toBe(true);
  });

  test(qase(2200, '[Functional] | Name column shows an avatar followed by the name in bold'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u, { deactivated: [D_PHYS, D_NURSE, D_PHYS_SA] });
    // The table always shows an initials avatar (no photos), for every row.
    for (const x of [D_PHYS, D_NURSE, D_PHYS_SA]) {
      const cell = cellD(u, x.email, 'name');
      await expect(cell.locator('div.rounded-full')).toHaveText(`${x.firstName[0]}${x.lastName[0]}`);
      expect(Number(await cell.getByText(x.fullName, { exact: true }).evaluate((e) => getComputedStyle(e).fontWeight))).toBeGreaterThanOrEqual(600);
    }
    await expect(u.table.locator('tbody img')).toHaveCount(0);
  });

  test(qase(2201, '[Functional] | NPI Number and Specialty show real values for Physicians only'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    await expect(cellD(u, D_PHYS.email, 'npi')).toHaveText(/** @type {string} */ (D_PHYS.npi));
    await expect(cellD(u, D_PHYS.email, 'specialty')).toHaveText('Cardiology');
    for (const x of [D_NURSE, D_DHN_SA]) {
      await expect(cellD(u, x.email, 'npi')).toHaveText('—');
      await expect(cellD(u, x.email, 'specialty')).toHaveText('—');
    }
  });

  test(qase(2202, "[Functional] | Added By shows 'You' or 'Super Admin' based on who added the user"), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    for (const x of DEACTIVATED) await expect(cellD(u, x.email, 'addedBy'), x.email).toHaveText(x.invitedByRole === 'CLINIC_ADMIN' ? 'You' : 'Super Admin');
  });

  test(qase(2203, '[Functional] | Deactivated On shows the date the user was deactivated'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    for (const x of DEACTIVATED) await expect(cellD(u, x.email, 'deactivatedOn'), x.email).toHaveText(usDate(x.deactivatedOn));
  });

  test(qase(2204, "[Functional] | Rows added by 'You' show both Reactivate and Delete icons"), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    for (const x of [D_PHYS, D_NURSE]) {
      await expect(btn(u, x.email, 'Reactivate')).toBeVisible();
      await expect(btn(u, x.email, 'Delete')).toBeVisible();
      await expect(cellD(u, x.email, 'action').getByRole('button')).toHaveCount(2);
    }
  });

  test(qase(2205, '[Functional] | Action icon tooltips show the specified text'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    // Native tooltips: shown on hover from the title attribute.
    await expect(btn(u, D_PHYS.email, 'Reactivate')).toHaveAttribute('title', 'Reactivate');
    await expect(btn(u, D_PHYS.email, 'Delete')).toHaveAttribute('title', 'Delete');
  });

  test(qase(2206, '[Functional] | A user the Clinic Admin deactivates moves from Active to Deactivated'), async ({ page, userManagementPage: u }) => {
    const sim = await signIn(page, u);
    const target = ACTIVE[1];
    await act(page, u, target.email, 'Deactivate');
    await expect(u.toast.filter({ hasText: `${target.fullName} has been deactivated.` })).toBeVisible();
    await expect(u.row(target.email)).toHaveCount(0);
    expect(sim.deactivations).toEqual([target.id]);
    await u.tab('Deactivated').click();
    await expect(u.row(target.email)).toBeVisible();
    await expect(cellD(u, target.email, 'addedBy')).toHaveText('You');
    await expect(cellD(u, target.email, 'deactivatedOn')).toHaveText(usDate(new Date()));
  });

  test(qase(2207, '[Functional] | A Super-Admin-added user reassigned to this clinic moves from Deactivated to Active'), async ({ page, userManagementPage: u }) => {
    const sim = await openDeactivated(page, u);
    // The Super Admin reassigns the user to this clinic (server side).
    const i = sim.deactivated.findIndex((/** @type {any} */ x) => x.id === D_PHYS_SA.id);
    const [user] = sim.deactivated.splice(i, 1);
    sim.active.unshift({ ...user, status: 'ACTIVE', deactivatedOn: undefined });
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await u.open();
    await expect(u.row(D_PHYS_SA.email)).toBeVisible();
    await expect(u.footer).toHaveText(new RegExp(`of ${ACTIVE.length + 1} users$`));
    await expectCount(u, 'Deactivated', DEACTIVATED.length - 1);
    await expect(u.row(D_PHYS_SA.email)).toHaveCount(0);
  });

  test(qase(2208, '[Functional] | Pagination footer shows the count text and page controls in the correct positions'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u, { deactivated: manyDeactivated(25) });
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 25 users$/);
    const main = /** @type {{x:number,width:number}} */ (await page.getByRole('main').boundingBox());
    const footer = /** @type {{x:number}} */ (await u.footer.boundingBox());
    const next = /** @type {{x:number,width:number}} */ (await u.nextPage.boundingBox());
    expect(footer.x, 'count text at bottom-left').toBeLessThan(main.x + main.width * 0.25);
    expect(next.x + next.width, 'page controls at bottom-right').toBeGreaterThan(main.x + main.width * 0.85);
    await expect(u.prevPage).toBeDisabled();
    await expect(u.nextPage).toBeEnabled();
  });

  test(qase(2209, '[Functional] | Footer counts on all three tabs stay live after deactivate, reactivate, and delete'), async ({ page, userManagementPage: u }) => {
    await signIn(page, u);
    const [A, P, D] = [ACTIVE.length, PENDING.length, DEACTIVATED.length];
    await act(page, u, ACTIVE[1].email, 'Deactivate');
    await expect(u.row(ACTIVE[1].email)).toHaveCount(0);
    await expectCount(u, 'Active', A - 1);
    await expectCount(u, 'Pending', P);
    await expectCount(u, 'Deactivated', D + 1);
    await act(page, u, D_PHYS.email, 'Reactivate');
    await expect(u.row(D_PHYS.email)).toHaveCount(0);
    await expectCount(u, 'Deactivated', D);
    await expectCount(u, 'Active', A);
    await expectCount(u, 'Pending', P);
    await expectCount(u, 'Deactivated', D);
    await act(page, u, D_NURSE.email, 'Delete');
    await expect(u.row(D_NURSE.email)).toHaveCount(0);
    await expectCount(u, 'Deactivated', D - 1);
    await expectCount(u, 'Active', A);
    await expectCount(u, 'Pending', P);
  });

  test(qase(2210, '[Functional] | Reactivated and deleted outcomes persist after a page refresh'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    await act(page, u, D_PHYS.email, 'Reactivate');
    await expect(u.row(D_PHYS.email)).toHaveCount(0);
    await act(page, u, D_NURSE.email, 'Delete');
    await expect(u.row(D_NURSE.email)).toHaveCount(0);
    await page.reload();
    await expect(u.heading).toBeVisible();
    await expect(u.row(D_PHYS.email)).toBeVisible(); // Active tab after refresh
    await expect(u.row(D_NURSE.email)).toHaveCount(0);
    await expect(u.footer).toHaveText(new RegExp(`of ${ACTIVE.length + 1} users$`));
    await expectCount(u, 'Deactivated', DEACTIVATED.length - 2);
    await expect(u.row(D_PHYS.email)).toHaveCount(0);
    await expect(u.row(D_NURSE.email)).toHaveCount(0);
  });

  // ---------- Negative ----------

  test(qase(2211, '[Negative] | Reactivate failure keeps the user in the Deactivated tab'), async ({ page, userManagementPage: u }) => {
    const sim = await openDeactivated(page, u, { reactivateStatus: 500 });
    await act(page, u, D_PHYS.email, 'Reactivate');
    await expect(u.toast.filter({ hasText: 'Something went wrong. Please try again later.' })).toBeVisible();
    await expect(u.toast.filter({ hasText: 'has been reactivated' })).toHaveCount(0);
    expect(sim.reactivations).toEqual([D_PHYS.id]);
    const d = dialog(page, 'Reactivate User');
    if (await d.isVisible()) await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(d).toBeHidden();
    await expect(u.row(D_PHYS.email)).toBeVisible();
    await expect(u.footer).toHaveText(new RegExp(`of ${DEACTIVATED.length} users$`));
  });

  test(qase(2212, '[Negative] | Delete failure keeps the user in the Deactivated tab'), async ({ page, userManagementPage: u }) => {
    const sim = await openDeactivated(page, u, { deleteStatus: 500 });
    await act(page, u, D_NURSE.email, 'Delete');
    await expect(u.toast.filter({ hasText: 'Something went wrong. Please try again later.' })).toBeVisible();
    await expect(u.toast.filter({ hasText: 'permanently deleted' })).toHaveCount(0);
    expect(sim.deletions).toEqual([D_NURSE.id]);
    const d = dialog(page, 'Delete User');
    if (await d.isVisible()) await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(d).toBeHidden();
    await expect(u.row(D_NURSE.email)).toBeVisible();
    await expect(u.footer).toHaveText(new RegExp(`of ${DEACTIVATED.length} users$`));
  });

  test(qase(2213, '[Negative] | A user without Clinic Admin permissions cannot view, reactivate, or delete from this tab'), async ({ page, playwright }) => {
    test.info().annotations.push({ type: 'note', description: 'Real server: requests without a Clinic Admin session are refused. UI: a simulated Physician session cannot open User Management.' });
    const anon = await playwright.request.newContext();
    const list = await anon.get(`${API_BASE}/clinic/resources?status=DEACTIVATED&page=1&limit=10`);
    expect(list.status()).toBe(401);
    expect(await list.text()).not.toMatch(/"email"\s*:/);
    expect((await anon.patch(`${API_BASE}/clinics/${SIM_CLINIC_ID}/users/${D_PHYS.id}/reactivate`)).status()).toBe(401);
    expect((await anon.delete(`${API_BASE}/clinic/resources/${D_PHYS.id}`)).status()).toBe(401);
    await anon.dispose();
    await simulateClinicUsers(page, { role: 'PHYSICIAN', deactivated: [...DEACTIVATED] });
    await page.goto('/admin/login');
    await page.getByRole('textbox', { name: 'Email Address' }).fill(SIM_ADMIN.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(SIM_ADMIN.password);
    await page.getByRole('button', { name: 'Sign In to Dashboard' }).click();
    await expect(page).not.toHaveURL(/\/admin\/login$/, { timeout: 10_000 });
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(D_PHYS.email)).toHaveCount(0);
  });

  // ---------- Edge ----------

  test(qase(2214, '[Edge] | Pagination boundary at the 10-row page size, including deleting the only user on the last page'), async ({ page, userManagementPage: u }) => {
    const sim = await openDeactivated(page, u, { deactivated: manyDeactivated(10) });
    await expect(u.rows).toHaveCount(10);
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 10 users$/);
    await expect(u.nextPage).toBeDisabled();
    sim.deactivated.push(...manyDeactivated(11).slice(10));
    await page.reload();
    await u.tab('Deactivated').click();
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 11 users$/);
    await expect(u.rows).toHaveCount(10);
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]11 of 11 users$/);
    await expect(u.rows).toHaveCount(1);
    await act(page, u, 'former11@example.com', 'Delete');
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 10 users$/);
    await expect(u.rows).toHaveCount(10);
    await expect(u.pageButton(1)).toHaveClass(/bg-primary/);
    await expect(u.pageButton(2)).toHaveCount(0);
  });

  test(qase(2215, '[Edge] | Rapid double-click on the Reactivate and Delete confirmations does not duplicate the action'), async ({ page, userManagementPage: u }) => {
    const sim = await openDeactivated(page, u, { actionDelay: 800 });
    await btn(u, D_PHYS.email, 'Reactivate').click();
    await dialog(page, 'Reactivate User').getByRole('button', { name: 'Reactivate User' }).dblclick();
    await expect(u.row(D_PHYS.email)).toHaveCount(0);
    await btn(u, D_NURSE.email, 'Delete').click();
    await dialog(page, 'Delete User').getByRole('button', { name: 'Delete User' }).dblclick();
    await expect(u.row(D_NURSE.email)).toHaveCount(0);
    await page.waitForTimeout(1_000);
    expect(sim.reactivations).toEqual([D_PHYS.id]);
    expect(sim.deletions).toEqual([D_NURSE.id]);
    await expect(u.toast.filter({ hasText: /not found|Something went wrong|Failed/ })).toHaveCount(0);
    await expectCount(u, 'Active', ACTIVE.length + 1);
  });

  test(qase(2216, '[Edge] | Acting on one user does not affect other rows'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    const keep = [D_DHN_SA, D_PHYS_SA];
    const before = await Promise.all(keep.map((x) => u.row(x.email).textContent()));
    await act(page, u, D_PHYS.email, 'Reactivate');
    await expect(u.row(D_PHYS.email)).toHaveCount(0);
    await act(page, u, D_NURSE.email, 'Delete');
    await expect(u.row(D_NURSE.email)).toHaveCount(0);
    expect((await emails(u)).sort()).toEqual(keep.map((x) => x.email).sort());
    for (const [i, x] of keep.entries()) {
      expect(await u.row(x.email).textContent()).toBe(before[i]);
      await expect(btn(u, x.email, 'Reactivate')).toHaveCount(0); // matches its own Added By (Super Admin)
    }
  });

  // ---------- Security ----------

  test.skip(qase(2217, '[Security] | Server-side enforcement blocks reactivating a Super-Admin-added user'), { annotation: { type: 'skip', description: 'Needs a real Clinic Admin session token; no Clinic Admin QA account is configured' } }, async () => {});

  test(qase(2218, '[Security] | Denied access to the Deactivated tab is audited'), async ({ playwright }) => {
    test.info().annotations.push({ type: 'note', description: 'Denial checked on the real API; the audit-log entry is not visible to automation.' });
    const anon = await playwright.request.newContext();
    expect((await anon.get(`${API_BASE}/clinic/resources?status=DEACTIVATED&page=1&limit=10`)).status()).toBe(401);
    expect((await anon.patch(`${API_BASE}/clinics/${SIM_CLINIC_ID}/users/${D_PHYS.id}/reactivate`)).status()).toBe(401);
    expect((await anon.delete(`${API_BASE}/clinic/resources/${D_PHYS.id}`)).status()).toBe(401);
    await anon.dispose();
  });

  test.skip(qase(2219, '[Security] | A successful reactivation produces a correctly-scoped audit entry'), { annotation: { type: 'skip', description: 'Needs access to the audit log, which automation cannot read' } }, async () => {});

  test.skip(qase(2220, "[Security] | A permanent deletion is audited and the entry survives the record's removal"), { annotation: { type: 'skip', description: 'Needs access to the audit log, which automation cannot read' } }, async () => {});

  test.skip(qase(2221, '[Security] | Errors on the Deactivated tab are logged without email, phone number, or NPI'), { annotation: { type: 'skip', description: 'Needs access to the application logs, which automation cannot read' } }, async () => {});

  // ---------- UI ----------

  test(qase(2222, '[UI] | User Type labels render in their specified colors'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    const pill = async (/** @type {string} */ email) => {
      const [r, g, b] = await rgb(cellD(u, email, 'type').locator('span'));
      return { r, g, b };
    };
    const [phys, nurse, dhn] = [await pill(D_PHYS.email), await pill(D_NURSE.email), await pill(D_DHN_SA.email)];
    expect(phys.r > phys.g && phys.b > phys.g, 'Physician label is purple').toBe(true);
    expect(nurse.b > nurse.r && nurse.b > nurse.g, 'Registered Nurse label is blue').toBe(true);
    expect(dhn.g > dhn.r * 2 && dhn.b > dhn.r * 2, `Digital Health Navigator label is teal (rgb ${dhn.r},${dhn.g},${dhn.b})`).toBe(true);
    await expect(cellD(u, D_DHN_SA.email, 'type').locator('span')).toHaveClass(/teal/);
  });

  test(qase(2223, '[UI] | Row hover highlights light grey'), async ({ page, userManagementPage: u }) => {
    await openDeactivated(page, u);
    const row = u.row(D_PHYS.email);
    await page.mouse.move(0, 0);
    const before = JSON.stringify(await rgb(row, 'backgroundColor'));
    await row.hover();
    await expect.poll(async () => JSON.stringify(await rgb(row, 'backgroundColor'))).not.toBe(before);
    const [r, g, b, a] = await rgb(row, 'backgroundColor');
    expect(Math.max(r, g, b) - Math.min(r, g, b), 'light grey').toBeLessThan(15);
    expect(a).toBeGreaterThan(0);
    await page.mouse.move(0, 0);
    await expect.poll(async () => JSON.stringify(await rgb(row, 'backgroundColor'))).toBe(before);
  });

  // ---------- E2E ----------

  test(qase(2224, '[E2E] | Full lifecycle: deactivate, review, reactivate, and permanently delete users'), async ({ page, userManagementPage: u }) => {
    const sim = await signIn(page, u);
    const [first, second] = [ACTIVE[0], ACTIVE[1]];
    await act(page, u, first.email, 'Deactivate');
    await expect(u.row(first.email)).toHaveCount(0);
    await u.tab('Deactivated').click();
    await expect(cellD(u, first.email, 'addedBy')).toHaveText('You');
    await expect(cellD(u, first.email, 'deactivatedOn')).toHaveText(usDate(new Date()));
    await expect(btn(u, first.email, 'Reactivate')).toBeVisible();
    await expect(btn(u, first.email, 'Delete')).toBeVisible();
    await act(page, u, first.email, 'Reactivate');
    await expect(u.row(first.email)).toHaveCount(0);
    await expect(u.footer).toHaveText(new RegExp(`of ${DEACTIVATED.length} users$`));
    await expectCount(u, 'Active', ACTIVE.length);
    await expect(u.row(first.email)).toBeVisible();
    await act(page, u, second.email, 'Deactivate');
    await expect(u.row(second.email)).toHaveCount(0);
    await u.tab('Deactivated').click();
    await act(page, u, second.email, 'Delete');
    await expect(u.row(second.email)).toHaveCount(0);
    expect(sim.deletions).toEqual([second.id]);
    await expectCount(u, 'Active', ACTIVE.length - 1);
    await expectCount(u, 'Pending', PENDING.length);
    await expectCount(u, 'Deactivated', DEACTIVATED.length);
    for (const t of /** @type {const} */ (['Active', 'Pending', 'Deactivated'])) {
      await u.tab(t).click();
      await expect(u.row(second.email), t).toHaveCount(0);
    }
  });
});
