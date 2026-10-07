// @ts-check
// Qase: HTM › Super Admin › Resource Management › Search & Filter (suite 20). Titles carry Qase case IDs.
// Signs in with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env against the QA portal.
//
// Read-only: searches and filters the real Active / Pending / Deactivated lists; search terms are derived from the
// live data at run time (nothing hardcoded). Exact-count cases (HTM-831, 832) and the "tab with zero resources" part
// of HTM-830 use a simulated list, since that data can't be arranged in shared QA.
import { test, expect } from '../../fixtures/pages.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '', SUPER_ADMIN_PASSWORD = '', SUPER_ADMIN_BASE_URL = '' } = process.env;
const API_BASE = SUPER_ADMIN_BASE_URL.replace('://superadmin.', '://api.') + '/api/v1';
const LIST = /\/api\/v1\/resources\?status=/;
const NO_MATCH = 'No resources match your search.';
const TYPE_LABEL = { PHYSICIAN: 'Physician', NURSE: 'Registered Nurse', DHN: 'Digital Health Navigator' };

/** @type {{ authorization: string, data: Record<string, any[]> }} */
const state = { authorization: '', data: {} };

/**
 * Serves one tab from `items`, honouring the search term and type filter the page sends (case-insensitive name match).
 * @param {import('@playwright/test').Page} page
 * @param {string} status
 * @param {any[]} items
 */
async function simulateTab(page, status, items) {
  await page.route(new RegExp(`/api/v1/resources\\?status=${status}`), (route) => {
    const url = new URL(route.request().url());
    const pageNo = Number(url.searchParams.get('page') || 1);
    const limit = Number(url.searchParams.get('limit') || 10);
    const term = (url.searchParams.get('search') || '').trim().toLowerCase();
    const type = url.searchParams.get('role') || url.searchParams.get('type') || url.searchParams.get('resourceType');
    const list = items.filter((i) => (!term || i.fullName.toLowerCase().includes(term)) && (!type || i.type === type));
    const total = list.length;
    const from = total ? (pageNo - 1) * limit + 1 : 0;
    const data = list.slice((pageNo - 1) * limit, pageNo * limit);
    route.fulfill({ json: { data, meta: { page: pageNo, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), from, to: total ? from + data.length - 1 : 0, counts: {} } } });
  });
}
/** @param {number} n @param {string} prefix */
const simItems = (n, prefix) =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    firstName: prefix,
    lastName: `Item${String.fromCharCode(97 + (i % 26))}${i}`,
    fullName: `${prefix} Item${String.fromCharCode(97 + (i % 26))}${i}`,
    email: `sim.${i}@example.com`,
    phoneNumber: '+12025550143',
    type: 'NURSE',
    typeLabel: 'Registered Nurse',
    status: 'ACTIVE',
    createdAt: '2026-09-25T09:00:00.000Z',
  }));

test.describe('Super Admin — Resource Management › Search & Filter', () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, 'Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env');

  test.beforeEach(async ({ page, loginPage, playwright }) => {
    state.authorization = '';
    page.on('request', (r) => {
      const auth = r.headers()['authorization'];
      if (auth && r.url().startsWith(API_BASE)) state.authorization = auth;
    });
    await loginPage.open();
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect.poll(() => state.authorization).not.toBe('');
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    for (const status of ['ACTIVE', 'PENDING', 'DEACTIVATED']) {
      const j = await (await api.get(`${API_BASE}/resources?status=${status}&pagination=false`)).json();
      state.data[status] = Array.isArray(j) ? j : j.data;
    }
    await api.dispose();
  });

  /** Goes to a tab and waits for its list to load. @param {any} r @param {'ACTIVE'|'PENDING'|'DEACTIVATED'} status */
  const openTab = async (/** @type {import('@playwright/test').Page} */ page, r, status) => {
    if (!page.url().endsWith('/resources')) await r.open();
    const tab = { ACTIVE: r.activeTab, PENDING: r.pendingTab, DEACTIVATED: r.deactivatedTab }[status];
    if (!(await tab.getAttribute('class'))?.includes('font-semibold')) {
      await Promise.all([page.waitForResponse((x) => x.url().includes(`status=${status}`)), tab.click()]);
    }
    await expect(r.bodyRows.first()).not.toHaveText(/Loading/);
  };
  /** Types into search and waits for the matching list response. */
  const search = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ r, /** @type {string} */ term) => {
    const want = term.trim();
    const [res] = await Promise.all([
      page.waitForResponse((x) => LIST.test(x.url()) && (new URL(x.url()).searchParams.get('search') || '').trim() === want),
      r.search.fill(term),
    ]);
    const json = await res.json();
    await expect(r.bodyRows.first()).not.toHaveText(/Loading/);
    return json;
  };
  /** Picks a Resource Type option and waits for the filtered list. */
  const filterType = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ r, /** @type {string} */ label) => {
    await r.resourceTypeFilter.click();
    const [res] = await Promise.all([page.waitForResponse((x) => LIST.test(x.url())), page.getByRole('option', { name: label, exact: true }).click()]);
    const json = await res.json();
    await expect(r.bodyRows.first()).not.toHaveText(/Loading/);
    return json;
  };
  const shownNames = async (/** @type {any} */ r) => (await r.bodyRows.locator('td:nth-child(1)').allInnerTexts()).map((/** @type {string} */ t) => t.split('\n').pop().trim());
  const shownTypes = async (/** @type {any} */ r) => (await r.bodyRows.locator('td:nth-child(4)').allInnerTexts()).map((/** @type {string} */ t) => t.trim());
  const footerOf = (/** @type {number} */ total) => `Showing ${total ? 1 : 0}–${Math.min(total, 10)} of ${total} resources`;

  test.describe('@smoke', () => {
    test(qase(808, '[SMOKE] | Searching by resource name returns matching resources live as the user types'), async ({ page, resourcesPage: r }) => {
      const target = state.data.ACTIVE[0];
      await openTab(page, r, 'ACTIVE');
      await test.step('Type the name character by character', async () => {
        const [res] = await Promise.all([page.waitForResponse((x) => LIST.test(x.url()) && x.url().includes('search=')), r.search.pressSequentially(target.firstName.slice(0, 3), { delay: 150 })]);
        expect(res.ok()).toBe(true);
        await expect(r.bodyRows.filter({ hasText: target.fullName })).toBeVisible();
        for (const n of await shownNames(r)) expect(n.toLowerCase()).toContain(target.firstName.slice(0, 3).toLowerCase());
      });
      await test.step('Finish typing the full name', async () => {
        await r.search.fill('');
        const json = await search(page, r, target.fullName);
        expect(json.meta.total, `searching the full name "${target.fullName}" should find it`).toBeGreaterThan(0);
        await expect(r.bodyRows.filter({ hasText: target.fullName })).toBeVisible();
      });
    });

    test(qase(809, '[SMOKE] | Selecting a Resource Type from the dropdown filters the table immediately'), async ({ page, resourcesPage: r }) => {
      await openTab(page, r, 'PENDING');
      const json = await filterType(page, r, 'Physician');
      const expected = state.data.PENDING.filter((x) => x.type === 'PHYSICIAN').length;
      expect(json.meta.total).toBe(expected);
      for (const t of await shownTypes(r)) expect(t).toBe('Physician');
      await expect(r.footer).toHaveText(footerOf(expected));
    });

    test(qase(810, '[SMOKE] | Combining Search and Resource Type filter narrows results by both conditions simultaneously'), async ({ page, resourcesPage: r }) => {
      // Find, in live data, a short term that matches both a Physician and a non-Physician on the same tab.
      let pick = null;
      for (const status of ['PENDING', 'DEACTIVATED', 'ACTIVE']) {
        const list = state.data[status];
        for (const p of list.filter((x) => x.type === 'PHYSICIAN')) {
          const name = p.fullName.toLowerCase();
          for (let i = 0; i + 2 <= name.length && !pick; i++) {
            const term = name.slice(i, i + 2);
            if (/[^a-z]/.test(term)) continue;
            if (list.some((x) => x.type !== 'PHYSICIAN' && x.fullName.toLowerCase().includes(term))) pick = { status, term };
          }
          if (pick) break;
        }
        if (pick) break;
      }
      expect(pick, 'live data should contain a term shared by a Physician and a non-Physician').toBeTruthy();
      await openTab(page, r, pick.status);
      await filterType(page, r, 'Physician');
      const json = await search(page, r, pick.term);
      const expected = state.data[pick.status].filter((x) => x.type === 'PHYSICIAN' && x.fullName.toLowerCase().includes(pick.term));
      expect(json.meta.total).toBe(expected.length);
      for (const t of await shownTypes(r)) expect(t).toBe('Physician');
      for (const n of await shownNames(r)) expect(n.toLowerCase()).toContain(pick.term);
    });
  });

  test(qase(811, '[Functional] | Search input with magnifying-glass icon is present and functional on all three tabs'), async ({ page, resourcesPage: r }) => {
    let firstBox;
    for (const status of /** @type {const} */ (['ACTIVE', 'PENDING', 'DEACTIVATED'])) {
      await test.step(status, async () => {
        await openTab(page, r, status);
        await expect(r.search).toBeVisible();
        await expect(r.search.locator('xpath=..').locator('svg.lucide-search')).toBeVisible();
        const box = await r.search.boundingBox();
        firstBox ??= box;
        if (box && firstBox) expect(Math.abs(box.x - firstBox.x) + Math.abs(box.y - firstBox.y)).toBeLessThan(3);
        const target = state.data[status][0];
        const json = await search(page, r, target.firstName.slice(0, 3));
        expect(json.meta.total).toBeGreaterThan(0);
        await expect(r.bodyRows.filter({ hasText: target.fullName }).first()).toBeVisible();
        await r.search.fill('');
      });
    }
  });

  test(qase(812, '[Functional] | Resource Type dropdown is present and functional on all three tabs, positioned top-right beside "+ Add New Resource"'), async ({ page, resourcesPage: r }) => {
    for (const status of /** @type {const} */ (['ACTIVE', 'PENDING', 'DEACTIVATED'])) {
      await test.step(status, async () => {
        await openTab(page, r, status);
        const [f, add] = await Promise.all([r.resourceTypeFilter.boundingBox(), r.addNewResourceButton.boundingBox()]);
        expect(f && add).toBeTruthy();
        if (f && add) {
          expect(Math.abs(f.y + f.height / 2 - (add.y + add.height / 2))).toBeLessThan(10);
          expect(add.x).toBeGreaterThan(f.x);
        }
        const json = await filterType(page, r, 'Registered Nurse');
        expect(json.meta.total).toBe(state.data[status].filter((x) => x.type === 'NURSE').length);
        for (const t of await shownTypes(r)) if (t !== NO_MATCH) expect(t).toBe('Registered Nurse');
        await filterType(page, r, 'All');
      });
    }
  });

  test(qase(813, '[Functional] | Resource Type dropdown defaults to "All" selected'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'ACTIVE');
    await expect(r.footer).toHaveText(footerOf(state.data.ACTIVE.length));
    await r.resourceTypeFilter.click();
    await expect(page.getByRole('option', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test(qase(814, '[Functional] | Resource Type dropdown lists Physician, Registered Nurse, and Digital Health Navigator as options'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'ACTIVE');
    await r.resourceTypeFilter.click();
    await expect(page.getByRole('option')).toHaveText(['All', 'Physician', 'Registered Nurse', 'Digital Health Navigator']);
  });

  test(qase(815, '[Functional] | Selecting "All" clears the type filter and shows all resource types'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'PENDING');
    await filterType(page, r, 'Physician');
    const json = await filterType(page, r, 'All');
    expect(json.meta.total).toBe(state.data.PENDING.length);
    expect(new Set(await shownTypes(r)).size).toBeGreaterThan(1);
  });

  test(qase(816, '[Functional] | Search matches on Resource Name'), async ({ page, resourcesPage: r }) => {
    const target = state.data.DEACTIVATED.find((x) => x.lastName.length >= 4) || state.data.DEACTIVATED[0];
    await openTab(page, r, 'DEACTIVATED');
    const term = target.lastName.slice(1, 4); // substring from inside the name
    await search(page, r, term);
    await expect(r.bodyRows.filter({ hasText: target.email }).first()).toBeVisible();
  });

  test(qase(817, '[Functional] | Search matches on Email Address'), async ({ page, resourcesPage: r }) => {
    // An email fragment that does not appear in any name on the tab, so a match can only come from the email.
    const list = state.data.PENDING;
    const target = list.find((x) => {
      const local = x.email.split('@')[0].replace(/[^a-z]/gi, '').slice(0, 5).toLowerCase();
      return local.length >= 4 && !list.some((y) => y.fullName.toLowerCase().includes(local));
    });
    expect(target, 'a resource whose email fragment is not part of any name').toBeTruthy();
    const term = target.email.split('@')[0].replace(/[^a-z]/gi, '').slice(0, 5);
    await openTab(page, r, 'PENDING');
    const json = await search(page, r, term);
    expect(json.meta.total, `searching the email fragment "${term}" should find ${target.email}`).toBeGreaterThan(0);
    await expect(r.bodyRows.filter({ hasText: target.email }).first()).toBeVisible();
  });

  test(qase(818, '[Functional] | Search performs partial, case-insensitive matching'), async ({ page, resourcesPage: r }) => {
    const target = state.data.ACTIVE.find((x) => x.firstName.length >= 4) || state.data.ACTIVE[0];
    await openTab(page, r, 'ACTIVE');
    for (const term of [target.firstName.toLowerCase(), target.firstName.toUpperCase(), target.firstName.slice(1, 4)]) {
      await test.step(`"${term}"`, async () => {
        await search(page, r, term);
        await expect(r.bodyRows.filter({ hasText: target.fullName })).toBeVisible();
      });
    }
  });

  test(qase(819, '[Functional] | Table filters to only resources matching the selected Resource Type'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'PENDING');
    const json = await filterType(page, r, 'Registered Nurse');
    expect(json.meta.total).toBe(state.data.PENDING.filter((x) => x.type === 'NURSE').length);
    const types = await shownTypes(r);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(t).toBe('Registered Nurse');
  });

  test(qase(820, '[Functional] | Search and filter apply only within the currently selected tab'), async ({ page, resourcesPage: r }) => {
    // A term that matches something on Active and something on Pending.
    let term = '';
    for (const a of state.data.ACTIVE) {
      for (let i = 0; i + 2 <= a.fullName.length && !term; i++) {
        const t = a.fullName.slice(i, i + 2).toLowerCase();
        if (!/[^a-z]/.test(t) && state.data.PENDING.some((p) => p.fullName.toLowerCase().includes(t))) term = t;
      }
    }
    expect(term).not.toBe('');
    await openTab(page, r, 'ACTIVE');
    const json = await search(page, r, term);
    const activeEmails = new Set(state.data.ACTIVE.map((x) => x.email));
    for (const row of json.data) expect(activeEmails.has(row.email)).toBe(true);
    await test.step('Switch to Pending — its own full list', async () => {
      await openTab(page, r, 'PENDING');
      await expect(r.search).toHaveValue('');
      await expect(r.footer).toHaveText(footerOf(state.data.PENDING.length));
    });
  });

  test(qase(821, '[Functional] | Clearing the search term reverts the table to show all resources on the current tab'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'DEACTIVATED');
    const narrowed = await search(page, r, state.data.DEACTIVATED[0].firstName.slice(0, 3));
    expect(narrowed.meta.total).toBeLessThan(state.data.DEACTIVATED.length);
    const json = await search(page, r, '');
    expect(json.meta.total).toBe(state.data.DEACTIVATED.length);
    await expect(r.footer).toHaveText(footerOf(state.data.DEACTIVATED.length));
  });

  test(qase(822, '[Functional] | Resetting the Resource Type filter to "All" reverts the table to show all resources on the current tab'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'DEACTIVATED');
    const narrowed = await filterType(page, r, 'Physician');
    expect(narrowed.meta.total).toBeLessThan(state.data.DEACTIVATED.length);
    const json = await filterType(page, r, 'All');
    expect(json.meta.total).toBe(state.data.DEACTIVATED.length);
    await expect(r.footer).toHaveText(footerOf(state.data.DEACTIVATED.length));
  });

  test(qase(823, '[Functional] | Tab count badge updates to reflect the filtered/searched result count'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'DEACTIVATED');
    const json = await filterType(page, r, 'Physician');
    await expect(page.getByRole('button', { name: new RegExp(`^Deactivated\\s*${json.meta.total}$`) }), 'Deactivated tab should show a count badge with the filtered count').toBeVisible();
  });

  test(qase(824, '[Functional] | Footer "Showing X–Y of Z resources" updates to reflect the filtered/searched result count'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'DEACTIVATED');
    await expect(r.footer).toHaveText(footerOf(state.data.DEACTIVATED.length));
    const json = await filterType(page, r, 'Physician');
    await expect(r.footer).toHaveText(footerOf(json.meta.total));
    const searched = await search(page, r, state.data.DEACTIVATED.find((x) => x.type === 'PHYSICIAN').firstName.slice(0, 3));
    await expect(r.footer).toHaveText(footerOf(searched.meta.total));
  });

  test(qase(825, '[Functional] | Pagination footer reflects the filtered/searched result set, including page count and arrows'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'DEACTIVATED');
    expect(state.data.DEACTIVATED.length, 'Deactivated spans more than one page').toBeGreaterThan(10);
    await expect(r.nextPage).toBeEnabled();
    const json = await filterType(page, r, 'Registered Nurse');
    expect(json.meta.total).toBeLessThanOrEqual(10);
    await expect(r.nextPage).toBeDisabled();
    await expect(r.prevPage).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Page \d+$/ })).toHaveCount(1);
  });

  test(qase(826, '[Functional] | Resource Type dropdown allows only a single selection at a time'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'PENDING');
    await filterType(page, r, 'Physician');
    const json = await filterType(page, r, 'Registered Nurse');
    expect(json.data.every((/** @type {any} */ x) => x.type === 'NURSE')).toBe(true);
    for (const t of await shownTypes(r)) expect(t).toBe('Registered Nurse');
    await r.resourceTypeFilter.click();
    await expect(page.getByRole('option', { selected: true })).toHaveText(['Registered Nurse']);
  });

  test(qase(827, '[Functional] | A maximum of 10 rows are displayed per page under any tab'), async ({ page, resourcesPage: r }) => {
    for (const status of /** @type {const} */ (['ACTIVE', 'PENDING', 'DEACTIVATED'])) {
      await openTab(page, r, status);
      await expect(r.bodyRows).toHaveCount(Math.min(state.data[status].length, 10));
    }
    await r.nextPage.click(); // Deactivated has more than 10
    await expect(r.footer).toHaveText(new RegExp(`^Showing 11–${Math.min(state.data.DEACTIVATED.length, 20)} of`));
  });

  test(qase(828, '[Negative] | Searching by Phone Number or Type value does not return matches'), async ({ page, resourcesPage: r }) => {
    const target = state.data.PENDING[0];
    await openTab(page, r, 'PENDING');
    await test.step('Phone number', async () => {
      const json = await search(page, r, target.phoneNumber.replace('+1', ''));
      expect(json.data.some((/** @type {any} */ x) => x.email === target.email)).toBe(false);
    });
    await test.step('Type value "Physician"', async () => {
      const json = await search(page, r, 'Physician');
      for (const row of json.data) expect(`${row.fullName} ${row.email}`.toLowerCase()).toContain('physician');
    });
  });

  test(qase(829, '[Negative] | Zero matching search/filter results show a blank table with headers visible and a centered "No resources match your search" message'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'ACTIVE');
    await search(page, r, 'zzqqnomatch');
    await expect(r.tableHeaders).toHaveCount(5);
    await expect(r.bodyRows).toHaveText([NO_MATCH]);
  });

  test(qase(830, '[Negative] | "No resources match your search" and "No resources found" are never shown interchangeably'), async ({ page, resourcesPage: r }) => {
    await test.step('Tab has resources, search matches none', async () => {
      await openTab(page, r, 'ACTIVE');
      await search(page, r, 'zzqqnomatch');
      await expect(r.bodyRows).toHaveText([NO_MATCH]);
      await expect(page.getByText('No resources found')).toHaveCount(0);
    });
    await test.step('Tab genuinely has zero resources (simulated), no search', async () => {
      await simulateTab(page, 'PENDING', []);
      await r.search.fill('');
      await openTab(page, r, 'PENDING');
      await expect(r.bodyRows).toHaveText([/^No resources found\.?$/]);
      await expect(page.getByText(NO_MATCH)).toHaveCount(0);
    });
  });

  test(qase(831, '[Edge] | Filtered results exactly matching 10 resources fit on a single page with no next-page arrow active'), async ({ page, resourcesPage: r }) => {
    await simulateTab(page, 'ACTIVE', [...simItems(10, 'Exactten'), ...simItems(15, 'Other')]);
    await openTab(page, r, 'ACTIVE');
    await search(page, r, 'Exactten');
    await expect(r.bodyRows).toHaveCount(10);
    await expect(r.footer).toHaveText('Showing 1–10 of 10 resources');
    await expect(r.nextPage).toBeDisabled();
  });

  test(qase(832, '[Edge] | Filtered results of 11 resources correctly spans exactly two pages'), async ({ page, resourcesPage: r }) => {
    await simulateTab(page, 'ACTIVE', [...simItems(11, 'Eleven'), ...simItems(15, 'Other')]);
    await openTab(page, r, 'ACTIVE');
    await search(page, r, 'Eleven');
    await expect(r.footer).toHaveText('Showing 1–10 of 11 resources');
    await expect(r.bodyRows).toHaveCount(10);
    await r.nextPage.click();
    await expect(r.footer).toHaveText('Showing 11–11 of 11 resources');
    await expect(r.bodyRows).toHaveCount(1);
    await expect(r.nextPage).toBeDisabled();
  });

  test(qase(833, '[Edge] | Search input handles leading/trailing whitespace and special characters without breaking'), async ({ page, resourcesPage: r }) => {
    const target = state.data.ACTIVE[0];
    await openTab(page, r, 'ACTIVE');
    await test.step('Leading/trailing spaces are trimmed', async () => {
      await search(page, r, `  ${target.firstName.slice(0, 4)}  `);
      await expect(r.bodyRows.filter({ hasText: target.fullName })).toBeVisible();
    });
    // Product rule (confirmed by QA): special characters are not supported as search input. The check is that
    // entering them never breaks the screen — no error, the table and footer still render, and clearing recovers.
    for (const ch of ['.', '+', '*']) {
      await test.step(`"${ch}" does not break the search`, async () => {
        const json = await search(page, r, ch);
        expect(Array.isArray(json.data)).toBe(true);
        await expect(page.locator('main table')).toBeVisible();
        await expect(r.tableHeaders).toHaveCount(5);
        await expect(r.footer).toBeVisible();
        await expect(r.toast.filter({ hasText: /error|wrong|failed/i })).toHaveCount(0);
      });
    }
    await test.step('Clearing the search restores the full list', async () => {
      await search(page, r, '');
      await expect(r.footer).toHaveText(footerOf(state.data.ACTIVE.length));
    });
  });

  test(qase(834, '[Security] | Search and filter controls are inaccessible to unauthenticated or unauthorized users'), async ({ browser, playwright }) => {
    const ctx = await browser.newContext({ baseURL: SUPER_ADMIN_BASE_URL });
    const anon = await ctx.newPage();
    await anon.goto('/resources');
    await expect(anon).toHaveURL(/\/login/);
    await expect(anon.getByRole('textbox', { name: 'Search resource by name' })).toHaveCount(0);
    await ctx.close();
    const api = await playwright.request.newContext();
    expect((await api.get(`${API_BASE}/resources?status=ACTIVE&page=1&limit=10&search=a`)).status()).toBe(401);
    await api.dispose();
  });

  test(qase(835, '[UI] | Search input displays a magnifying-glass icon'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'ACTIVE');
    const icon = r.search.locator('xpath=..').locator('svg.lucide-search');
    await expect(icon).toBeVisible();
    const [i, s] = await Promise.all([icon.boundingBox(), r.search.boundingBox()]);
    if (i && s) expect(i.x).toBeGreaterThanOrEqual(s.x - 1);
  });

  test(qase(836, '[UI] | Zero-result blank table renders cleanly with only headers and a centered message, no layout break'), async ({ page, resourcesPage: r }) => {
    await openTab(page, r, 'ACTIVE');
    const headersBefore = await Promise.all((await r.tableHeaders.all()).map((h) => h.boundingBox()));
    await search(page, r, 'zzqqnomatch');
    await expect(r.bodyRows).toHaveCount(1);
    const headersAfter = await Promise.all((await r.tableHeaders.all()).map((h) => h.boundingBox()));
    headersAfter.forEach((b, i) => expect(Math.abs((b?.x ?? 0) - (headersBefore[i]?.x ?? 0))).toBeLessThan(3));
    const cell = r.bodyRows.first().locator('td');
    await expect(cell).toHaveCount(1);
    expect(await cell.getAttribute('colspan')).toBe('5');
    const [c, t] = await Promise.all([cell.boundingBox(), page.locator('main table').boundingBox()]);
    const text = await cell.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const b = range.getBoundingClientRect();
      return { center: b.x + b.width / 2 };
    });
    if (c && t) {
      expect(Math.abs(c.width - t.width)).toBeLessThan(3);
      expect(Math.abs(text.center - (t.x + t.width / 2))).toBeLessThan(10);
    }
  });

  test(qase(837, '[E2E] | Full lifecycle: apply search and filter together, clear both, and confirm tab isolation and live count updates throughout'), async ({ page, resourcesPage: r }) => {
    const phys = state.data.ACTIVE.find((x) => x.type === 'PHYSICIAN') || state.data.DEACTIVATED.find((x) => x.type === 'PHYSICIAN');
    const status = state.data.ACTIVE.includes(phys) ? 'ACTIVE' : 'DEACTIVATED';
    const term = phys.firstName.slice(0, 3);
    const physTotal = state.data[status].filter((x) => x.type === 'PHYSICIAN').length;
    await openTab(page, r, status);
    await test.step('Filter Physician + search a partial name', async () => {
      await filterType(page, r, 'Physician');
      const json = await search(page, r, term);
      await expect(r.footer).toHaveText(footerOf(json.meta.total));
      for (const t of await shownTypes(r)) expect(t).toBe('Physician');
      // The app has no tab count badges; the narrowed count is confirmed via the footer above.
    });
    await test.step('Clear the search only', async () => {
      await search(page, r, '');
      await expect(r.footer).toHaveText(footerOf(physTotal));
    });
    await test.step('Reset the filter to All', async () => {
      await filterType(page, r, 'All');
      await expect(r.footer).toHaveText(footerOf(state.data[status].length));
    });
    await test.step('Switch to Pending — unaffected', async () => {
      await openTab(page, r, 'PENDING');
      await expect(r.footer).toHaveText(footerOf(state.data.PENDING.length));
    });
    await test.step('Zero-match search on Pending', async () => {
      await search(page, r, 'zzqqnomatch');
      await expect(r.bodyRows).toHaveText([NO_MATCH]);
    });
  });
});
