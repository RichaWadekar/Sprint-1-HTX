// @ts-check
// Qase: HTM › Super Admin › Settings › Change Password (suite 11). Titles carry Qase case IDs via qase(id, title).
// Signs in with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env against the QA portal.
//
// The account's real password is never changed: a guard route answers every save that carries the correct old
// password with a simulated success (the app's own "Password updated successfully." toast is still asserted).
// Wrong-old-password submissions (HTM-702, 715, 724) do reach the real server, one attempt each.
// The Old Password field starts empty in this build (Qase expects it pre-filled), so tests type it in.
// HTM-708 (Old Password pre-filled) and HTM-714 (mismatch shown as a toast) are intentionally not scripted.
// Known UI issue: Save and Cancel ignore the first click while a password field has focus; the page object blurs first.
import { test, expect } from '../../fixtures/pages.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '', SUPER_ADMIN_PASSWORD = '', SUPER_ADMIN_BASE_URL = '' } = process.env;
const API_BASE = SUPER_ADMIN_BASE_URL.replace('://superadmin.', '://api.') + '/api/v1';
const NEW_PASSWORD = 'Valid@98765';
const WRONG_OLD = 'Wrong@12345';
const SUCCESS = 'Password updated successfully.';
const WRONG_OLD_MESSAGE = 'The current password is incorrect';

/** Per-test state: saves that hit the (guarded) change-password endpoint, and the captured auth header. */
const state = { saves: 0, simulatedSaves: 0, authorization: '' };

/**
 * Replaces the guard with a custom response for the next saves (e.g. a 500), still never touching the real password.
 * @param {import('@playwright/test').Page} page
 * @param {{ status: number, delay?: number }} opts
 */
async function simulateSave(page, { status, delay = 0 }) {
  await page.route('**/auth/change-password', async (route) => {
    state.saves++;
    state.simulatedSaves++;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const body = status < 400 ? { success: true } : { status, message: 'Something went wrong. Please try again later.' };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.describe('Super Admin — Change Password', () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, 'Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env');

  test.beforeEach(async ({ page, loginPage, changePasswordPage }) => {
    state.saves = 0;
    state.simulatedSaves = 0;
    state.authorization = '';
    page.on('request', (r) => {
      const auth = r.headers()['authorization'];
      if (auth && r.url().startsWith(API_BASE)) state.authorization = auth;
    });
    // Guard: a save with the correct old password is always simulated, so the real password can never change.
    await page.route('**/auth/change-password', async (route) => {
      state.saves++;
      const body = route.request().postDataJSON() || {};
      if (body.oldPassword === SUPER_ADMIN_PASSWORD) {
        state.simulatedSaves++;
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
      } else {
        await route.continue(); // wrong old password → real server rejection
      }
    });
    await loginPage.open();
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
    await changePasswordPage.open();
  });

  test.describe('@smoke', () => {
    test(qase(701, '[SMOKE] | Successfully changing password with a correct old password and a policy-compliant new password shows a success toast'), async ({ changePasswordPage: cp }) => {
      await test.step('Enter the correct current password', async () => {
        await cp.oldPassword.fill(SUPER_ADMIN_PASSWORD);
        await expect(cp.fieldErrors).toHaveCount(0);
      });
      await test.step('Enter a policy-compliant new password in both fields', async () => {
        await cp.newPassword.fill(NEW_PASSWORD);
        await cp.confirmPassword.fill(NEW_PASSWORD);
        await expect(cp.saveButton).toBeEnabled();
      });
      await test.step('Tap "Save Password"', async () => {
        await cp.save();
        const toast = cp.toast.filter({ hasText: SUCCESS });
        await expect(toast).toBeVisible();
        await expect(toast).toHaveAttribute('data-type', 'success');
        await expect(cp.toaster).toHaveAttribute('data-x-position', 'right');
        await expect(cp.toaster).toHaveAttribute('data-y-position', 'top');
        expect(state.simulatedSaves).toBe(1);
      });
    });

    test(qase(702, '[SMOKE] | Entering an incorrect old password blocks submission with an appropriate error'), async ({ page, changePasswordPage: cp }) => {
      await cp.fill(WRONG_OLD, NEW_PASSWORD);
      await cp.save();
      await expect(cp.toast.filter({ hasText: WRONG_OLD_MESSAGE })).toBeVisible();
      await expect(cp.toast.filter({ hasText: SUCCESS })).toHaveCount(0);
      await expect(page).toHaveURL(/\/settings\/password/);
    });

    test(qase(703, '[SMOKE] | Save Password remains disabled until all three fields are filled, then submits successfully once valid'), async ({ changePasswordPage: cp }) => {
      await test.step('New and Confirm empty — Save disabled', async () => {
        await cp.oldPassword.fill(SUPER_ADMIN_PASSWORD);
        await expect(cp.saveButton).toBeDisabled();
      });
      await test.step('Fill both new-password fields — Save enabled and submits', async () => {
        await cp.newPassword.fill(NEW_PASSWORD);
        await cp.confirmPassword.fill(NEW_PASSWORD);
        await expect(cp.saveButton).toBeEnabled();
        await cp.save();
        await expect(cp.toast.filter({ hasText: SUCCESS })).toBeVisible();
      });
    });
  });

  test(qase(704, '[Functional] | Settings appears in the left sidebar and shows Change Password selected by default in its sub-nav'), async ({ page, changePasswordPage: cp }) => {
    await page.goto('/dashboard');
    await page.locator('a[href="/settings"]').click();
    await expect(page).toHaveURL(/\/settings\/password/);
    await expect(cp.changePasswordLink).toBeVisible();
    await expect(cp.notificationSettingsLink).toBeVisible();
    await expect(cp.changePasswordLink).toHaveClass(/\bactive\b/);
    await expect(cp.notificationSettingsLink).not.toHaveClass(/\bactive\b/);
  });

  test(qase(705, '[Functional] | Page heading and subtext display correctly'), async ({ changePasswordPage: cp }) => {
    await expect(cp.heading).toBeVisible();
    await expect(cp.subtext).toBeVisible();
  });

  test(qase(706, '[Functional] | Three fields render top to bottom with correct labels and placeholders'), async ({ page, changePasswordPage: cp }) => {
    await expect(page.getByRole('textbox', { name: /Enter Old Password/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Enter New Password/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Confirm New Password/ })).toBeVisible();
    await expect(cp.newPassword).toHaveAttribute('placeholder', 'Min. 8 characters');
    await expect(cp.confirmPassword).toHaveAttribute('placeholder', 'Re-enter new password');
    const [o, n, c] = await Promise.all([cp.oldPassword, cp.newPassword, cp.confirmPassword].map((f) => f.boundingBox()));
    expect(o && n && c).toBeTruthy();
    if (o && n && c) {
      expect(o.y).toBeLessThan(n.y);
      expect(n.y).toBeLessThan(c.y);
    }
  });

  test(qase(707, '[Functional] | Each of the three fields has an eye icon toggle'), async ({ changePasswordPage: cp }) => {
    for (const eye of [cp.oldEye, cp.newEye, cp.confirmEye]) await expect(eye).toBeVisible();
  });

  test(qase(709, '[Functional] | Cancel (neutral/outline) and Save Password (solid dark blue) buttons are present at the bottom of the form'), async ({ changePasswordPage: cp }) => {
    await expect(cp.cancelButton).toBeVisible();
    await expect(cp.saveButton).toHaveText('Save Password');
    const cancel = await cp.cancelButton.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderStyle }));
    expect(cancel.bg).toMatch(/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/);
    expect(cancel.border).not.toBe('none');
    const save = await cp.saveButton.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    const [r, g, b] = (save.bg.match(/\d+/g) || []).map(Number);
    expect(r + g + b, 'Save Password should be a dark fill').toBeLessThan(150);
    expect(b, 'Save Password fill should be blue-toned').toBeGreaterThan(r);
    expect(save.color).toBe('rgb(255, 255, 255)');
    const [confirm, btn] = await Promise.all([cp.confirmPassword.boundingBox(), cp.saveButton.boundingBox()]);
    if (confirm && btn) expect(btn.y).toBeGreaterThan(confirm.y);
  });

  test(qase(710, "[Functional] | Eye icon toggles each field's masking independently"), async ({ changePasswordPage: cp }) => {
    await cp.fill(SUPER_ADMIN_PASSWORD, NEW_PASSWORD);
    const types = () => Promise.all([cp.oldPassword, cp.newPassword, cp.confirmPassword].map((f) => f.getAttribute('type')));
    await cp.oldEye.click();
    expect(await types()).toEqual(['text', 'password', 'password']);
    await cp.oldEye.click();
    await cp.newEye.click();
    expect(await types()).toEqual(['password', 'text', 'password']);
    await cp.newEye.click();
    await cp.confirmEye.click();
    expect(await types()).toEqual(['password', 'password', 'text']);
  });

  test(qase(711, '[Functional] | Tapping Cancel discards changes and redirects to the last-visited module'), async ({ page, changePasswordPage: cp }) => {
    await page.goto('/resources');
    await page.locator('a[href="/settings"]').click();
    await expect(page).toHaveURL(/\/settings\/password/);
    await cp.fill(SUPER_ADMIN_PASSWORD, NEW_PASSWORD);
    await cp.cancel();
    await expect(page).toHaveURL(/\/resources/);
    expect(state.saves).toBe(0);
  });

  test(qase(712, '[Negative] | New Password failing any one of the 5 policy rules blocks submission'), async ({ changePasswordPage: cp }) => {
    const cases = [
      ['shorter than 8 characters', 'Ab@1abc', 'Password must be at least 8 characters.'],
      ['missing an uppercase letter', 'valid@1234', 'Must contain at least one uppercase letter.'],
      ['missing a number', 'Valid@abcd', 'Must contain at least one number.'],
      ['missing a special character', 'Valid1234', 'Must contain at least one special character.'],
    ];
    await cp.oldPassword.fill(SUPER_ADMIN_PASSWORD);
    for (const [label, pwd, message] of cases) {
      await test.step(`New password ${label}`, async () => {
        await cp.newPassword.fill(pwd);
        await cp.confirmPassword.fill(pwd);
        await cp.confirmPassword.blur();
        await expect(cp.fieldErrors.filter({ hasText: message })).toBeVisible();
        await expect(cp.saveButton).toBeDisabled();
      });
    }
    expect(state.saves).toBe(0);
  });

  test(qase(713, '[Negative] | A new password identical to the old password is blocked with a validation error'), async ({ changePasswordPage: cp }) => {
    await cp.fill(SUPER_ADMIN_PASSWORD, SUPER_ADMIN_PASSWORD);
    await cp.confirmPassword.blur();
    await expect(cp.fieldErrors.filter({ hasText: 'New password must be different from the current password' })).toBeVisible();
    await expect(cp.saveButton).toBeDisabled();
    expect(state.saves).toBe(0);
  });

  test(qase(715, '[Negative] | An incorrect old password blocks submission until corrected'), async ({ changePasswordPage: cp }) => {
    await test.step('Incorrect old password', async () => {
      await cp.fill(WRONG_OLD, NEW_PASSWORD);
      await cp.save();
      await expect(cp.toast.filter({ hasText: WRONG_OLD_MESSAGE })).toBeVisible();
      await expect(cp.toast.filter({ hasText: SUCCESS })).toHaveCount(0);
    });
    await test.step('Correct the old password and resubmit', async () => {
      await cp.oldPassword.fill(SUPER_ADMIN_PASSWORD);
      await cp.save();
      await expect(cp.toast.filter({ hasText: SUCCESS })).toBeVisible();
    });
  });

  test(qase(716, '[Negative] | Save Password remains disabled if any of the three fields is left empty'), async ({ changePasswordPage: cp }) => {
    await cp.fill(SUPER_ADMIN_PASSWORD, NEW_PASSWORD);
    await expect(cp.saveButton).toBeEnabled();
    await test.step('Clear Old Password', async () => {
      await cp.oldPassword.fill('');
      await expect(cp.saveButton).toBeDisabled();
    });
    await test.step('Restore Old Password, clear Confirm New Password', async () => {
      await cp.oldPassword.fill(SUPER_ADMIN_PASSWORD);
      await cp.confirmPassword.fill('');
      await expect(cp.saveButton).toBeDisabled();
    });
  });

  test(qase(717, '[Negative] | Save Password API/network failure keeps the user on the form with no password changed'), async ({ page, changePasswordPage: cp }) => {
    await cp.fill(SUPER_ADMIN_PASSWORD, NEW_PASSWORD);
    await test.step('Simulate an API failure and save', async () => {
      await simulateSave(page, { status: 500 });
      await cp.save();
      await expect(cp.toast.filter({ hasText: 'Something went wrong. Please try again later.' })).toBeVisible();
      await expect(cp.toast.filter({ hasText: SUCCESS })).toHaveCount(0);
      await expect(page).toHaveURL(/\/settings\/password/);
      await expect(cp.newPassword).toHaveValue(NEW_PASSWORD);
    });
    await test.step('Restore connectivity and resubmit', async () => {
      await page.unroute('**/auth/change-password'); // drops both handlers …
      await simulateSave(page, { status: 200 }); // … and re-simulates success (real password stays unchanged)
      await cp.save();
      await expect(cp.toast.filter({ hasText: SUCCESS })).toBeVisible();
    });
  });

  test(qase(718, '[Edge] | A new password exactly meeting the minimum boundary for each of the 5 rules is accepted'), async ({ changePasswordPage: cp }) => {
    const boundary = 'Aa1@bcde'; // 8 chars: 1 upper, 1 number, 1 special, lowercase
    expect(boundary).toHaveLength(8);
    await cp.fill(SUPER_ADMIN_PASSWORD, boundary);
    await expect(cp.saveButton).toBeEnabled();
    await cp.save();
    await expect(cp.toast.filter({ hasText: SUCCESS })).toBeVisible();
  });

  test(qase(719, '[Edge] | Rapid double-tap on Save Password does not trigger duplicate submissions'), async ({ page, changePasswordPage: cp }) => {
    await simulateSave(page, { status: 200, delay: 1000 });
    await cp.fill(SUPER_ADMIN_PASSWORD, NEW_PASSWORD);
    await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
    await cp.saveButton.dblclick();
    await expect(cp.saveButton).toHaveText(/Saving/);
    await expect(cp.toast.filter({ hasText: SUCCESS })).toHaveCount(1);
    await page.waitForTimeout(1000);
    expect(state.saves).toBe(1);
  });

  test(qase(720, '[Security] | The pre-filled Old Password value is never exposed in plain text without an explicit eye icon tap'), async ({ page, changePasswordPage: cp }) => {
    await test.step('Old Password stays masked on entry, focus and blur', async () => {
      await cp.oldPassword.fill(SUPER_ADMIN_PASSWORD);
      await expect(cp.oldPassword).toHaveAttribute('type', 'password');
      await cp.oldPassword.focus();
      await expect(cp.oldPassword).toHaveAttribute('type', 'password');
      await cp.newPassword.focus();
      await expect(cp.oldPassword).toHaveAttribute('type', 'password');
    });
    await test.step('Refresh and revisit', async () => {
      await page.reload();
      await cp.oldPassword.waitFor();
      await expect(cp.oldPassword).toHaveAttribute('type', 'password');
    });
  });

  test(qase(721, '[Security] | New Password and Confirm New Password values remain masked unless explicitly revealed'), async ({ changePasswordPage: cp }) => {
    await cp.newPassword.fill(NEW_PASSWORD);
    await cp.confirmPassword.fill(NEW_PASSWORD);
    for (const f of [cp.newPassword, cp.confirmPassword]) {
      await f.focus();
      await expect(cp.newPassword).toHaveAttribute('type', 'password');
      await expect(cp.confirmPassword).toHaveAttribute('type', 'password');
    }
    await cp.oldPassword.focus();
    await expect(cp.newPassword).toHaveAttribute('type', 'password');
    await expect(cp.confirmPassword).toHaveAttribute('type', 'password');
  });

  test(qase(722, '[Security] | Server-side validation rejects a policy-non-compliant or old-password-identical new password even if client-side checks are bypassed'), async ({ playwright }) => {
    // Direct API call with the correct old password and an identical new one (safe: even if accepted, nothing changes).
    expect(state.authorization, 'auth header captured from the signed-in session').not.toBe('');
    const api = await playwright.request.newContext({ extraHTTPHeaders: { authorization: state.authorization } });
    const res = await api.post(`${API_BASE}/auth/change-password`, { data: { oldPassword: SUPER_ADMIN_PASSWORD, newPassword: SUPER_ADMIN_PASSWORD } });
    expect(res.status(), await res.text()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    await api.dispose();
  });

  test(qase(723, '[UI] | Eye icon visual state reflects masked/visible state independently per field'), async ({ changePasswordPage: cp }) => {
    await cp.fill(SUPER_ADMIN_PASSWORD, NEW_PASSWORD);
    await cp.newEye.click();
    await expect(cp.newEye).toHaveAccessibleName('Hide password');
    await expect(cp.oldEye).toHaveAccessibleName('Show password');
    await expect(cp.confirmEye).toHaveAccessibleName('Show password');
  });

  test(qase(724, '[E2E] | Full lifecycle: correct an invalid old password and a policy-violating new password before succeeding'), async ({ changePasswordPage: cp }) => {
    await test.step('Incorrect old password + valid new password', async () => {
      await cp.fill(WRONG_OLD, NEW_PASSWORD);
      await cp.save();
      await expect(cp.toast.filter({ hasText: WRONG_OLD_MESSAGE })).toBeVisible();
    });
    await test.step('Correct old password, new password without a special character', async () => {
      await cp.fill(SUPER_ADMIN_PASSWORD, 'Valid1234');
      await cp.confirmPassword.blur();
      await expect(cp.fieldErrors.filter({ hasText: 'Must contain at least one special character.' })).toBeVisible();
      await expect(cp.saveButton).toBeDisabled();
    });
    await test.step('Valid, matching new password', async () => {
      await cp.fill(SUPER_ADMIN_PASSWORD, NEW_PASSWORD);
      await cp.save();
      await expect(cp.toast.filter({ hasText: SUCCESS })).toBeVisible();
    });
  });

  test(qase(725, '[E2E] | Full lifecycle: Cancel discards changes and returns to the last-visited module'), async ({ page, changePasswordPage: cp }) => {
    await test.step('From Resource Management, open Settings › Change Password', async () => {
      await page.goto('/resources');
      await page.locator('a[href="/settings"]').click();
      await expect(page).toHaveURL(/\/settings\/password/);
      await expect(cp.oldPassword).toHaveAttribute('type', 'password');
    });
    await test.step('Enter new passwords, then Cancel', async () => {
      await cp.newPassword.fill(NEW_PASSWORD);
      await cp.confirmPassword.fill(NEW_PASSWORD);
      await cp.cancel();
      await expect(page).toHaveURL(/\/resources/);
    });
    await test.step('Return to Change Password — no leftover values', async () => {
      await page.locator('a[href="/settings"]').click();
      await expect(cp.newPassword).toHaveValue('');
      await expect(cp.confirmPassword).toHaveValue('');
      await expect(cp.oldPassword).toHaveAttribute('type', 'password');
    });
    expect(state.saves).toBe(0);
  });
});
