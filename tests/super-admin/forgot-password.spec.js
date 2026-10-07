// @ts-check
// Qase: HTM › Super Admin › Forgot Password (suite 3). Titles carry Qase case IDs via qase(id, title).
//
// Forgot Password screen: runs against the real QA API using unregistered addresses, so no real reset
// emails are sent. Error/in-flight states mock POST /auth/reset-link.
// Reset Password screen: opening it needs a real emailed token, so these tests mock
// GET /auth/reset-password/validate (and POST /auth/reset-password where a submit is involved).
// They verify the front-end behaviour only — not that the password actually changed server-side.
//
// Not automated here (left for manual execution in Qase):
//   HTM-1050, 1054, 1063, 1064, 1065, 1072, 1073 — need a real reset email/inbox access and real tokens
//   HTM-1074, 1075, 1076, 1077, 1078             — need backend request tampering / audit & server log access
//   HTM-1079, 1080                               — threshold / behaviour not defined in ACs (flagged in the cases)
import { test, expect } from '../../fixtures/pages.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '' } = process.env;
const unregisteredEmail = () => `qa.unregistered.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.com`;
const COMPLIANT = 'Valid@1234';
const RESET_SENT = 'Password reset link sent successfully.';
const GENERIC_ERROR = 'Something went wrong. Please try again later.';
const RULE_MET = /text-success-500/;
const RULE_UNMET = /text-neutral-300/;

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} body
 */
async function mockTokenValidation(page, body = { valid: true }) {
  await page.route('**/auth/reset-password/validate**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

/**
 * Mocks an API POST and counts calls. `delay` keeps the request in flight long enough to observe loading state.
 * @param {import('@playwright/test').Page} page
 * @param {string} path  e.g. '/auth/reset-link'
 * @param {{ status?: number, delay?: number }} [opts]
 */
async function mockPost(page, path, { status = 200, delay = 0 } = {}) {
  const calls = { count: 0 };
  await page.route((url) => url.pathname.endsWith(path), async (route) => {
    calls.count++;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const body = status < 400 ? { success: true, message: 'ok' } : { status, message: 'Internal Server Error' };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

test.describe('Super Admin — Forgot Password', () => {
  test.describe('Forgot Password screen', () => {
    test.beforeEach(async ({ forgotPasswordPage }) => {
      await forgotPasswordPage.open();
    });

    test(qase(1044, '[SMOKE] | Forgot Password screen displays icon, heading, subtext, required email field, submit button, and Back to Login link'), async ({ page, loginPage, forgotPasswordPage: fp }) => {
      await test.step("On the Sign In screen, select 'Forgot Password?'", async () => {
        await loginPage.open();
        await loginPage.forgotPasswordLink.click();
        await expect(page).toHaveURL(/\/forgot-password/);
      });
      await test.step('Verify all Forgot Password screen elements', async () => {
        await expect(fp.icon).toBeVisible();
        await expect(fp.heading).toBeVisible();
        await expect(fp.subtext).toBeVisible();
        await expect(fp.emailInput).toBeVisible();
        await expect(fp.requiredAsterisk).toBeVisible();
        await expect(fp.requiredAsterisk).toHaveClass(/text-danger/);
        await expect(fp.sendResetLinkButton).toBeVisible();
        await expect(fp.backToLoginLink).toBeVisible();
      });
    });

    test(qase(1045, '[SMOKE] | Submitting a valid registered email successfully sends a reset link and shows the success toast with redirect to Sign In'), async ({ page, forgotPasswordPage: fp }) => {
      // Opt-in: this sends a real reset email to the Super Admin account and invalidates any earlier reset link.
      test.skip(!SUPER_ADMIN_EMAIL || process.env.ALLOW_RESET_EMAIL !== 'true', 'Set SUPER_ADMIN_EMAIL and ALLOW_RESET_EMAIL=true in .env');
      await test.step('Enter a valid, registered Super Admin email address', async () => {
        await fp.emailInput.fill(SUPER_ADMIN_EMAIL);
        await expect(fp.sendResetLinkButton).toBeEnabled();
      });
      await test.step("Select 'Send Reset Password Link'", async () => {
        // Hold the real request briefly so the in-flight state is observable.
        await page.route('**/auth/reset-link', async (route) => {
          await new Promise((r) => setTimeout(r, 1000));
          await route.continue();
        });
        await fp.sendResetLinkButton.click();
        await expect(fp.sendResetLinkButton).toBeDisabled();
        await expect(fp.sendResetLinkButton).toHaveText(/Sending/);
      });
      await test.step('Wait for the request to complete', async () => {
        await expect(fp.toast).toContainText(RESET_SENT);
        await expect(page).toHaveURL(/\/login/);
      });
    });

    test(qase(1048, "[Functional] | Selecting '← Back to Login' before submitting returns to Sign In and does not trigger a reset email"), async ({ page, loginPage, forgotPasswordPage: fp }) => {
      let resetRequests = 0;
      page.on('request', (r) => {
        if (r.url().includes('/auth/reset-link')) resetRequests++;
      });
      await fp.emailInput.fill(unregisteredEmail());
      await fp.backToLoginLink.click();
      await expect(page).toHaveURL(/\/login/);
      await expect(loginPage.signInButton).toBeVisible();
      expect(resetRequests).toBe(0);
    });

    test(qase(1049, "[Functional] | 'Send Reset Password Link' button disables and shows a spinner with 'Sending...' while the request is in flight"), async ({ page, forgotPasswordPage: fp }) => {
      await mockPost(page, '/auth/reset-link', { delay: 2000 });
      await test.step("Enter a valid email address and select 'Send Reset Password Link'", async () => {
        await fp.requestResetLink(unregisteredEmail());
        await expect(fp.sendResetLinkButton).toBeDisabled();
      });
      await test.step('Observe the button state before the request completes', async () => {
        await expect(fp.sendResetLinkButton).toHaveText(/Sending/);
        await expect(fp.sendResetLinkButton.locator('svg')).toBeVisible();
      });
    });

    test(qase(1055, "[Negative] | 'Send Reset Password Link' stays disabled and the form cannot be submitted for empty or invalid email input"), async ({ forgotPasswordPage: fp }) => {
      await test.step('Leave the Email Address field empty', async () => {
        await expect(fp.emailInput).toHaveValue('');
        await expect(fp.sendResetLinkButton).toBeDisabled();
      });
      await test.step("Enter syntactically invalid emails ('abc@', 'plainaddress')", async () => {
        for (const bad of ['abc@', 'plainaddress']) {
          await fp.emailInput.fill(bad);
          await fp.emailInput.blur();
          await expect(fp.emailError).toHaveText(/valid email address/i);
          await expect(fp.sendResetLinkButton).toBeDisabled();
        }
      });
    });

    test(qase(1060, '[Negative] | Submitting an unregistered or non-Super-Admin email returns the identical generic confirmation and sends no email'), async ({ page, forgotPasswordPage: fp }) => {
      await fp.requestResetLink(unregisteredEmail());
      await expect(fp.toast).toContainText(RESET_SENT);
      await expect(page).toHaveURL(/\/login/);
    });

    test(qase(1061, '[Negative] | Forgot Password request fails on network/API error: no false success shown, Super Admin stays on screen'), async ({ page, forgotPasswordPage: fp }) => {
      await mockPost(page, '/auth/reset-link', { status: 500 });
      await fp.requestResetLink(unregisteredEmail());
      await expect(page.getByText(GENERIC_ERROR).first()).toBeVisible();
      await expect(page.getByText(RESET_SENT)).toHaveCount(0);
      await expect(fp.sendResetLinkButton).toBeEnabled();
      await expect(page).toHaveURL(/\/forgot-password/);
    });

    test(qase(1066, '[Edge] | Email Address field handles values at and beyond standard length limits without breaking the layout'), async ({ forgotPasswordPage: fp }) => {
      // RFC 5321 / OWASP: local part ≤ 64 chars, whole address ≤ 254 chars. Domain = 190 chars (labels ≤ 63).
      const DOMAIN = `${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(58)}.com`;
      await test.step('Enter an address at the boundary (254 total) and observe it is accepted', async () => {
        const email = `${'a'.repeat(63)}@${DOMAIN}`;
        expect(email.length).toBe(254);
        await fp.emailInput.fill(email);
        await fp.emailInput.blur();
        await expect(fp.emailInput).toHaveValue(email);
        await expect(fp.emailError).toHaveCount(0);
        await expect(fp.sendResetLinkButton).toBeEnabled();
        await expect(fp.sendResetLinkButton).toBeInViewport();
      });
      await test.step('Enter an address one character over the limit (255 total)', async () => {
        const email = `${'a'.repeat(64)}@${DOMAIN}`;
        expect(email.length).toBe(255);
        await fp.emailInput.fill(email);
        await fp.emailInput.blur();
        // Must be rejected — not silently truncated into a different (valid) address.
        const truncated = (await fp.emailInput.inputValue()) !== email;
        const rejected = (await fp.sendResetLinkButton.isDisabled()) || (await fp.emailError.count()) > 0;
        expect(rejected && !truncated, `value truncated=${truncated}, rejected=${rejected}`).toBe(true);
      });
      await test.step('Enter an address whose local part is 65 chars (one over)', async () => {
        await fp.emailInput.fill(`${'a'.repeat(65)}@example.com`);
        await fp.emailInput.blur();
        await expect(fp.sendResetLinkButton).toBeDisabled();
      });
    });

    test(qase(1067, "[Edge] | Rapid double-submission of 'Send Reset Password Link' does not send duplicate emails or issue multiple simultaneous tokens"), async ({ page, forgotPasswordPage: fp }) => {
      const calls = await mockPost(page, '/auth/reset-link', { delay: 1500 });
      await fp.emailInput.fill(unregisteredEmail());
      await fp.sendResetLinkButton.dblclick();
      await expect(page).toHaveURL(/\/login/);
      expect(calls.count).toBe(1);
    });

    test(qase(1070, "[UI] | 'Password reset link sent successfully' toast renders in the top-right corner of the screen"), async ({ page, forgotPasswordPage: fp }) => {
      await fp.requestResetLink(unregisteredEmail());
      await expect(fp.toast).toContainText(RESET_SENT);
      await expect(fp.toaster).toHaveAttribute('data-x-position', 'right');
      await expect(fp.toaster).toHaveAttribute('data-y-position', 'top');
      const box = await fp.toast.first().boundingBox();
      const viewport = page.viewportSize();
      expect(box && viewport).toBeTruthy();
      if (!box || !viewport) return;
      expect(box.x + box.width / 2).toBeGreaterThan(viewport.width / 2);
      expect(box.y + box.height / 2).toBeLessThan(viewport.height / 2);
    });

    test(qase(1071, '[UI] | Forgot Password and Reset Password screens render their respective icons correctly positioned above the heading'), async ({ page, forgotPasswordPage: fp, resetPasswordPage: rp }) => {
      await test.step('Forgot Password screen shows a mail icon above its heading', async () => {
        const icon = await fp.icon.boundingBox();
        const heading = await fp.heading.boundingBox();
        expect(icon && heading).toBeTruthy();
        if (icon && heading) expect(icon.y + icon.height).toBeLessThanOrEqual(heading.y);
      });
      await test.step('Reset Password screen shows a key icon above its heading', async () => {
        await mockTokenValidation(page);
        await rp.open('qa-mock-token');
        await expect(rp.icon).toBeVisible();
        const icon = await rp.icon.boundingBox();
        const heading = await rp.heading.boundingBox();
        expect(icon && heading).toBeTruthy();
        if (icon && heading) expect(icon.y + icon.height).toBeLessThanOrEqual(heading.y);
      });
    });
  });

  test.describe('Reset Password screen (token validation mocked)', () => {
    test.beforeEach(async ({ page, resetPasswordPage }) => {
      await mockTokenValidation(page);
      await resetPasswordPage.open('qa-mock-token');
      await expect(resetPasswordPage.heading).toBeVisible();
    });

    test(qase(1046, '[SMOKE] | Opening a valid, unexpired reset link opens the Reset Password screen with all required elements'), async ({ resetPasswordPage: rp }) => {
      await expect(rp.icon).toBeVisible();
      await expect(rp.heading).toBeVisible();
      await expect(rp.subtext).toBeVisible();
      await expect(rp.newPasswordInput).toHaveAttribute('type', 'password');
      await expect(rp.confirmPasswordInput).toHaveAttribute('type', 'password');
      await expect(rp.newPasswordEye).toBeVisible();
      await expect(rp.confirmPasswordEye).toBeVisible();
      await expect(rp.submitButton).toHaveText('Change Password');
    });

    test(qase(1047, '[SMOKE] | Setting a new password that satisfies all five rules successfully changes the password and returns to Sign In'), async ({ page, resetPasswordPage: rp }) => {
      await mockPost(page, '/auth/reset-password', { delay: 1000 });
      await test.step("Enter a password meeting all five rules in 'Enter New Password'", async () => {
        await rp.newPasswordInput.fill(COMPLIANT);
        for (const rule of Object.values(rp.rules)) await expect(rp.ruleIcon(rule)).toHaveClass(RULE_MET);
        await expect(rp.strength).toContainText('Strong');
      });
      await test.step("Enter the identical password in 'Re-enter New Password'", async () => {
        await rp.confirmPasswordInput.fill(COMPLIANT);
        await rp.confirmPasswordInput.blur();
        await expect(rp.fieldErrors).toHaveCount(0);
      });
      await test.step('Submit', async () => {
        await rp.submitButton.click();
        await expect(rp.submitButton).toHaveText(/Updating/);
      });
      await test.step("Select 'Go to Log-In' in the success pop-up", async () => {
        await expect(rp.successDialog).toBeVisible();
        await rp.goToLoginButton.click();
        await expect(page).toHaveURL(/\/login/);
      });
    });

    test(qase(1051, '[Functional] | Both password fields are masked by default and can be toggled to plain text independently via the eye icon'), async ({ resetPasswordPage: rp }) => {
      await test.step('Enter text into both fields', async () => {
        await rp.fill(COMPLIANT);
        await expect(rp.newPasswordInput).toHaveAttribute('type', 'password');
        await expect(rp.confirmPasswordInput).toHaveAttribute('type', 'password');
      });
      await test.step("Toggle the eye on 'Enter New Password' only", async () => {
        await rp.newPasswordEye.click();
        await expect(rp.newPasswordInput).toHaveAttribute('type', 'text');
        await expect(rp.confirmPasswordInput).toHaveAttribute('type', 'password');
        await rp.newPasswordEye.click();
        await expect(rp.newPasswordInput).toHaveAttribute('type', 'password');
      });
      await test.step("Toggle the eye on 'Re-enter New Password' only", async () => {
        await rp.confirmPasswordEye.click();
        await expect(rp.confirmPasswordInput).toHaveAttribute('type', 'text');
        await expect(rp.newPasswordInput).toHaveAttribute('type', 'password');
        await rp.confirmPasswordEye.click();
        await expect(rp.confirmPasswordInput).toHaveAttribute('type', 'password');
      });
    });

    test(qase(1052, '[Functional] | Password rule checklist items turn green individually as each rule is satisfied, and the strength indicator updates live'), async ({ resetPasswordPage: rp }) => {
      const { length, lowercase, uppercase, number, special } = rp.rules;
      /** @type {[string, import('@playwright/test').Locator[]][]} */
      const progression = [
        ['a', [lowercase]],
        ['aA', [lowercase, uppercase]],
        ['aA1', [lowercase, uppercase, number]],
        ['aA1!', [lowercase, uppercase, number, special]],
        ['aA1!aaaa', [lowercase, uppercase, number, special, length]],
      ];
      let previousStrength = '';
      for (const [value, met] of progression) {
        await test.step(`Type "${value}"`, async () => {
          await rp.newPasswordInput.fill(value);
          for (const rule of Object.values(rp.rules)) {
            await expect(rp.ruleIcon(rule)).toHaveClass(met.includes(rule) ? RULE_MET : RULE_UNMET);
          }
          const strength = (await rp.strength.innerText()).trim();
          expect(strength).not.toBe('');
          previousStrength = strength;
        });
      }
      expect(previousStrength).toContain('Strong');
    });

    test(qase(1053, "[Functional] | 'Change Password' button shows a loader with 'Updating' text while the request is in flight"), async ({ page, resetPasswordPage: rp }) => {
      await mockPost(page, '/auth/reset-password', { delay: 2000 });
      await rp.fill(COMPLIANT);
      await rp.submitButton.click();
      await expect(rp.submitButton).toBeDisabled();
      await expect(rp.submitButton).toHaveText(/Updating/);
      await expect(rp.submitButton.locator('svg')).toBeVisible();
    });

    test(qase(1056, '[Negative] | A new password failing any of the five rules is rejected on submit and unmet rules remain visibly unsatisfied'), async ({ page, resetPasswordPage: rp }) => {
      const calls = await mockPost(page, '/auth/reset-password');
      const cases = [
        ['shorter than 8 characters', 'Sh@1a', rp.rules.length],
        ['no uppercase letter', 'valid@1234', rp.rules.uppercase],
        ['no lowercase letter', 'VALID@1234', rp.rules.lowercase],
        ['no number', 'Valid@abcd', rp.rules.number],
        ['no special character', 'Valid1234', rp.rules.special],
      ];
      for (const [label, pwd, unmetRule] of cases) {
        await test.step(`Password with ${label}`, async () => {
          await rp.fill(/** @type {string} */ (pwd));
          await expect(rp.ruleIcon(/** @type {import('@playwright/test').Locator} */ (unmetRule))).toHaveClass(RULE_UNMET);
          await expect(rp.submitButton).toBeDisabled();
        });
      }
      expect(calls.count).toBe(0);
    });

    test(qase(1057, "[Negative] | Mismatched 'Enter New Password' and 'Re-enter New Password' blocks submission and shows 'Passwords don't match'"), async ({ page, resetPasswordPage: rp }) => {
      const calls = await mockPost(page, '/auth/reset-password');
      await rp.fill(COMPLIANT, 'Different@1234');
      await rp.confirmPasswordInput.blur();
      await expect(rp.fieldErrors).toHaveText(/passwords do(n't| not) match/i);
      await expect(rp.submitButton).toBeDisabled();
      expect(calls.count).toBe(0);
    });

    test(qase(1058, "[Negative] | Leaving 'Re-enter New Password' empty blocks submission and shows 'Please confirm your password'"), async ({ page, resetPasswordPage: rp }) => {
      const calls = await mockPost(page, '/auth/reset-password');
      await rp.newPasswordInput.fill(COMPLIANT);
      await rp.confirmPasswordInput.focus();
      await rp.confirmPasswordInput.blur();
      await expect(rp.fieldErrors).toHaveText(/confirm (your )?password/i);
      await expect(rp.submitButton).toBeDisabled();
      expect(calls.count).toBe(0);
    });

    test(qase(1062, '[Negative] | Change Password request fails on network/API error: password not changed, Super Admin stays on screen'), async ({ page, resetPasswordPage: rp }) => {
      await mockPost(page, '/auth/reset-password', { status: 500 });
      await rp.fill(COMPLIANT);
      await rp.submitButton.click();
      await expect(page.getByText(GENERIC_ERROR).first()).toBeVisible();
      await expect(rp.successDialog).toHaveCount(0);
      await expect(rp.submitButton).toBeEnabled();
      await expect(page).toHaveURL(/\/reset-password/);
    });

    test(qase(1068, "[Edge] | Rapid double-submission of 'Change Password' does not trigger duplicate password-change requests"), async ({ page, resetPasswordPage: rp }) => {
      const calls = await mockPost(page, '/auth/reset-password', { delay: 1500 });
      await rp.fill(COMPLIANT);
      await rp.submitButton.dblclick();
      await expect(rp.successDialog).toBeVisible();
      expect(calls.count).toBe(1);
    });

    test(qase(1069, '[UI] | Focusing either password field applies a blue focus border'), async ({ resetPasswordPage: rp }) => {
      const FOCUS_RING = 'rgb(26, 45, 69) 0px 0px 0px 4px';
      const ring = (/** @type {import('@playwright/test').Locator} */ l) => () => l.evaluate((el) => getComputedStyle(el).boxShadow);
      await test.step("Click into 'Enter New Password'", async () => {
        await rp.newPasswordInput.click();
        await expect.poll(ring(rp.newPasswordInput)).toContain(FOCUS_RING);
      });
      await test.step("Click into 'Re-enter New Password'", async () => {
        await rp.confirmPasswordInput.click();
        await expect.poll(ring(rp.confirmPasswordInput)).toContain(FOCUS_RING);
        await expect.poll(ring(rp.newPasswordInput)).not.toContain(FOCUS_RING);
      });
    });
  });

  test(qase(1059, '[Negative] | Opening an expired or already-used reset link shows the expired-link message with a CTA back to Forgot Password'), async ({ page, resetPasswordPage: rp, forgotPasswordPage }) => {
    await test.step('Open a reset link the server reports as expired', async () => {
      await mockTokenValidation(page, { valid: false, reason: 'EXPIRED', message: 'This password reset link has expired. Please request a new one.' });
      await rp.open('qa-expired-token');
      await expect(rp.linkErrorHeading).toBeVisible();
      await expect(page.getByText(/expired/i).first()).toBeVisible();
    });
    await test.step('Follow the CTA back to Forgot Password', async () => {
      await rp.requestNewLinkLink.click();
      await expect(page).toHaveURL(/\/forgot-password/);
      await expect(forgotPasswordPage.heading).toBeVisible();
    });
  });
});
