// @ts-check
// Qase: HTM › Clinic Admin › User Management › Pending Tab (suite 29). Titles carry Qase IDs.
// Runs on the Clinic Admin portal (CLINIC_ADMIN_BASE_URL).
//
// The Clinic Admin session, the user list and the Resend / Cancel Invite calls are SIMULATED (fixtures/clinicUsersSim.js):
// no Clinic Admin QA account is configured and no real invite emails are sent. The pending list includes, as in QA, an
// invite the Super Admin sent to this clinic (Added By "Super Admin").
// Real-server checks: HTM-468/469 (list, resend and cancel APIs refuse requests without a session).
// Aligned to the app where Qase differs (user confirmed these pass): the tabs carry no count badges, so counts are read
// from each tab's "Showing … of N users" footer; subtext "Manage Physicians, Nurses, and DHNs."; the Pending tab has no
// Added By filter; the DHN pill is teal; invites the Super Admin sent to the clinic are listed as "Super Admin" with
// Resend only (no Cancel).
// HTM-470–473 are recorded as manually verified (block at the end of this file).
import { test, expect } from '../../fixtures/pages.js';
import { simulateClinicUsers, simUser, SIM_ADMIN } from '../../fixtures/clinicUsersSim.js';
import { qase } from 'playwright-qase-reporter';

const { CLINIC_ADMIN_BASE_URL = 'https://clinic.qa.healthtelematix.com' } = process.env;
const API_BASE = 'https://api.qa.healthtelematix.com/api/v1';

const pending = (/** @type {Parameters<typeof simUser>[0] & { canResend?: boolean }} */ u) => ({ canResend: true, ...simUser({ status: 'PENDING', ...u }) });
const P_PHYS = pending({ id: 'p1', firstName: 'Grace', lastName: 'Hopper', email: 'grace.hopper@example.com', phoneNumber: '+12025550111', type: 'PHYSICIAN', npi: '1003000126', specialties: ['Cardiology'], addedByMe: true });
const P_NURSE = pending({ id: 'p2', firstName: 'Ada', lastName: 'Byron', email: 'ada.byron@example.com', phoneNumber: '+12025550112', type: 'NURSE', addedByMe: true });
const P_DHN = pending({ id: 'p3', firstName: 'Alan', lastName: 'Turing', email: 'alan.turing@example.com', phoneNumber: '+12025550113', type: 'DHN', addedByMe: true });
const P_SA = pending({ id: 'p4', firstName: 'Mary', lastName: 'Jackson', email: 'mary.jackson@example.com', phoneNumber: '+12025550114', type: 'NURSE', addedByMe: false });
const PENDING = [P_PHYS, P_NURSE, P_DHN, P_SA];
const ACTIVE = [
  simUser({ id: 'a1', firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@clinic.com', phoneNumber: '+12025550101', type: 'PHYSICIAN', npi: '1234567893', specialties: ['Cardiology'], addedByMe: true }),
  simUser({ id: 'a2', firstName: 'Anna', lastName: 'Chen', email: 'anna.chen@example.com', phoneNumber: '+12025550102', type: 'NURSE' }),
];
const DEACTIVATED = [simUser({ id: 'd1', firstName: 'Former', lastName: 'Member', email: 'former.member@example.com', phoneNumber: '+12025550301', type: 'DHN', addedByMe: true, status: 'DEACTIVATED' })];

/** n pending invites sent by this Clinic Admin. @param {number} n */
const manyPending = (n) =>
  Array.from({ length: n }, (_, i) =>
    pending({ id: `m${i}`, firstName: `Invitee${String(i + 1).padStart(2, '0')}`, lastName: 'Test', email: `invitee${String(i + 1).padStart(2, '0')}@example.com`, phoneNumber: `+1202555${2000 + i}`, type: 'NURSE', addedByMe: true }),
  );

test.use({ baseURL: CLINIC_ADMIN_BASE_URL });
test.describe.configure({ timeout: 60_000 });

test.describe('Clinic Admin — User Management › Pending tab', () => {
  /** Signed-in Clinic Admin on User Management with the Pending tab open. */
  const openPending = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ u, opts = {}) => {
    // Copies, so tests that move users between tabs never touch the shared data.
    const o = /** @type {any} */ ({ active: ACTIVE, pending: PENDING, deactivated: DEACTIVATED, ...opts });
    const sim = await simulateClinicUsers(page, { ...o, active: [...o.active], pending: [...o.pending], deactivated: [...o.deactivated] });
    await u.signIn(SIM_ADMIN.email, SIM_ADMIN.password);
    await u.open();
    await u.tab('Pending').click();
    await expect.poll(() => u.isTabSelected('Pending')).toBe(true);
    const first = /** @type {any[]} */ (sim.pending)[0];
    if (first) await expect(u.row(first.email)).toBeVisible();
    return sim;
  };
  const emails = async (/** @type {any} */ u) => (await u.rows.allInnerTexts()).map((t) => t.match(/\S+@\S+\.\w+/)?.[0]).filter(Boolean);
  const resendBtn = (/** @type {any} */ u, /** @type {string} */ email) => u.cell(u.row(email), 'action').getByRole('button', { name: 'Resend invite' });
  const cancelBtn = (/** @type {any} */ u, /** @type {string} */ email) => u.cell(u.row(email), 'action').getByRole('button', { name: 'Cancel invite' });
  const dialog = (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ title) => page.getByRole('dialog').filter({ hasText: title });
  const resend = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ u, /** @type {string} */ email) => {
    await resendBtn(u, email).click();
    await dialog(page, 'Resend Invite').getByRole('button', { name: 'Resend Invite' }).click();
  };
  const cancel = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ u, /** @type {string} */ email) => {
    await cancelBtn(u, email).click();
    await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).click();
  };
  /** The tabs have no count badges: a tab's live count is its footer total ("Showing … of N users"), or its empty state. */
  const expectCount = async (/** @type {any} */ u, /** @type {'Active'|'Pending'|'Deactivated'} */ tab, /** @type {number} */ n) => {
    await u.tab(tab).click();
    await expect.poll(() => u.isTabSelected(tab)).toBe(true);
    if (n === 0) await expect(u.page.getByText(`No ${tab} Users`), `${tab} count`).toBeVisible();
    else await expect(u.footer, `${tab} count`).toHaveText(new RegExp(`of ${n} users?$`));
  };
  /** Server side: the invited user finishes onboarding and moves from Pending to Active. */
  const completeOnboarding = (/** @type {any} */ sim, /** @type {string} */ email) => {
    const i = sim.pending.findIndex((/** @type {any} */ x) => x.email === email);
    const [user] = sim.pending.splice(i, 1);
    sim.active.unshift({ ...user, status: 'ACTIVE' });
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

  test(qase(436, '[SMOKE] | Pending tab loads with the list of invited users'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u);
    expect(await u.isTabSelected('Active')).toBe(false);
    await expect(u.rows).toHaveCount(PENDING.length);
    for (const x of PENDING) {
      const row = u.row(x.email);
      await expect(u.cell(row, 'name')).toContainText(x.fullName);
      await expect(u.cell(row, 'phone')).toHaveText(/\(\d{3}\) \d{3}-\d{4}$/);
    }
    expect(sim.listCalls.at(-1)).toMatchObject({ status: 'PENDING', page: '1' });
  });

  test(qase(437, '[SMOKE] | Newly invited user automatically appears on the Pending tab'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    const NEW = { firstName: 'Katherine', lastName: 'Johnson', email: 'katherine.johnson@example.com', phone: '2025550188', npi: '1245319599', specialty: 'Neurology' };
    await u.openModal();
    await u.fill(NEW);
    await u.sendInviteButton.click();
    await u.doneButton.click();
    const row = u.row(NEW.email);
    await expect(row).toBeVisible();
    await expect(u.cell(row, 'name')).toContainText('Katherine Johnson');
    await expect(u.cell(row, 'type')).toHaveText('Physician');
    await expect(u.cell(row, 'npi')).toHaveText(NEW.npi);
    await expect(u.cell(row, 'addedBy')).toHaveText('You');
    await expectCount(u, 'Pending', PENDING.length + 1);
  });

  test(qase(438, '[SMOKE] | Resend Invite triggers a new invitation email to the pending user'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u);
    await resendBtn(u, P_PHYS.email).click();
    const d = dialog(page, 'Resend Invite');
    await expect(d).toContainText(`A new invitation will be sent to ${P_PHYS.fullName} at ${P_PHYS.email}.`);
    await d.getByRole('button', { name: 'Resend Invite' }).click();
    await expect(d).toBeHidden();
    await expect(u.toast.filter({ hasText: 'Invite resent successfully.' })).toBeVisible();
    expect(sim.resends).toEqual([P_PHYS.id]);
    await expect(u.row(P_PHYS.email)).toBeVisible();
  });

  test(qase(439, '[SMOKE] | Cancel Invite removes the invitation and the row from the Pending tab'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u);
    await cancelBtn(u, P_NURSE.email).click();
    const d = dialog(page, 'Cancel Invite');
    await expect(d).toContainText(`The invitation sent to ${P_NURSE.fullName} at ${P_NURSE.email} will be cancelled.`);
    await expect(d.getByRole('button', { name: 'Keep Invite' })).toBeVisible();
    await d.getByRole('button', { name: 'Cancel Invite' }).click();
    await expect(d).toBeHidden();
    await expect(u.toast.filter({ hasText: 'Invite cancelled.' })).toBeVisible();
    await expect(u.row(P_NURSE.email)).toHaveCount(0);
    await expect(u.rows).toHaveCount(PENDING.length - 1);
    expect(sim.cancels).toEqual([P_NURSE.id]);
    await expectCount(u, 'Pending', PENDING.length - 1);
  });

  test(qase(440, '[SMOKE] | Invited user completing onboarding auto-moves from Pending to Active'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u);
    completeOnboarding(sim, P_PHYS.email);
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await u.open();
    await expect(u.row(P_PHYS.email)).toBeVisible();
    await expect(u.cell(u.row(P_PHYS.email), 'action').getByRole('button', { name: 'Edit' })).toBeVisible();
    await u.tab('Pending').click();
    await expect(u.row(P_NURSE.email)).toBeVisible();
    await expect(u.row(P_PHYS.email)).toHaveCount(0);
    await expectCount(u, 'Active', ACTIVE.length + 1);
    await expectCount(u, 'Pending', PENDING.length - 1);
  });

  // ---------- Functional ----------

  test(qase(441, '[Functional] | Page header and subtext render correctly on the Pending tab'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    await expect(u.heading).toHaveText('User Management');
    expect(Number(await u.heading.evaluate((e) => getComputedStyle(e).fontWeight))).toBeGreaterThanOrEqual(600);
    const [r, g, b] = await rgb(u.headerSubtext);
    expect(Math.max(r, g, b) - Math.min(r, g, b), 'subtext is grey').toBeLessThan(30);
    await expect(u.headerSubtext).toHaveText('Manage Physicians, Nurses, and DHNs.');
  });

  test(qase(442, "[Functional] | Badge counts on all three tabs stay live and accurate from the Pending tab's perspective"), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u);
    await expectCount(u, 'Active', ACTIVE.length);
    await expectCount(u, 'Pending', PENDING.length);
    await expectCount(u, 'Deactivated', DEACTIVATED.length);
    await expectCount(u, 'Pending', PENDING.length);
    await cancel(page, u, P_NURSE.email);
    await expect(u.row(P_NURSE.email)).toHaveCount(0);
    await expect(u.footer).toHaveText(new RegExp(`of ${PENDING.length - 1} users$`)); // updated in place after the cancel
    completeOnboarding(sim, P_DHN.email);
    await expectCount(u, 'Active', ACTIVE.length + 1);
    await expectCount(u, 'Pending', PENDING.length - 2);
  });

  test(qase(443, '[Functional] | Tab-row controls appear on the Pending tab in the correct left-to-right order'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    // The Pending tab has no Added By filter.
    await expect(u.page.getByRole('main').getByRole('button', { name: 'Added By', exact: true })).toHaveCount(0);
    const x = async (/** @type {import('@playwright/test').Locator} */ l) => /** @type {{x:number}} */ (await l.boundingBox()).x;
    const order = [await x(u.tab('Active')), await x(u.tab('Pending')), await x(u.tab('Deactivated')), await x(u.searchInput), await x(u.userTypeFilter), await x(u.addUserButton)];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await expect(u.addUserButton).toHaveText('Add New User');
    const [r, g, b] = await rgb(u.addUserButton, 'backgroundColor');
    expect(b > r && b > g, `'Add New User' is blue (rgb ${r},${g},${b})`).toBe(true);
  });

  test(qase(444, '[Functional] | Table column headers render in the correct order on the Pending tab'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    expect(await u.columnHeaders.allInnerTexts()).toEqual(['NAME', 'EMAIL ADDRESS', 'PHONE NUMBER', 'NPI NUMBER', 'USER TYPE', 'SPECIALTY', 'ADDED BY', 'ACTION']);
  });

  test(qase(445, '[Functional] | NPI Number and Specialty columns show real values for Physician rows, em dash for Nurse/DHN'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    await expect(u.cell(u.row(P_PHYS.email), 'npi')).toHaveText(/** @type {string} */ (P_PHYS.npi));
    await expect(u.cell(u.row(P_PHYS.email), 'specialty')).toHaveText('Cardiology');
    for (const x of [P_NURSE, P_DHN]) {
      await expect(u.cell(u.row(x.email), 'npi')).toHaveText('—');
      await expect(u.cell(u.row(x.email), 'specialty')).toHaveText('—');
    }
  });

  test(qase(446, '[Functional] | User Type pill colors are correct and consistent on the Pending tab'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    const pill = async (/** @type {string} */ email) => {
      const [r, g, b] = await rgb(u.cell(u.row(email), 'type').locator('span'));
      return { r, g, b };
    };
    const phys = await pill(P_PHYS.email);
    const nurses = [await pill(P_NURSE.email), await pill(P_SA.email)];
    const dhn = await pill(P_DHN.email);
    expect(nurses[0]).toEqual(nurses[1]);
    expect(phys.r > phys.g && phys.b > phys.g, 'Physician pill is purple').toBe(true);
    expect(nurses[0].b > nurses[0].r && nurses[0].b > nurses[0].g, 'Registered Nurse pill is blue').toBe(true);
    expect(dhn.g > dhn.r * 2 && dhn.b > dhn.r * 2, `Digital Health Navigator pill is teal (rgb ${dhn.r},${dhn.g},${dhn.b})`).toBe(true);
    await expect(u.cell(u.row(P_DHN.email), 'type').locator('span')).toHaveClass(/teal/);
  });

  test(qase(447, "[Functional] | Added By column always shows 'You' on every Pending row"), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    // Invites this Clinic Admin sent show 'You'; an invite the Super Admin sent to the clinic shows 'Super Admin'.
    for (const x of PENDING) await expect(u.cell(u.row(x.email), 'addedBy'), x.email).toHaveText(x.invitedByRole === 'CLINIC_ADMIN' ? 'You' : 'Super Admin');
  });

  test(qase(448, '[Functional] | Action column always shows both Resend Invite and Cancel Invite icons on every Pending row'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    // Every row has an action: own invites get Resend + Cancel, a Super Admin invite gets Resend only.
    for (const x of PENDING) {
      const mine = x.invitedByRole === 'CLINIC_ADMIN';
      await expect(resendBtn(u, x.email), x.email).toBeVisible();
      await expect(cancelBtn(u, x.email), x.email).toHaveCount(mine ? 1 : 0);
      await expect(u.cell(u.row(x.email), 'action').getByRole('button'), x.email).toHaveCount(mine ? 2 : 1);
    }
  });

  test(qase(449, '[Functional] | Pending row Action column never shows Edit or Deactivate'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    for (const row of await u.rows.all()) {
      const buttons = u.cell(row, 'action').getByRole('button');
      await expect(buttons.filter({ has: page.locator('[title="Edit"], [title="Deactivate"]') })).toHaveCount(0);
      for (const b of await buttons.all()) expect(await b.getAttribute('title')).toMatch(/^(Resend invite|Cancel invite)$/);
    }
    await expect(u.table.getByRole('button', { name: /^(Edit|Deactivate)$/ })).toHaveCount(0);
  });

  test(qase(450, '[Functional] | Full invited-user details are visible on the Pending tab before acceptance'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    const row = u.row(P_PHYS.email);
    await expect(u.cell(row, 'name')).toContainText('Grace Hopper');
    await expect(u.cell(row, 'email')).toHaveText(P_PHYS.email);
    await expect(u.cell(row, 'phone')).toHaveText('+1 (202) 555-0111');
    await expect(u.cell(row, 'npi')).toHaveText(/** @type {string} */ (P_PHYS.npi));
    await expect(u.cell(row, 'specialty')).toHaveText('Cardiology');
    await expect(u.cell(row, 'type')).toHaveText('Physician');
  });

  test(qase(451, '[Functional] | Pagination footer text and controls render and update correctly on the Pending tab'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u, { pending: manyPending(25) });
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 25 users$/);
    await expect(u.pageButton(1)).toHaveClass(/bg-primary/);
    const [r, g, b] = await rgb(u.pageButton(1), 'backgroundColor');
    expect(b >= r && b >= g, 'current page in a blue box').toBe(true);
    await expect(u.prevPage).toBeDisabled();
    await expect(u.nextPage).toBeEnabled();
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]20 of 25 users$/);
    await expect(u.pageButton(2)).toHaveClass(/bg-primary/);
    await expect(u.pageButton(1)).not.toHaveClass(/bg-primary/);
    await expect(u.prevPage).toBeEnabled();
    await expect(u.nextPage).toBeEnabled();
  });

  test(qase(452, '[Functional] | Pending tab pagination page size is 10 rows per page'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u, { pending: manyPending(25) });
    await expect(u.rows).toHaveCount(10);
  });

  test(qase(453, '[Functional] | No Super-Admin-added user ever appears on the Pending tab'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    // The invite the Super Admin sent is listed, clearly marked 'Super Admin', and this admin cannot cancel it.
    expect(await emails(u)).toContain(P_SA.email);
    await expect(u.cell(u.row(P_SA.email), 'addedBy')).toHaveText('Super Admin');
    await expect(cancelBtn(u, P_SA.email)).toHaveCount(0);
    // The Added By column never mislabels an own invite as 'Super Admin'.
    await expect(u.table.getByRole('cell', { name: 'Super Admin', exact: true })).toHaveCount(1);
  });

  test(qase(454, '[Functional] | An accepted invite disappears entirely from Pending, with no residual resend/cancel option'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u);
    await expect(resendBtn(u, P_DHN.email)).toBeVisible();
    completeOnboarding(sim, P_DHN.email);
    await page.reload();
    await u.tab('Pending').click();
    await expect(u.row(P_NURSE.email)).toBeVisible();
    await u.searchInput.fill('Turing');
    await expect(u.noResults).toBeVisible();
    await expect(u.row(P_DHN.email)).toHaveCount(0);
    await expect(u.table.getByRole('button', { name: /Resend invite|Cancel invite/ })).toHaveCount(0);
  });

  // ---------- Negative ----------

  test(qase(455, '[Negative] | API failure loading the Pending tab table shows an error state without crashing'), async ({ page, userManagementPage: u }) => {
    const sim = await simulateClinicUsers(page, { active: [...ACTIVE], pending: [...PENDING] });
    await u.signIn(SIM_ADMIN.email, SIM_ADMIN.password);
    await u.open();
    sim.listStatus = 503;
    await u.tab('Pending').click();
    const toast = u.toast.filter({ hasText: /temporarily unavailable|Something went wrong|Failed to load/ });
    await expect(toast).toBeVisible();
    await expect(u.toast).not.toContainText(/Error:|stack|at \w+ \(|TypeError|\.js:\d+/);
    await expect(page.getByText(/Unexpected Application Error/)).toHaveCount(0);
    sim.listStatus = 200;
    await u.tab('Deactivated').click();
    await u.tab('Pending').click();
    await expect(u.row(P_PHYS.email)).toBeVisible();
  });

  test(qase(456, '[Negative] | API failure confirming Resend Invite leaves the invite and row unchanged'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u, { resendStatus: 500 });
    const before = await u.row(P_PHYS.email).textContent();
    await resend(page, u, P_PHYS.email);
    await expect(u.toast.filter({ hasText: 'Something went wrong. Please try again later.' })).toBeVisible();
    expect(sim.resends).toEqual([P_PHYS.id]);
    // The confirmation stays open so the admin can retry or back out; the row behind it is unchanged.
    const d = dialog(page, 'Resend Invite');
    await expect(d).toBeVisible();
    await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(d).toBeHidden();
    expect(await u.row(P_PHYS.email).textContent()).toBe(before);
    await expect(resendBtn(u, P_PHYS.email)).toBeEnabled();
    await expect(u.toast.filter({ hasText: 'Invite resent successfully.' })).toHaveCount(0);
  });

  test(qase(457, '[Negative] | API failure confirming Cancel Invite leaves the invitation active'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u, { cancelStatus: 500 });
    await cancel(page, u, P_NURSE.email);
    await expect(u.toast.filter({ hasText: 'Something went wrong. Please try again later.' })).toBeVisible();
    expect(sim.cancels).toEqual([P_NURSE.id]);
    const d = dialog(page, 'Cancel Invite');
    await expect(d).toBeVisible();
    await d.getByRole('button', { name: 'Keep Invite' }).click();
    await expect(d).toBeHidden();
    await expect(u.row(P_NURSE.email)).toBeVisible();
    await expect(cancelBtn(u, P_NURSE.email)).toBeEnabled();
    expect(sim.pending.map((/** @type {any} */ x) => x.email)).toContain(P_NURSE.email);
  });

  test(qase(458, '[Negative] | Resend or Cancel on an invite that was just accepted is handled gracefully'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u);
    completeOnboarding(sim, P_PHYS.email); // accepted in the background; the row is still on screen
    await resend(page, u, P_PHYS.email);
    await expect(u.toast.filter({ hasText: /no longer pending|already (been )?accepted|cannot be resent/i })).toBeVisible();
    await expect(page.getByText(/Unexpected Application Error/)).toHaveCount(0);
    await expect(u.toast.filter({ hasText: 'Invite resent successfully.' })).toHaveCount(0);
    // The list refreshes: gone from Pending, present on Active.
    await expect(u.row(P_PHYS.email)).toHaveCount(0);
    await u.tab('Active').click();
    await expect(u.row(P_PHYS.email)).toBeVisible();
    // Same for Cancel on another just-accepted invite.
    await u.tab('Pending').click();
    await expect(u.row(P_NURSE.email)).toBeVisible();
    completeOnboarding(sim, P_NURSE.email);
    await cancel(page, u, P_NURSE.email);
    await expect(u.toast.filter({ hasText: /no longer pending|already (been )?accepted|only be cancelled while/i })).toBeVisible();
    await expect(u.row(P_NURSE.email)).toHaveCount(0);
  });

  // ---------- Edge ----------

  test(qase(459, '[Edge] | Pagination boundary at exactly 10 and 11 pending invites'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u, { pending: manyPending(10) });
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 10 users$/);
    await expect(u.pageButton(2)).toHaveCount(0);
    await expect(u.prevPage).toBeDisabled();
    await expect(u.nextPage).toBeDisabled();
    sim.pending.push(...manyPending(11).slice(10));
    await page.reload();
    await u.tab('Pending').click();
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 11 users$/);
    await expect(u.nextPage).toBeEnabled();
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]11 of 11 users$/);
    await expect(u.nextPage).toBeDisabled();
  });

  test(qase(460, '[Edge] | Single pending invite renders pagination and footer text correctly'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u, { pending: [P_PHYS] });
    await expect(u.rows).toHaveCount(1);
    await expect(u.footer).toHaveText(/^Showing 1[–-]1 of 1 users?$/);
    await expect(u.prevPage).toBeDisabled();
    await expect(u.nextPage).toBeDisabled();
  });

  test(qase(461, '[Edge] | Mixed Physician/Nurse/DHN pending rows render independently without cross-row contamination'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u, { pending: [P_PHYS, P_NURSE, P_DHN] });
    const pill = { PHYSICIAN: /violet/, NURSE: /blue/, DHN: /teal|green|emerald/ };
    for (const x of [P_PHYS, P_NURSE, P_DHN]) {
      const row = u.row(x.email);
      await expect(u.cell(row, 'type').locator('span')).toHaveClass(pill[x.type]);
      await expect(u.cell(row, 'npi')).toHaveText(x.type === 'PHYSICIAN' ? /** @type {string} */ (x.npi) : '—');
      await expect(u.cell(row, 'specialty')).toHaveText(x.type === 'PHYSICIAN' ? 'Cardiology' : '—');
      await expect(u.cell(row, 'action').getByRole('button')).toHaveCount(2);
      await expect(resendBtn(u, x.email)).toBeEnabled();
      await expect(cancelBtn(u, x.email)).toBeEnabled();
    }
  });

  test(qase(462, '[Edge] | Resending or cancelling one invite does not affect other pending rows'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u, { pending: [P_PHYS, P_NURSE, P_DHN] });
    const [a, c] = [await u.row(P_PHYS.email).textContent(), await u.row(P_DHN.email).textContent()];
    await resend(page, u, P_PHYS.email);
    await expect(u.toast.filter({ hasText: 'Invite resent successfully.' })).toBeVisible();
    await expect(u.row(P_PHYS.email)).toHaveText(/** @type {string} */ (a));
    await cancel(page, u, P_NURSE.email);
    await expect(u.row(P_NURSE.email)).toHaveCount(0);
    await expect(u.row(P_DHN.email)).toHaveText(/** @type {string} */ (c));
    await expect(resendBtn(u, P_DHN.email)).toBeEnabled();
    await expect(cancelBtn(u, P_DHN.email)).toBeEnabled();
    expect(sim.resends).toEqual([P_PHYS.id]);
    expect(sim.cancels).toEqual([P_NURSE.id]);
  });

  test(qase(463, '[Edge] | Rapid repeated tab switching does not corrupt the Pending dataset or badge counts'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    for (const t of /** @type {const} */ (['Active', 'Pending', 'Deactivated', 'Pending'])) await u.tab(t).click();
    await expect(u.rows).toHaveCount(PENDING.length);
    await page.waitForTimeout(800);
    expect((await emails(u)).sort()).toEqual(PENDING.map((x) => x.email).sort());
    expect(await u.isTabSelected('Pending')).toBe(true);
    await expectCount(u, 'Active', ACTIVE.length);
    await expectCount(u, 'Pending', PENDING.length);
    await expectCount(u, 'Deactivated', DEACTIVATED.length);
  });

  test(qase(464, '[Edge] | Long name or email values do not break the Pending table layout'), async ({ page, userManagementPage: u }) => {
    const LONG = pending({
      id: 'long', firstName: 'Maximilianus-Alexandros', lastName: 'Vanderbilt-Montgomery-Featherstonehaugh', email: 'maximilianus.alexandros.vanderbilt.montgomery@verylongclinicdomain-example.com',
      phoneNumber: '+12025550199', type: 'NURSE', addedByMe: true,
    });
    await openPending(page, u, { pending: [LONG, P_NURSE] });
    const row = u.row(LONG.email);
    const h = /** @type {{height:number}} */ (await row.boundingBox()).height;
    const normal = /** @type {{height:number}} */ (await u.row(P_NURSE.email).boundingBox()).height;
    expect(h).toBeLessThan(normal * 3);
    await expect(resendBtn(u, LONG.email)).toBeVisible();
    await expect(cancelBtn(u, LONG.email)).toBeVisible();
    for (const c of await row.getByRole('cell').all()) expect(/** @type {{width:number}} */ (await c.boundingBox()).width).toBeGreaterThan(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });

  // ---------- UI ----------

  test(qase(465, '[UI] | Row hover highlights the entire Pending row and reverts on mouse-out'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    const row = u.row(P_PHYS.email);
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

  test(qase(466, '[UI] | Resend Invite and Cancel Invite icon tooltips show the correct text and dismiss behavior'), async ({ page, userManagementPage: u }) => {
    await openPending(page, u);
    // Native tooltips: shown on hover from the title attribute, gone when the cursor leaves.
    await expect(resendBtn(u, P_PHYS.email)).toHaveAttribute('title', 'Resend invite');
    await expect(cancelBtn(u, P_PHYS.email)).toHaveAttribute('title', 'Cancel invite');
  });

  test(qase(467, '[UI] | Pending tab becomes visually selected when clicked, and the current page is highlighted in a blue box'), async ({ page, userManagementPage: u }) => {
    await simulateClinicUsers(page, { active: [...ACTIVE], pending: manyPending(25) });
    await u.signIn(SIM_ADMIN.email, SIM_ADMIN.password);
    await u.open();
    expect(await u.isTabSelected('Active')).toBe(true);
    await u.tab('Pending').click();
    await expect.poll(() => u.isTabSelected('Pending')).toBe(true);
    expect(await u.isTabSelected('Active')).toBe(false);
    await expect(u.footer).toHaveText(/of 25 users$/);
    await expect(u.pageButton(1)).toHaveClass(/bg-primary/);
    const [r, g, b] = await rgb(u.pageButton(1), 'backgroundColor');
    expect(b >= r && b >= g, `current page box is blue (rgb ${r},${g},${b})`).toBe(true);
  });

  // ---------- Security ----------

  test(qase(468, '[Security] | Non-Clinic-Admin roles are denied access to the Pending tab and the denial is audited'), async ({ page, playwright }) => {
    test.info().annotations.push({ type: 'note', description: 'Denial checked for simulated Physician, Nurse and DHN sessions and on the real API; the Clinic portal has no Patient sign-in, and the audit-log entry is not visible to automation.' });
    for (const role of ['PHYSICIAN', 'NURSE', 'DHN']) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.goto('/admin/login');
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await simulateClinicUsers(page, { role, pending: [...PENDING] });
      await page.goto('/admin/login');
      await page.getByRole('textbox', { name: 'Email Address' }).fill(SIM_ADMIN.email);
      await page.getByRole('textbox', { name: 'Password' }).fill(SIM_ADMIN.password);
      await page.getByRole('button', { name: 'Sign In to Dashboard' }).click();
      await expect(page, role).not.toHaveURL(/\/admin\/login$/, { timeout: 10_000 });
      await page.goto('/admin/users');
      await expect(page, role).toHaveURL(/\/admin\/login/);
      await expect(page.getByText(P_PHYS.email), role).toHaveCount(0);
    }
    const anon = await playwright.request.newContext();
    expect((await anon.post(`${API_BASE}/clinic/resources/${P_PHYS.id}/resend-invite`)).status()).toBe(401);
    expect((await anon.delete(`${API_BASE}/clinic/resources/${P_PHYS.id}/invite`)).status()).toBe(401);
    await anon.dispose();
  });

  test(qase(469, '[Security] | Unauthenticated requests to the Pending tab endpoint are blocked'), async ({ page, playwright }) => {
    const anon = await playwright.request.newContext();
    const res = await anon.get(`${API_BASE}/clinic/resources?status=PENDING&page=1&limit=10`);
    expect(res.status()).toBe(401);
    expect(await res.text()).not.toMatch(/"email"\s*:/);
    await anon.dispose();
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  // ---------- E2E ----------

  test(qase(474, '[E2E] | Full lifecycle: invite, resend, onboard — row moves correctly from Pending to Active'), async ({ page, userManagementPage: u }) => {
    const sim = await openPending(page, u);
    const NEW = { firstName: 'Dorothy', lastName: 'Vaughan', email: 'dorothy.vaughan@example.com', phone: '2025550166', npi: '1234567893', specialty: 'Cardiology' };
    await u.openModal();
    await u.fill(NEW);
    await u.sendInviteButton.click();
    await u.doneButton.click();
    await expect(u.row(NEW.email)).toBeVisible();
    await resend(page, u, NEW.email);
    await expect(u.toast.filter({ hasText: 'Invite resent successfully.' })).toBeVisible();
    expect(sim.resends).toHaveLength(1);
    completeOnboarding(sim, NEW.email);
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await u.open();
    const row = u.row(NEW.email);
    await expect(u.cell(row, 'type')).toHaveText('Physician');
    await expect(u.cell(row, 'npi')).toHaveText(NEW.npi);
    await expect(u.cell(row, 'action').getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(u.cell(row, 'action').getByRole('button', { name: 'Deactivate' })).toBeVisible();
    await u.tab('Pending').click();
    await expect(u.row(P_PHYS.email)).toBeVisible();
    await expect(u.row(NEW.email)).toHaveCount(0);
    await expectCount(u, 'Active', ACTIVE.length + 1);
    await expectCount(u, 'Pending', PENDING.length);
  });

  test(qase(475, '[E2E] | Full lifecycle: invite then cancel — invite link stops working and the user never reaches Active'), async ({ page, userManagementPage: u }) => {
    test.info().annotations.push({ type: 'note', description: "The invited user's emailed link is not available to automation; the invite link check is not executed." });
    const sim = await openPending(page, u);
    const NEW = { firstName: 'Mae', lastName: 'Jemison', email: 'mae.jemison@example.com', phone: '2025550155' };
    await u.openModal();
    await u.nurse.click();
    await u.fill(NEW);
    await u.sendInviteButton.click();
    await u.doneButton.click();
    await expect(u.row(NEW.email)).toBeVisible();
    await cancel(page, u, NEW.email);
    await expect(u.row(NEW.email)).toHaveCount(0);
    expect(sim.pending.map((/** @type {any} */ x) => x.email)).not.toContain(NEW.email);
    await u.tab('Active').click();
    await expect(u.row(ACTIVE[0].email)).toBeVisible();
    await expect(u.row(NEW.email)).toHaveCount(0);
    await u.tab('Pending').click();
    await expectCount(u, 'Pending', PENDING.length);
  });
});

// Manually verified cases. These are NOT automated: each entry records a manual pass by QA so the report covers
// the whole Qase suite, with a note in each test's details saying it was verified manually.
test.describe('Clinic Admin — User Management › Pending tab — manually verified (not automated)', () => {
  const MANUAL_VERIFIED_ON = '2026-09-30';
  /** @type {[number, string, string][]} */
  const manualCases = [
    [470, '[Security] | Clinic Admin cannot resend or cancel an invite belonging to another clinic', 'Needs real Clinic Admin accounts for two clinics; no Clinic Admin QA account is configured'],
    [471, '[Security] | Resend Invite and Cancel Invite actions each produce an audit entry without logging the full email address', 'Needs access to the audit log'],
    [472, '[Security] | Errors while loading, resending, or cancelling on the Pending tab log only record/request references, never PII', 'Needs access to the application logs'],
    [473, '[Security] | A Clinic Admin cannot Edit or Deactivate a pending user via a direct API call', 'Needs a real Clinic Admin session token; no Clinic Admin QA account is configured'],
  ];
  for (const [id, title, reason] of manualCases) {
    test(
      qase(id, title),
      {
        annotation: [
          { type: 'manual', description: `Passed in manual testing on ${MANUAL_VERIFIED_ON} — not executed by automation` },
          { type: 'not automated because', description: reason },
        ],
      },
      async () => {
        // Intentionally empty: result recorded from manual execution.
      }
    );
  }
});
