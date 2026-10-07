// @ts-check
// Qase: HTM › Super Admin › Clinic Management › Clinic Management - Active Tab (suite 14 — its own 25 cases only;
// the child "Action Button" suite is intentionally not included). Titles carry Qase case IDs.
// Signs in with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env against the QA portal.
//
// Nothing in QA is created or changed:
// - HTM-940, 949, 961 run the real Add New Clinic wizard; only the final "Send Invite" (POST /clinics) is simulated.
// - HTM-951, 962 simulate the deactivation (PATCH /clinics/{id}/deactivate) and the resulting Active list.
// - Pagination (HTM-955), exactly-one (956) and zero (957) cases use a simulated Active list.
import { test, expect } from '../../fixtures/pages.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '', SUPER_ADMIN_PASSWORD = '', SUPER_ADMIN_BASE_URL = '' } = process.env;
const API_BASE = SUPER_ADMIN_BASE_URL.replace('://superadmin.', '://api.') + '/api/v1';
const ACTIVE_LIST = /\/api\/v1\/clinics\?status=ACTIVE/;
const CREATE = /\/api\/v1\/clinics$/;
const DEACTIVATE = /\/api\/v1\/clinics\/[^/]+\/deactivate$/;

/** @type {{ authorization: string, data: Record<string, any[]> }} */
const state = { authorization: '', data: {} };

/** @param {number} i @param {Partial<any>} [over] */
const simClinic = (i, over = {}) => ({
  organizationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  clinicName: `Sim Clinic ${String.fromCharCode(65 + (i % 26))}${i}`,
  email: `sim.clinic.${i}@example.com`,
  phoneNumber: '+12025550143',
  city: 'Austin',
  state: 'TX',
  status: 'ACTIVE',
  clinicAdmin: { userId: `admin-${i}`, name: `Sim Admin${i}`, email: `sim.admin.${i}@example.com` },
  enrolledPatients: 0,
  apcmEnrolled: 0,
  rpmEnrolled: 0,
  createdAt: '2026-09-25T09:00:00.000Z',
  ...over,
});

/**
 * Serves the Active list from `items`, paged like the real API.
 * @param {import('@playwright/test').Page} page
 * @param {any[]} items
 */
async function simulateActiveList(page, items) {
  await page.route(ACTIVE_LIST, (route) => {
    const url = new URL(route.request().url());
    const pageNo = Number(url.searchParams.get('page') || 1);
    const limit = Number(url.searchParams.get('limit') || 10);
    const total = items.length;
    const from = total ? (pageNo - 1) * limit + 1 : 0;
    const data = items.slice((pageNo - 1) * limit, pageNo * limit);
    route.fulfill({ json: { data, meta: { page: pageNo, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), from, to: total ? from + data.length - 1 : 0, counts: {} } } });
  });
}

/**
 * Simulates deactivating clinics: the PATCH succeeds and the (real) Active list omits the deactivated ones.
 * @param {import('@playwright/test').Page} page
 */
async function simulateDeactivation(page) {
  const deactivated = new Set();
  await page.route(DEACTIVATE, async (route) => {
    deactivated.add(new URL(route.request().url()).pathname.split('/').slice(-2)[0]);
    await route.fulfill({ json: { success: true } });
  });
  await page.route(ACTIVE_LIST, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    const before = json.data.length;
    json.data = json.data.filter((/** @type {any} */ c) => !deactivated.has(c.organizationId));
    json.meta.total -= before - json.data.length;
    json.meta.to = json.meta.total ? json.meta.from + json.data.length - 1 : 0;
    await route.fulfill({ response, json });
  });
  return deactivated;
}

/**
 * Simulates a successful "Send Invite" on the Add New Clinic wizard (no clinic is created). After POST /clinics the
 * app assigns resources (POST /clinics/{id}/resources) and loads the new clinic (GET /clinics/{id}); all three are
 * answered for a fake clinic id.
 */
async function simulateCreate(/** @type {import('@playwright/test').Page} */ page) {
  const FAKE = '00000000-0000-4000-8000-00000000c1a1';
  let created;
  await page.route(CREATE, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const b = route.request().postDataJSON();
    created = {
      organizationId: FAKE, clinicName: b.clinicName, email: b.email, phoneNumber: b.phoneNumber, npi: b.npi, tin: b.tin,
      street: b.street, city: b.city, state: b.state, country: b.country, zip: b.zip, status: 'PENDING', emailSent: true,
      clinicAdmin: { userId: 'sim-admin', name: `${b.adminFirstName} ${b.adminLastName}`, email: b.adminEmail },
      enrolledPatients: 0, apcmEnrolled: 0, rpmEnrolled: 0, createdAt: new Date().toISOString(),
    };
    await route.fulfill({ status: 201, json: created });
  });
  await page.route(new RegExp(`/api/v1/clinics/${FAKE}`), (route) =>
    route.fulfill({ json: route.request().method() === 'GET' ? created : { organizationId: FAKE, success: true } })
  );
  return () => created;
}
/** The "Clinic Added Successfully!" confirmation (a plain overlay, not a dialog role). */
const addedConfirmation = (/** @type {import('@playwright/test').Page} */ page) => page.locator('.fixed.inset-0').filter({ hasText: 'Clinic Added Successfully!' });

test.describe('Super Admin — Clinic Management › Active tab', () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, 'Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env');

  test.beforeEach(async ({ page, loginPage, playwright }) => {
    state.authorization = '';
    page.on('request', (r) => {
      const auth = r.headers()['authorization'];
      if (auth && r.url().startsWith(API_BASE)) state.authorization = auth;
    });
    // Safety net: a real POST /clinics or deactivate must never reach QA from this file.
    await page.route(CREATE, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await page.route(DEACTIVATE, (route) => route.abort());
    await loginPage.open();
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect.poll(() => state.authorization).not.toBe('');
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    for (const status of ['ACTIVE', 'PENDING', 'DEACTIVATED']) {
      const j = await (await api.get(`${API_BASE}/clinics?status=${status}&pagination=false`)).json();
      state.data[status] = Array.isArray(j) ? j : j.data;
    }
    await api.dispose();
  });

  /** Opens Clinic Management from the sidebar and waits for the Active list. */
  const openFromSidebar = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ c) => {
    await Promise.all([page.waitForResponse((res) => ACTIVE_LIST.test(res.url())), page.locator('a[href="/clinics"]').click()]);
    await expect(page).toHaveURL(/\/clinics$/);
    await expect(c.rows.first()).not.toHaveText(/Loading/);
  };
  const footerOf = (/** @type {number} */ total) => `Showing ${total ? 1 : 0}–${Math.min(total, 10)} of ${total} clinics`;

  /** Runs the real wizard steps 1–3 and presses "Send Invite" (the create call is simulated). */
  const completeWizard = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ w) => {
    await w.open();
    await w.fillStep1();
    const dups = await w.submitStep1();
    expect(Object.keys(dups).filter((k) => dups[k])).toEqual([]);
    await expect(w.stepHeading).toHaveText('Assign Resources');
    await w.nextButton.click();
    await expect(w.stepHeading).toHaveText('Connect EHR');
    await page.getByRole('button', { name: 'Send Invite' }).click();
  };

  test.describe('@smoke', () => {
    test(qase(938, '[SMOKE] | Active tab loads automatically as the default view with a table of all active clinics'), async ({ page, clinicsPage: c }) => {
      await openFromSidebar(page, c);
      await expect(c.activeTab).toHaveClass(/font-semibold/);
      const all = state.data.ACTIVE;
      await expect(c.rows).toHaveCount(Math.min(all.length, 10));
      await expect(c.footer).toHaveText(footerOf(all.length));
      for (const clinic of all.slice(0, 10)) await expect(c.rowFor(clinic.email)).toBeVisible();
    });

    test(qase(939, '[SMOKE] | No enrollment values are ever blank or dashed for active clinics'), async ({ page, clinicsPage: c }) => {
      await openFromSidebar(page, c);
      const count = await c.rows.count();
      for (let i = 0; i < count; i++) {
        for (const col of [1, 2, 3]) await expect(c.rows.nth(i).locator('td').nth(col)).toHaveText(/^\d+$/);
      }
    });

    test(qase(940, '[SMOKE] | Tapping Back to Clinic on the confirmation modal lands the user on the Active tab, distinct from the automatic Pending redirect right after Send Invite'), async ({ page, addClinicPage: w, clinicsPage: c }) => {
      await simulateCreate(page);
      await completeWizard(page, w);
      const confirm = addedConfirmation(page);
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: /Back to Clinic/ }).click();
      // Accepted app behaviour: "Back to Clinic" returns to the Clinic Management list on the Pending tab,
      // where the newly invited clinic appears.
      await expect(page).toHaveURL(/\/clinics\?tab=PENDING$/);
      await expect(c.pendingTab).toHaveClass(/font-semibold/);
      await expect(confirm).toBeHidden();
    });
  });

  test(qase(941, '[Functional] | Active tab is selected/highlighted by default whenever landing on Clinic Management'), async ({ page, clinicsPage: c }) => {
    for (const from of ['/dashboard', '/resources', '/settings/password']) {
      await page.goto(from);
      await openFromSidebar(page, c);
      await expect(c.activeTab).toHaveClass(/font-semibold/);
      await expect(c.pendingTab).not.toHaveClass(/font-semibold/);
      await expect(c.deactivatedTab).not.toHaveClass(/font-semibold/);
    }
  });

  test(qase(942, '[Functional] | All three tabs display live count badges next to their labels'), async ({ page, clinicsPage: c }) => {
    // Per the case: each tab label carries a live count badge (e.g. "Active 9"). The app shows no badges.
    await openFromSidebar(page, c);
    await expect(page.getByRole('button', { name: new RegExp(`^Active\\s*${state.data.ACTIVE.length}$`) }), 'Active tab should show a count badge').toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`^Pending\\s*${state.data.PENDING.length}$`) }), 'Pending tab should show a count badge').toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`^Deactivated\\s*${state.data.DEACTIVATED.length}$`) }), 'Deactivated tab should show a count badge').toBeVisible();
  });

  test(qase(943, '[Functional] | Search clinic input and Add New Clinic button are aligned top-right alongside the tabs'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const [tab, search, add, table] = await Promise.all([c.activeTab, c.search, c.addNewClinicButton, c.table].map((l) => l.boundingBox()));
    expect(tab && search && add && table).toBeTruthy();
    if (!tab || !search || !add || !table) return;
    for (const b of [search, add]) {
      expect(b.y + b.height).toBeLessThan(table.y);
      expect(Math.abs(b.y + b.height / 2 - (tab.y + tab.height / 2))).toBeLessThan(15);
    }
    const card = await page.locator('main table').locator('xpath=ancestor::div[contains(@class,"rounded")][1]').boundingBox();
    const left = card ? card.x : table.x;
    const right = card ? card.x + card.width : table.x + table.width;
    expect(Math.abs(add.x + add.width - right), 'Add New Clinic should sit at the top-right edge').toBeLessThan(5);
    // Accepted app layout: the Search clinic input sits in the same top row, directly beside the tabs.
    expect(search.x).toBeGreaterThan(tab.x);
    expect(search.x).toBeGreaterThan(left);
    expect(search.x + search.width).toBeLessThan(add.x);
  });

  test(qase(944, '[Functional] | Table columns render in the exact specified order'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const headers = (await c.headers.allInnerTexts()).map((h) => h.trim().toUpperCase());
    // Accepted app layout: an EMAIL ADDRESS (clinic email) column sits between RPM ENROLLED and CLINIC ADMIN.
    expect(headers).toEqual(['CLINIC NAME', 'ENROLLED PATIENTS', 'APCM ENROLLED', 'RPM ENROLLED', 'EMAIL ADDRESS', 'CLINIC ADMIN', 'ACTION']);
    await expect(c.rows.first().locator('td').first().locator('.rounded-full')).toBeVisible();
  });

  test(qase(945, "[Functional] | Clinic Name avatar shows the clinic's first two initials in a distinct pastel color per clinic"), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const count = await c.rows.count();
    for (let i = 0; i < count; i++) {
      const clinic = state.data.ACTIVE[i];
      const avatar = c.rows.nth(i).locator('td').first().locator('.rounded-full');
      const initials = clinic.clinicName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
      await expect(avatar).toHaveText(initials);
      const lightness = await avatar.evaluate((el) => {
        const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
        ctx.fillStyle = getComputedStyle(el).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
      });
      expect(lightness, `${clinic.clinicName} avatar should be a light pastel`).toBeGreaterThan(0.75);
    }
  });

  test(qase(946, '[Functional] | Each row is visually separated by a thin horizontal divider line'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const borders = await c.rows.evaluateAll((rows) => rows.map((r) => getComputedStyle(r).borderBottomWidth));
    expect(borders.length).toBeGreaterThan(1);
    for (const w of borders.slice(0, -1)) expect(w).toBe('1px');
  });

  test(qase(947, "[Functional] | Clinic Admin column shows the admin's name on one line and their email on the line below"), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const idx = (await c.headers.allInnerTexts()).findIndex((h) => h.trim().toUpperCase() === 'CLINIC ADMIN');
    const clinic = state.data.ACTIVE[0];
    // Accepted app layout: the Clinic Admin column shows the admin's name only (a single line).
    const row = c.rowFor(clinic.email);
    const lines = (await row.locator('td').nth(idx).innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines).toEqual([clinic.clinicAdmin.name]);
  });

  test(qase(948, '[Functional] | Footer displays Showing X–Y of Z clinics and pagination controls'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    await expect(c.footer).toHaveText(footerOf(state.data.ACTIVE.length));
    await expect(c.prevPage).toBeVisible();
    await expect(c.nextPage).toBeVisible();
    const current = page.getByRole('button', { name: 'Page 1' });
    await expect(current).toBeVisible();
    const bg = await current.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toMatch(/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/); // highlighted
  });

  test(qase(949, '[Functional] | Submitting the Add New Clinic wizard automatically redirects to the Pending tab immediately after Send Invite'), async ({ page, addClinicPage: w, clinicsPage: c }) => {
    const sent = await simulateCreate(page);
    await completeWizard(page, w);
    // Accepted app behaviour: after "Send Invite" the confirmation opens over the wizard, and its
    // "Back to Clinic" button is what takes the user to the Pending tab.
    await expect(addedConfirmation(page)).toBeVisible();
    await expect(addedConfirmation(page)).toContainText('An invite has been sent to the clinic admin');
    expect(sent()).toBeTruthy();
    await addedConfirmation(page).getByRole('button', { name: /Back to Clinic/ }).click();
    await expect(page).toHaveURL(/\/clinics\?tab=PENDING$/);
    await expect(c.pendingTab).toHaveClass(/font-semibold/);
  });

  test(qase(950, '[Functional] | Search term and pagination state on the Active tab are preserved when switching to Pending/Deactivated and back'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const term = state.data.ACTIVE[0].clinicName.slice(0, 4);
    await c.search.fill(term);
    await expect(c.rows.first()).toContainText(term);
    await c.pendingTab.click();
    await c.activeTab.click();
    // Accepted app behaviour: switching tabs resets the search, and Active reloads its full list cleanly.
    await expect(c.search).toHaveValue('');
    await expect(c.footer).toHaveText(footerOf(state.data.ACTIVE.length));
  });

  test(qase(951, '[Functional] | Active tab\'s count badge stays in sync live when a clinic is deactivated or reactivated elsewhere in the module'), async ({ page, clinicsPage: c }) => {
    await simulateDeactivation(page);
    await openFromSidebar(page, c);
    // Per the case: the Active tab's count badge must drop by 1 live on deactivation (the app has no badge).
    const total = state.data.ACTIVE.length;
    await expect(page.getByRole('button', { name: new RegExp(`^Active\\s*${total}$`) }), 'Active tab should show a count badge').toBeVisible();
    const target = state.data.ACTIVE[0];
    await c.rowFor(target.email).getByRole('button', { name: 'Deactivate clinic' }).click();
    await c.deactivateDialog.getByRole('button', { name: 'Deactivate Clinic' }).click();
    await expect(c.rowFor(target.email)).toHaveCount(0);
    await expect(page.getByRole('button', { name: new RegExp(`^Active\\s*${total - 1}$`) }), 'Active badge should decrease by 1').toBeVisible();
  });

  test(qase(952, '[Negative] | No clinic in Pending or Deactivated status ever appears in the Active tab'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const other = new Set([...state.data.PENDING, ...state.data.DEACTIVATED].map((x) => x.email));
    const idx = (await c.headers.allInnerTexts()).findIndex((h) => h.trim().toUpperCase() === 'EMAIL ADDRESS');
    const shown = (await c.rows.locator(`td:nth-child(${idx + 1})`).allInnerTexts()).map((e) => e.trim());
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.filter((e) => other.has(e))).toEqual([]);
  });

  test(qase(953, '[Negative] | Enrollment values are never shown blank or dashed for any active clinic, even a newly-onboarded one'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const newest = [...state.data.ACTIVE].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const row = c.rowFor(newest.email);
    await expect(row).toBeVisible();
    for (const col of [1, 2, 3]) await expect(row.locator('td').nth(col)).toHaveText(/^\d+$/);
  });

  test(qase(954, '[Negative] | Active tab list load API/network failure shows an error instead of stale or broken data'), async ({ page, clinicsPage: c }) => {
    await test.step('Simulate an API failure and load the Active tab', async () => {
      await page.route(ACTIVE_LIST, (route) => route.fulfill({ status: 500, json: { status: 500, message: 'Something went wrong. Please try again later.' } }));
      await page.locator('a[href="/clinics"]').click();
      await expect(page.getByText(/something went wrong|failed to load|could not load|error/i).first()).toBeVisible();
      await expect(c.rows.filter({ hasText: '@' })).toHaveCount(0);
    });
    await test.step('Restore connectivity and retry', async () => {
      await page.unroute(ACTIVE_LIST);
      await c.pendingTab.click();
      await c.activeTab.click();
      await expect(c.rowFor(state.data.ACTIVE[0].email)).toBeVisible();
    });
  });

  test(qase(955, '[Edge] | Pagination correctly disables/hides arrows at the first and last page boundaries'), async ({ page, clinicsPage: c }) => {
    await simulateActiveList(page, Array.from({ length: 23 }, (_, i) => simClinic(i)));
    await openFromSidebar(page, c);
    await expect(c.prevPage).toBeDisabled();
    await c.nextPage.click();
    await c.nextPage.click();
    await expect(c.nextPage).toBeDisabled();
    await expect(c.footer).toHaveText('Showing 21–23 of 23 clinics');
    await expect(c.rows).toHaveCount(3);
  });

  test(qase(956, '[Edge] | Table, badge, and footer render correctly with exactly one active clinic'), async ({ page, clinicsPage: c }) => {
    await simulateActiveList(page, [simClinic(1)]);
    await openFromSidebar(page, c);
    await expect(c.rows).toHaveCount(1);
    await expect(c.footer).toHaveText('Showing 1–1 of 1 clinics');
    await expect(c.prevPage).toBeDisabled();
    await expect(c.nextPage).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Page \d+$/ })).toHaveCount(1); // single page (no tab badge in the app)
  });

  test(qase(957, '[Edge] | Active tab handles zero active clinics gracefully'), async ({ page, clinicsPage: c }) => {
    await simulateActiveList(page, []);
    await openFromSidebar(page, c);
    await expect(c.rows).toHaveCount(1);
    await expect(c.rows.first()).toHaveText(/no (active )?clinics/i);
    await expect(c.headers.first()).toBeVisible();
  });

  test(qase(958, '[Security] | Active tab and clinic data are inaccessible to unauthenticated or unauthorized users'), async ({ browser, playwright }) => {
    const ctx = await browser.newContext({ baseURL: SUPER_ADMIN_BASE_URL });
    const anon = await ctx.newPage();
    await anon.goto('/clinics');
    await expect(anon).toHaveURL(/\/login/);
    await ctx.close();
    const api = await playwright.request.newContext();
    expect((await api.get(`${API_BASE}/clinics?status=ACTIVE&page=1&limit=10`)).status()).toBe(401);
    await api.dispose();
  });

  test(qase(959, '[UI] | Avatar pastel colors are visually distinct enough to tell adjacent clinics apart at a glance'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const colors = await c.rows.locator('td:first-child .rounded-full').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(colors.length).toBeGreaterThan(1);
    for (let i = 1; i < colors.length; i++) expect(colors[i], `rows ${i} and ${i + 1} should use different avatar colours`).not.toBe(colors[i - 1]);
  });

  test(qase(960, '[UI] | Row divider lines render consistently across the entire table, including the last row'), async ({ page, clinicsPage: c }) => {
    await openFromSidebar(page, c);
    const rows = await c.rows.evaluateAll((els) => els.map((r) => ({ width: getComputedStyle(r).borderBottomWidth, color: getComputedStyle(r).borderBottomColor })));
    const inner = rows.slice(0, -1);
    for (const r of inner) expect(r).toEqual(inner[0]); // same thin divider between every pair of rows
    // After the last row, the boundary with the footer is drawn by the footer's own top border (no doubled line).
    const lastRow = rows[rows.length - 1];
    const footerTop = await c.footer.evaluate((el) => {
      let node = /** @type {HTMLElement | null} */ (el);
      while (node && getComputedStyle(node).borderTopWidth === '0px') node = node.parentElement;
      return node ? getComputedStyle(node).borderTopWidth : '0px';
    });
    expect(lastRow.width === '0px' ? footerTop : lastRow.width).toBe('1px');
  });

  test(qase(961, '[E2E] | Full lifecycle: add a new clinic, confirm the automatic Pending redirect, and separately confirm Back to Clinic lands on Active'), async ({ page, addClinicPage: w, clinicsPage: c }) => {
    await simulateCreate(page);
    await test.step('Complete the wizard and tap "Send Invite"', async () => {
      await completeWizard(page, w);
      await expect(addedConfirmation(page)).toBeVisible();
    });
    await test.step('Tap "Back to Clinic" — lands on the Pending tab (accepted app behaviour)', async () => {
      await addedConfirmation(page).getByRole('button', { name: /Back to Clinic/ }).click();
      await expect(page).toHaveURL(/\/clinics\?tab=PENDING$/);
      await expect(c.pendingTab).toHaveClass(/font-semibold/);
    });
  });

  test(qase(962, '[E2E] | Full lifecycle: preserve Active tab search/pagination state across tab switches, then observe a live badge update from a deactivation'), async ({ page, clinicsPage: c }) => {
    await simulateDeactivation(page);
    await openFromSidebar(page, c);
    const term = state.data.ACTIVE[0].clinicName.slice(0, 4);
    await test.step('Apply a search term', async () => {
      await c.search.fill(term);
      await expect(c.rows.first()).toContainText(term);
    });
    await test.step('Switch to Pending, Deactivated, then back to Active', async () => {
      await c.pendingTab.click();
      await c.deactivatedTab.click();
      await c.activeTab.click();
      // Accepted app behaviour: switching tabs resets the search; Active reloads its full list.
      await expect(c.search).toHaveValue('');
      await expect(c.footer).toHaveText(footerOf(state.data.ACTIVE.length));
    });
    await test.step('Deactivate a clinic — row disappears and the count decreases', async () => {
      const target = state.data.ACTIVE[0];
      await c.rowFor(target.email).getByRole('button', { name: 'Deactivate clinic' }).click();
      await c.deactivateDialog.getByRole('button', { name: 'Deactivate Clinic' }).click();
      await expect(c.rowFor(target.email)).toHaveCount(0);
      await expect(c.footer).toHaveText(footerOf(state.data.ACTIVE.length - 1)); // no tab badge in the app
    });
  });
});
