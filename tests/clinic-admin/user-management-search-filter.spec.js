// @ts-check
// Qase: HTM › Clinic Admin › User Management › Search and Filter (suite 31). Titles carry Qase IDs.
// Runs on the Clinic Admin portal (CLINIC_ADMIN_BASE_URL).
//
// The Clinic Admin session and the user list are SIMULATED (fixtures/clinicUsersSim.js): no Clinic Admin QA account is
// configured. The simulated list API filters by status / role / added-by and searches name or email (case-insensitive
// substring), 10 per page — so these tests check what the portal asks for and how it shows the answer; the server's own
// search rules are not exercised. As in QA, invites the Super Admin sent to the clinic are listed on Pending.
// Real-server checks: HTM-1856 (the list API refuses requests without a session).
// Aligned to the app where Qase differs (user confirmed): switching tabs resets search and filters; the Deactivated
// Added By menu includes "All"; a failed filter load keeps the last loaded rows; Super-Admin invites are listed on
// Pending as "Super Admin". HTM-1809 (subtext) and HTM-1862 (placeholder) still assert the Qase wording and fail by design.
import { test, expect } from '../../fixtures/pages.js';
import { simulateClinicUsers, simUser, SIM_ADMIN } from '../../fixtures/clinicUsersSim.js';
import { qase } from 'playwright-qase-reporter';

const { CLINIC_ADMIN_BASE_URL = 'https://clinic.qa.healthtelematix.com' } = process.env;
const API_BASE = 'https://api.qa.healthtelematix.com/api/v1';

let seq = 0;
const u_ = (/** @type {string} */ first, /** @type {string} */ last, /** @type {'PHYSICIAN'|'NURSE'|'DHN'} */ type, /** @type {boolean} */ addedByMe, extra = {}) =>
  simUser({
    id: `s${++seq}`, firstName: first, lastName: last, email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com',
    phoneNumber: `+1202555${String(1000 + seq)}`, type, addedByMe,
    ...(type === 'PHYSICIAN' ? { npi: '1234567893', specialties: ['Cardiology'] } : {}), ...extra,
  });
const pend = (/** @type {Parameters<typeof u_>} */ ...a) => ({ canResend: true, ...u_(a[0], a[1], a[2], a[3], { status: 'PENDING', ...a[4] }) });
const deact = (/** @type {Parameters<typeof u_>} */ ...a) => ({ ...u_(a[0], a[1], a[2], a[3], { status: 'DEACTIVATED', ...a[4] }), deactivatedOn: '2026-09-01T15:00:00Z' });

const SARAH_T = u_('Sarah', 'Thompson', 'NURSE', true, { email: 's.t@clinic.com' });
const ACTIVE = [
  SARAH_T,
  u_('Sarah', 'Kim', 'PHYSICIAN', false),
  u_('James', 'Hartwell', 'PHYSICIAN', true),
  u_('Priya', 'Nair', 'PHYSICIAN', false),
  u_('Omar', 'Diaz', 'DHN', true),
  u_('Liam', 'Brooks', 'NURSE', false),
  u_('Nina', 'Patel', 'DHN', false),
];
const P_SARAH_T = pend('Sarah', 'Thompson', 'NURSE', true, { email: 'sarah.thompson.invite@example.com' });
const P_SARAH_K = pend('Sarah', 'Kim', 'PHYSICIAN', true, { email: 'sarah.kim.invite@example.com' });
const P_SA = pend('Mary', 'Jackson', 'NURSE', false);
const PENDING = [P_SARAH_T, P_SARAH_K, pend('Victor', 'Hugo', 'DHN', true), P_SA];
const JOHN_PARK = deact('John', 'Park', 'NURSE', true);
const JOHN_LEE = deact('John', 'Lee', 'PHYSICIAN', false);
const DEACTIVATED = [JOHN_PARK, JOHN_LEE, deact('Alan', 'Turing', 'DHN', false), deact('Grace', 'Hopper', 'PHYSICIAN', true)];

/** n users named `${prefix}NN Test`. @param {number} n @param {string} prefix @param {(i:number)=>boolean} [mine] */
const bulk = (n, prefix, status = 'ACTIVE', mine = () => true, type = /** @type {'NURSE'|'PHYSICIAN'|'DHN'} */ ('NURSE')) =>
  Array.from({ length: n }, (_, i) => {
    const x = u_(`${prefix}${String(i + 1).padStart(2, '0')}`, 'Test', type, mine(i), { email: `${prefix.toLowerCase()}${i + 1}@example.com`, status });
    return status === 'DEACTIVATED' ? { ...x, deactivatedOn: '2026-09-01T15:00:00Z' } : status === 'PENDING' ? { ...x, canResend: true } : x;
  });

test.use({ baseURL: CLINIC_ADMIN_BASE_URL });
test.describe.configure({ timeout: 60_000 });

test.describe('Clinic Admin — User Management › Search and filter', () => {
  /** Signed-in Clinic Admin on User Management, on `tab`. Data is copied so tests never touch the shared arrays. */
  const open = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ u, tab = /** @type {'Active'|'Pending'|'Deactivated'} */ ('Active'), opts = {}) => {
    const o = /** @type {any} */ ({ active: ACTIVE, pending: PENDING, deactivated: DEACTIVATED, ...opts });
    const sim = await simulateClinicUsers(page, { ...o, active: [...o.active], pending: [...o.pending], deactivated: [...o.deactivated] });
    await u.signIn(SIM_ADMIN.email, SIM_ADMIN.password);
    await u.open();
    if (tab !== 'Active') await u.tab(tab).click();
    await expect.poll(() => u.isTabSelected(tab)).toBe(true);
    const key = { Active: 'active', Pending: 'pending', Deactivated: 'deactivated' }[tab];
    const first = /** @type {any[]} */ (sim[key])[0];
    if (first) await expect(u.row(first.email)).toBeVisible();
    return sim;
  };
  const emails = async (/** @type {any} */ u) => (await u.rows.allInnerTexts()).map((t) => t.match(/\S+@\S+\.\w+/)?.[0]).filter(Boolean);
  const sorted = (/** @type {any[]} */ xs) => xs.map((x) => x.email).sort();
  /** Shown rows equal exactly `xs` (single page). */
  const expectRows = async (/** @type {any} */ u, /** @type {any[]} */ xs) => {
    await expect(u.rows).toHaveCount(xs.length);
    await expect.poll(async () => (await emails(u)).sort()).toEqual(sorted(xs));
  };
  const total = (/** @type {any} */ u, /** @type {number} */ n) => expect(u.footer).toHaveText(new RegExp(`of ${n} users?$`));
  /** An option in the open filter menu (menu items follow their trigger). */
  const option = (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ name) => page.getByRole('main').getByRole('button', { name, exact: true }).last();
  /** Selected menu option: tinted background plus a checkmark. */
  const isChosen = async (/** @type {import('@playwright/test').Locator} */ opt) =>
    /bg-primary\/5/.test((await opt.getAttribute('class')) ?? '') && (await opt.locator('svg').count()) > 0;
  const addedByButton = (/** @type {import('@playwright/test').Page} */ page) => page.getByRole('main').getByRole('button', { name: 'Added By', exact: true });
  const typeOf = (/** @type {any} */ u, /** @type {import('@playwright/test').Locator} */ row) => u.cell(row, 'type').innerText();
  const addedByOf = (/** @type {any} */ u, /** @type {import('@playwright/test').Locator} */ row) => u.cell(row, 'addedBy').innerText();
  /** Canvas-normalised rgb of a CSS colour. */
  const rgb = (/** @type {import('@playwright/test').Locator} */ el, /** @type {'color'|'backgroundColor'} */ prop = 'color') =>
    el.evaluate((node, p) => {
      const c = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 1, 1);
      c.fillStyle = getComputedStyle(node)[p];
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data];
    }, prop);
  const byMe = (/** @type {any} */ x) => x.invitedByRole === 'CLINIC_ADMIN';

  // ---------- Smoke ----------

  test(qase(1803, '[SMOKE] | Typing in the search bar filters the table live by partial match on Name'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.searchInput.pressSequentially('sarah');
    await expectRows(u, ACTIVE.filter((x) => x.firstName === 'Sarah'));
    await expect(u.row(SARAH_T.email)).toBeVisible();
  });

  test(qase(1804, '[SMOKE] | Selecting a User Type filter option immediately filters the table and updates the footer count'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Physician');
    const phys = ACTIVE.filter((x) => x.type === 'PHYSICIAN');
    await expectRows(u, phys);
    await total(u, phys.length);
    await expect(option(page, 'Registered Nurse')).toHaveCount(0); // menu closed
    await expect(u.userTypeFilter).toHaveText('Physician');
  });

  test(qase(1805, '[SMOKE] | Combining search text with both filters narrows results by the intersection of all active criteria'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Physician');
    await u.filterAddedBy('You');
    await u.searchInput.fill('hart');
    await expectRows(u, ACTIVE.filter((x) => x.type === 'PHYSICIAN' && byMe(x) && /hart/i.test(x.fullName)));
    await u.searchInput.fill('sarah'); // Sarah Kim is a Physician but added by Super Admin; Sarah Thompson is a Nurse
    await expect(u.noResults).toBeVisible();
  });

  test(qase(1806, '[SMOKE] | Search and filter state is independent per tab and does not carry over when switching tabs'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Physician');
    await u.filterAddedBy('You');
    await u.searchInput.fill('hart');
    await expect(u.rows).toHaveCount(1);
    await u.tab('Pending').click();
    await expectRows(u, PENDING);
    await expect(addedByButton(page)).toHaveCount(0);
    // Returning to Active starts fresh: the app resets search and filters on every tab switch.
    await u.tab('Active').click();
    await expect(u.searchInput).toHaveValue('');
    await expect(u.userTypeFilter).toHaveText('User Type');
    await expect(u.addedByFilter).toHaveText('Added By');
    await expectRows(u, ACTIVE);
  });

  test(qase(1807, '[SMOKE] | Pending tab shows the User Type filter only, with no Added By filter'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Pending');
    await expect(u.userTypeFilter).toHaveText('User Type');
    await expect(u.addUserButton).toHaveText(/Add New (Physician|User)/);
    await expect(addedByButton(page)).toHaveCount(0);
  });

  test(qase(1808, '[SMOKE] | Deactivated tab Added By filter offers only You and Super Admin'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated');
    await u.addedByFilter.click();
    // The menu offers All (the default), Super Admin and You.
    await expect(option(page, 'All').locator('xpath=..').getByRole('button')).toHaveText(['All', 'Super Admin', 'You']);
    expect(await isChosen(option(page, 'All'))).toBe(true);
  });

  // ---------- Functional ----------

  test(qase(1809, '[Functional] | Header and subtext render correctly; tabs show no badge count and Active is selected by default'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    for (const t of /** @type {const} */ (['Active', 'Pending', 'Deactivated'])) await expect(u.tab(t).locator('span')).toHaveCount(0);
    expect(await u.isTabSelected('Active')).toBe(true);
    await expect(u.heading).toHaveText('User Management');
    await expect(u.headerSubtext).toHaveText('Manage physicians, nurses, and digital health navigators.');
  });

  test(qase(1810, '[Functional] | Active and Deactivated tabs show search bar, User Type, Added By and blue Add New Physician button in that order'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    const x = async (/** @type {import('@playwright/test').Locator} */ l) => /** @type {{x:number}} */ (await l.boundingBox()).x;
    for (const t of /** @type {const} */ (['Active', 'Deactivated'])) {
      await u.tab(t).click();
      await expect(u.addedByFilter).toBeVisible();
      const order = [await x(u.searchInput), await x(u.userTypeFilter), await x(u.addedByFilter), await x(u.addUserButton)];
      expect(order, t).toEqual([...order].sort((a, b) => a - b));
      const [r, g, b] = await rgb(u.addUserButton, 'backgroundColor');
      expect(b > r && b > g, `${t}: add button is blue`).toBe(true);
    }
  });

  test(qase(1811, '[Functional] | Hovering over any table row highlights it with light grey'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    const row = u.row(SARAH_T.email);
    await page.mouse.move(0, 0);
    const before = JSON.stringify(await rgb(row, 'backgroundColor'));
    await row.hover();
    await expect.poll(async () => JSON.stringify(await rgb(row, 'backgroundColor'))).not.toBe(before);
    const [r, g, b] = await rgb(row, 'backgroundColor');
    expect(Math.max(r, g, b) - Math.min(r, g, b), 'light grey').toBeLessThan(15);
  });

  test(qase(1812, '[Functional] | Clicking into the search bar shows a blinking cursor'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.searchInput.click();
    await expect(u.searchInput).toBeFocused();
    expect(await u.searchInput.evaluate((e) => getComputedStyle(e).caretColor)).not.toBe('transparent');
    await page.keyboard.type('x');
    await expect(u.searchInput).toHaveValue('x');
  });

  test(qase(1813, '[Functional] | Search matches partial text in Name, case-insensitively'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    for (const term of ['sarah', 'SARAH', 'arah']) {
      await u.searchInput.fill(term);
      await expect(u.row(SARAH_T.email), term).toBeVisible();
      await expectRows(u, ACTIVE.filter((x) => x.firstName === 'Sarah'));
    }
  });

  test(qase(1814, '[Functional] | User Type dropdown lists All Types, Physician, Registered Nurse, and Digital Health Navigator'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.userTypeFilter.click();
    for (const o of ['All Types', 'Physician', 'Registered Nurse', 'Digital Health Navigator']) await expect(option(page, o)).toBeVisible();
    const menu = option(page, 'All Types').locator('xpath=..');
    await expect(menu.getByRole('button')).toHaveText(['All Types', 'Physician', 'Registered Nurse', 'Digital Health Navigator']);
  });

  test(qase(1815, '[Functional] | "All Types" is selected by default, shown highlighted grey with a checkmark'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.userTypeFilter.click();
    expect(await isChosen(option(page, 'All Types'))).toBe(true);
    expect(await isChosen(option(page, 'Physician'))).toBe(false);
    const [r, g, b] = await rgb(option(page, 'All Types'), 'backgroundColor');
    expect(Math.max(r, g, b) - Math.min(r, g, b), 'grey highlight').toBeLessThan(20);
  });

  test(qase(1816, '[Functional] | Only one User Type option can be selected at a time'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Physician');
    await u.filterUserType('Registered Nurse');
    await expect(u.userTypeFilter).toHaveText('Registered Nurse');
    await expectRows(u, ACTIVE.filter((x) => x.type === 'NURSE'));
    await u.userTypeFilter.click();
    expect(await isChosen(option(page, 'Registered Nurse'))).toBe(true);
    expect(await isChosen(option(page, 'Physician'))).toBe(false);
  });

  test(qase(1817, '[Functional] | Active tab Added By dropdown lists All, Super Admin, and You'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.addedByFilter.click();
    await expect(option(page, 'All').locator('xpath=..').getByRole('button')).toHaveText(['All', 'Super Admin', 'You']);
  });

  test(qase(1818, '[Functional] | "All" is selected by default in Active tab Added By, shown highlighted grey with a checkmark'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.addedByFilter.click();
    expect(await isChosen(option(page, 'All'))).toBe(true);
    expect(await isChosen(option(page, 'You'))).toBe(false);
    const [r, g, b] = await rgb(option(page, 'All'), 'backgroundColor');
    expect(Math.max(r, g, b) - Math.min(r, g, b), 'grey highlight').toBeLessThan(20);
  });

  test(qase(1819, '[Functional] | Only one Added By option can be selected at a time'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterAddedBy('You');
    await u.filterAddedBy('Super Admin');
    await expect(u.addedByFilter).toHaveText('Super Admin');
    await expectRows(u, ACTIVE.filter((x) => !byMe(x)));
    await u.addedByFilter.click();
    expect(await isChosen(option(page, 'Super Admin'))).toBe(true);
    expect(await isChosen(option(page, 'You'))).toBe(false);
  });

  test(qase(1820, '[Functional] | Selecting an Added By option immediately filters, updates the footer count, closes the dropdown, and updates the button label'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterAddedBy('You');
    const mine = ACTIVE.filter(byMe);
    await expectRows(u, mine);
    await total(u, mine.length);
    await expect(page.getByRole('main').getByRole('button', { name: 'Super Admin', exact: true })).toHaveCount(0);
    await expect(u.addedByFilter).toHaveText('You');
    for (const row of await u.rows.all()) expect(await addedByOf(u, row)).toBe('You');
  });

  test(qase(1821, '[Functional] | Resetting filters to "All"/"All Types" on the Active tab restores defaults'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Digital Health Navigator');
    await u.filterAddedBy('Super Admin');
    await expectRows(u, ACTIVE.filter((x) => x.type === 'DHN' && !byMe(x)));
    await u.filterUserType('All Types');
    await expect(u.userTypeFilter).toHaveText('User Type');
    await expectRows(u, ACTIVE.filter((x) => !byMe(x)));
    await u.filterAddedBy('All');
    await expect(u.addedByFilter).toHaveText('Added By');
    await expectRows(u, ACTIVE);
  });

  test(qase(1822, '[Functional] | Clearing the search bar text immediately restores results to whatever the active filters currently allow'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Physician');
    await u.searchInput.fill('sarah');
    await expectRows(u, ACTIVE.filter((x) => x.type === 'PHYSICIAN' && x.firstName === 'Sarah'));
    await u.searchInput.fill('');
    await expectRows(u, ACTIVE.filter((x) => x.type === 'PHYSICIAN'));
    await expect(u.userTypeFilter).toHaveText('Physician');
  });

  test(qase(1823, '[Functional] | The Add New Physician button and tab structure remain unaffected by search/filter state'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Physician');
    await u.filterAddedBy('You');
    await u.searchInput.fill('hart');
    await expect(u.rows).toHaveCount(1);
    await expect(u.addUserButton).toBeVisible();
    await expect(u.addUserButton).toBeEnabled();
    await expect(u.addUserButton).toHaveText(/Add New (Physician|User)/);
    for (const t of /** @type {const} */ (['Active', 'Pending', 'Deactivated'])) await expect(u.tab(t)).toHaveText(t);
    expect(await u.isTabSelected('Active')).toBe(true);
  });

  test(qase(1824, '[Functional] | Pending list filters by the selected User Type'), async ({ page, userManagementPage: u }) => {
    const nurses = bulk(12, 'Nurse', 'PENDING');
    await open(page, u, 'Pending', { pending: [...nurses, ...bulk(5, 'Doc', 'PENDING', () => true, 'PHYSICIAN')] });
    await u.filterUserType('Registered Nurse');
    await expect(u.userTypeFilter).toHaveText('Registered Nurse');
    await total(u, nurses.length);
    for (const row of await u.rows.all()) expect(await typeOf(u, row)).toBe('Registered Nurse');
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]12 of 12 users$/);
    for (const row of await u.rows.all()) expect(await typeOf(u, row)).toBe('Registered Nurse');
  });

  test(qase(1825, '[Functional] | Pending list never shows Super Admin-added users'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Pending');
    // An invite the Super Admin sent to the clinic is listed, labelled "Super Admin", only under its own user type.
    for (const t of ['All Types', 'Physician', 'Registered Nurse', 'Digital Health Navigator']) {
      await u.filterUserType(t);
      const shown = t === 'All Types' || t === 'Registered Nurse';
      await expect(u.row(P_SA.email), t).toHaveCount(shown ? 1 : 0);
      if (shown) await expect(u.cell(u.row(P_SA.email), 'addedBy'), t).toHaveText('Super Admin');
      for (const row of await u.rows.all()) {
        const mail = await u.cell(row, 'email').innerText();
        expect(await addedByOf(u, row), mail).toBe(mail === P_SA.email ? 'Super Admin' : 'You');
      }
    }
  });

  test(qase(1826, '[Functional] | Pending ADDED BY column shows the Clinic Admin\'s name — needs confirmation'), async ({ page, userManagementPage: u }) => {
    test.info().annotations.push({ type: 'note', description: 'Open question in Qase; the app shows "You" for the Clinic Admin\'s own invites (the existing Pending behaviour).' });
    await open(page, u, 'Pending');
    for (const x of PENDING.filter(byMe)) await expect(u.cell(u.row(x.email), 'addedBy')).toHaveText('You');
  });

  test(qase(1827, '[Functional] | Deactivated Added By You shows only users added by the Clinic Admin'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated');
    await u.filterAddedBy('You');
    const mine = DEACTIVATED.filter(byMe);
    await expectRows(u, mine);
    await total(u, mine.length);
    await expect(u.addedByFilter).toHaveText('You');
    await expect(page.getByRole('main').getByRole('button', { name: 'Super Admin', exact: true })).toHaveCount(0);
  });

  test(qase(1828, '[Functional] | Deactivated Added By Super Admin shows only Super Admin-added users'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated');
    await u.filterAddedBy('Super Admin');
    const theirs = DEACTIVATED.filter((x) => !byMe(x));
    await expectRows(u, theirs);
    await total(u, theirs.length);
    await expect(u.addedByFilter).toHaveText('Super Admin');
  });

  test(qase(1829, '[Functional] | Deactivated User Type and Added By filters combine as an intersection'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated');
    await u.filterAddedBy('Super Admin');
    await expectRows(u, DEACTIVATED.filter((x) => !byMe(x)));
    await u.filterUserType('Physician');
    const both = DEACTIVATED.filter((x) => !byMe(x) && x.type === 'PHYSICIAN');
    await expectRows(u, both);
    await total(u, both.length);
  });

  test(qase(1830, '[Functional] | Deactivated footer and pagination reflect the Added By filtered total'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated', { deactivated: [...bulk(11, 'Mine', 'DEACTIVATED'), ...bulk(6, 'Theirs', 'DEACTIVATED', () => false)] });
    await u.filterAddedBy('You');
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 11 users$/);
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]11 of 11 users$/);
    await expect(u.rows).toHaveCount(1);
  });

  test(qase(1831, '[Functional] | Per-tab filter sets persist after refresh and re-login'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    const check = async () => {
      await u.tab('Pending').click();
      await expect(u.userTypeFilter).toBeVisible();
      await expect(addedByButton(page)).toHaveCount(0);
      await u.tab('Deactivated').click();
      await u.addedByFilter.click();
      await expect(option(page, 'You')).toBeVisible();
      await expect(option(page, 'Super Admin')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.mouse.click(5, 5);
    };
    await check();
    await page.reload();
    await expect(u.heading).toBeVisible();
    await check();
    await page.getByRole('button', { name: 'Log Out' }).click();
    await page.getByRole('dialog', { name: 'Log Out' }).getByRole('button', { name: 'Log Out' }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await u.signIn(SIM_ADMIN.email, SIM_ADMIN.password);
    await u.open();
    await check();
  });

  test(qase(1832, '[Functional] | Search works on the Pending tab'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Pending');
    await u.searchInput.pressSequentially('sarah');
    const hits = PENDING.filter((x) => x.firstName === 'Sarah');
    await expectRows(u, hits);
    await total(u, hits.length);
  });

  test(qase(1833, '[Functional] | Search works on the Deactivated tab'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated');
    await u.searchInput.pressSequentially('park');
    await expectRows(u, [JOHN_PARK]);
    await total(u, 1);
  });

  test(qase(1834, '[Functional] | Search matches last name and full name including a space'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.searchInput.fill('thompson');
    await expectRows(u, [SARAH_T]);
    await u.searchInput.fill('sarah thom');
    await expectRows(u, [SARAH_T]);
  });

  test(qase(1835, '[Functional] | Search-only results update the footer count and pagination'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Active', { active: [...bulk(12, 'Dana'), ...bulk(13, 'Bob')] });
    await u.searchInput.fill('an');
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 12 users$/);
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]12 of 12 users$/);
    await expect(u.rows).toHaveCount(2);
  });

  test(qase(1836, '[Functional] | Clearing search with no filters restores the full tab list'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.searchInput.fill('sarah');
    await expect(u.rows).toHaveCount(2);
    await u.searchInput.fill('');
    await expectRows(u, ACTIVE);
    await total(u, ACTIVE.length);
  });

  test(qase(1837, '[Functional] | Search combined with Pending User Type filter returns the intersection'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Pending');
    await u.searchInput.fill('sarah');
    await expectRows(u, [P_SARAH_T, P_SARAH_K]);
    await u.filterUserType('Registered Nurse');
    await expectRows(u, [P_SARAH_T]);
    await total(u, 1);
  });

  test(qase(1838, '[Functional] | Search combined with Deactivated Added By filter returns the intersection'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated');
    await u.searchInput.fill('john');
    await expectRows(u, [JOHN_PARK, JOHN_LEE]);
    await u.filterAddedBy('You');
    await expectRows(u, [JOHN_PARK]);
    await total(u, 1);
  });

  // ---------- Negative ----------

  test(qase(1839, '[Negative] | Zero matching search/filter results show "No results found" in place of table rows'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.searchInput.fill('zzzz-no-match');
    await expect(u.noResults).toBeVisible();
    await expect(u.row('@')).toHaveCount(0);
    await u.searchInput.fill('');
    await u.filterUserType('Digital Health Navigator');
    await u.filterAddedBy('You');
    await u.searchInput.fill('nina'); // Nina is a DHN added by Super Admin
    await expect(u.noResults).toBeVisible();
  });

  test(qase(1840, '[Negative] | Search and filter criteria never apply across multiple tabs simultaneously'), async ({ page, userManagementPage: u }) => {
    const sim = await open(page, u);
    await u.searchInput.fill('sarah'); // matches Sarahs on Active and Pending
    await expectRows(u, ACTIVE.filter((x) => x.firstName === 'Sarah'));
    expect(await emails(u)).not.toContain(P_SARAH_T.email);
    expect(await emails(u)).not.toContain(P_SARAH_K.email);
    expect(sim.listCalls.filter((c) => c.search).every((c) => c.status === 'ACTIVE')).toBe(true);
  });

  test(qase(1841, '[Negative] | Search/filter backend errors, if applicable, keep the user informed rather than silently failing'), async ({ page, userManagementPage: u }) => {
    const sim = await open(page, u);
    sim.searchStatus = 503;
    await u.searchInput.fill('sarah');
    await expect(u.toast.filter({ hasText: /temporarily unavailable|Something went wrong|Failed to load/ })).toBeVisible();
    await expect(page.getByText(/Unexpected Application Error/)).toHaveCount(0);
    sim.searchStatus = 200;
    await u.searchInput.fill('');
    await u.searchInput.fill('sarah');
    await expectRows(u, ACTIVE.filter((x) => x.firstName === 'Sarah'));
  });

  test(qase(1842, '[Negative] | Added By cannot be forced onto the Pending tab via URL or API parameter'), async ({ page, userManagementPage: u }) => {
    test.info().annotations.push({ type: 'note', description: 'URL part checked; the direct API part needs a real Clinic Admin session token.' });
    const sim = await open(page, u, 'Pending');
    await page.goto('/admin/users?tab=pending&addedBy=superadmin');
    await expect(u.heading).toBeVisible();
    await u.tab('Pending').click();
    await expect(addedByButton(page)).toHaveCount(0);
    await expectRows(u, PENDING);
    expect(sim.listCalls.filter((c) => c.status === 'PENDING').every((c) => !c.addedBy)).toBe(true);
  });

  test(qase(1843, '[Negative] | User added by Super Admin never lands in Pending'), async ({ page, userManagementPage: u }) => {
    const sim = await open(page, u, 'Pending', { pending: PENDING.filter(byMe) });
    const z = PENDING.filter(byMe).length;
    await total(u, z);
    // The Super Admin adds a Physician to this clinic: it is created as an invite to the clinic.
    sim.pending.push(pend('Katherine', 'Johnson', 'PHYSICIAN', false));
    await page.reload();
    await u.tab('Pending').click();
    // The Super Admin's invite is listed on Pending, marked "Super Admin", and the total goes up by one.
    await expect(u.row('katherine.johnson@example.com')).toBeVisible();
    await expect(u.cell(u.row('katherine.johnson@example.com'), 'addedBy')).toHaveText('Super Admin');
    await total(u, z + 1);
  });

  test(qase(1844, '[Negative] | Deactivated Added By filter API failure shows error and no stale rows'), async ({ page, userManagementPage: u }) => {
    const sim = await open(page, u, 'Deactivated');
    sim.listStatus = 503;
    await u.filterAddedBy('You');
    await expect(u.toast.filter({ hasText: /temporarily unavailable|Something went wrong|Failed to load/ })).toBeVisible();
    expect(await u.isTabSelected('Deactivated')).toBe(true);
    await expect(u.addedByFilter).toHaveText('You');
    // The app keeps showing the last loaded list (and its total) rather than a blank or broken table.
    await expectRows(u, DEACTIVATED);
    await total(u, DEACTIVATED.length);
    await expect(page.getByText(/Unexpected Application Error/)).toHaveCount(0);
    // Once the API recovers, choosing the filter again shows the correct filtered list.
    sim.listStatus = 200;
    await u.filterAddedBy('Super Admin');
    await u.filterAddedBy('You');
    await expectRows(u, DEACTIVATED.filter(byMe));
    await total(u, DEACTIVATED.filter(byMe).length);
  });

  test(qase(1845, '[Negative] | Search by email address — expected behaviour needs confirmation'), async ({ page, userManagementPage: u }) => {
    test.info().annotations.push({ type: 'note', description: 'Open question in Qase. The search box is labelled "Search by name or email...", so the name-or-email rule is checked.' });
    await open(page, u);
    await expect(u.searchInput).toHaveAttribute('placeholder', /name or email/i);
    await u.searchInput.fill('clinic.com');
    await expectRows(u, [SARAH_T]);
  });

  test(qase(1846, '[Negative] | Clearing a zero-result search restores the list'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Physician');
    await u.searchInput.fill('zzzz');
    await expect(u.noResults).toBeVisible();
    await u.searchInput.fill('');
    await expect(u.noResults).toHaveCount(0);
    await expectRows(u, ACTIVE.filter((x) => x.type === 'PHYSICIAN'));
  });

  // ---------- Edge ----------

  test(qase(1847, '[Edge] | Filtered pagination reflects the filtered total exactly at the 10/11-row boundary'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Active', { active: [...bulk(10, 'Tenx'), bulk(1, 'Tenz')[0], ...bulk(8, 'Other')] });
    await u.searchInput.fill('tenx');
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 10 users$/);
    await expect(u.nextPage).toBeDisabled();
    await u.searchInput.fill('ten');
    await expect(u.footer).toHaveText(/^Showing 1[–-]10 of 11 users$/);
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]11 of 11 users$/);
    await expect(u.rows).toHaveCount(1);
  });

  test(qase(1848, '[Edge] | Rapid successive keystrokes in search do not cause flickering or stale intermediate results'), async ({ page, userManagementPage: u }) => {
    const sim = await open(page, u);
    const before = sim.listCalls.length;
    await u.searchInput.pressSequentially('thompson', { delay: 20 });
    await expectRows(u, [SARAH_T]);
    await page.waitForTimeout(600);
    const searches = sim.listCalls.slice(before).map((c) => c.search);
    expect(searches.filter(Boolean), 'debounced: no request per keystroke').toEqual(['thompson']);
    await expectRows(u, [SARAH_T]);
  });

  test(qase(1849, '[Edge] | Search input handles leading/trailing whitespace and special characters without breaking'), async ({ page, userManagementPage: u }) => {
    const sim = await open(page, u);
    await u.searchInput.fill('  sarah  ');
    await expectRows(u, ACTIVE.filter((x) => x.firstName === 'Sarah'));
    expect(sim.listCalls.at(-1)?.search).toBe('sarah');
    for (const term of ['.', '+', '*']) {
      await u.searchInput.fill(term);
      await expect.poll(() => sim.listCalls.at(-1)?.search, term).toBe(term);
      await expect(page.getByText(/Unexpected Application Error/)).toHaveCount(0);
      await expect(u.heading).toBeVisible();
    }
    await u.searchInput.fill('+');
    await expect(u.noResults).toBeVisible(); // literal "+" matches nobody
  });

  test(qase(1850, '[Edge] | Deactivated Added By default state and reset without an All option — needs confirmation'), async ({ page, userManagementPage: u }) => {
    test.info().annotations.push({ type: 'note', description: 'Open question in Qase. Observed: default label "Added By" with the full list; reset by choosing "All" (or switching tabs).' });
    await open(page, u, 'Deactivated');
    await expect(u.addedByFilter).toHaveText('Added By');
    await expectRows(u, DEACTIVATED);
    await u.filterAddedBy('You');
    await expectRows(u, DEACTIVATED.filter(byMe));
    await u.filterAddedBy('All');
    await expectRows(u, DEACTIVATED);
    await u.filterAddedBy('You');
    await u.tab('Active').click();
    await u.tab('Deactivated').click();
    await expect(u.addedByFilter).toHaveText('Added By');
    await expectRows(u, DEACTIVATED);
  });

  test(qase(1851, '[Edge] | Deactivated Added By You with only Super Admin-added users shows No results found'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated', { deactivated: DEACTIVATED.filter((x) => !byMe(x)) });
    await u.filterAddedBy('You');
    await expect(u.noResults).toBeVisible();
  });

  test(qase(1852, '[Edge] | Users added by another Clinic Admin of the same clinic — Added By bucket needs confirmation'), async ({ page, userManagementPage: u }) => {
    test.info().annotations.push({ type: 'note', description: 'Open question in Qase. Observed: the portal buckets anything a Clinic Admin added (invitedByRole CLINIC_ADMIN) as "You", including another admin of the same clinic.' });
    const U = deact('Other', 'Adminsuser', 'NURSE', true);
    const V = pend('Pending', 'Adminsinvite', 'NURSE', true);
    await open(page, u, 'Deactivated', { deactivated: [U, JOHN_LEE], pending: [V] });
    await u.filterAddedBy('You');
    await expect(u.row(U.email)).toBeVisible();
    await u.filterAddedBy('Super Admin');
    await expect(u.row(U.email)).toHaveCount(0);
    await u.tab('Pending').click();
    await expect(u.cell(u.row(V.email), 'addedBy')).toHaveText('You');
  });

  test(qase(1853, '[Edge] | Changing Added By while on page 2 returns to page 1 of the new results'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Deactivated', { deactivated: [...bulk(12, 'Mine', 'DEACTIVATED'), ...bulk(4, 'Theirs', 'DEACTIVATED', () => false)] });
    await u.filterAddedBy('You');
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]12 of 12 users$/);
    await u.filterAddedBy('Super Admin');
    await expect(u.footer).toHaveText(/^Showing 1[–-]4 of 4 users$/);
    await expect(u.rows).toHaveCount(4);
  });

  test(qase(1854, '[Edge] | Search while on page 2 returns results from page 1'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Active', { active: [...bulk(3, 'Zed'), ...bulk(22, 'Bob')] });
    await u.nextPage.click();
    await expect(u.footer).toHaveText(/^Showing 11[–-]20 of 25 users$/);
    await u.searchInput.fill('zed');
    await expect(u.footer).toHaveText(/^Showing 1[–-]3 of 3 users$/);
    await expect(u.rows).toHaveCount(3);
  });

  test(qase(1855, '[Edge] | Search of only spaces does not filter the list'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.searchInput.fill('   ');
    await page.waitForTimeout(600);
    await expect(u.noResults).toHaveCount(0);
    await expectRows(u, ACTIVE);
    await expect(page.getByText(/Unexpected Application Error/)).toHaveCount(0);
  });

  // ---------- Security ----------

  test(qase(1856, '[Security] | A user without Clinic Admin permissions is denied when attempting to search or filter, and the denial is audited'), async ({ page, playwright }) => {
    test.info().annotations.push({ type: 'note', description: 'Denial checked on the real API and for a simulated Physician session; the audit-log entry is not visible to automation.' });
    const anon = await playwright.request.newContext();
    expect((await anon.get(`${API_BASE}/clinic/resources?status=ACTIVE&page=1&limit=10&search=sarah&role=PHYSICIAN&addedBy=ME`)).status()).toBe(401);
    await anon.dispose();
    await simulateClinicUsers(page, { role: 'PHYSICIAN', active: [...ACTIVE] });
    await page.goto('/admin/login');
    await page.getByRole('textbox', { name: 'Email Address' }).fill(SIM_ADMIN.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(SIM_ADMIN.password);
    await page.getByRole('button', { name: 'Sign In to Dashboard' }).click();
    await expect(page).not.toHaveURL(/\/admin\/login$/, { timeout: 10_000 });
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('textbox', { name: 'Search by name or email...' })).toHaveCount(0);
  });

  test.skip(qase(1857, "[Security] | Errors while searching or filtering log only record/request references — never the search term or a user's contact details"), { annotation: { type: 'skip', description: 'Needs access to the application logs, which automation cannot read' } }, async () => {});

  test.skip(qase(1858, "[Security] | Deactivated Added By results are scoped to the Clinic Admin's own clinic"), { annotation: { type: 'skip', description: 'Needs real Clinic Admin accounts and data for two clinics; no Clinic Admin QA account is configured' } }, async () => {});

  // ---------- UI ----------

  test(qase(1859, '[UI] | Filter button label updates to reflect the currently selected option for both filters'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await expect(u.userTypeFilter).toHaveText('User Type');
    await expect(u.addedByFilter).toHaveText('Added By');
    await u.filterUserType('Digital Health Navigator');
    await expect(u.userTypeFilter).toHaveText('Digital Health Navigator');
    await u.filterAddedBy('Super Admin');
    await expect(u.addedByFilter).toHaveText('Super Admin');
  });

  test(qase(1860, '[UI] | Selected filter option is visually distinguished in its dropdown with grey highlight and a checkmark'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Registered Nurse');
    await u.userTypeFilter.click();
    expect(await isChosen(option(page, 'Registered Nurse'))).toBe(true);
    for (const o of ['All Types', 'Physician', 'Digital Health Navigator']) expect(await isChosen(option(page, o)), o).toBe(false);
    const [r, g, b] = await rgb(option(page, 'Registered Nurse'), 'backgroundColor');
    expect(Math.max(r, g, b) - Math.min(r, g, b), 'grey highlight').toBeLessThan(20);
  });

  test(qase(1861, '[UI] | Pending control row shows search, User Type and Add New Physician with no gap for the removed filter'), async ({ page, userManagementPage: u }) => {
    await open(page, u, 'Pending');
    await expect(addedByButton(page)).toHaveCount(0);
    const box = async (/** @type {import('@playwright/test').Locator} */ l) => /** @type {{x:number,width:number}} */ (await l.boundingBox());
    const [s, t, a] = [await box(u.searchInput), await box(u.userTypeFilter), await box(u.addUserButton)];
    expect(s.x < t.x && t.x < a.x).toBe(true);
    const gap = a.x - (t.x + t.width);
    expect(gap, 'no empty slot between User Type and the add button').toBeLessThan(24);
    expect(gap).toBeGreaterThanOrEqual(0);
  });

  test(qase(1862, '[UI] | Search bar shows placeholder "Search by Name"'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await expect(u.searchInput).toHaveAttribute('placeholder', 'Search by Name');
    await u.searchInput.pressSequentially('s');
    expect(await u.searchInput.evaluate((e) => e.matches(':placeholder-shown'))).toBe(false);
  });

  // ---------- E2E ----------

  test(qase(1863, '[E2E] | Full lifecycle: apply search and both filters together on Active, verify accurate counts/pagination, then confirm tab isolation'), async ({ page, userManagementPage: u }) => {
    await open(page, u);
    await u.filterUserType('Physician');
    await u.filterAddedBy('You');
    await u.searchInput.fill('jam');
    await expectRows(u, ACTIVE.filter((x) => x.type === 'PHYSICIAN' && byMe(x) && /jam/i.test(x.fullName)));
    await total(u, 1);
    await u.searchInput.fill('');
    const physMine = ACTIVE.filter((x) => x.type === 'PHYSICIAN' && byMe(x));
    await expectRows(u, physMine);
    await total(u, physMine.length);
    await u.filterUserType('All Types');
    await u.filterAddedBy('All');
    await expectRows(u, ACTIVE);
    await u.tab('Pending').click();
    await expectRows(u, PENDING);
    await u.searchInput.fill('nobody-here');
    await expect(u.noResults).toBeVisible();
    await u.tab('Deactivated').click();
    await expectRows(u, DEACTIVATED);
    await u.tab('Active').click();
    await expectRows(u, ACTIVE);
  });

  test(qase(1864, '[E2E] | Clinic Admin-added user found via Pending User Type, then via Deactivated Added By You'), async ({ page, userManagementPage: u }) => {
    const sim = await open(page, u);
    const NEW = { firstName: 'Rosalind', lastName: 'Franklin', email: 'rosalind.franklin@example.com', phone: '2025550177' };
    await u.openModal();
    await u.nurse.click();
    await u.fill(NEW);
    await u.sendInviteButton.click();
    await u.doneButton.click();
    await u.filterUserType('Registered Nurse');
    await expect(u.row(NEW.email)).toBeVisible();
    // Onboarding completes (server side), then the admin deactivates the nurse from Active.
    const i = sim.pending.findIndex((/** @type {any} */ x) => x.email === NEW.email);
    const [nurse] = sim.pending.splice(i, 1);
    sim.active.unshift({ ...nurse, status: 'ACTIVE' });
    await u.tab('Pending').click();
    await expect(u.row(P_SARAH_T.email)).toBeVisible();
    await expect(u.row(NEW.email)).toHaveCount(0);
    await u.tab('Active').click();
    await u.row(NEW.email).getByRole('button', { name: 'Deactivate', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate User' }).click();
    await expect(u.row(NEW.email)).toHaveCount(0);
    await u.tab('Deactivated').click();
    await u.filterAddedBy('You');
    await expect(u.row(NEW.email)).toBeVisible();
    await u.filterAddedBy('Super Admin');
    await expect(u.row(JOHN_LEE.email)).toBeVisible();
    await expect(u.row(NEW.email)).toHaveCount(0);
  });

  test(qase(1865, '[E2E] | Super Admin-added user skips Pending and is found via Deactivated Added By Super Admin'), async ({ page, userManagementPage: u }) => {
    const sim = await open(page, u, 'Pending');
    // The Super Admin adds a Physician to this clinic: an invite to the clinic, listed on Pending until accepted.
    const SA_DOC = pend('Katherine', 'Johnson', 'PHYSICIAN', false);
    sim.pending.push(SA_DOC);
    await page.reload();
    await u.tab('Pending').click();
    await expect(u.row(P_SARAH_T.email)).toBeVisible();
    // Until accepted, the Super Admin's invite is listed on Pending, marked "Super Admin".
    await expect(u.row(SA_DOC.email)).toBeVisible();
    await expect(u.cell(u.row(SA_DOC.email), 'addedBy')).toHaveText('Super Admin');
    // Once active, the admin cannot deactivate a Super-Admin-added user from the UI (no action icons), so the move to
    // Deactivated happens server side.
    sim.pending.splice(sim.pending.indexOf(SA_DOC), 1);
    sim.deactivated.unshift({ ...SA_DOC, status: 'DEACTIVATED', deactivatedOn: new Date().toISOString() });
    await u.tab('Deactivated').click();
    await u.filterAddedBy('Super Admin');
    await expect(u.row(SA_DOC.email)).toBeVisible();
    await u.filterAddedBy('You');
    await expect(u.row(SA_DOC.email)).toHaveCount(0);
  });
});
