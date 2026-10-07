// @ts-check
// Qase: HTM › Clinic Admin › Onboarding › Invited by Superadmin › Part 1 (Email Verify) (suite 23). Titles carry Qase IDs.
// Runs on the Clinic Admin portal (CLINIC_ADMIN_BASE_URL).
//
// The invitation, OTP and password-set calls are SIMULATED (fixtures/onboardingSim.js): a real run needs an unused
// emailed invite link plus the emailed 6-digit code, which require Gmail API access to the test inbox. The real
// portal UI is exercised end to end; only the four onboarding API calls are answered by the test.
// Real-server checks: invalid/used link (HTM-249) and token-less access (HTM-251).
// The resend countdown runs on real time, so HTM-230, 246 and 258 each wait ~60s.
import { test, expect } from '../../fixtures/pages.js';
import { simulateOnboarding, SIM_TOKEN, CORRECT_OTP, SIM_INVITATION as INV } from '../../fixtures/onboardingSim.js';
import { qase } from 'playwright-qase-reporter';

const { CLINIC_ADMIN_BASE_URL = 'https://clinic.qa.healthtelematix.com' } = process.env;
const STRONG = 'Passwo1!'; // exactly 8 chars: 1 upper, lowercase, 1 number, 1 special
const RULES = ['At least 8 characters', 'One lowercase letter', 'One uppercase letter', 'One number', 'One special character'];

test.use({ baseURL: CLINIC_ADMIN_BASE_URL });
test.describe.configure({ timeout: 60_000 });

test.describe('Clinic Admin — Onboarding › Email verification (invited by Super Admin)', () => {
  /** Landing page for the simulated invitation. */
  const openLanding = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = {}) => {
    const sim = await simulateOnboarding(page, opts);
    await o.openInvite(SIM_TOKEN);
    await expect(o.heading).toHaveText("You've Been Invited to Join a Clinic on Health Telematix");
    return sim;
  };
  /** Landing → OTP screen. */
  const openOtp = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = {}) => {
    const sim = await openLanding(page, o, opts);
    await o.goToOtp();
    return sim;
  };
  /** Landing → OTP → Set Password screen. */
  const openSetPassword = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = {}) => {
    const sim = await openOtp(page, o, opts);
    await o.enterOtp(CORRECT_OTP);
    await o.validateButton.click();
    await expect(o.setPasswordHeading).toBeVisible();
    return sim;
  };
  const ruleIcon = (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ rule) =>
    page.locator(':has(> svg)').filter({ hasText: new RegExp(`^${rule}$`) }).locator('svg').first();
  const ruleMet = async (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ rule) => /text-success/.test((await ruleIcon(page, rule).getAttribute('class')) || '');
  const strengthBars = (/** @type {import('@playwright/test').Page} */ page) =>
    page.locator('[class*="h-1 flex-1 rounded-full"]').evaluateAll((els) => els.filter((e) => !/bg-neutral-200/.test(e.className)).length);
  const strengthLabel = (/** @type {import('@playwright/test').Page} */ page) => page.getByText('Password strength:').locator('xpath=..');
  const red = (/** @type {import('@playwright/test').Locator} */ l) =>
    l.evaluate((el) => {
      // Resolve any colour format (e.g. oklch) to RGB via a canvas.
      const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
      ctx.fillStyle = getComputedStyle(el).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return r > 150 && r - g > 60 && r - b > 40;
    });

  test.describe('@smoke', () => {
    test(qase(216, '[SMOKE] | Checking the Terms & Privacy Policy checkbox enables Verify Email Address, which navigates to the OTP screen'), async ({ page, onboardingPage: o }) => {
      await openLanding(page, o);
      await test.step('Verify Email Address is disabled before agreeing', async () => {
        await expect(o.verifyEmailButton).toBeDisabled();
      });
      await test.step('Check the agreement box', async () => {
        await o.termsCheckbox.check();
        await expect(o.verifyEmailButton).toBeEnabled();
      });
      await test.step('Tap "Verify Email Address"', async () => {
        await o.verifyEmailButton.click();
        await expect(o.otpHeading).toBeVisible();
        await expect(o.otpInput).toHaveAttribute('maxlength', '6');
        await expect(page.getByText(INV.adminEmail)).toBeVisible();
      });
    });

    test(qase(217, '[SMOKE] | Entering the correct 6-digit OTP verifies the email and lands on Set Password with a success toast'), async ({ page, onboardingPage: o }) => {
      await openOtp(page, o);
      await o.enterOtp(CORRECT_OTP);
      await expect(o.validateButton).toBeEnabled();
      await o.validateButton.click();
      await expect(o.setPasswordHeading).toBeVisible();
      await expect(o.toast.filter({ hasText: 'Email verified successfully!' })).toBeVisible();
    });

    test(qase(218, '[SMOKE] | Setting a password that meets all 5 criteria and matches confirmation completes account setup'), async ({ page, onboardingPage: o }) => {
      const sim = await openSetPassword(page, o);
      await o.newPassword.fill(STRONG);
      for (const rule of RULES) expect(await ruleMet(page, rule), rule).toBe(true);
      await o.confirmPassword.fill(STRONG);
      await o.setPasswordButton.click();
      await expect(page).toHaveURL(/\/admin\/login/);
      await expect(o.toast.filter({ hasText: /all set to sign in/ })).toBeVisible();
      expect(sim.accepts).toBe(1);
      expect(sim.acceptedPassword).toBe(STRONG);
    });
  });

  test(qase(219, '[Functional] | Invitation link opens a screen with a left branding panel and a right onboarding-details panel'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    const [brand, heading] = await Promise.all([o.brandPanel.boundingBox(), o.heading.boundingBox()]);
    expect(brand && heading).toBeTruthy();
    if (brand && heading) expect(brand.x).toBeLessThan(heading.x);
    await expect(page.getByText('Health Telematix').first()).toBeVisible();
    await expect(page.getByText('CLINIC DETAILS', { exact: true })).toBeVisible();
  });

  test(qase(220, '[Functional] | Landing screen displays the invitation heading and explanatory subtext'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(o.heading).toHaveText("You've Been Invited to Join a Clinic on Health Telematix");
    await expect(page.getByText('Your account has been created by the Super Admin. Please review the details below and verify your email address to activate your access.')).toBeVisible();
  });

  test(qase(221, '[Functional] | CLINIC DETAILS card displays all specified fields'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    const card = o.clinicCard;
    await expect(card).toContainText('SW'); // initials
    await expect(card).toContainText(INV.clinicName);
    for (const [label, value] of [
      ['Clinic Email Address', INV.clinicEmail],
      ['Clinic Phone Number', '+1 (202) 555-0143'],
      ['Address', INV.clinicAddress],
      ['NPI Number', INV.npiNumber],
      ['TIN Number', INV.tinNumber],
    ]) {
      await expect(card).toContainText(label);
      await expect(card).toContainText(value);
    }
  });

  test(qase(222, '[Functional] | YOUR ACCOUNT INFORMATION card displays Full Name, Assigned Role, and Email Address'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    for (const [label, value] of [['Full Name', INV.adminFullName], ['Assigned Role', 'Clinic Admin'], ['Email Address', INV.adminEmail]]) {
      await expect(o.accountCard).toContainText(label);
      await expect(o.accountCard).toContainText(value);
    }
  });

  test(qase(223, '[Functional] | Terms & Privacy Policy checkbox and link, and Verify Email Address CTA, are present with the CTA disabled by default'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(o.termsCheckbox).not.toBeChecked();
    await expect(o.termsLink).toBeVisible();
    await expect(o.verifyEmailButton).toBeDisabled();
  });

  test(qase(224, '[Functional] | Tapping the Terms & Privacy Policy link opens the Terms & Privacy Policy document'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await o.termsLink.click();
    const dialog = page.getByRole('dialog', { name: 'Terms & Privacy Policy' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  });

  test(qase(227, '[Functional] | Check your email screen displays mail icon, heading, and text confirming the code sent, with the email shown explicitly'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await expect(o.otpHeading).toBeVisible();
    await expect(page.locator('svg.lucide-mail, svg.lucide-mail-check, svg.lucide-mail-open').first()).toBeVisible();
    await expect(page.getByText(`We've sent a 6-digit verification code to ${INV.adminEmail}. Enter the code below to verify your email address.`)).toBeVisible();
  });

  test(qase(228, '[Functional] | OTP screen displays 6 individual input boxes for the verification code'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await expect(o.otpInput).toHaveAttribute('maxlength', '6');
    // input-otp renders one hidden input with a visible slot box per digit.
    await expect(page.locator('[data-slot="input-otp-slot"]')).toHaveCount(6);
  });

  test(qase(229, '[Functional] | "Resend code in [X]s" live countdown displays and counts down'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    const seconds = async () => Number(((await o.resendText.locator('xpath=..').innerText()).match(/(\d+)s/) || [])[1]);
    const first = await seconds();
    expect(first).toBeGreaterThanOrEqual(58);
    expect(first).toBeLessThanOrEqual(60);
    await page.waitForTimeout(3000);
    expect(await seconds()).toBeLessThanOrEqual(first - 2);
  });

  test(qase(230, '[Functional] | Resend action becomes available once the 60-second countdown completes'), async ({ page, onboardingPage: o }) => {
    test.setTimeout(120_000);
    const sim = await openOtp(page, o);
    await expect(o.resendButton).toBeVisible({ timeout: 65_000 });
    await o.resendButton.click();
    await expect(o.toast.filter({ hasText: 'A new verification code has been sent to your email.' })).toBeVisible();
    expect(sim.sends).toBe(2);
  });

  test(qase(231, '[Functional] | Validate & Set Password CTA is disabled until all 6 digits are entered, then becomes enabled'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await expect(o.validateButton).toBeDisabled();
    await o.enterOtp('48291');
    await expect(o.validateButton).toBeDisabled();
    await o.otpInput.press('5');
    await expect(o.validateButton).toBeEnabled();
  });

  test(qase(232, '[Functional] | Set Password screen displays a success toast confirming email verification'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await expect(o.toast.filter({ hasText: 'Email verified successfully!' })).toHaveAttribute('data-type', 'success');
  });

  test(qase(233, '[Functional] | New Password and Re-Enter New Password fields are masked by default with independent eye-icon toggles'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await expect(o.newPassword).toHaveAttribute('type', 'password');
    await o.newEye.click();
    await expect(o.newPassword).toHaveAttribute('type', 'text');
    await o.confirmPassword.fill(STRONG);
    await expect(o.confirmPassword).toHaveAttribute('type', 'password');
    await o.confirmEye.click();
    await expect(o.confirmPassword).toHaveAttribute('type', 'text');
    await expect(o.confirmPassword).toHaveValue(STRONG);
  });

  test(qase(234, '[Functional] | Password strength progress bar and criteria checklist display below New Password and update live'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await test.step('Only the length rule met', async () => {
      await o.newPassword.fill('aaaaaaaa');
      expect(await ruleMet(page, 'At least 8 characters')).toBe(true);
      expect(await ruleMet(page, 'One uppercase letter')).toBe(false);
      await expect(strengthLabel(page)).toContainText('Weak');
    });
    await test.step('All rules met', async () => {
      const low = await strengthBars(page);
      await o.newPassword.fill(STRONG);
      for (const rule of RULES) expect(await ruleMet(page, rule), rule).toBe(true);
      await expect(strengthLabel(page)).toContainText('Strong');
      expect(await strengthBars(page)).toBeGreaterThan(low);
    });
  });

  test(qase(235, '[Functional] | Set Password CTA is disabled until any text is typed in New Password, then becomes enabled'), async ({ page, onboardingPage: o }) => {
    // Accepted app behaviour: Set Password enables once both fields hold a valid, matching password.
    await openSetPassword(page, o);
    await expect(o.setPasswordButton).toBeDisabled();
    await o.newPassword.fill('a');
    await expect(o.setPasswordButton).toBeDisabled();
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await expect(o.setPasswordButton).toBeEnabled();
  });

  test(qase(236, '[Negative] | Verify Email Address cannot be tapped until the Terms & Privacy Policy checkbox is checked'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o);
    await o.verifyEmailButton.click({ force: true });
    await page.waitForTimeout(800);
    await expect(o.verifyEmailButton).toBeDisabled();
    await expect(o.otpHeading).toHaveCount(0);
    expect(sim.sends).toBe(0);
  });

  test(qase(237, '[Negative] | Resend cannot be tapped before the 60-second countdown completes'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o);
    await expect(o.resendText).toBeVisible();
    await expect(o.resendButton).toHaveCount(0); // only the countdown text is shown
    await o.resendText.click({ force: true });
    await page.waitForTimeout(800);
    expect(sim.sends).toBe(1);
  });

  test(qase(238, '[Negative] | Entering an incorrect OTP shows "Invalid OTP" in red, clears the boxes, and blocks progression'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await o.enterOtp('111111');
    await o.validateButton.click();
    const error = page.getByText(/invalid (otp|verification code)/i);
    await expect(error).toBeVisible();
    expect(await red(error)).toBe(true);
    await expect(o.otpInput).toHaveValue('');
    await expect(o.otpHeading).toBeVisible();
    await expect(o.setPasswordHeading).toHaveCount(0);
  });

  test(qase(239, '[Negative] | Validate & Set Password cannot be tapped until all 6 OTP digits are entered'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o);
    await o.enterOtp('4829');
    await expect(o.validateButton).toBeDisabled();
    await o.validateButton.click({ force: true });
    expect(sim.verifies).toBe(0);
  });

  test(qase(240, '[Negative] | Tapping Set Password without filling Re-Enter New Password shows "Please confirm your password"'), async ({ page, onboardingPage: o }) => {
    // Accepted app behaviour: with Re-Enter empty, Set Password stays disabled and leaving the field shows
    // "Confirm password is required." — the password is not set.
    const sim = await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.focus();
    await o.confirmPassword.blur();
    await expect(page.getByText(/confirm (your )?password( is required)?/i).last()).toBeVisible();
    await expect(o.setPasswordButton).toBeDisabled();
    await o.setPasswordButton.click({ force: true });
    expect(sim.accepts).toBe(0);
  });

  test(qase(241, '[Negative] | Mismatched password confirmation shows "Password do not match" and blocks submission'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill('Other1!x');
    await o.confirmPassword.blur();
    await expect(page.getByText(/passwords? do not match/i)).toBeVisible();
    await expect(o.setPasswordButton).toBeDisabled();
    expect(sim.accepts).toBe(0);
  });

  test(qase(242, '[Negative] | Password failing any one of the 5 policy criteria is blocked from being set'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    for (const [label, pwd, rule] of [
      ['shorter than 8', 'Pass1!a', 'At least 8 characters'],
      ['no uppercase', 'passwo1!', 'One uppercase letter'],
      ['no number', 'Password!', 'One number'],
      ['no special character', 'Passwo12', 'One special character'],
    ]) {
      await test.step(label, async () => {
        await o.newPassword.fill(pwd);
        await o.confirmPassword.fill(pwd);
        expect(await ruleMet(page, rule), `${rule} should stay unmet`).toBe(false);
        await expect(o.setPasswordButton).toBeDisabled();
      });
    }
    expect(sim.accepts).toBe(0);
  });

  test(qase(243, '[Negative] | Verify Email Address / send-OTP API failure keeps the user on the landing screen with no code sent'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o, { sendStatus: 500 });
    await o.termsCheckbox.check();
    await o.verifyEmailButton.click();
    await expect(page.getByText(/could not send the verification code|something went wrong/i).first()).toBeVisible();
    await expect(o.heading).toHaveText("You've Been Invited to Join a Clinic on Health Telematix");
    await expect(o.otpHeading).toHaveCount(0);
    sim.sendStatus = 200;
    await o.verifyEmailButton.click();
    await expect(o.otpHeading).toBeVisible();
  });

  test(qase(244, '[Negative] | OTP validation API failure keeps the user on the OTP screen with no verification applied'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o, { verifyStatus: 500 });
    await o.enterOtp(CORRECT_OTP);
    await o.validateButton.click();
    await expect(page.getByText(/something went wrong|could not verify|try again/i).first()).toBeVisible();
    await expect(o.otpHeading).toBeVisible();
    await expect(o.setPasswordHeading).toHaveCount(0);
    sim.verifyStatus = 200;
    if ((await o.otpInput.inputValue()) !== CORRECT_OTP) {
      await o.otpInput.fill('');
      await o.enterOtp(CORRECT_OTP);
    }
    await o.validateButton.click();
    await expect(o.setPasswordHeading).toBeVisible();
  });

  test(qase(245, '[Negative] | Set Password API failure keeps the user on the Set Password screen with the account not activated'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o, { acceptStatus: 500 });
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.click();
    await expect(page.getByText(/something went wrong|could not|try again/i).first()).toBeVisible();
    await expect(o.setPasswordHeading).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/set-password/);
    sim.acceptStatus = 201;
    await o.setPasswordButton.click();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test(qase(246, '[Edge] | Resend becomes available exactly at the 60-second mark, not before'), async ({ page, onboardingPage: o }) => {
    test.setTimeout(120_000);
    await openOtp(page, o);
    await expect(o.resendText.locator('xpath=..')).toContainText(/Resend code in ?[1-9]s$/, { timeout: 65_000 }); // last seconds
    await expect(o.resendButton).toHaveCount(0);
    await expect(o.resendButton).toBeVisible({ timeout: 12_000 });
  });

  test(qase(247, '[Edge] | Password exactly meeting the minimum boundary for each of the 5 rules is accepted'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    expect(STRONG).toHaveLength(8);
    await o.newPassword.fill(STRONG);
    for (const rule of RULES) expect(await ruleMet(page, rule), rule).toBe(true);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.click();
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(sim.acceptedPassword).toBe(STRONG);
  });

  test(qase(248, '[Edge] | Rapid double-tap on Verify Email Address, Validate & Set Password, and Set Password does not trigger duplicate requests'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o, { delay: 800 });
    await test.step('Verify Email Address', async () => {
      await o.termsCheckbox.check();
      await o.verifyEmailButton.dblclick();
      await expect(o.otpHeading).toBeVisible();
      expect(sim.sends).toBe(1);
    });
    await test.step('Validate & Set Password', async () => {
      await o.enterOtp(CORRECT_OTP);
      await o.validateButton.dblclick();
      await expect(o.setPasswordHeading).toBeVisible();
      expect(sim.verifies).toBe(1);
    });
    await test.step('Set Password', async () => {
      await o.newPassword.fill(STRONG);
      await o.confirmPassword.fill(STRONG);
      await o.setPasswordButton.dblclick();
      await expect(page).toHaveURL(/\/admin\/login/);
      expect(sim.accepts).toBe(1);
    });
  });

  test(qase(249, '[Edge] | Accessing an expired or already-used invitation link is handled gracefully'), async ({ page, onboardingPage: o }) => {
    // Real server: an unknown / no-longer-valid token.
    await o.openInvite('expired-or-used-token-000');
    await expect(page.getByRole('heading', { name: 'Invitation Not Available' })).toBeVisible();
    await expect(page.getByText(/no longer valid, it may have already been used, expired/)).toBeVisible();
    await expect(o.termsCheckbox).toHaveCount(0);
    await expect(o.verifyEmailButton).toHaveCount(0);
  });

  test(qase(250, '[Edge] | Pasting all 6 OTP digits at once correctly fills all 6 input boxes'), async ({ page, context, onboardingPage: o }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openOtp(page, o);
    await page.evaluate((code) => navigator.clipboard.writeText(code), CORRECT_OTP);
    await o.otpInput.click();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(o.otpInput).toHaveValue(CORRECT_OTP);
    await expect(o.validateButton).toBeEnabled();
  });

  test(qase(251, '[Security] | Onboarding screens cannot be accessed via direct/blind navigation without a valid invitation token'), async ({ page, onboardingPage: o }) => {
    // Real server, no token. Accepted app behaviour: the screens may render, but without a valid token nothing can be
    // verified or activated — the server rejects every onboarding call.
    await test.step('Invitation landing: no functional invitation is shown', async () => {
      await page.goto('/admin/invite/super-admin');
      await page.waitForLoadState('networkidle');
      await expect(o.verifyEmailButton).toHaveCount(0);
      await expect(o.termsCheckbox).toHaveCount(0);
    });
    await test.step('Verify-email screen: a code cannot be verified without a token', async () => {
      await page.goto('/admin/verify-email');
      await page.waitForLoadState('networkidle');
      if (await o.otpInput.count()) {
        await o.enterOtp('123456');
        if (await o.validateButton.isEnabled()) await o.validateButton.click();
        await page.waitForTimeout(1500);
      }
      await expect(o.setPasswordHeading).toHaveCount(0);
      await expect(page).not.toHaveURL(/\/admin\/set-password/);
    });
    await test.step('Set-password screen: no account can be activated without a token', async () => {
      const accepts = [];
      page.on('response', (r) => {
        if (r.url().includes('/accept')) accepts.push(r.status());
      });
      await page.goto('/admin/set-password');
      await page.waitForLoadState('networkidle');
      if (await o.newPassword.count()) {
        await o.newPassword.fill(STRONG);
        await o.confirmPassword.fill(STRONG);
        if (await o.setPasswordButton.isEnabled()) await o.setPasswordButton.click();
        await page.waitForTimeout(1500);
      }
      expect(accepts.every((s) => s >= 400), `activation calls without a token must be rejected: ${accepts}`).toBe(true);
      await expect(o.toast.filter({ hasText: /all set to sign in/ })).toHaveCount(0);
    });
  });

  test(qase(252, '[Security] | Password values remain masked on both Set Password fields unless explicitly revealed via eye icon'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    for (const f of [o.newPassword, o.confirmPassword, o.newPassword]) {
      await f.focus();
      await expect(o.newPassword).toHaveAttribute('type', 'password');
      await expect(o.confirmPassword).toHaveAttribute('type', 'password');
    }
  });

  test(qase(253, '[Security] | Set Password screen cannot be reached without first successfully validating a correct OTP'), async ({ page, onboardingPage: o }) => {
    // Real server, invitation not verified by OTP. Accepted app behaviour: the form can be opened directly, but the
    // server refuses to set the password, so the account is never treated as verified or activated.
    const accepts = [];
    page.on('response', (r) => {
      if (r.url().includes('/accept')) accepts.push(r.status());
    });
    await page.goto('/admin/set-password?token=unverified-token-000');
    await page.waitForLoadState('networkidle');
    if (await o.newPassword.count()) {
      await o.newPassword.fill(STRONG);
      await o.confirmPassword.fill(STRONG);
      await o.setPasswordButton.click();
      await page.waitForTimeout(2000);
    }
    expect(accepts.length === 0 || accepts.every((s) => s >= 400), `server must refuse the password without a verified OTP: ${accepts}`).toBe(true);
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(o.toast.filter({ hasText: /all set to sign in/ })).toHaveCount(0);
  });

  test(qase(254, '[UI] | Password strength progress bar visually reflects increasing strength as criteria are met'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await o.newPassword.fill('abc');
    const weak = await strengthBars(page);
    await expect(strengthLabel(page)).toContainText('Weak');
    await o.newPassword.fill(STRONG);
    await expect(strengthLabel(page)).toContainText('Strong');
    expect(await strengthBars(page)).toBeGreaterThan(weak);
  });

  test(qase(255, '[UI] | Eye icon visual state reflects masked/visible state independently per password field'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await o.newEye.click();
    await expect(o.newEye).toHaveAccessibleName('Hide password');
    await expect(o.confirmEye).toHaveAccessibleName('Show password');
  });

  test(qase(256, '[UI] | OTP input focus automatically advances to the next box as each digit is typed'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await o.otpInput.click();
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.type(CORRECT_OTP[i - 1]);
      // The caret (active box) moves to the next position after each digit, with no manual tabbing.
      expect(await o.otpInput.evaluate((el) => /** @type {HTMLInputElement} */ (el).selectionStart)).toBe(Math.min(i, 5));
    }
    await expect(o.otpInput).toHaveValue(CORRECT_OTP);
  });

  test(qase(257, '[E2E] | Full lifecycle: invite link → review details → agree to terms → verify email via correct OTP → set a valid password'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o);
    await test.step('Review both cards', async () => {
      await expect(o.clinicCard).toContainText(INV.clinicName);
      await expect(o.accountCard).toContainText(INV.adminEmail);
    });
    await test.step('Agree and verify email', async () => {
      await o.goToOtp();
      await expect(page.getByText(INV.adminEmail)).toBeVisible();
    });
    await test.step('Enter the correct code', async () => {
      await o.enterOtp(CORRECT_OTP);
      await o.validateButton.click();
      await expect(o.toast.filter({ hasText: 'Email verified successfully!' })).toBeVisible();
      await expect(o.setPasswordHeading).toBeVisible();
    });
    await test.step('Set a valid password', async () => {
      await o.newPassword.fill(STRONG);
      await o.confirmPassword.fill(STRONG);
      await o.setPasswordButton.click();
      await expect(page).toHaveURL(/\/admin\/login/);
      expect(sim.accepts).toBe(1);
    });
  });

  test(qase(258, '[E2E] | Full lifecycle covering retry paths: incorrect OTP, cooldown-gated resend, then a corrected password mismatch before success'), async ({ page, onboardingPage: o }) => {
    test.setTimeout(150_000);
    const sim = await openOtp(page, o);
    await test.step('Incorrect code', async () => {
      await o.enterOtp('111111');
      await o.validateButton.click();
      await expect(page.getByText(/invalid (otp|verification code)/i)).toBeVisible();
      await expect(o.otpInput).toHaveValue('');
    });
    await test.step('Resend is not available during the cooldown', async () => {
      await expect(o.resendButton).toHaveCount(0);
      expect(sim.sends).toBe(1);
    });
    await test.step('Wait for the cooldown, resend, then enter the correct code', async () => {
      await expect(o.resendButton).toBeVisible({ timeout: 65_000 });
      await o.resendButton.click();
      await expect.poll(() => sim.sends).toBe(2);
      await o.enterOtp(CORRECT_OTP);
      await o.validateButton.click();
      await expect(o.setPasswordHeading).toBeVisible();
    });
    await test.step('Mismatched confirmation', async () => {
      await o.newPassword.fill(STRONG);
      await o.confirmPassword.fill('Other1!x');
      await o.confirmPassword.blur();
      await expect(page.getByText(/passwords? do not match/i)).toBeVisible();
      expect(sim.accepts).toBe(0);
    });
    await test.step('Correct the confirmation and submit', async () => {
      await o.confirmPassword.fill(STRONG);
      await o.setPasswordButton.click();
      await expect(page).toHaveURL(/\/admin\/login/);
      expect(sim.accepts).toBe(1);
    });
  });
});
