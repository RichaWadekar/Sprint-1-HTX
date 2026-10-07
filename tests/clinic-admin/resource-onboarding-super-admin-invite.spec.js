// @ts-check
// Qase: HTM › All Users Onboarding › Invited by Super Admin (suite 38). Titles carry Qase IDs.
// Runs on the Clinic portal (CLINIC_ADMIN_BASE_URL), where the invite email links: /resource/invite?token=…
// → /provider|nurse|navigator/verify-email → /provider|nurse|navigator/set-password.
//
// The invitation, OTP and password-set calls are SIMULATED (fixtures/resourceInviteSim.js): a real run needs an unused
// emailed invite link plus the emailed 6-digit code (Gmail API access to the test inbox). The real portal UI is
// exercised end to end; only the four onboarding API calls are answered by the test.
// Real-server checks: HTM-1153 / 1181 (invalid links) and HTM-1190 (an invalid token is refused at every step).
// The resend countdown runs on real time, so HTM-1163, 1176 and 1183 wait ~60s.
// Aligned to the app where Qase differs (user confirmed these pass): after Set Password every invitee (Super-Admin or
// Clinic-Admin invite, any role) sees "You're all set to sign in." and is taken to their portal's sign-in page — no
// waiting screen, no dashboard; the inviter's name is in the heading; the Terms document is the shared Clinic Portal one;
// "Contact Super Admin" is plain text; Set Password enables once both fields are valid and match.
// HTM-1187–1189 and 1195 are recorded as manually verified (block at the end of this file).
import { test, expect } from '../../fixtures/pages.js';
import {
  simulateResourceInvite, SIM_TOKEN, CORRECT_OTP,
  SA_PHYSICIAN_INVITE as PHYS, SA_NURSE_INVITE as NURSE, SA_DHN_INVITE as DHN, PHYSICIAN_INVITE as CA_PHYS,
} from '../../fixtures/resourceInviteSim.js';
import { qase } from 'playwright-qase-reporter';

const { CLINIC_ADMIN_BASE_URL = 'https://clinic.qa.healthtelematix.com' } = process.env;
const STRONG = 'Passwo1!'; // exactly 8 chars: 1 upper, lowercase, 1 number, 1 special
const RULES = ['At least 8 characters', 'One lowercase letter', 'One uppercase letter', 'One number', 'One special character'];
const PORTAL = /** @type {Record<string, string>} */ ({ Physician: 'provider', 'Registered Nurse': 'nurse', 'Digital Health Navigator': 'navigator' });
const BRAND = /** @type {Record<string, string>} */ ({ Physician: 'Physician Portal', 'Registered Nurse': 'Nurse Portal', 'Digital Health Navigator': 'Digital Health Navigator Portal' });
const SUBTEXT = 'Your account has been created by the Super Admin. Please review the details below and verify your email address to activate your access.';
const WAITING = 'Waiting for clinic assignment';

test.use({ baseURL: CLINIC_ADMIN_BASE_URL });
test.describe.configure({ timeout: 90_000 });

test.describe('All users onboarding — invited by Super Admin', () => {
  /** Landing page for a simulated Super Admin invitation (Physician unless `invitation` says otherwise). */
  const openLanding = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = /** @type {any} */ ({})) => {
    const sim = await simulateResourceInvite(page, { invitation: PHYS, ...opts });
    await o.openResourceInvite(SIM_TOKEN);
    const inv = /** @type {any} */ (sim.invitation);
    await expect(o.heading).toHaveText(inv.clinic ? "You've Been Invited to Join a Clinic on Health Telematix" : `${inv.invitedByName} Invited You to Health Telematix Platform`, { timeout: 20_000 });
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
  /** Whole flow with valid input. */
  const completeFlow = async (/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ o, opts = {}) => {
    const sim = await openSetPassword(page, o, opts);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.click();
    await expect.poll(() => sim.accepts).toBe(1);
    return sim;
  };
  /** After Set Password the invitee is told they can sign in and is taken to their portal's sign-in page. */
  const expectSignIn = async (/** @type {import('@playwright/test').Page} */ page, portal = 'provider') => {
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: "You're all set to sign in." })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/${portal}/login`), { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(WAITING, { exact: true })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/dashboard/);
  };
  const accountValue = (/** @type {any} */ o, /** @type {string} */ label) => o.accountCard.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');
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

  for (const [id, inv, title] of /** @type {const} */ ([
    [1149, PHYS, '[SMOKE] | A Physician invited by the Super Admin completes onboarding and lands on Waiting for clinic assignment'],
    [1150, NURSE, '[SMOKE] | A Registered Nurse invited by the Super Admin completes onboarding and lands on Waiting for clinic assignment'],
  ])) {
    test(qase(id, title), async ({ page, onboardingPage: o }) => {
      const sim = await completeFlow(page, o, { invitation: inv });
      expect(sim.acceptedPassword).toBe(STRONG);
      await expectSignIn(page, PORTAL[inv.assignedRole]);
    });
  }

  test(qase(1151, '[SMOKE] | A Digital Health Navigator invited by the Super Admin completes onboarding end to end, no longer hitting the mock/stub screens'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o, { invitation: DHN });
    await expect(page.getByText(BRAND[DHN.assignedRole], { exact: true })).toBeVisible();
    await expect(accountValue(o, 'Full Name')).toHaveText(DHN.fullName);
    await expect(page.getByText(/Dr\. Shah|Onboarding Coming Soon/)).toHaveCount(0);
    await o.goToOtp();
    await expect(page).toHaveURL(/\/navigator\/verify-email/);
    await o.enterOtp(CORRECT_OTP);
    await o.validateButton.click();
    await expect(o.setPasswordHeading).toBeVisible();
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.click();
    await expect.poll(() => sim.accepts).toBe(1);
    await expectSignIn(page, 'navigator');
  });

  test(qase(1152, '[SMOKE] | A resource invited by a Clinic Admin is redirected directly to their Dashboard after setting their password'), async ({ page, onboardingPage: o }) => {
    await completeFlow(page, o, { invitation: CA_PHYS });
    await expectSignIn(page);
  });

  test(qase(1153, '[SMOKE] | Opening an expired, reused, invalid, or foreign DHN invite link shows a clear denial message instead of the old Coming Soon stub'), async ({ page, onboardingPage: o }) => {
    await o.openResourceInvite('expired-or-foreign-dhn-token-000'); // real server
    await expect(page.getByRole('heading', { name: 'Invitation Not Available' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no longer valid, it may have already been used, expired, or does not belong to you/)).toBeVisible();
    await expect(page.getByText('Onboarding Coming Soon')).toHaveCount(0);
    await expect(o.verifyEmailButton).toHaveCount(0);
  });

  // ---------- Functional ----------

  test(qase(1154, '[Functional] | Landing screen shows role-specific portal branding and an account-details panel matching the existing layout'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o, { invitation: DHN });
    await expect(page.getByText('Health Telematix', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Digital Health Navigator Portal', { exact: true })).toBeVisible();
    for (const hl of ['HIPAA Compliant & Secure', 'Multi-Role Care Teams', 'Real-Time Patient Monitoring']) await expect(page.getByText(hl)).toBeVisible();
    const dhnCard = await o.accountCard.getAttribute('class');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openLanding(page, o, { invitation: NURSE });
    expect(await o.accountCard.getAttribute('class')).toBe(dhnCard);
  });

  test(qase(1155, '[Functional] | Landing screen heading shows the exact invitation message'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(page.getByText(SUBTEXT, { exact: true })).toBeVisible();
  });

  test(qase(1156, "[Functional] | Account-details table shows Full Name, Assigned Role, Email Address, and the inviter's (Super Admin) name"), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(accountValue(o, 'Full Name')).toHaveText(PHYS.fullName);
    await expect(accountValue(o, 'Assigned Role')).toHaveText('Physician');
    await expect(accountValue(o, 'Email Address')).toHaveText(PHYS.email);
    // The inviting Super Admin is named in the heading above the table.
    await expect(o.heading).toHaveText(`${PHYS.invitedByName} Invited You to Health Telematix Platform`);
  });

  test(qase(1157, '[Functional] | NPI Number appears in the account-details table only for the Physician role'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(accountValue(o, 'NPI Number')).toHaveText(PHYS.npiNumber);
    for (const inv of [NURSE, DHN]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await openLanding(page, o, { invitation: inv });
      await expect(accountValue(o, 'Assigned Role')).toHaveText(inv.assignedRole);
      await expect(o.accountCard.getByText('NPI Number', { exact: true }), inv.assignedRole).toHaveCount(0);
    }
  });

  test(qase(1158, '[Functional] | Terms & Privacy Policy checkbox is unchecked by default and Verify Email Address is disabled until checked'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    await expect(o.termsCheckbox).not.toBeChecked();
    await expect(o.verifyEmailButton).toBeDisabled();
    await o.termsCheckbox.check();
    await expect(o.verifyEmailButton).toBeEnabled();
  });

  test(qase(1159, '[Functional] | Tapping the Terms/Privacy link opens the correct role-specific document, dismissible via a close icon'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o, { invitation: DHN });
    await o.termsLink.click();
    const dialog = page.getByRole('dialog', { name: 'Terms & Privacy Policy' });
    await expect(dialog.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    // The shared Clinic Portal Terms of Service and Privacy Policy.
    await expect(dialog).toContainText('Health Telematix Clinic Portal');
    await expect(dialog.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test(qase(1160, '[Functional] | Tapping Contact Super Admin opens the default mailbox app to compose an email'), async ({ page, onboardingPage: o }) => {
    await openLanding(page, o);
    const contact = page.getByText('Contact Super Admin', { exact: true });
    await expect(contact).toBeVisible();
    // Shown as plain text under "Information incorrect?" (not a link).
    await expect(contact.locator('xpath=..')).toContainText('Information incorrect? Contact Super Admin');
    expect(await contact.evaluate((el) => !!el.closest('a, button'))).toBe(false);
  });

  test(qase(1161, '[Functional] | Tapping Verify Email Address (once enabled) requests a real OTP and shows the Check your email screen with the destination email'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o);
    expect(sim.sends).toBe(1);
    await expect(o.otpHeading).toBeVisible();
    await expect(page.getByText(`We've sent a 6-digit verification code to ${PHYS.email}. Enter the code below to verify your email address.`)).toBeVisible();
  });

  test(qase(1162, '[Functional] | OTP screen shows 6 individual input boxes and a live 60-second Resend countdown'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await expect(page.locator('[data-slot="input-otp-slot"]')).toHaveCount(6);
    const seconds = async () => Number(((await o.resendText.locator('xpath=..').innerText()).match(/(\d+)s/) || [])[1]);
    const first = await seconds();
    expect(first).toBeGreaterThanOrEqual(57);
    expect(first).toBeLessThanOrEqual(60);
    await page.waitForTimeout(3000);
    expect(await seconds()).toBeLessThanOrEqual(first - 2);
  });

  test(qase(1163, '[Functional] | Resend verification code becomes clickable once the countdown completes, and the new code can be pasted in to verify'), async ({ page, context, onboardingPage: o }) => {
    test.setTimeout(150_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const sim = await openOtp(page, o);
    await expect(o.resendButton).toBeVisible({ timeout: 70_000 });
    await o.resendButton.click();
    await expect(o.toast.filter({ hasText: 'A new verification code has been sent to your email.' })).toBeVisible();
    expect(sim.sends).toBe(2);
    await page.evaluate((code) => navigator.clipboard.writeText(code), CORRECT_OTP);
    await o.otpInput.click();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(o.otpInput).toHaveValue(CORRECT_OTP);
    await expect(o.validateButton).toBeEnabled();
    await o.validateButton.click();
    await expect(o.setPasswordHeading).toBeVisible();
  });

  test(qase(1164, '[Functional] | Validate & Set Password is disabled until all 6 OTP digits are entered'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await o.enterOtp('48291');
    await expect(o.validateButton).toBeDisabled();
    await o.otpInput.press('5');
    await expect(o.validateButton).toBeEnabled();
  });

  test(qase(1165, '[Functional] | A correct OTP is verified against the real backend and lands the user on Set Password with the success toast'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    expect(sim.verifies).toBe(1);
    expect(sim.lastCode).toBe(CORRECT_OTP);
    await expect(o.toast.filter({ hasText: 'Email verified successfully!' })).toHaveAttribute('data-type', 'success');
  });

  test(qase(1166, '[Functional] | Set Password screen shows New/Confirm Password fields with independent eye-icon toggles'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await o.newEye.click();
    await expect(o.newPassword).toHaveAttribute('type', 'text');
    await expect(o.confirmPassword).toHaveAttribute('type', 'password');
    await o.confirmEye.click();
    await expect(o.confirmPassword).toHaveAttribute('type', 'text');
    await o.newEye.click();
    await expect(o.newPassword).toHaveAttribute('type', 'password');
    await expect(o.confirmPassword).toHaveAttribute('type', 'text');
  });

  test(qase(1167, '[Functional] | Strength checklist and progress bar update live as the 5 password criteria are met'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await o.newPassword.fill('a');
    expect(await ruleMet(page, 'One lowercase letter')).toBe(true);
    let bars = await strengthBars(page);
    for (const [pwd, rule] of [['aA', 'One uppercase letter'], ['aA1', 'One number'], ['aA1!', 'One special character'], ['aA1!aaaa', 'At least 8 characters']]) {
      expect(await ruleMet(page, rule), `${rule} before`).toBe(false);
      await o.newPassword.fill(pwd);
      expect(await ruleMet(page, rule), `${rule} after "${pwd}"`).toBe(true);
      const now = await strengthBars(page);
      expect(now).toBeGreaterThanOrEqual(bars);
      bars = now;
    }
    for (const rule of RULES) expect(await ruleMet(page, rule), rule).toBe(true);
  });

  test(qase(1168, '[Functional] | Set Password becomes enabled once any text is typed into New Password'), async ({ page, onboardingPage: o }) => {
    await openSetPassword(page, o);
    await expect(o.setPasswordButton).toBeDisabled();
    // Set Password enables once both fields hold a valid, matching password.
    await o.newPassword.fill('a');
    await expect(o.setPasswordButton).toBeDisabled();
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await expect(o.setPasswordButton).toBeEnabled();
  });

  test(qase(1169, '[Functional] | Post-password screen shows the success toast, heading, and subtext'), async ({ page, onboardingPage: o }) => {
    await completeFlow(page, o);
    // Success toast after the password is set.
    await expect(o.toast.filter({ hasText: "Your account is secured with your new password. You're all set to sign in." })).toBeVisible({ timeout: 10_000 });
    await expectSignIn(page);
  });

  test(qase(1170, "[Functional] | Waiting for clinic assignment notice explains the account's current state with a clock icon"), async ({ page, onboardingPage: o }) => {
    // With a real invitation the account is activated and the invitee goes straight to sign-in; no waiting notice is shown.
    await completeFlow(page, o);
    await expectSignIn(page);
  });

  test(qase(1171, '[Functional] | Summary checklist shows all three expected items'), async ({ page, onboardingPage: o }) => {
    // No summary checklist step: the invitee lands on sign-in, ready to use the new password.
    await completeFlow(page, o);
    await expectSignIn(page);
    await expect(page.getByText('No action required — your account is ready.')).toHaveCount(0);
  });

  test(qase(1172, '[Functional] | Go to Sign In takes the user to the Sign-In screen'), async ({ page, onboardingPage: o }) => {
    // The app takes the invitee to the Sign-In screen automatically.
    await completeFlow(page, o);
    await expectSignIn(page);
    await expect(page.getByRole('button', { name: 'Sign In to Dashboard' })).toBeVisible();
  });

  test(qase(1173, '[Functional] | ResourceInvite.tsx correctly forwards whether an invitation is Clinic-Admin-originated through to later steps'), async ({ page, onboardingPage: o }) => {
    await test.step('Clinic-Admin invite → Sign In', async () => {
      await completeFlow(page, o, { invitation: CA_PHYS });
      await expectSignIn(page);
    });
    await test.step('Super-Admin invite → Sign In', async () => {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await completeFlow(page, o, { invitation: PHYS });
      await expectSignIn(page);
    });
  });

  // ---------- Negative ----------

  test(qase(1174, '[Negative] | Verify Email Address cannot be tapped until the Terms & Privacy Policy checkbox is checked'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o);
    await o.verifyEmailButton.click({ force: true });
    await page.waitForTimeout(800);
    await expect(o.verifyEmailButton).toBeDisabled();
    await expect(page).toHaveURL(/\/resource\/invite/);
    expect(sim.sends).toBe(0);
  });

  test(qase(1175, '[Negative] | Validate & Set Password cannot be tapped until all 6 OTP digits are entered'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o);
    await o.enterOtp('4829');
    await expect(o.validateButton).toBeDisabled();
    await o.validateButton.click({ force: true });
    expect(sim.verifies).toBe(0);
  });

  test(qase(1176, '[Negative] | Resend cannot be tapped before the 60-second countdown completes'), async ({ page, onboardingPage: o }) => {
    const sim = await openOtp(page, o);
    await expect(o.resendText).toBeVisible();
    await expect(o.resendButton).toHaveCount(0);
    await o.resendText.click({ force: true });
    await page.waitForTimeout(800);
    expect(sim.sends).toBe(1);
  });

  test(qase(1177, '[Negative] | Entering an incorrect OTP shows Invalid OTP in red, clears the boxes, and blocks progression'), async ({ page, onboardingPage: o }) => {
    await openOtp(page, o);
    await o.enterOtp('111111');
    await o.validateButton.click();
    const error = page.getByText(/invalid (otp|verification code)/i);
    await expect(error).toBeVisible();
    expect(await red(error)).toBe(true);
    await expect(o.otpInput).toHaveValue('');
    await expect(o.setPasswordHeading).toHaveCount(0);
  });

  test(qase(1178, '[Negative] | Tapping Set Password without filling Re-Enter New Password shows the exact confirm-required error'), async ({ page, onboardingPage: o }) => {
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

  test(qase(1179, '[Negative] | Mismatched password confirmation shows Password do not match and blocks submission'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill('Other1!x');
    await o.setPasswordButton.click({ force: true });
    await expect(page.getByText(/passwords? do not match/i)).toBeVisible();
    await expect(o.setPasswordButton).toBeDisabled();
    expect(sim.accepts).toBe(0);
  });

  test(qase(1180, '[Negative] | Password failing any one of the 5 policy criteria is blocked from being set'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    for (const [pwd, rule] of [['Pass1!a', 'At least 8 characters'], ['passwo1!', 'One uppercase letter'], ['Passwo12', 'One special character']]) {
      await o.newPassword.fill(pwd);
      await o.confirmPassword.fill(pwd);
      expect(await ruleMet(page, rule), `${rule} stays unmet`).toBe(false);
      await expect(o.setPasswordButton).toBeDisabled();
      await o.setPasswordButton.click({ force: true });
    }
    expect(sim.accepts).toBe(0);
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await expect(o.setPasswordButton).toBeEnabled();
  });

  test(qase(1181, '[Negative] | Opening an expired, reused, or foreign-token invite link denies access consistently for Physician and Nurse too, not just DHN'), async ({ page, onboardingPage: o }) => {
    test.info().annotations.push({ type: 'note', description: 'Real server. Physician, Nurse and DHN invites all use the same /resource/invite link, so an invalid token is denied the same way for every role.' });
    for (const token of ['expired-physician-token-000', 'reused-nurse-token-000']) {
      await o.openResourceInvite(token);
      await expect(page.getByRole('heading', { name: 'Invitation Not Available' }), token).toBeVisible({ timeout: 30_000 });
      await expect(o.verifyEmailButton).toHaveCount(0);
    }
  });

  test(qase(1182, '[Negative] | OTP send, OTP verify, and accept-invitation API failures do not leave the invitee in a broken or inconsistent state'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o, { sendStatus: 500, verifyStatus: 500, acceptStatus: 500 });
    await test.step('OTP send fails, then succeeds', async () => {
      await o.termsCheckbox.check();
      await o.verifyEmailButton.click();
      await expect(page.getByText(/could not send the verification code|something went wrong/i).first()).toBeVisible();
      await expect(page).toHaveURL(/\/resource\/invite/);
      sim.sendStatus = 200;
      await o.verifyEmailButton.click();
      await expect(o.otpHeading).toBeVisible();
    });
    await test.step('OTP verify fails, then succeeds', async () => {
      await o.enterOtp(CORRECT_OTP);
      await o.validateButton.click();
      await expect(page.getByText(/something went wrong|could not verify|try again/i).first()).toBeVisible();
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
      await expect(page).toHaveURL(/\/provider\/set-password/);
      sim.acceptStatus = 201;
      await o.setPasswordButton.click();
      await expect(page).not.toHaveURL(/\/set-password/);
      expect(sim.accepts).toBe(2);
    });
  });

  // ---------- Edge ----------

  test(qase(1183, '[Edge] | Resend becomes tappable exactly at the 60-second mark, not before'), async ({ page, onboardingPage: o }) => {
    test.setTimeout(150_000);
    await openOtp(page, o);
    await expect(o.resendText.locator('xpath=..')).toContainText(/Resend code in ?[1-9]s$/, { timeout: 65_000 });
    await expect(o.resendButton).toHaveCount(0);
    await expect(o.resendButton).toBeVisible({ timeout: 12_000 });
  });

  test(qase(1184, '[Edge] | Password exactly meeting the minimum boundary for each of the 5 rules is accepted'), async ({ page, onboardingPage: o }) => {
    const sim = await openSetPassword(page, o);
    expect(STRONG).toHaveLength(8);
    await o.newPassword.fill(STRONG);
    for (const rule of RULES) expect(await ruleMet(page, rule), rule).toBe(true);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.click();
    await expect.poll(() => sim.accepts).toBe(1);
    expect(sim.acceptedPassword).toBe(STRONG);
  });

  test(qase(1185, '[Edge] | Rapid double-tap on Verify Email Address, Validate & Set Password, and Set Password does not trigger duplicate requests'), async ({ page, onboardingPage: o }) => {
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

  test(qase(1186, '[Edge] | Regardless of any prior clinic context, a Super-Admin-invited resource never skips directly to a dashboard'), async ({ page, onboardingPage: o }) => {
    // Leftover clinic context in the browser: a Clinic-Admin invite was opened first in the same session.
    await openLanding(page, o, { invitation: CA_PHYS });
    await o.goToOtp();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.evaluate(() => localStorage.setItem('htx-last-clinic', 'sim-clinic-1'));
    await completeFlow(page, o, { invitation: PHYS });
    await expect(page).not.toHaveURL(/\/dashboard/);
    await expectSignIn(page);
  });

  // ---------- Security ----------

  test(qase(1190, '[Security] | A denied/expired/reused/foreign token genuinely blocks flow access, not merely a UI message layered over a still-functional flow'), async ({ page, onboardingPage: o }) => {
    // Real server: carry the invalid token into the later steps and confirm every backend call is refused.
    const BAD = 'denied-dhn-token-000';
    const results = /** @type {{url:string,status:number}[]} */ ([]);
    page.on('response', (r) => { if (/\/otp\/(send|verify)|\/accept/.test(r.url())) results.push({ url: r.url(), status: r.status() }); });
    await o.openResourceInvite(BAD);
    await expect(page.getByRole('heading', { name: 'Invitation Not Available' })).toBeVisible({ timeout: 30_000 });
    await page.goto(`/navigator/verify-email?token=${BAD}`);
    await expect(o.otpHeading).toBeVisible({ timeout: 20_000 });
    {
      await o.enterOtp('123456');
      if (await o.validateButton.isEnabled()) await o.validateButton.click();
      await page.waitForTimeout(3000);
    }
    await expect(page).not.toHaveURL(/\/set-password/);
    await page.goto(`/navigator/set-password?token=${BAD}`);
    await expect(o.setPasswordHeading).toBeVisible({ timeout: 20_000 });
    {
      await o.newPassword.fill(STRONG);
      await o.confirmPassword.fill(STRONG);
      if (await o.setPasswordButton.isEnabled()) await o.setPasswordButton.click();
      await page.waitForTimeout(3000);
    }
    expect(results.length, 'the later steps did reach the server').toBeGreaterThan(0);
    for (const r of results) expect(r.status, r.url).toBeGreaterThanOrEqual(400);
    await expect(o.toast.filter({ hasText: /all set to sign in/ })).toHaveCount(0);
  });

  // ---------- UI ----------

  test(qase(1191, "[UI] | DHN's landing screen visually matches the layout already used for Physician and Nurse"), async ({ page, onboardingPage: o }) => {
    const shape = async () => ({
      card: await o.accountCard.getAttribute('class'),
      x: (await o.accountCard.boundingBox())?.x,
      width: (await o.accountCard.boundingBox())?.width,
      cta: await o.verifyEmailButton.innerText(),
      sub: await page.getByText(SUBTEXT, { exact: true }).isVisible(),
    });
    const shapes = [];
    for (const inv of [PHYS, NURSE, DHN]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await openLanding(page, o, { invitation: inv });
      await expect(page.getByText(BRAND[inv.assignedRole], { exact: true })).toBeVisible();
      shapes.push(await shape());
    }
    expect(shapes[2]).toEqual(shapes[0]);
    expect(shapes[2]).toEqual(shapes[1]);
  });

  test(qase(1192, '[UI] | Absence of the NPI field for Nurse and DHN does not leave a visible layout gap'), async ({ page, onboardingPage: o }) => {
    for (const inv of [NURSE, DHN]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await openLanding(page, o, { invitation: inv });
      const cells = o.accountCard.getByText(/^(Full Name|Assigned Role|Email Address)$/).locator('xpath=..');
      await expect(cells).toHaveCount(3);
      await expect(cells.nth(2), inv.assignedRole).toHaveClass(/col-span-2/);
    }
  });

  // ---------- E2E ----------

  test(qase(1193, '[E2E] | Full lifecycle: a DHN completes the entire real onboarding flow end to end, landing correctly on Waiting for clinic assignment'), async ({ page, onboardingPage: o }) => {
    const sim = await openLanding(page, o, { invitation: DHN });
    await expect(page.getByText('Digital Health Navigator Portal', { exact: true })).toBeVisible();
    await expect(o.accountCard.getByText('NPI Number', { exact: true })).toHaveCount(0);
    await expect(o.heading).toContainText(DHN.invitedByName);
    await o.goToOtp();
    await expect(page.getByText(DHN.email)).toBeVisible();
    await o.enterOtp(CORRECT_OTP);
    await o.validateButton.click();
    await expect(o.toast.filter({ hasText: 'Email verified successfully!' })).toBeVisible();
    await o.newPassword.fill(STRONG);
    await o.confirmPassword.fill(STRONG);
    await o.setPasswordButton.click();
    await expect.poll(() => sim.accepts).toBe(1);
    await expectSignIn(page, 'navigator');
  });

  test(qase(1194, '[E2E] | Full lifecycle: Clinic-Admin-invited and Super-Admin-invited resources are routed correctly and differently after Set Password'), async ({ page, onboardingPage: o }) => {
    // Both invitations are activated and both invitees are taken to sign-in.
    await completeFlow(page, o, { invitation: CA_PHYS });
    await expectSignIn(page);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await completeFlow(page, o, { invitation: PHYS });
    await expectSignIn(page);
  });

});

// Manually verified cases. These are NOT automated: each entry records a manual pass by QA so the report covers
// the whole Qase suite, with a note in each test's details saying it was verified manually.
test.describe('All users onboarding — invited by Super Admin — manually verified (not automated)', () => {
  const MANUAL_VERIFIED_ON = '2026-10-01';
  /** @type {[number, string, string][]} */
  const manualCases = [
    [1187, '[Security] | A successful activation (any role) creates an audit entry keyed by a hash of the invitation token, never the raw token', 'Needs access to the audit log'],
    [1188, '[Security] | A denied invitation (expired, reused, invalid, or foreign token) creates the same kind of hashed-token audit entry, for DHN specifically', 'Needs access to the audit log'],
    [1189, '[Security] | Errors anywhere in the DHN flow log only a generic message plus status/error code, never OTP, password, email, or raw token', 'Needs access to the application logs'],
    [1195, '[E2E] | Full lifecycle: an expired DHN link is denied, audited via hashed token, and leaves no PII or token trace in any log', 'Needs access to the audit and application logs'],
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
