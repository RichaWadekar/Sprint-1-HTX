// @ts-check
// Qase: HTM › Physician & Nurse Onboarding › Invited by Clinic Admin (suite 39). Titles carry Qase IDs.
// Runs on the Clinic portal (CLINIC_ADMIN_BASE_URL), where the invite email links: /resource/invite?token=…
// → /provider|nurse/verify-email → /provider|nurse/set-password.
//
// The invitation, OTP and password-set calls are SIMULATED (fixtures/resourceInviteSim.js): a real run needs an unused
// emailed invite link plus the emailed 6-digit code (Gmail API access to the test inbox). The real portal UI is
// exercised end to end; only the four onboarding API calls are answered by the test.
// Real-server checks: HTM-1138 (invalid link) and HTM-1143 (no token).
// The resend countdown runs on real time, so HTM-1134 and HTM-1139 wait ~60s.
// Aligned to the app where Qase differs (user confirmed these pass): after setting the password the invitee is sent to
// their portal's sign-in page (no waiting screen); "Contact Super Admin" is plain text; Set Password stays disabled
// until both fields are valid and match ("Confirm password is required."); without a token the verify-email and
// set-password screens still render, but nothing is verified or activated.
import { test, expect } from '../../fixtures/pages.js';
import { simulateResourceInvite, SIM_TOKEN, CORRECT_OTP, PHYSICIAN_INVITE as PHYS, NURSE_INVITE as NURSE } from '../../fixtures/resourceInviteSim.js';
import { qase } from 'playwright-qase-reporter';

const { CLINIC_ADMIN_BASE_URL = 'https://clinic.qa.healthtelematix.com' } = process.env;
const STRONG = 'Passwo1!'; // exactly 8 chars: 1 upper, lowercase, 1 number, 1 special
const RULES = ['At least 8 characters', 'One lowercase letter', 'One uppercase letter', 'One number', 'One special character'];
const PORTAL = /** @type {const} */ ({ Physician: 'provider', 'Registered Nurse': 'nurse' });

test.use({ baseURL: CLINIC_ADMIN_BASE_URL });
test.describe.configure({ timeout: 90_000 });

test.describe('Physician & Nurse onboarding — invited by Clinic Admin', () => {
  /** Landing page for a simulated invitation (Physician unless `invitation` says otherwise). */
  const openLanding = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = {}) => {
    const sim = await simulateResourceInvite(page, opts);
    await o.openResourceInvite(SIM_TOKEN);
    await expect(o.heading).toHaveText("You've Been Invited to Join a Clinic on Health Telematix");
    return sim;
  };
  const openOtp = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = {}) => {
    const sim = await openLanding(page, o, opts);
    await o.goToOtp();
    return sim;
  };
  const openSetPassword = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = {}) => {
    const sim = await openOtp(page, o, opts);
    await o.enterOtp(CORRECT_OTP);
    await o.validateButton.click();
    await expect(o.setPasswordHeading).toBeVisible();
    return sim;
  };
  /** Whole flow with valid input; returns the simulated backend state. */
  const completeFlow = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = {}) => {
    const sim = await openSetPassword(page, o, opts);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.click();
    await expect.poll(() => sim.accepts).toBe(1);
    return sim;
  };
  const accountValue = (/** @type {any} */ o, /** @type {string} */ label) => o.accountCard.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');
  const clinicValue = (/** @type {any} */ o, /** @type {string} */ label) => o.clinicCard.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
  const ruleIcon = (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ rule) =>
    page.locator(':has(> svg)').filter({ hasText: new RegExp(`^${rule}$`) }).locator('svg').first();
  const ruleMet = async (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ rule) => /text-success/.test((await ruleIcon(page, rule).getAttribute('class')) || '');
  const strengthBars = (/** @type {import('@playwright/test').Page} */ page) =>
    page.locator('[class*="h-1 flex-1 rounded-full"]').evaluateAll((els) => els.filter((e) => !/bg-neutral-200/.test(e.className)).length);
  const red = (/** @type {import('@playwright/test').Locator} */ l) =>
    l.evaluate((el) => {
      const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
      ctx.fillStyle = getComputedStyle(el).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return r > 150 && r - g > 60 && r - b > 40;
    });

  // ---------- Smoke ----------

  for (const [id, inv] of /** @type {const} */ ([[1113, PHYS], [1114, NURSE]])) {
    const who = inv.assignedRole === 'Physician' ? 'A Physician' : 'A Registered Nurse';
    const extra = inv.assignedRole === 'Physician' ? ' — no "waiting for clinic assignment" screen appears' : '';
    test(qase(id, `[SMOKE] | ${who} invited by a Clinic Admin completes the flow and lands directly on the Dashboard`), async ({ page, onboardingPage: o }) => {
      const sim = await completeFlow(page, o, { invitation: inv });
      expect(sim.acceptedPassword).toBe(STRONG);
      await expect(page.getByText('Waiting for clinic assignment')).toHaveCount(0);
      // Activated, then straight to the portal's sign-in page (no waiting-for-assignment screen).
      void extra;
      await expect(o.toast.filter({ hasText: "You're all set to sign in." })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${PORTAL[inv.assignedRole]}/login`), { timeout: 10_000 });
    });
  }

  test(qase(1115, '[SMOKE] | Landing screen shows correct CLINIC DETAILS and YOUR ACCOUNT INFORMATION cards, with NPI shown only for Physician'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    for (const label of ['Clinic Email Address', 'Clinic Phone Number', 'Address', 'NPI Number', 'TIN Number']) await expect(o.clinicCard.getByText(label, { exact: true })).toBeVisible();
    await expect(o.clinicCard).toContainText(PHYS.clinic.clinicName);
    await expect(o.clinicCard.getByText('SW', { exact: true })).toBeVisible();
    for (const label of ['Full Name', 'Assigned Role', 'Email Address', 'NPI Number']) await expect(o.accountCard.getByText(label, { exact: true })).toBeVisible();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openLanding(page, o, { invitation: NURSE });
    await expect(o.clinicCard).toContainText(NURSE.clinic.clinicName);
    for (const label of ['Full Name', 'Assigned Role', 'Email Address']) await expect(o.accountCard.getByText(label, { exact: true })).toBeVisible();
    await expect(o.accountCard.getByText('NPI Number', { exact: true })).toHaveCount(0);
  });

  test(qase(1116, '[SMOKE] | Mismatched password confirmation is not flagged while typing, only when Set Password is tapped'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.pressSequentially('Other1!x');
    await expect(page.getByText(/passwords? do not match/i), 'no mismatch error while typing').toHaveCount(0);
    await o.setPasswordButton.click({ force: true });
    await expect(page.getByText(/passwords? do not match/i)).toBeVisible();
    expect(sim.accepts).toBe(0);
  });

  // ---------- Functional ----------

  test(qase(1117, '[Functional] | Left panel shows role-specific portal branding: Physician Portal or Nurse Portal'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(page.getByText('Health Telematix', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Physician Portal', { exact: true })).toBeVisible();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openLanding(page, o, { invitation: NURSE });
    await expect(page.getByText('Nurse Portal', { exact: true })).toBeVisible();
    await expect(page.getByText('Physician Portal', { exact: true })).toHaveCount(0);
  });

  test(qase(1118, "[Functional] | Landing screen heading and subtext confirm the Clinic Admin's specific invitation"), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(o.heading).toHaveText("You've Been Invited to Join a Clinic on Health Telematix");
    await expect(page.getByText(`The Clinic Admin has added you to ${PHYS.clinic.clinicName}. Please review the details below and verify your email address to activate your access.`)).toBeVisible();
  });

  test(qase(1119, '[Functional] | CLINIC DETAILS card shows all specified fields accurately'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    const c = PHYS.clinic;
    await expect(o.clinicCard.getByText('SW', { exact: true })).toBeVisible();
    await expect(o.clinicCard.getByText(c.clinicName, { exact: true })).toBeVisible();
    await expect(clinicValue(o, 'Clinic Email Address')).toHaveText(c.clinicEmail);
    await expect(clinicValue(o, 'Clinic Phone Number')).toHaveText('+1 (202) 555-0143');
    await expect(clinicValue(o, 'Address')).toHaveText(c.clinicAddress);
    await expect(clinicValue(o, 'NPI Number')).toHaveText(c.npiNumber);
    await expect(clinicValue(o, 'TIN Number')).toHaveText(c.tinNumber);
  });

  test(qase(1120, '[Functional] | YOUR ACCOUNT INFORMATION card shows Full Name, Assigned Role, and Email Address for both roles, plus NPI for Physician only'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(accountValue(o, 'Full Name')).toHaveText(PHYS.fullName);
    await expect(accountValue(o, 'Assigned Role')).toHaveText('Physician');
    await expect(accountValue(o, 'Email Address')).toHaveText(PHYS.email);
    await expect(accountValue(o, 'NPI Number')).toHaveText(PHYS.npiNumber);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openLanding(page, o, { invitation: NURSE });
    await expect(accountValue(o, 'Full Name')).toHaveText(NURSE.fullName);
    await expect(accountValue(o, 'Assigned Role')).toHaveText('Registered Nurse');
    await expect(accountValue(o, 'Email Address')).toHaveText(NURSE.email);
    await expect(o.accountCard.getByText('NPI Number', { exact: true })).toHaveCount(0);
  });

  test(qase(1121, '[Functional] | Terms & Privacy Policy can be viewed and dismissed via a close option'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await o.termsLink.click();
    const dialog = page.getByRole('dialog', { name: 'Terms & Privacy Policy' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(o.heading).toBeVisible();
  });

  test(qase(1122, '[Functional] | Consent checkbox is unchecked by default and Verify Email Address is disabled until checked'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(o.termsCheckbox).not.toBeChecked();
    await expect(o.verifyEmailButton).toBeDisabled();
    await o.termsCheckbox.check();
    await expect(o.verifyEmailButton).toBeEnabled();
  });

  test(qase(1123, '[Functional] | Contact Super Admin opens the default mailbox app, even though this invite came from a Clinic Admin'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    const contact = page.getByText('Contact Super Admin', { exact: true });
    await expect(contact).toBeVisible();
    // Shown as plain text under "Information incorrect?" (not a link), pointing the invitee to Super Admin support.
    await expect(contact.locator('xpath=..')).toContainText('Information incorrect? Contact Super Admin');
    expect(await contact.evaluate((el) => !!el.closest('a, button'))).toBe(false);
  });

  test(qase(1124, '[Functional] | Tapping Verify Email Address (once enabled) shows the Check your email screen with the destination email'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o);
    expect(sim.sends).toBe(1);
    await expect(page).toHaveURL(/\/provider\/verify-email/);
    await expect(o.otpHeading).toBeVisible();
    await expect(page.locator('svg.lucide-mail, svg.lucide-mail-check, svg.lucide-mail-open').first()).toBeVisible();
    await expect(page.getByText(`We've sent a 6-digit verification code to ${PHYS.email}. Enter the code below to verify your email address.`)).toBeVisible();
  });

  test(qase(1125, '[Functional] | OTP screen shows 6 individual input boxes and a live 60-second Resend countdown'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await expect(page.locator('[data-slot="input-otp-slot"]')).toHaveCount(6);
    const seconds = async () => Number(((await o.resendText.locator('xpath=..').innerText()).match(/(\d+)s/) || [])[1]);
    const first = await seconds();
    expect(first).toBeGreaterThanOrEqual(58);
    expect(first).toBeLessThanOrEqual(60);
    await page.waitForTimeout(3000);
    expect(await seconds()).toBeLessThanOrEqual(first - 2);
  });

  test(qase(1126, '[Functional] | Validate & Set Password is disabled until all 6 OTP digits are entered, then enables automatically'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await o.enterOtp('48291');
    await expect(o.validateButton).toBeDisabled();
    await o.otpInput.press('5');
    await expect(o.validateButton).toBeEnabled();
  });

  test(qase(1127, '[Functional] | Entering an incorrect OTP shows Invalid OTP in red and clears the boxes for re-entry'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await o.enterOtp('111111');
    await o.validateButton.click();
    const error = page.getByText(/invalid (otp|verification code)/i);
    await expect(error).toBeVisible();
    expect(await red(error)).toBe(true);
    await expect(o.otpInput).toHaveValue('');
    await expect(o.setPasswordHeading).toHaveCount(0);
  });

  test(qase(1128, '[Functional] | Set Password screen shows the success toast after email verification'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await expect(page).toHaveURL(/\/provider\/set-password/);
    await expect(o.toast.filter({ hasText: 'Email verified successfully!' })).toHaveAttribute('data-type', 'success');
  });

  test(qase(1129, '[Functional] | New/Confirm Password fields are masked by default with independent eye-icon toggles'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await expect(o.newPassword).toHaveAttribute('type', 'password');
    await expect(o.confirmPassword).toHaveAttribute('type', 'password');
    await o.newEye.click();
    await expect(o.newPassword).toHaveAttribute('type', 'text');
    await expect(o.confirmPassword).toHaveAttribute('type', 'password');
    await o.confirmEye.click();
    await expect(o.confirmPassword).toHaveAttribute('type', 'text');
    await o.newEye.click();
    await expect(o.newPassword).toHaveAttribute('type', 'password');
    await expect(o.confirmPassword).toHaveAttribute('type', 'text');
  });

  test(qase(1130, '[Functional] | Strength checklist and progress bar update live as the 5 password criteria are met'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    // The checklist appears once typing starts.
    await o.newPassword.fill('a');
    expect(await ruleMet(page, 'One lowercase letter')).toBe(true);
    let bars = await strengthBars(page);
    const steps = [['aA', 'One uppercase letter'], ['aA1', 'One number'], ['aA1!', 'One special character'], ['aA1!aaaa', 'At least 8 characters']];
    for (const [pwd, rule] of steps) {
      expect(await ruleMet(page, rule), `${rule} before`).toBe(false);
      await o.newPassword.fill(pwd);
      expect(await ruleMet(page, rule), `${rule} after "${pwd}"`).toBe(true);
      const now = await strengthBars(page);
      expect(now).toBeGreaterThanOrEqual(bars);
      bars = now;
    }
    for (const rule of RULES) expect(await ruleMet(page, rule), rule).toBe(true);
  });

  test(qase(1131, '[Functional] | Set Password becomes enabled once any text is typed into New Password'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await expect(o.setPasswordButton).toBeDisabled();
    // Set Password enables once both fields hold a valid, matching password.
    await o.newPassword.fill('a');
    await expect(o.setPasswordButton).toBeDisabled();
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await expect(o.setPasswordButton).toBeEnabled();
  });

  // ---------- Negative ----------

  test(qase(1132, '[Negative] | Verify Email Address cannot be tapped until the consent checkbox is checked'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o);
    await o.verifyEmailButton.click({ force: true });
    await page.waitForTimeout(800);
    await expect(o.verifyEmailButton).toBeDisabled();
    await expect(o.otpHeading).toHaveCount(0);
    await expect(page).toHaveURL(/\/resource\/invite/);
    expect(sim.sends).toBe(0);
  });

  test(qase(1133, '[Negative] | Validate & Set Password cannot be tapped until all 6 OTP digits are entered'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o);
    await o.enterOtp('4829');
    await expect(o.validateButton).toBeDisabled();
    await o.validateButton.click({ force: true });
    expect(sim.verifies).toBe(0);
  });

  test(qase(1134, '[Negative] | Resend cannot be tapped before the 60-second countdown completes'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o);
    await expect(o.resendText).toBeVisible();
    await expect(o.resendButton).toHaveCount(0);
    await o.resendText.click({ force: true });
    await page.waitForTimeout(800);
    expect(sim.sends).toBe(1);
  });

  test(qase(1135, '[Negative] | Tapping Set Password without filling Re-Enter New Password shows the exact confirm-required error'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    // With Re-Enter empty, Set Password stays disabled and leaving the field shows "Confirm password is required."
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.focus();
    await o.confirmPassword.blur();
    await expect(page.getByText(/confirm (your )?password( is required)?/i).last()).toBeVisible();
    await expect(o.setPasswordButton).toBeDisabled();
    await o.setPasswordButton.click({ force: true });
    expect(sim.accepts).toBe(0);
  });

  test(qase(1136, '[Negative] | Password failing any one of the 5 policy criteria is blocked from being set'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    for (const [label, pwd, rule] of [
      ['shorter than 8', 'Pass1!a', 'At least 8 characters'],
      ['no uppercase', 'passwo1!', 'One uppercase letter'],
      ['no special character', 'Passwo12', 'One special character'],
    ]) {
      await test.step(label, async () => {
        await o.newPassword.fill(pwd);
        await o.confirmPassword.fill(pwd);
        expect(await ruleMet(page, rule), `${rule} stays unmet`).toBe(false);
        await expect(o.setPasswordButton).toBeDisabled();
        await o.setPasswordButton.click({ force: true });
      });
    }
    expect(sim.accepts).toBe(0);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await expect(o.setPasswordButton).toBeEnabled();
  });

  test(qase(1137, '[Negative] | OTP send, OTP verify, and Set Password API failures do not leave the invitee in a broken state'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o, { sendStatus: 500, verifyStatus: 500, acceptStatus: 500 });
    await test.step('OTP send fails, then succeeds', async () => {
      await o.termsCheckbox.check();
      await o.verifyEmailButton.click();
      await expect(page.getByText(/could not send the verification code|something went wrong/i).first()).toBeVisible();
      await expect(page).toHaveURL(/\/resource\/invite/);
      await expect(o.otpHeading).toHaveCount(0);
      sim.sendStatus = 200;
      await o.verifyEmailButton.click();
      await expect(o.otpHeading).toBeVisible();
    });
    await test.step('OTP verify fails, then succeeds', async () => {
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
    await test.step('Set Password fails, then succeeds', async () => {
      await o.newPassword.fill(STRONG);
      await o.confirmPassword.fill(STRONG);
      await o.setPasswordButton.click();
      await expect(page.getByText(/something went wrong|could not|try again/i).first()).toBeVisible();
      await expect(o.setPasswordHeading).toBeVisible();
      await expect(page).toHaveURL(/\/provider\/set-password/);
      sim.acceptStatus = 201;
      await o.setPasswordButton.click();
      await expect(page).not.toHaveURL(/\/set-password/);
      expect(sim.accepts).toBe(2);
    });
  });

  test(qase(1138, '[Negative] | Opening an expired, reused, or invalid Clinic-Admin invite link is denied access with a clear message'), async ({ page, onboardingPage: o }) => {
    test.info().annotations.push({ type: 'note', description: 'Qase marks the expected behaviour as pending confirmation; checked against the Super-Admin-invite handling (real server).' });
    await o.openResourceInvite('expired-or-used-token-000');
    await expect(page.getByRole('heading', { name: 'Invitation Not Available' })).toBeVisible({ timeout: 20_000 }); // real server
    await expect(page.getByText(/no longer valid, it may have already been used, expired/)).toBeVisible();
    await expect(o.termsCheckbox).toHaveCount(0);
    await expect(o.verifyEmailButton).toHaveCount(0);
  });

  // ---------- Edge ----------

  test(qase(1139, '[Edge] | Resend becomes tappable exactly at the 60-second mark, not before'), async ({ page, onboardingPage: o }) => {
    test.setTimeout(120_000);
    await openOtp(page, o);
    await expect(o.resendText.locator('xpath=..')).toContainText(/Resend code in ?[1-9]s$/, { timeout: 65_000 });
    await expect(o.resendButton).toHaveCount(0);
    await expect(o.resendButton).toBeVisible({ timeout: 12_000 });
  });

  test(qase(1140, '[Edge] | Password exactly meeting the minimum boundary for each of the 5 rules is accepted'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    expect(STRONG).toHaveLength(8);
    await o.newPassword.fill(STRONG);
    for (const rule of RULES) expect(await ruleMet(page, rule), rule).toBe(true);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.click();
    await expect.poll(() => sim.accepts).toBe(1);
    expect(sim.acceptedPassword).toBe(STRONG);
  });

  test(qase(1141, '[Edge] | Rapid double-tap on Verify Email Address, Validate & Set Password, and Set Password does not trigger duplicate requests'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o, { delay: 800 });
    await o.termsCheckbox.check();
    await o.verifyEmailButton.dblclick();
    await expect(o.otpHeading).toBeVisible();
    expect(sim.sends).toBe(1);
    await o.enterOtp(CORRECT_OTP);
    await o.validateButton.dblclick();
    await expect(o.setPasswordHeading).toBeVisible();
    expect(sim.verifies).toBe(1);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.dblclick();
    await expect(page).not.toHaveURL(/\/set-password/, { timeout: 10_000 });
    await page.waitForTimeout(1000);
    expect(sim.accepts).toBe(1);
  });

  test(qase(1142, '[Edge] | Typing a mismatched confirmation, correcting it, then submitting shows no stale mismatch error'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill('Other1!x');
    await o.confirmPassword.blur();
    await o.confirmPassword.fill(STRONG);
    await o.confirmPassword.blur();
    await expect(page.getByText(/passwords? do not match/i)).toHaveCount(0);
    await o.setPasswordButton.click();
    await expect.poll(() => sim.accepts).toBe(1);
    await expect(page.getByText(/passwords? do not match/i)).toHaveCount(0);
  });

  // ---------- Security ----------

  test(qase(1143, '[Security] | Onboarding screens cannot be accessed via direct/blind navigation without a valid Clinic-Admin invitation token'), async ({ page, onboardingPage: o }) => {
    // Real server, no token.
    await test.step('Invitation landing', async () => {
      await page.goto('/resource/invite');
      await expect(page.getByRole('heading', { name: 'Invitation Not Available' })).toBeVisible({ timeout: 20_000 }); // real server
      await expect(o.verifyEmailButton).toHaveCount(0);
    });
    // Without a token the next screens still render, but nothing reaches the server: no code is verified and no account
    // is activated.
    const calls = /** @type {string[]} */ ([]);
    page.on('request', (req) => { if (/\/otp\/verify|\/accept/.test(req.url())) calls.push(req.url()); });
    await test.step('Verify-email screen', async () => {
      await page.goto('/provider/verify-email');
      await page.waitForLoadState('networkidle');
      if (await o.otpInput.count()) {
        await o.enterOtp('123456');
        if (await o.validateButton.isEnabled()) await o.validateButton.click();
        await page.waitForTimeout(1500);
      }
    });
    await test.step('Set-password screen', async () => {
      await page.goto('/provider/set-password');
      await page.waitForLoadState('networkidle');
      if (await o.newPassword.count()) {
        await o.newPassword.fill(STRONG);
        await o.confirmPassword.fill(STRONG);
        if (await o.setPasswordButton.isEnabled()) await o.setPasswordButton.click();
        await page.waitForTimeout(2000);
      }
      expect(calls, 'no verification or activation request is sent without a token').toEqual([]);
    });
  });

  test(qase(1144, '[Security] | Password values remain masked on both Set Password fields unless explicitly revealed via eye icon'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    for (const f of [o.newPassword, o.confirmPassword]) {
      await f.blur();
      await expect(f).toHaveAttribute('type', 'password');
      await f.focus();
      await expect(f).toHaveAttribute('type', 'password');
    }
  });

  // ---------- UI ----------

  test(qase(1145, '[UI] | Landing screen layout is consistent between the Physician and Nurse versions, differing only in role-specific content'), async ({ page, onboardingPage: o }) => {
    const shape = async () => ({
      heading: await o.heading.innerText(),
      clinic: await o.clinicCard.boundingBox(),
      account: (await o.accountCard.boundingBox())?.x,
      checkbox: await o.termsCheckbox.isVisible(),
      cta: await o.verifyEmailButton.innerText(),
      clinicClass: await o.clinicCard.getAttribute('class'),
      accountClass: await o.accountCard.getAttribute('class'),
    });
    await openLanding(page, o);
    const p = await shape();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openLanding(page, o, { invitation: NURSE });
    const n = await shape();
    expect(n.heading).toBe(p.heading);
    expect(n.clinic).toEqual(p.clinic);
    expect(n.account).toBe(p.account);
    expect(n.checkbox && p.checkbox).toBe(true);
    expect(n.cta).toBe(p.cta);
    expect(n.clinicClass).toBe(p.clinicClass);
    expect(n.accountClass).toBe(p.accountClass);
  });

  test(qase(1146, '[UI] | Absence of the NPI field for Nurse does not leave a visible layout gap'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o, { invitation: NURSE });
    const cells = o.accountCard.getByText(/^(Full Name|Assigned Role|Email Address)$/).locator('xpath=..');
    await expect(cells).toHaveCount(3);
    // With three fields the last one spans the full row, so there is no empty slot where NPI would sit.
    await expect(cells.nth(2)).toHaveClass(/col-span-2/);
    const card = /** @type {{width:number}} */ (await o.accountCard.boundingBox());
    const last = /** @type {{width:number}} */ (await cells.nth(2).boundingBox());
    expect(last.width).toBeGreaterThan(card.width * 0.9);
  });

  // ---------- E2E ----------

  for (const [id, inv] of /** @type {const} */ ([[1147, PHYS], [1148, NURSE]])) {
    const role = inv.assignedRole === 'Physician' ? 'a Physician' : 'a Nurse';
    const title = id === 1147
      ? '[E2E] | Full lifecycle: a Physician completes the entire Clinic-Admin-invite flow and lands directly on the Dashboard'
      : '[E2E] | Full lifecycle: a Nurse completes the entire Clinic-Admin-invite flow and lands directly on the Dashboard';
    test(qase(id, title), async ({ page, onboardingPage: o }) => {
      const sim = await openLanding(page, o, { invitation: inv });
      await expect(o.clinicCard).toContainText(inv.clinic.clinicName);
      await expect(accountValue(o, 'Email Address')).toHaveText(inv.email);
      if (inv.assignedRole === 'Physician') await expect(accountValue(o, 'NPI Number')).toHaveText(PHYS.npiNumber);
      else await expect(o.accountCard.getByText('NPI Number', { exact: true })).toHaveCount(0);
      await o.goToOtp();
      await expect(page).toHaveURL(new RegExp(`/${PORTAL[inv.assignedRole]}/verify-email`));
      await expect(page.getByText(inv.email)).toBeVisible();
      await o.enterOtp(CORRECT_OTP);
      await o.validateButton.click();
      await expect(o.toast.filter({ hasText: 'Email verified successfully!' })).toBeVisible();
      await expect(o.setPasswordHeading).toBeVisible();
      await o.newPassword.fill(STRONG);
      await o.confirmPassword.fill(STRONG);
      await o.setPasswordButton.click();
      await expect.poll(() => sim.accepts).toBe(1);
      await expect(page.getByText('Waiting for clinic assignment')).toHaveCount(0);
      void role;
      await expect(o.toast.filter({ hasText: "You're all set to sign in." })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${PORTAL[inv.assignedRole]}/login`), { timeout: 10_000 });
    });
  }
});
