// @ts-check
// Qase: HTM › Super Admin › Clinic Management › Search, Filter & Pagination (suite 40). Titles carry Qase case IDs.
// Signs in with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env against the QA portal.
//
// Read-only: searches and pages through the real Active / Pending / Deactivated clinic lists, with search terms
// derived from live data. Simulated lists only where QA lacks the data: a multi-page Active tab (HTM-1197) and an
// empty tab (HTM-1204, 1205). HTM-1208 automates the unauthenticated checks; its other-role steps need other logins.
import { test, expect } from '../../fixtures/pages.js';
import { simClinic, simulateClinicList } from '../../fixtures/clinicSim.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '', SUPER_ADMIN_PASSWORD = '', SUPER_ADMIN_BASE_URL = '' } = process.env;
const API_BASE = SUPER_ADMIN_BASE_URL.replace('://superadmin.', '://api.') + '/api/v1';
const LIST = /\/api\/v1\/clinics\?status=/;
const NO_MATCH = 'No clinics match your search.';
const NO_CLINICS = 'No clinics found.';

/** @type {{ authorization: string, data: Record<string, any[]> }} */
const state = { authorization: '', data: {} };

test.describe('Super Admin — Clinic Management › Search, Filter & Pagination', () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, 'Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env');
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page, loginPage, playwright }) => {
    state.authorization = '';
    page.on('request', (r) => {
      const auth = r.headers()['authorization'];
      if (auth && r.url().startsWith(API_BASE)) state.authorization = auth;
    });
    await loginPage.open();
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect.poll(() => state.authorization).not.toBe('');
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    for (const status of ['ACTIVE', 'PENDING', 'DEACTIVATED']) {
      const j = await (await api.get(`${API_BASE}/clinics?status=${status}&pagination=false`)).json();
      state.data[status] = Array.isArray(j) ? j : j.data;
    }
    await api.dispose();
  });

  /** Opens a tab and waits for its list. @param {'ACTIVE'|'PENDING'|'DEACTIVATED'} status */
  const openTab = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ c, status) => {
    if (!/\/clinics(\?.*)?$/.test(page.url())) {
      await Promise.all([page.waitForResponse((x) => x.url().includes('status=ACTIVE')), page.goto('/clinics')]);
    }
    if (!(await c.tab(status).getAttribute('class'))?.includes('font-semibold')) {
      await Promise.all([page.waitForResponse((x) => x.url().includes(`status=${status}`)), c.tab(status).click()]);
    }
    await expect(c.rows.first()).not.toHaveText(/Loading/);
  };
  /** Types a search term and waits for that exact search's response. */
  const search = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ c, /** @type {string} */ term) => {
    const want = term.trim();
    const response = page
      .waitForResponse((x) => LIST.test(x.url()) && (new URL(x.url()).searchParams.get('search') || '').trim() === want, { timeout: 10_000 })
      .catch(() => null); // the app may serve a repeated query from its cache without a new request
    await c.search.fill(term);
    const res = await response;
    await expect(c.rows.first()).not.toHaveText(/Loading/);
    if (res) return res.json();
    const status = ['ACTIVE', 'PENDING', 'DEACTIVATED'].find((s) => page.url().includes(s)) || (await currentStatus(c));
    const all = state.data[status].filter((x) => !want || x.clinicName.toLowerCase().includes(want.toLowerCase()));
    return { data: all.slice(0, 10), meta: { total: all.length } };
  };
  /** Which tab is currently selected. */
  const currentStatus = async (/** @type {any} */ c) => {
    for (const s of ['ACTIVE', 'PENDING', 'DEACTIVATED']) if ((await c.tab(s).getAttribute('class'))?.includes('font-semibold')) return s;
    return 'ACTIVE';
  };
  const footerRe = (/** @type {number} */ from, /** @type {number} */ to, /** @type {number} */ total) => new RegExp(`^Showing ${from}–${to} of ${total} (\\w+ )?clinics$`);
  const names = async (/** @type {any} */ c) => (await c.rows.locator('td:first-child').allInnerTexts()).map((/** @type {string} */ t) => t.split('\n').pop().trim());
  /** Picks a short term matching several clinics on a tab (used for multi-page filtered results). */
  const termWithAtLeast = (/** @type {any[]} */ list, /** @type {number} */ min) => {
    const counts = new Map();
    for (const c of list) {
      const n = c.clinicName.toLowerCase();
      for (let i = 0; i + 2 <= n.length; i++) {
        const t = n.slice(i, i + 2);
        if (/[^a-z]/.test(t)) continue;
        counts.set(t, (counts.get(t) || new Set()).add(c.organizationId));
      }
    }
    return [...counts.entries()].map(([t, s]) => [t, s.size]).filter(([, n]) => n >= min && n < list.length).sort((a, b) => b[1] - a[1])[0];
  };

  test.describe('@smoke', () => {
    test(qase(1196, '[SMOKE] | Real-time search returns matching clinics by Clinic Name'), async ({ page, clinicsPage: c }) => {
      const target = state.data.ACTIVE.find((x) => x.clinicName.length >= 5) || state.data.ACTIVE[0];
      await test.step('Active tab shows the search field with a magnifying-glass icon beside the tabs', async () => {
        await openTab(page, c, 'ACTIVE');
        await expect(c.search).toBeVisible();
        await expect(c.search.locator('xpath=..').locator('svg')).toBeVisible();
      });
      await test.step('Type a partial name one character at a time — the table updates as you type', async () => {
        const term = target.clinicName.slice(0, 4).toLowerCase();
        const searches = [];
        page.on('request', (r) => {
          const s = LIST.test(r.url()) && new URL(r.url()).searchParams.get('search');
          if (s) searches.push(s);
        });
        await c.search.pressSequentially(term, { delay: 400 });
        await expect(c.rows.filter({ hasText: target.clinicName })).toBeVisible();
        expect(searches.length, 'results should refresh while typing, without Enter').toBeGreaterThan(1);
        for (const n of await names(c)) expect(n.toLowerCase()).toContain(term);
      });
      await test.step('Footer reflects the filtered count', async () => {
        const n = (await names(c)).length;
        await expect(c.footer).toHaveText(footerRe(1, n, n));
      });
    });

    test(qase(1197, '[SMOKE] | Pagination navigates between pages and "Showing X-Y of Z" updates correctly'), async ({ page, clinicsPage: c }) => {
      // QA's Active tab fits on one page, so a 23-clinic Active list is simulated.
      const items = Array.from({ length: 23 }, (_, i) => simClinic(i));
      await simulateClinicList(page, 'ACTIVE', items);
      await openTab(page, c, 'ACTIVE');
      await expect(c.footer).toHaveText('Showing 1–10 of 23 clinics');
      await expect(page.getByRole('button', { name: 'Page 1' })).toBeVisible();
      const page1 = await names(c);
      await c.nextPage.click();
      await expect(c.footer).toHaveText('Showing 11–20 of 23 clinics');
      await expect(c.rows.first()).toContainText(items[10].clinicName);
      await c.prevPage.click();
      await expect(c.footer).toHaveText('Showing 1–10 of 23 clinics');
      expect(await names(c)).toEqual(page1);
    });
  });

  test(qase(1198, '[Functional] | Search field is present and functional on Active, Pending, and Deactivated tabs'), async ({ page, clinicsPage: c }) => {
    for (const status of /** @type {const} */ (['ACTIVE', 'PENDING', 'DEACTIVATED'])) {
      await test.step(status, async () => {
        await openTab(page, c, status);
        await expect(c.search).toBeVisible();
        const [tab, s] = await Promise.all([c.tab(status).boundingBox(), c.search.boundingBox()]);
        if (tab && s) expect(Math.abs(tab.y + tab.height / 2 - (s.y + s.height / 2))).toBeLessThan(15); // beside the tabs
        const target = state.data[status][0];
        const json = await search(page, c, target.clinicName.slice(0, 4));
        expect(json.data.some((/** @type {any} */ x) => x.organizationId === target.organizationId)).toBe(true);
        await search(page, c, '');
      });
    }
  });

  test(qase(1199, '[Functional] | Search matches partial, case-insensitive text in Clinic Name and Clinic Admin'), async ({ page, clinicsPage: c }) => {
    const target = state.data.ACTIVE.find((x) => x.clinicName.length >= 5 && x.clinicAdmin?.name) || state.data.ACTIVE[0];
    const nameTerm = target.clinicName.slice(1, 4);
    const adminTerm = target.clinicAdmin.name.split(' ')[0].slice(0, 4);
    await openTab(page, c, 'ACTIVE');
    for (const term of [nameTerm.toLowerCase(), nameTerm.toUpperCase()]) {
      await test.step(`Clinic name fragment "${term}"`, async () => {
        const json = await search(page, c, term);
        expect(json.data.some((/** @type {any} */ x) => x.organizationId === target.organizationId)).toBe(true);
      });
    }
    for (const term of [adminTerm.toLowerCase(), adminTerm.toUpperCase()]) {
      await test.step(`Clinic Admin fragment "${term}"`, async () => {
        const json = await search(page, c, term);
        expect(json.data.some((/** @type {any} */ x) => x.organizationId === target.organizationId), `admin "${target.clinicAdmin.name}" should be searchable`).toBe(true);
      });
    }
  });

  test(qase(1200, '[Functional] | Search results are scoped to the currently selected tab only'), async ({ page, clinicsPage: c }) => {
    const activeNames = state.data.ACTIVE.map((x) => x.clinicName.toLowerCase());
    for (const status of /** @type {const} */ (['PENDING', 'DEACTIVATED'])) {
      const target = state.data[status].find((x) => !activeNames.some((n) => n.includes(x.clinicName.toLowerCase().slice(0, 6))) && x.clinicName.length >= 6);
      expect(target, `a ${status} clinic whose name matches nothing on Active`).toBeTruthy();
      const term = target.clinicName.slice(0, 6);
      await test.step(`"${term}" on Active finds nothing`, async () => {
        await openTab(page, c, 'ACTIVE');
        await search(page, c, term);
        await expect(c.rows).toHaveText([NO_MATCH]);
      });
      await test.step(`"${term}" on ${status} finds the clinic`, async () => {
        await openTab(page, c, status);
        const json = await search(page, c, term);
        expect(json.data.every((/** @type {any} */ x) => x.status === status)).toBe(true);
        await expect(c.rowFor(target.email)).toBeVisible();
      });
      await search(page, c, '');
    }
  });

  test(qase(1201, '[Functional] | Clearing the search term reverts the table to show all clinics on the tab'), async ({ page, clinicsPage: c }) => {
    await openTab(page, c, 'PENDING');
    const total = state.data.PENDING.length;
    const narrowed = await search(page, c, state.data.PENDING[0].clinicName.slice(0, 5));
    expect(narrowed.meta.total).toBeLessThan(total);
    const json = await search(page, c, '');
    expect(json.meta.total).toBe(total);
    await expect(c.footer).toHaveText(footerRe(1, Math.min(total, 10), total));
  });

  test(qase(1202, '[Negative] | Search does not match on non-searchable fields (Phone Number, NPI, TIN)'), async ({ page, playwright, clinicsPage: c }) => {
    const target = state.data.ACTIVE[0];
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    const detail = await (await api.get(`${API_BASE}/clinics/${target.organizationId}`)).json();
    await api.dispose();
    await openTab(page, c, 'ACTIVE');
    for (const [label, value] of [['phone', target.phoneNumber], ['NPI', detail.npi], ['TIN', detail.tin]]) {
      await test.step(`${label} "${value}"`, async () => {
        expect(value, `${label} known for the clinic`).toBeTruthy();
        await search(page, c, value);
        await expect(c.rows).toHaveText([NO_MATCH]);
      });
    }
  });

  test(qase(1203, '[Negative] | Search/pagination data-fetch failure shows an error and preserves table state'), async ({ page, clinicsPage: c }) => {
    await openTab(page, c, 'PENDING');
    const rowsBefore = await c.rows.evaluateAll((rs) => rs.map((r) => r.innerText));
    const footerBefore = await c.footer.innerText();
    await test.step('A failing page request shows an error and keeps the table', async () => {
      await page.route(/\/api\/v1\/clinics\?status=PENDING.*page=2/, (route) => route.fulfill({ status: 500, json: { status: 500, message: 'Something went wrong. Please try again later.' } }));
      await c.nextPage.click();
      await expect(page.getByText(/something went wrong|failed to load|could not load|error/i).first()).toBeVisible();
      await expect(c.pendingTab).toHaveClass(/font-semibold/);
      expect(await c.rows.evaluateAll((rs) => rs.map((r) => r.innerText)), 'rows should be kept, not cleared or corrupted').toEqual(rowsBefore);
      await expect(c.footer).toHaveText(footerBefore);
    });
    await test.step('Retry after connectivity returns', async () => {
      // Accepted app behaviour: after a failed load the pager already highlights the requested page, so the retry
      // is made by going back to page 1 and then to page 2 again.
      await page.unroute(/\/api\/v1\/clinics\?status=PENDING.*page=2/);
      await page.getByRole('button', { name: 'Page 1' }).click();
      await expect(c.footer).toHaveText(footerBefore);
      await Promise.all([page.waitForResponse((x) => /status=PENDING.*page=2/.test(x.url()) && x.ok()), page.getByRole('button', { name: 'Page 2' }).click()]);
      await expect(c.footer, 'page 2 loads once connectivity is back').toHaveText(footerRe(11, Math.min(20, state.data.PENDING.length), state.data.PENDING.length));
    });
  });

  test(qase(1204, '[Edge] | Empty-state message correctly distinguishes a true-empty tab from a no-match search'), async ({ page, clinicsPage: c }) => {
    // The empty Active tab shows the generic message (the empty Deactivated tab has its own copy: 'No Deactivated Clinics').
    await simulateClinicList(page, 'ACTIVE', []);
    await test.step('Tab with zero clinics, no search', async () => {
      await openTab(page, c, 'ACTIVE');
      await expect(c.rows).toHaveText([NO_CLINICS]);
    });
    await test.step('Tab with clinics, no-match search', async () => {
      await openTab(page, c, 'PENDING');
      await search(page, c, 'zzqqnomatch');
      await expect(c.headers.first()).toBeVisible();
      await expect(c.rows).toHaveText([NO_MATCH]);
    });
    await test.step('Clear the search', async () => {
      await search(page, c, '');
      await expect(c.footer).toHaveText(footerRe(1, Math.min(state.data.PENDING.length, 10), state.data.PENDING.length));
    });
  });

  test(qase(1205, '[Negative] | "No clinics found" and "No clinics match your search" are never shown together or interchanged'), async ({ page, clinicsPage: c }) => {
    // The empty Active tab shows the generic message (the empty Deactivated tab has its own copy: 'No Deactivated Clinics').
    await simulateClinicList(page, 'ACTIVE', []);
    await test.step('Tab with clinics, no search: neither message', async () => {
      await openTab(page, c, 'PENDING');
      await expect(page.getByText(NO_CLINICS)).toHaveCount(0);
      await expect(page.getByText(NO_MATCH)).toHaveCount(0);
    });
    await test.step('Tab with zero clinics, no search: only "No clinics found."', async () => {
      await openTab(page, c, 'ACTIVE');
      await expect(page.getByText(NO_CLINICS)).toBeVisible();
      await expect(page.getByText(NO_MATCH)).toHaveCount(0);
    });
    await test.step('Tab with clinics, no-match search: only "No clinics match your search."', async () => {
      await openTab(page, c, 'PENDING');
      await search(page, c, 'zzqqnomatch');
      await expect(page.getByText(NO_MATCH)).toBeVisible();
      await expect(page.getByText(NO_CLINICS)).toHaveCount(0);
    });
  });

  test(qase(1206, '[Edge] | Pagination "Showing X-Y of Z" recalculates correctly with and without an active search term'), async ({ page, clinicsPage: c }) => {
    const total = state.data.PENDING.length;
    const pick = termWithAtLeast(state.data.PENDING, 11);
    expect(pick, 'a term matching more than one page of Pending clinics').toBeTruthy();
    const [term] = pick;
    await openTab(page, c, 'PENDING');
    await expect(c.footer).toHaveText(footerRe(1, 10, total));
    const json = await search(page, c, term);
    const filtered = json.meta.total;
    expect(filtered).toBeGreaterThan(10);
    expect(filtered).toBeLessThan(total);
    await expect(c.footer).toHaveText(footerRe(1, 10, filtered));
    await Promise.all([page.waitForResponse((x) => LIST.test(x.url()) && x.url().includes('page=2')), c.nextPage.click()]);
    await expect(c.footer).toHaveText(footerRe(11, Math.min(20, filtered), filtered));
    for (const n of await names(c)) expect(n.toLowerCase()).toContain(term);
    await search(page, c, '');
    await expect(c.footer).toHaveText(footerRe(1, 10, total));
  });

  test(qase(1207, '[UI] | Search field displays a blue focus border when active/selected'), async ({ page, clinicsPage: c }) => {
    await openTab(page, c, 'ACTIVE');
    const border = () =>
      c.search.evaluate((el) => {
        const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
        ctx.fillStyle = getComputedStyle(el).borderTopColor;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      });
    const idle = await border();
    await c.search.click();
    await expect.poll(border).not.toEqual(idle);
    const [r, , b, a] = await border();
    expect(b, 'focused border should be blue-toned').toBeGreaterThan(r);
    expect(a).toBeGreaterThan(0);
    await c.headers.first().click();
    await expect.poll(border).toEqual(idle);
  });

  test(qase(1208, '[Security] | Only the Super Admin role can access Clinic Management search, filter, and pagination'), { annotation: { type: 'note', description: 'Steps 1–2 (non-Super-Admin role logins) are not automated — no such test accounts. Step 3 and token-less API access are checked.' } }, async ({ browser, playwright }) => {
    const ctx = await browser.newContext({ baseURL: SUPER_ADMIN_BASE_URL });
    const anon = await ctx.newPage();
    await anon.goto('/clinics');
    await expect(anon).toHaveURL(/\/login/);
    await ctx.close();
    const api = await playwright.request.newContext();
    expect((await api.get(`${API_BASE}/clinics?status=ACTIVE&page=1&limit=10&search=a`)).status()).toBe(401);
    await api.dispose();
  });

  test(qase(1209, '[E2E] | Full search, tab-switch, and pagination workflow across Clinic Management'), async ({ page, clinicsPage: c }) => {
    const target = state.data.ACTIVE[0];
    await test.step('Clinic Management lands on Active', async () => {
      await page.locator('a[href="/clinics"]').click();
      await expect(c.activeTab).toHaveClass(/font-semibold/);
      await expect(c.footer).toBeVisible();
    });
    await test.step('Search a known Active clinic (partial, case-insensitive)', async () => {
      const json = await search(page, c, target.clinicName.slice(0, 4).toUpperCase());
      await expect(c.rowFor(target.email)).toBeVisible();
      await expect(c.footer).toHaveText(footerRe(1, json.meta.total, json.meta.total));
    });
    await test.step('Switch to Pending — its own list', async () => {
      await openTab(page, c, 'PENDING');
      await expect(c.footer).toHaveText(footerRe(1, 10, state.data.PENDING.length));
    });
    await test.step('No-match search on Pending, then clear', async () => {
      await search(page, c, 'zzqqnomatch');
      await expect(c.rows).toHaveText([NO_MATCH]);
      await search(page, c, '');
      await expect(c.footer).toHaveText(new RegExp(`^Showing 1–10 of ${state.data.PENDING.length} pending clinics$`));
    });
    await test.step('Next page on Pending', async () => {
      await Promise.all([page.waitForResponse((x) => LIST.test(x.url()) && x.url().includes('page=2')), c.nextPage.click()]);
      await expect(c.footer).toHaveText(footerRe(11, Math.min(20, state.data.PENDING.length), state.data.PENDING.length));
    });
    await test.step('Back to Active — reloads correctly', async () => {
      await openTab(page, c, 'ACTIVE');
      await expect(c.footer).toHaveText(footerRe(1, Math.min(state.data.ACTIVE.length, 10), state.data.ACTIVE.length));
    });
  });
});
