// @ts-check
// Qase: HTM › Super Admin › Resource Management › Pending Tab › Action Button (Resend & Cancel Invite) (suite 19).
// Signs in with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env against the QA portal.
//
// Every test acts only on invites it creates itself (unique @example.com emails), cancelled afterwards if still pending.
// - Cancel Invite runs for REAL (DELETE /resources/{id}/invite).
// - Resend Invite is SIMULATED: a freshly sent invite is locked for 24h by the server, so the list response marks the
//   test's own invite as resendable and POST /resources/{id}/resend-invite is simulated — no emails are resent.
//   The real 24h lock on a fresh invite is still used for the "disabled Resend" cases (HTM-328, 331).
// - HTM-332 (invited person opens an expired/cancelled link from email) is skipped.
import { test, expect } from '../../fixtures/pages.js';
import { buildResourceData } from '../../pages/ResourcesPage.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '', SUPER_ADMIN_PASSWORD = '', SUPER_ADMIN_BASE_URL = '' } = process.env;
const API_BASE = SUPER_ADMIN_BASE_URL.replace('://superadmin.', '://api.') + '/api/v1';
const PENDING_LIST = /\/api\/v1\/resources\?status=PENDING/;
const RESEND = /\/api\/v1\/resources\/[^/?]+\/resend-invite$/;
const CANCEL = /\/api\/v1\/resources\/[^/?]+\/invite$/;
const PLEASE_WAIT = /Please wait/;
const RESEND_TOAST = /resent/i;
const CANCEL_TOAST = 'Invite cancelled.';

const state = {
  authorization: '',
  created: /** @type {{ id: string, email: string, firstName: string, lastName: string }[]} */ ([]),
  resendable: /** @type {Map<string, boolean>} */ (new Map()), // email → simulated canResend
  resendCalls: 0,
  cancelCalls: 0,
};

test.describe('Super Admin — Pending tab › Resend & Cancel Invite', () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, 'Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env');
  // One at a time: tests add and cancel real invites, which would shift each other's Pending totals.
  test.describe.configure({ mode: 'default' });

  test.beforeEach(async ({ page, loginPage }) => {
    Object.assign(state, { authorization: '', created: [], resendable: new Map(), resendCalls: 0, cancelCalls: 0 });
    page.on('request', (r) => {
      const auth = r.headers()['authorization'];
      if (auth && r.url().startsWith(API_BASE)) state.authorization = auth;
      if (r.method() === 'POST' && RESEND.test(r.url())) state.resendCalls++;
      if (r.method() === 'DELETE' && CANCEL.test(r.url())) state.cancelCalls++;
    });
    // Serve the real Pending list, overriding canResend only for this test's own invites.
    await page.route(PENDING_LIST, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      for (const item of json.data || []) if (state.resendable.has(item.email)) item.canResend = state.resendable.get(item.email);
      await route.fulfill({ response, json });
    });
    await loginPage.open();
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect.poll(() => state.authorization).not.toBe('');
  });

  test.afterEach(async ({ playwright }) => {
    if (!state.created.length) return;
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    const pending = await (await api.get(`${API_BASE}/resources?status=PENDING&pagination=false`)).json();
    const stillPending = new Set((Array.isArray(pending) ? pending : pending.data).map((/** @type {any} */ x) => x.id));
    for (const { id } of state.created) {
      if (!stillPending.has(id)) continue; // already cancelled by the test
      const res = await api.delete(`${API_BASE}/resources/${id}/invite`);
      expect(res.ok(), `cleanup: cancel invite ${id} → ${res.status()}`).toBe(true);
    }
    await api.dispose();
  });

  /**
   * Creates a real pending Registered Nurse invite via the API (unique @example.com email).
   * @param {any} playwright
   * @param {{ resendable?: boolean, email?: string }} [opts]  resendable → list shows its Resend enabled (simulated)
   */
  const createInvite = async (playwright, { resendable = false, email } = {}) => {
    const d = buildResourceData();
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    const res = await api.post(`${API_BASE}/resources`, {
      data: { role: 'NURSE', firstName: d.firstName, lastName: d.lastName, email: email || d.email, phoneNumber: '+12025550143' },
    });
    expect(res.status(), await res.text()).toBe(201);
    const { userId } = await res.json();
    await api.dispose();
    const invite = { id: userId, email: email || d.email, firstName: d.firstName, lastName: d.lastName };
    state.created.push(invite);
    if (resendable) state.resendable.set(invite.email, true);
    return invite;
  };

  /**
   * Simulates the resend endpoint. On success the invite becomes locked again (as the server's 24h cooldown would).
   * @param {import('@playwright/test').Page} page
   * @param {{ status?: number, delay?: number }} [opts]
   */
  const simulateResend = async (page, { status = 200, delay = 800 } = {}) => {
    await page.route(RESEND, async (route) => {
      await new Promise((r) => setTimeout(r, delay));
      const id = new URL(route.request().url()).pathname.split('/').slice(-2)[0];
      if (status < 400) {
        const inv = state.created.find((c) => c.id === id);
        if (inv) state.resendable.set(inv.email, false);
        // Mirrors the real API shape (as on invite creation): without emailSent the app warns the email failed.
        await route.fulfill({ status, json: { userId: id, status: 'PENDING', emailSent: true } });
      } else {
        await route.fulfill({ status, json: { status, message: 'Something went wrong. Please try again later.' } });
      }
    });
  };

  /** Opens Resource Management → Pending and returns the loaded page's total. */
  const openPending = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ r) => {
    await r.open();
    const [response] = await Promise.all([page.waitForResponse((res) => PENDING_LIST.test(res.url())), r.pendingTab.click()]);
    await expect(r.bodyRows.first()).not.toHaveText(/Loading/);
    return (await response.json()).meta.total;
  };

  const dialog = (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ name) => page.getByRole('dialog', { name });
  const resendBtn = (/** @type {any} */ r, /** @type {string} */ email) => r.rowFor(email).getByRole('button', { name: 'Resend invite' });
  const cancelBtn = (/** @type {any} */ r, /** @type {string} */ email) => r.rowFor(email).getByRole('button', { name: 'Cancel invite' });
  const rgb = (/** @type {import('@playwright/test').Locator} */ l, /** @type {string} */ prop) =>
    l.evaluate((el, p) => {
      const c = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
      c.fillStyle = getComputedStyle(el)[p];
      c.fillRect(0, 0, 1, 1);
      return Array.from(c.getImageData(0, 0, 1, 1).data.slice(0, 3));
    }, prop);
  const isOrange = ([r, g, b]) => r > 200 && g > 100 && g < 200 && b < 80;
  /** True when a full-screen, semi-opaque dark layer (the dimmed backdrop) is present behind an open dialog. */
  const backdropDimmed = (/** @type {import('@playwright/test').Page} */ page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('body *')].some((e) => {
        const s = getComputedStyle(e);
        const box = e.getBoundingClientRect();
        // Resolve any colour format (rgba, oklab, …) to its alpha by painting it on a transparent canvas.
        const c = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
        c.fillStyle = s.backgroundColor;
        c.fillRect(0, 0, 1, 1);
        const alpha = c.getImageData(0, 0, 1, 1).data[3] / 255;
        return s.position === 'fixed' && box.width >= innerWidth - 1 && box.height >= innerHeight - 1 && alpha > 0.1 && alpha < 1 && e.getAttribute('role') !== 'dialog';
      })
    );
  const isNavy = ([r, g, b]) => r + g + b < 150 && b > r;

  test.describe('@smoke', () => {
    test(qase(298, '[SMOKE] | Tapping Resend Invite (when enabled) successfully resends the invite and the resource stays unchanged in Pending'), async ({ page, playwright, resourcesPage: r }) => {
      const inv = await createInvite(playwright, { resendable: true });
      await simulateResend(page);
      const total = await openPending(page, r);
      const modal = dialog(page, 'Resend Invite');
      await test.step('Tap "Resend"', async () => {
        await resendBtn(r, inv.email).click();
        await expect(modal).toBeVisible();
        await expect(modal.locator('.font-bold', { hasText: `${inv.firstName} ${inv.lastName}` })).toBeVisible();
      });
      await test.step('Tap "Resend Invite"', async () => {
        await modal.getByRole('button', { name: 'Resend Invite' }).click();
        await expect(modal.getByRole('button', { name: PLEASE_WAIT })).toBeVisible();
        const toast = r.toast.filter({ hasText: RESEND_TOAST });
        await expect(toast).toBeVisible();
        await expect(toast).toHaveAttribute('data-type', 'success');
      });
      await test.step('Resource stays in Pending unchanged', async () => {
        await expect(r.rowFor(inv.email)).toBeVisible();
        await expect(r.footer).toHaveText(new RegExp(`of ${total} resources$`));
      });
    });

    test(qase(299, '[SMOKE] | Tapping Cancel Invite successfully cancels the invite, removes the resource, and decreases the Pending badge by 1'), async ({ page, playwright, resourcesPage: r }) => {
      const inv = await createInvite(playwright);
      const total = await openPending(page, r);
      const modal = dialog(page, 'Cancel Invite');
      await test.step('Tap the "X" icon', async () => {
        await cancelBtn(r, inv.email).click();
        await expect(modal).toBeVisible();
        await expect(modal.locator('.font-bold', { hasText: `${inv.firstName} ${inv.lastName}` })).toBeVisible();
      });
      await test.step('Tap "Cancel Invite"', async () => {
        await page.route(CANCEL, async (route) => {
          await new Promise((res) => setTimeout(res, 800));
          await route.continue();
        });
        await modal.getByRole('button', { name: 'Cancel Invite' }).click();
        await expect(modal.getByRole('button', { name: PLEASE_WAIT })).toBeVisible();
        await expect(r.toast.filter({ hasText: CANCEL_TOAST })).toHaveAttribute('data-type', 'success');
      });
      await test.step('Resource removed; count decreases by 1', async () => {
        await expect(r.rowFor(inv.email)).toHaveCount(0);
        await expect(r.footer).toHaveText(new RegExp(`of ${total - 1} resources$`));
      });
    });

    test(qase(300, '[SMOKE] | Resend button is disabled immediately after a successful resend and stays disabled until the 24-hour link expiry'), { annotation: { type: 'note', description: 'The 24h cooldown is enforced server-side; the re-enable after 24h is simulated via the list response.' } }, async ({ page, playwright, resourcesPage: r }) => {
      const inv = await createInvite(playwright, { resendable: true });
      await simulateResend(page);
      await openPending(page, r);
      await resendBtn(r, inv.email).click();
      await dialog(page, 'Resend Invite').getByRole('button', { name: 'Resend Invite' }).click();
      await expect(r.toast.filter({ hasText: RESEND_TOAST })).toBeVisible();
      await test.step('Resend is disabled right after the resend', async () => {
        await expect(resendBtn(r, inv.email)).toBeDisabled();
      });
      await test.step('Tapping it again does nothing', async () => {
        await resendBtn(r, inv.email).click({ force: true });
        await expect(dialog(page, 'Resend Invite')).toHaveCount(0);
      });
      await test.step('After 24h the button is enabled again', async () => {
        state.resendable.set(inv.email, true);
        await r.activeTab.click();
        await r.pendingTab.click();
        await expect(resendBtn(r, inv.email)).toBeEnabled();
      });
    });
  });

  test(qase(301, '[Functional] | Pending tab rows highlight with a darker grey background on hover'), async ({ page, resourcesPage: r }) => {
    await openPending(page, r);
    const row = r.bodyRows.first();
    const bg = () => row.evaluate((el) => getComputedStyle(el).backgroundColor);
    const before = await bg();
    await row.locator('td').nth(2).hover();
    await expect.poll(bg).not.toBe(before);
  });

  test(qase(302, '[Functional] | "Resend" button and "X" cancel icon are displayed in the ACTION column for every row'), async ({ page, resourcesPage: r }) => {
    await openPending(page, r);
    const count = await r.bodyRows.count();
    for (let i = 0; i < count; i++) {
      const row = r.bodyRows.nth(i);
      const resend = row.getByRole('button', { name: 'Resend invite' });
      const cancel = row.getByRole('button', { name: 'Cancel invite' });
      await expect(resend.locator('svg.lucide-send')).toBeVisible();
      await expect(cancel.locator('svg.lucide-x')).toBeVisible();
      const [a, b] = await Promise.all([resend.boundingBox(), cancel.boundingBox()]);
      if (a && b) expect(Math.abs(a.y - b.y)).toBeLessThan(5);
      // Accepted app design: Resend is an icon-only paper-plane button, labelled "Resend invite" (name + tooltip).
      await expect(resend).toHaveAttribute('title', 'Resend invite');
      await expect(cancel).toHaveAttribute('title', 'Cancel invite');
    }
  });

  test(qase(303, '[Functional] | "X" icon renders neutral/grey by default and changes to orange highlighted background/icon color on hover'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    const x = cancelBtn(r, inv.email);
    const [cr, cg, cb] = await rgb(x, 'color');
    expect(Math.max(cr, cg, cb) - Math.min(cr, cg, cb), 'default icon colour should be neutral grey').toBeLessThan(40);
    await x.hover();
    await expect.poll(() => rgb(x, 'color').then(isOrange), { message: 'icon turns orange on hover' }).toBe(true);
    await expect.poll(() => rgb(x, 'backgroundColor').then(([r0, g0, b0]) => r0 > 240 && b0 < 240 && g0 > 220)).toBe(true); // amber-50 highlight
  });

  test(qase(304, '[Functional] | Tapping "Resend" opens the Resend Invite confirmation modal with background dimmed and non-interactive'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await openPending(page, r);
    await resendBtn(r, inv.email).click();
    await expect(dialog(page, 'Resend Invite')).toBeVisible();
    await expect.poll(() => backdropDimmed(page), { message: 'background should be dimmed' }).toBe(true);
    await r.activeTab.click({ timeout: 2000 }).catch(() => {});
    await expect(dialog(page, 'Resend Invite')).toBeVisible();
    await expect(r.pendingTab).toHaveClass(/font-semibold/);
  });

  test(qase(305, '[Functional] | Resend Invite modal displays teal paper-plane icon, heading, and confirmation text with bold name/email'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await openPending(page, r);
    await resendBtn(r, inv.email).click();
    const modal = dialog(page, 'Resend Invite');
    await test.step('Teal paper-plane icon above the heading', async () => {
      const icon = modal.locator('svg.text-teal-600');
      await expect(icon).toBeVisible();
      await expect(icon.locator('xpath=..')).toHaveClass(/bg-teal-50/);
      const [ib, hb] = await Promise.all([icon.boundingBox(), modal.getByRole('heading', { name: 'Resend Invite' }).boundingBox()]);
      if (ib && hb) expect(ib.y + ib.height).toBeLessThanOrEqual(hb.y);
    });
    await test.step('Confirmation text with bold name and email', async () => {
      // Accepted app wording: "Resend the invite for <Name>?" with the name in bold (the email is not shown).
      await expect(modal.getByText(`Resend the invite for ${inv.firstName} ${inv.lastName}?`)).toBeVisible();
      const name = modal.locator('.font-bold', { hasText: `${inv.firstName} ${inv.lastName}` });
      await expect(name).toBeVisible();
      expect(Number(await name.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
    });
  });

  test(qase(306, '[Functional] | Resend Invite modal displays Cancel and "Resend Invite" buttons plus a close (X) icon top-right'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await openPending(page, r);
    await resendBtn(r, inv.email).click();
    const modal = dialog(page, 'Resend Invite');
    const cancel = modal.getByRole('button', { name: 'Cancel', exact: true });
    const confirm = modal.getByRole('button', { name: 'Resend Invite' });
    await expect(cancel).toHaveClass(/border/);
    await expect(cancel).toHaveClass(/bg-white/);
    expect(isNavy(await rgb(confirm, 'backgroundColor'))).toBe(true);
    expect(await rgb(confirm, 'color')).toEqual([255, 255, 255]);
    const [close, m] = await Promise.all([modal.getByRole('button', { name: 'Close' }).boundingBox(), modal.boundingBox()]);
    if (close && m) {
      expect(close.x).toBeGreaterThan(m.x + m.width / 2);
      expect(close.y).toBeLessThan(m.y + m.height / 4);
    }
  });

  test(qase(307, '[Functional] | Tapping "Resend Invite" changes its label to "Please wait..." in dimmed/lighter blue while processing'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await simulateResend(page, { delay: 2000 });
    await openPending(page, r);
    await resendBtn(r, inv.email).click();
    const modal = dialog(page, 'Resend Invite');
    await modal.getByRole('button', { name: 'Resend Invite' }).click();
    const waiting = modal.getByRole('button', { name: PLEASE_WAIT });
    await expect(waiting).toBeVisible();
    expect(isNavy(await rgb(waiting, 'backgroundColor'))).toBe(true);
    expect(Number(await waiting.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
  });

  test(qase(308, '[Functional] | Successful resend shows a green "Invite resent successfully" toast in the top-right corner'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await simulateResend(page);
    await openPending(page, r);
    await resendBtn(r, inv.email).click();
    await dialog(page, 'Resend Invite').getByRole('button', { name: 'Resend Invite' }).click();
    const toast = r.toast.filter({ hasText: 'Invite resent successfully' });
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute('data-type', 'success');
    await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-x-position', 'right');
    await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-y-position', 'top');
  });

  test(qase(309, '[Functional] | Tapping the "X" icon opens the Cancel Invite confirmation modal with background dimmed and non-interactive'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    await cancelBtn(r, inv.email).click();
    await expect(dialog(page, 'Cancel Invite')).toBeVisible();
    await expect.poll(() => backdropDimmed(page), { message: 'background should be dimmed' }).toBe(true);
    await r.activeTab.click({ timeout: 2000 }).catch(() => {});
    await expect(dialog(page, 'Cancel Invite')).toBeVisible();
    await expect(r.pendingTab).toHaveClass(/font-semibold/);
    expect(state.cancelCalls).toBe(0);
  });

  test(qase(310, '[Functional] | Cancel Invite modal displays orange X icon, heading, and confirmation text with bold name/email'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    await cancelBtn(r, inv.email).click();
    const modal = dialog(page, 'Cancel Invite');
    await test.step('Orange circular icon above the heading', async () => {
      const icon = modal.locator('svg.text-amber-500');
      await expect(icon).toBeVisible();
      expect(isOrange(await rgb(icon, 'color'))).toBe(true);
      const [ib, hb] = await Promise.all([icon.boundingBox(), modal.getByRole('heading', { name: 'Cancel Invite' }).boundingBox()]);
      if (ib && hb) expect(ib.y + ib.height).toBeLessThanOrEqual(hb.y);
    });
    await test.step('Confirmation text with bold name and email', async () => {
      // Accepted app wording: "Are you sure you want to cancel the pending invite for <Name>?" with the name in bold.
      await expect(modal.getByText(`Are you sure you want to cancel the pending invite for ${inv.firstName} ${inv.lastName}?`)).toBeVisible();
      const name = modal.locator('.font-bold', { hasText: `${inv.firstName} ${inv.lastName}` });
      await expect(name).toBeVisible();
      expect(Number(await name.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
    });
  });

  test(qase(311, '[Functional] | Cancel Invite modal displays Cancel and "Cancel Invite" buttons plus a close (X) icon top-right'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    await cancelBtn(r, inv.email).click();
    const modal = dialog(page, 'Cancel Invite');
    const cancel = modal.getByRole('button', { name: 'Cancel', exact: true });
    const confirm = modal.getByRole('button', { name: 'Cancel Invite' });
    await expect(cancel).toHaveClass(/border/);
    await expect(cancel).toHaveClass(/bg-white/);
    expect(isOrange(await rgb(confirm, 'backgroundColor'))).toBe(true);
    const [close, m] = await Promise.all([modal.getByRole('button', { name: 'Close' }).boundingBox(), modal.boundingBox()]);
    if (close && m) {
      expect(close.x).toBeGreaterThan(m.x + m.width / 2);
      expect(close.y).toBeLessThan(m.y + m.height / 4);
    }
  });

  test(qase(312, '[Functional] | Tapping "Cancel Invite" changes its label to "Please wait..." in dimmed/lighter orange while processing'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    await page.route(CANCEL, async (route) => {
      await new Promise((res) => setTimeout(res, 2000));
      await route.continue();
    });
    await cancelBtn(r, inv.email).click();
    const modal = dialog(page, 'Cancel Invite');
    await modal.getByRole('button', { name: 'Cancel Invite' }).click();
    const waiting = modal.getByRole('button', { name: PLEASE_WAIT });
    await expect(waiting).toBeVisible();
    expect(isOrange(await rgb(waiting, 'backgroundColor'))).toBe(true);
    expect(Number(await waiting.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
    await expect(r.toast.filter({ hasText: CANCEL_TOAST })).toBeVisible();
  });

  test(qase(313, '[Functional] | Successful cancellation shows a green success toast in the top-right corner'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    await cancelBtn(r, inv.email).click();
    await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).click();
    const toast = r.toast.filter({ hasText: CANCEL_TOAST });
    await expect(toast).toHaveAttribute('data-type', 'success');
    await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-x-position', 'right');
    await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-y-position', 'top');
  });

  for (const [id, label, modalName, close] of /** @type {const} */ ([
    [314, 'Tapping Cancel (neutral button) on the Resend Invite modal dismisses it with no change made', 'Resend Invite', 'cancel'],
    [315, 'Tapping the X close icon on the Resend Invite modal dismisses it with no change made', 'Resend Invite', 'x'],
    [316, 'Tapping Cancel (neutral button) on the Cancel Invite modal dismisses it with no change made', 'Cancel Invite', 'cancel'],
    [317, 'Tapping the X close icon on the Cancel Invite modal dismisses it with no change made', 'Cancel Invite', 'x'],
  ])) {
    test(qase(id, `[Functional] | ${label}`), async ({ page, playwright, resourcesPage: r }) => {
      const isResend = modalName === 'Resend Invite';
      const inv = await createInvite(playwright, { resendable: isResend });
      if (isResend) await simulateResend(page);
      const total = await openPending(page, r);
      await (isResend ? resendBtn(r, inv.email) : cancelBtn(r, inv.email)).click();
      const modal = dialog(page, modalName);
      await expect(modal).toBeVisible();
      await (close === 'cancel' ? modal.getByRole('button', { name: 'Cancel', exact: true }) : modal.getByRole('button', { name: 'Close' })).click();
      await expect(modal).toBeHidden();
      await expect(r.pendingTab).toHaveClass(/font-semibold/);
      await expect(r.rowFor(inv.email)).toBeVisible();
      await expect(r.footer).toHaveText(new RegExp(`of ${total} resources$`));
      if (isResend) await expect(resendBtn(r, inv.email)).toBeEnabled();
      expect(state.resendCalls + state.cancelCalls).toBe(0);
    });
  }

  test(qase(318, '[Functional] | After a successful Resend, the resource remains in the Pending tab unchanged'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await simulateResend(page);
    const total = await openPending(page, r);
    const cellsBefore = await r.rowFor(inv.email).locator('td').allInnerTexts();
    const indexBefore = (await r.bodyRows.locator('td:nth-child(2)').allInnerTexts()).indexOf(inv.email);
    await resendBtn(r, inv.email).click();
    await dialog(page, 'Resend Invite').getByRole('button', { name: 'Resend Invite' }).click();
    await expect(r.toast.filter({ hasText: RESEND_TOAST })).toBeVisible();
    await expect.poll(() => r.rowFor(inv.email).locator('td').allInnerTexts()).toEqual(cellsBefore);
    expect((await r.bodyRows.locator('td:nth-child(2)').allInnerTexts()).indexOf(inv.email)).toBe(indexBefore);
    await expect(r.footer).toHaveText(new RegExp(`of ${total} resources$`));
  });

  test(qase(319, "[Functional] | After a successful Cancel, the resource is permanently removed from the Pending tab's table"), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    await cancelBtn(r, inv.email).click();
    await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).click();
    await expect(r.rowFor(inv.email)).toHaveCount(0);
    await page.reload();
    await r.pendingTab.click();
    await expect(r.bodyRows.first()).not.toHaveText(/Loading/);
    await expect(r.rowFor(inv.email)).toHaveCount(0);
  });

  test(qase(320, '[Functional] | Pending tab count badge decreases by 1 immediately upon a successful cancellation'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    const total = await openPending(page, r);
    await expect(page.getByRole('button', { name: new RegExp(`^Pending\\s*${total}$`) }), 'Pending tab should show a count badge').toBeVisible();
    await cancelBtn(r, inv.email).click();
    await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^Pending\\s*${total - 1}$`) })).toBeVisible();
  });

  test(qase(321, '[Functional] | Cancelled resource does not appear in Active or Deactivated tabs after cancellation'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    await cancelBtn(r, inv.email).click();
    await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).click();
    await expect(r.rowFor(inv.email)).toHaveCount(0);
    for (const tab of [r.activeTab, r.deactivatedTab]) {
      await tab.click();
      await expect(r.bodyRows.first()).not.toHaveText(/Loading/);
      await expect(r.rowFor(inv.email)).toHaveCount(0);
    }
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    for (const status of ['ACTIVE', 'DEACTIVATED', 'PENDING']) {
      const j = await (await api.get(`${API_BASE}/resources?status=${status}&pagination=false`)).json();
      expect((Array.isArray(j) ? j : j.data).some((/** @type {any} */ x) => x.email === inv.email)).toBe(false);
    }
    await api.dispose();
  });

  test(qase(322, '[Functional] | Re-inviting a previously cancelled person requires starting a completely new Add New Resource flow'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    await openPending(page, r);
    await cancelBtn(r, inv.email).click();
    await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).click();
    await expect(r.rowFor(inv.email)).toHaveCount(0);
    await test.step('No restore / reuse option anywhere', async () => {
      await expect(page.getByRole('button', { name: /restore|reuse|undo|reactivate/i })).toHaveCount(0);
    });
    await test.step('Invite the same person again from scratch', async () => {
      await r.openModal();
      await r.fillForm('nurse', { email: inv.email });
      await r.sendInviteButton.click();
      await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
      await r.viewResourceButton.click();
      await expect(r.rowFor(inv.email)).toBeVisible();
      const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
      const j = await (await api.get(`${API_BASE}/resources?status=PENDING&pagination=false`)).json();
      const fresh = (Array.isArray(j) ? j : j.data).find((/** @type {any} */ x) => x.email === inv.email);
      await api.dispose();
      expect(fresh.id, 'a brand-new record, not the cancelled one').not.toBe(inv.id);
      state.created.push({ ...inv, id: fresh.id }); // clean up the new invite too
    });
  });

  test(qase(323, '[Negative] | Single tap on "Resend" or the "X" icon only opens the confirmation modal, never performs the action immediately'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await simulateResend(page);
    await openPending(page, r);
    await resendBtn(r, inv.email).click();
    await expect(dialog(page, 'Resend Invite')).toBeVisible();
    await page.waitForTimeout(800);
    expect(state.resendCalls).toBe(0);
    await dialog(page, 'Resend Invite').getByRole('button', { name: 'Close' }).click();
    await cancelBtn(r, inv.email).click();
    await expect(dialog(page, 'Cancel Invite')).toBeVisible();
    await page.waitForTimeout(800);
    expect(state.cancelCalls).toBe(0);
    await expect(r.rowFor(inv.email)).toBeVisible();
  });

  test(qase(324, '[Negative] | Neither modal can be dismissed nor re-tapped while in its "Please wait..." loading state'), async ({ page, playwright, resourcesPage: r }) => {
    const a = await createInvite(playwright, { resendable: true });
    const b = await createInvite(playwright);
    await simulateResend(page, { delay: 3000 });
    await page.route(CANCEL, async (route) => {
      await new Promise((res) => setTimeout(res, 3000));
      await route.continue();
    });
    await openPending(page, r);
    for (const [name, open, confirmName] of /** @type {const} */ ([
      ['Resend Invite', () => resendBtn(r, a.email).click(), 'Resend Invite'],
      ['Cancel Invite', () => cancelBtn(r, b.email).click(), 'Cancel Invite'],
    ])) {
      await test.step(`${name} modal is locked while waiting`, async () => {
        await open();
        const modal = dialog(page, name);
        await modal.getByRole('button', { name: confirmName }).click();
        await expect(modal.getByRole('button', { name: PLEASE_WAIT }), 'confirm button locked while waiting').toBeDisabled();
        // Each dismissal is checked on its own (soft) so the report names exactly which one breaks the lock.
        for (const [label, attempt] of /** @type {const} */ ([
          ['Cancel button', () => modal.getByRole('button', { name: 'Cancel', exact: true }).click({ force: true, timeout: 1000 })],
          ['X close icon', () => modal.getByRole('button', { name: 'Close' }).click({ force: true, timeout: 1000 })],
          ['Escape key', () => page.keyboard.press('Escape')],
        ])) {
          if (!(await modal.isVisible())) break;
          await attempt().catch(() => {});
          await page.waitForTimeout(200);
          await expect.soft(modal, `${name}: the ${label} must not close the modal during "Please wait…"`).toBeVisible();
        }
        await expect(modal).toBeHidden({ timeout: 10_000 }); // closes once the request completes
      });
    }
    expect(state.resendCalls).toBe(1);
    expect(state.cancelCalls).toBe(1);
  });

  test(qase(325, "[Negative] | Background screen, including other rows' action buttons, is non-interactive while either modal is open"), async ({ page, playwright, resourcesPage: r }) => {
    const a = await createInvite(playwright);
    const b = await createInvite(playwright);
    await openPending(page, r);
    const other = await cancelBtn(r, a.email).boundingBox();
    await cancelBtn(r, b.email).click();
    const modal = dialog(page, 'Cancel Invite');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(`${b.firstName} ${b.lastName}`);
    if (other) await page.mouse.click(other.x + other.width / 2, other.y + other.height / 2);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(modal).toContainText(`${b.firstName} ${b.lastName}`);
    expect(state.cancelCalls).toBe(0);
  });

  test(qase(326, '[Negative] | Resend API/network failure leaves the resource unchanged with no success toast'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await simulateResend(page, { status: 500, delay: 300 });
    await openPending(page, r);
    const modal = dialog(page, 'Resend Invite');
    await test.step('Resend fails', async () => {
      await resendBtn(r, inv.email).click();
      await modal.getByRole('button', { name: 'Resend Invite' }).click();
      await expect(r.toast.filter({ hasText: /something went wrong/i })).toBeVisible();
      await expect(r.toast.filter({ hasText: RESEND_TOAST })).toHaveCount(0);
      if (await modal.isVisible()) await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(resendBtn(r, inv.email)).toBeEnabled(); // cooldown not started
      await expect(r.rowFor(inv.email)).toBeVisible();
    });
    await test.step('Retry succeeds', async () => {
      await page.unroute(RESEND);
      await simulateResend(page);
      await resendBtn(r, inv.email).click();
      await modal.getByRole('button', { name: 'Resend Invite' }).click();
      await expect(r.toast.filter({ hasText: RESEND_TOAST })).toBeVisible();
    });
  });

  test(qase(327, '[Negative] | Cancel Invite API/network failure leaves the resource in the Pending tab unchanged'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    const total = await openPending(page, r);
    const modal = dialog(page, 'Cancel Invite');
    await test.step('Cancel fails', async () => {
      await page.route(CANCEL, (route) => route.fulfill({ status: 500, json: { status: 500, message: 'Something went wrong. Please try again later.' } }));
      await cancelBtn(r, inv.email).click();
      await modal.getByRole('button', { name: 'Cancel Invite' }).click();
      await expect(r.toast.filter({ hasText: /something went wrong/i })).toBeVisible();
      await expect(r.toast.filter({ hasText: CANCEL_TOAST })).toHaveCount(0);
      if (await modal.isVisible()) await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(r.rowFor(inv.email)).toBeVisible();
      await expect(r.footer).toHaveText(new RegExp(`of ${total} resources$`));
    });
    await test.step('Retry succeeds', async () => {
      await page.unroute(CANCEL);
      await cancelBtn(r, inv.email).click();
      await modal.getByRole('button', { name: 'Cancel Invite' }).click();
      await expect(r.rowFor(inv.email)).toHaveCount(0);
      await expect(r.footer).toHaveText(new RegExp(`of ${total - 1} resources$`));
    });
  });

  test(qase(328, '[Negative] | Tapping a disabled Resend button (within the 24-hour cooldown) has no effect'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright); // freshly sent → real 24h lock
    await openPending(page, r);
    await expect(resendBtn(r, inv.email)).toBeDisabled();
    await resendBtn(r, inv.email).click({ force: true });
    await expect(dialog(page, 'Resend Invite')).toHaveCount(0);
    expect(state.resendCalls).toBe(0);
  });

  test(qase(329, '[Edge] | Resend button re-enables exactly once the 24-hour link expiry threshold is reached, not before'), { annotation: { type: 'note', description: 'The 24h threshold is computed server-side (canResend); both states are simulated via the list response.' } }, async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright);
    state.resendable.set(inv.email, false); // 23h59m: server still reports locked
    await openPending(page, r);
    await expect(resendBtn(r, inv.email)).toBeDisabled();
    state.resendable.set(inv.email, true); // 24h reached: server reports resendable
    await r.activeTab.click();
    await r.pendingTab.click();
    await expect(resendBtn(r, inv.email)).toBeEnabled();
  });

  test(qase(330, '[Edge] | Rapid double-tap on "Resend Invite" or "Cancel Invite" inside their modals sends only a single request'), async ({ page, playwright, resourcesPage: r }) => {
    const a = await createInvite(playwright, { resendable: true });
    const b = await createInvite(playwright);
    await simulateResend(page, { delay: 1000 });
    const total = await openPending(page, r);
    await test.step('Double-tap "Resend Invite"', async () => {
      await resendBtn(r, a.email).click();
      await dialog(page, 'Resend Invite').getByRole('button', { name: 'Resend Invite' }).dblclick();
      await expect(r.toast.filter({ hasText: RESEND_TOAST })).toHaveCount(1);
      await page.waitForTimeout(800);
      expect(state.resendCalls).toBe(1);
    });
    await test.step('Double-tap "Cancel Invite" for a different resource', async () => {
      await cancelBtn(r, b.email).click();
      await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).dblclick();
      await expect(r.toast.filter({ hasText: CANCEL_TOAST })).toHaveCount(1);
      await expect(r.rowFor(b.email)).toHaveCount(0);
      await page.waitForTimeout(800);
      expect(state.cancelCalls).toBe(1);
      await expect(r.footer).toHaveText(new RegExp(`of ${total - 1} resources$`));
    });
  });

  test(qase(331, '[Edge] | Resend-disabled cooldown state persists correctly across a page refresh'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright); // freshly sent → real 24h lock
    await openPending(page, r);
    await expect(resendBtn(r, inv.email)).toBeDisabled();
    await page.reload();
    await r.pendingTab.click();
    await expect(r.bodyRows.first()).not.toHaveText(/Loading/);
    await expect(resendBtn(r, inv.email)).toBeDisabled();
  });

  test.skip(qase(332, '[Edge] | Opening an expired or cancelled invite link shows the invited person the expiry/cancellation message'), { annotation: { type: 'skip', description: "Needs the invited person's emailed invite link, which automation can't access" } }, async () => {});

  test(qase(333, '[Security] | Resend and Cancel Invite actions are inaccessible to unauthenticated or unauthorized users'), async ({ playwright }) => {
    const inv = await createInvite(playwright);
    const anon = await playwright.request.newContext();
    expect((await anon.post(`${API_BASE}/resources/${inv.id}/resend-invite`)).status()).toBe(401);
    expect((await anon.delete(`${API_BASE}/resources/${inv.id}/invite`)).status()).toBe(401);
    await anon.dispose();
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    const j = await (await api.get(`${API_BASE}/resources?status=PENDING&pagination=false`)).json();
    expect((Array.isArray(j) ? j : j.data).some((/** @type {any} */ x) => x.id === inv.id), 'invite still pending after the blocked calls').toBe(true);
    await api.dispose();
  });

  test(qase(334, '[UI] | Resend Invite and Cancel Invite modals use visually distinct color themes matching their severity'), async ({ page, playwright, resourcesPage: r }) => {
    const inv = await createInvite(playwright, { resendable: true });
    await openPending(page, r);
    await resendBtn(r, inv.email).click();
    const resend = dialog(page, 'Resend Invite');
    const resendIcon = await rgb(resend.locator('svg.text-teal-600'), 'color');
    const resendConfirm = await rgb(resend.getByRole('button', { name: 'Resend Invite' }), 'backgroundColor');
    expect(resendIcon[1]).toBeGreaterThan(resendIcon[0]); // teal: green/blue over red
    expect(isNavy(resendConfirm)).toBe(true);
    await resend.getByRole('button', { name: 'Close' }).click();
    await cancelBtn(r, inv.email).click();
    const cancel = dialog(page, 'Cancel Invite');
    expect(isOrange(await rgb(cancel.locator('svg.text-amber-500'), 'color'))).toBe(true);
    expect(isOrange(await rgb(cancel.getByRole('button', { name: 'Cancel Invite' }), 'backgroundColor'))).toBe(true);
  });

  test(qase(335, '[UI] | "Please wait..." loading label styling is visually distinguishable per action'), async ({ page, playwright, resourcesPage: r }) => {
    const a = await createInvite(playwright, { resendable: true });
    const b = await createInvite(playwright);
    await simulateResend(page, { delay: 2000 });
    await page.route(CANCEL, async (route) => {
      await new Promise((res) => setTimeout(res, 2000));
      await route.continue();
    });
    await openPending(page, r);
    await resendBtn(r, a.email).click();
    await dialog(page, 'Resend Invite').getByRole('button', { name: 'Resend Invite' }).click();
    const resendWaiting = await rgb(dialog(page, 'Resend Invite').getByRole('button', { name: PLEASE_WAIT }), 'backgroundColor');
    await expect(dialog(page, 'Resend Invite')).toBeHidden({ timeout: 10_000 });
    await cancelBtn(r, b.email).click();
    await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).click();
    const cancelWaiting = await rgb(dialog(page, 'Cancel Invite').getByRole('button', { name: PLEASE_WAIT }), 'backgroundColor');
    expect(isNavy(resendWaiting)).toBe(true);
    expect(isOrange(cancelWaiting)).toBe(true);
    expect(resendWaiting).not.toEqual(cancelWaiting);
  });

  test(qase(336, '[E2E] | Full lifecycle: resend an invite and verify the cooldown lock, then cancel a different invite and verify permanent removal'), async ({ page, playwright, resourcesPage: r }) => {
    test.setTimeout(90_000); // long E2E: resend + cancel + two tab checks + a fresh invite
    const a = await createInvite(playwright, { resendable: true });
    const b = await createInvite(playwright);
    await simulateResend(page);
    const total = await openPending(page, r);
    await test.step('Resend to Resource A', async () => {
      await resendBtn(r, a.email).click();
      const modal = dialog(page, 'Resend Invite');
      await modal.getByRole('button', { name: 'Resend Invite' }).click();
      await expect(modal.getByRole('button', { name: PLEASE_WAIT })).toBeVisible();
      await expect(r.toast.filter({ hasText: RESEND_TOAST })).toBeVisible();
      await expect(r.rowFor(a.email)).toBeVisible();
      await expect(resendBtn(r, a.email)).toBeDisabled();
    });
    await test.step('Cancel Resource B', async () => {
      await cancelBtn(r, b.email).click();
      await dialog(page, 'Cancel Invite').getByRole('button', { name: 'Cancel Invite' }).click();
      await expect(r.toast.filter({ hasText: CANCEL_TOAST })).toBeVisible();
      await expect(r.rowFor(b.email)).toHaveCount(0);
      await expect(r.footer).toHaveText(new RegExp(`of ${total - 1} resources$`));
    });
    await test.step('Resource B is not in Active or Deactivated', async () => {
      for (const tab of [r.activeTab, r.deactivatedTab]) {
        await tab.click();
        await expect(r.bodyRows.first()).not.toHaveText(/Loading/);
        await expect(r.rowFor(b.email)).toHaveCount(0);
      }
    });
    await test.step('Invite Resource B again from scratch', async () => {
      await r.openModal();
      await r.fillForm('nurse', { email: b.email });
      const [res] = await Promise.all([page.waitForResponse((x) => x.request().method() === 'POST' && x.url().endsWith('/api/v1/resources')), r.sendInviteButton.click()]);
      const { userId } = await res.json();
      expect(userId).not.toBe(b.id);
      state.created.push({ ...b, id: userId });
      await expect(r.confirmationHeading).toBeVisible({ timeout: 15_000 });
    });
  });
});
