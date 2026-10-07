// @ts-check
// Qase: HTM › Super Admin › Sign In (suite 2). Test titles carry Qase case IDs via qase(id, title)
// for traceability (shown as "(Qase ID: n)"); results are not reported to Qase.
//
// Not automated here (left for manual execution in Qase):
//   HTM-3, 5, 37      — rely on browser password-manager autofill / a remembered user
//   HTM-2, 36         — need a fresh, never-signed-in Super Admin account per run
//   HTM-17, 18, 20-23 — dashboard layout checks; add once SUPER_ADMIN_* creds are available to inspect the dashboard DOM
import { test, expect } from '../../fixtures/pages.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '', SUPER_ADMIN_PASSWORD = '' } = process.env;
const hasCreds = !!(SUPER_ADMIN_EMAIL && SUPER_ADMIN_PASSWORD);
const NEEDS_CREDS = 'Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env';
const INVALID_EMAIL = /enter a valid email address/i;

test.describe('Super Admin — Sign In', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.open();
  });

  test.describe('@smoke', () => {
    test(qase(1, '[SMOKE] Valid Super Admin credentials sign-in navigates to Dashboard with default UI state'), async ({ page, loginPage }) => {
      test.skip(!hasCreds, NEEDS_CREDS);
      await test.step('Enter a registered email address in the Email Address field', async () => {
        await loginPage.emailInput.fill(SUPER_ADMIN_EMAIL);
        await expect(loginPage.emailInput).toHaveValue(SUPER_ADMIN_EMAIL);
      });
      await test.step('Enter the correct matching password in the Password field', async () => {
        await loginPage.passwordInput.fill(SUPER_ADMIN_PASSWORD);
        await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
      });
      await test.step('Tap "Sign In to Dashboard"', async () => {
        await loginPage.signInButton.click();
        await expect(page).toHaveURL(/\/dashboard/);
      });
    });
  });

  test(qase(4, '[Functional] Branding panel displays logo, portal label, and value proposition content'), async ({ loginPage }) => {
    await test.step('Load the Sign-In page', async () => {
      await expect(loginPage.brandName).toBeVisible();
      await expect(loginPage.portalLabel).toBeVisible();
    });
    await test.step('Inspect the panel body', async () => {
      await expect(loginPage.brandingImages.first()).toBeVisible();
    });
    await test.step('Inspect the value proposition list', async () => {
      for (const prop of loginPage.valueProps) await expect(prop).toBeVisible();
    });
  });

  test(qase(6, '[Functional] Email Address field displays placeholder example text'), async ({ loginPage }) => {
    await test.step('Load the Sign-In page without entering any value', async () => {
      await expect(loginPage.emailInput).toHaveValue('');
      await expect(loginPage.emailInput).toHaveAttribute('placeholder', /\S+/);
    });
    await test.step('Click into the field and type a character', async () => {
      await loginPage.emailInput.click();
      await loginPage.emailInput.pressSequentially('a');
      await expect(loginPage.emailInput).toHaveValue('a');
    });
  });

  test(qase(7, '[Functional] Password field loads empty with no pre-filled value on first visit'), async ({ loginPage }) => {
    await expect(loginPage.passwordInput).toHaveValue('');
  });

  test(qase(8, '[Functional] "Forgot password?" link is right-aligned directly below Password field'), async ({ loginPage }) => {
    const pwd = await loginPage.passwordInput.boundingBox();
    const link = await loginPage.forgotPasswordLink.boundingBox();
    expect(pwd && link).toBeTruthy();
    if (!pwd || !link) return;
    expect(link.y).toBeGreaterThanOrEqual(pwd.y + pwd.height);
    expect(Math.abs(link.x + link.width - (pwd.x + pwd.width))).toBeLessThanOrEqual(4);
  });

  test(qase(9, '[Functional] "Sign In to Dashboard" button displays with right-arrow icon'), async ({ loginPage }) => {
    await expect(loginPage.signInButton).toBeVisible();
    await expect(loginPage.signInButton.locator('svg')).toBeVisible();
  });

  test(qase(10, '[Functional] Footer displays Privacy Policy and Terms of Service as clickable links within acceptance note'), async ({ page, loginPage }) => {
    await test.step('Scroll to the footer area of the Sign-In page', async () => {
      await expect(page.getByText(/By signing in,? you automatically accept our Privacy Policy and Terms of Service/)).toBeVisible();
    });
    await test.step('Inspect "Privacy Policy" and "Terms of Service" within the note', async () => {
      await expect(loginPage.privacyPolicyLink).toBeEnabled();
      await expect(loginPage.termsLink).toBeEnabled();
    });
  });

  test(qase(11, '[Functional] Copyright line displays correct year and company name'), async ({ loginPage }) => {
    await expect(loginPage.footer).toContainText('© 2026 Health Telematix. All rights reserved.');
  });

  test(qase(12, '[Functional] Email Address field shows blue focus border when selected/active'), async ({ loginPage }) => {
    // Focus state is a 4px navy-blue ring (box-shadow); an empty field on blur gets a separate red "invalid" ring.
    const FOCUS_RING = 'rgb(26, 45, 69) 0px 0px 0px 4px';
    const ring = () => loginPage.emailInput.evaluate((el) => getComputedStyle(el).boxShadow);
    await test.step('Tap/click into the Email Address field', async () => {
      await loginPage.emailInput.click();
      await expect.poll(ring).toContain(FOCUS_RING);
    });
    await test.step('Tap/click outside the field', async () => {
      await loginPage.welcomeHeading.click();
      await expect.poll(ring).not.toContain(FOCUS_RING);
    });
  });

  test(qase(13, '[Functional] Eye icon toggles password visibility between masked and plain text'), async ({ loginPage }) => {
    await test.step('Enter a value into the Password field', async () => {
      await loginPage.passwordInput.fill('Secret@123');
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    });
    await test.step('Tap the eye icon', async () => {
      await loginPage.showPasswordButton.click();
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');
      await expect(loginPage.passwordInput).toHaveValue('Secret@123');
    });
    await test.step('Tap the eye icon again', async () => {
      await loginPage.hidePasswordButton.click();
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    });
  });

  test(qase(14, '[Functional] Tapping "Forgot password?" navigates to password recovery entry flow'), async ({ page, loginPage, forgotPasswordPage }) => {
    await loginPage.forgotPasswordLink.click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(forgotPasswordPage.heading).toBeVisible();
    await expect(forgotPasswordPage.sendResetLinkButton).toBeVisible();
  });

  test(qase(15, '[Functional] Tapping Privacy Policy link opens Privacy Policy content'), async ({ loginPage }) => {
    await loginPage.privacyPolicyLink.click();
    await expect(loginPage.legalDialog).toBeVisible();
    await expect(loginPage.legalDialog.getByText(/privacy/i).first()).toBeVisible();
  });

  test(qase(16, '[Functional] Tapping Terms of Service link opens Terms of Service content'), async ({ loginPage }) => {
    await loginPage.termsLink.click();
    await expect(loginPage.legalDialog).toBeVisible();
    await expect(loginPage.legalDialog.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  });

  test(qase(19, '[Functional] Dashboard module is selected by default with menu bar expanded on login'), async ({ page, loginPage }) => {
    test.skip(!hasCreds, NEEDS_CREDS);
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Dashboard').first()).toBeVisible();
  });

  test(qase(24, '[Functional] Successful login session persists Dashboard view after page refresh'), async ({ page, loginPage }) => {
    test.skip(!hasCreds, NEEDS_CREDS);
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test(qase(25, '[Negative] Invalid email format displays inline error and blocks sign-in'), async ({ loginPage }) => {
    await test.step('Enter an email missing the "@" symbol and a valid password', async () => {
      await loginPage.fill('userexample.com', 'Password@123');
      await loginPage.passwordInput.focus();
      await expect(loginPage.emailError).toHaveText(INVALID_EMAIL);
      await expect(loginPage.signInButton).toBeDisabled();
    });
    await test.step('Enter an email missing a domain ("user@")', async () => {
      await loginPage.emailInput.fill('user@');
      await loginPage.passwordInput.focus();
      await expect(loginPage.emailError).toHaveText(INVALID_EMAIL);
      await expect(loginPage.signInButton).toBeDisabled();
    });
    await test.step('Leave Email Address empty', async () => {
      await loginPage.emailInput.fill('');
      await loginPage.passwordInput.focus();
      await expect(loginPage.emailError).toHaveText('Email is required.');
      await expect(loginPage.signInButton).toBeDisabled();
    });
  });

  test(qase(26, '[Negative] Valid-format email with incorrect password shows generic "Invalid email or password" message'), async ({ page, loginPage }) => {
    test.skip(!SUPER_ADMIN_EMAIL, 'Set SUPER_ADMIN_EMAIL in .env');
    await test.step('Enter a valid-format, registered email address', async () => {
      await loginPage.emailInput.fill(SUPER_ADMIN_EMAIL);
      await loginPage.passwordInput.focus();
      await expect(loginPage.emailError).toHaveCount(0);
    });
    await test.step('Enter an incorrect password and tap "Sign In to Dashboard"', async () => {
      await loginPage.passwordInput.fill('Definitely-Wrong-1!');
      await loginPage.signInButton.click();
      await expect(loginPage.formError).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test(qase(27, '[Negative] Submitting with no password doesn\'t enable "Sign In to Dashboard" button and blocks sign-in'), async ({ loginPage }) => {
    await loginPage.emailInput.fill('qa.user@example.com');
    await expect(loginPage.emailError).toHaveCount(0);
    await expect(loginPage.passwordInput).toHaveValue('');
    await expect(loginPage.signInButton).toBeDisabled();
  });

  test(qase(28, '[Negative] Sign-in API/network failure keeps user on Sign-In screen with no partial session'), async ({ page, loginPage }) => {
    await test.step('Enter valid email and password', async () => {
      await loginPage.fill('qa.user@example.com', 'Password@123');
      await expect(loginPage.signInButton).toBeEnabled();
    });
    await test.step('Simulate an API failure (5xx) and tap "Sign In to Dashboard"', async () => {
      await page.route('**/auth/login', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500,"message":"Internal Server Error"}' })
      );
      await loginPage.signInButton.click();
      await expect(page.getByText('Something went wrong. Please try again later.')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
    await test.step('No session was created — protected route still redirects to Sign-In', async () => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test(qase(29, '[Negative] "Remember Me" option is not present anywhere on the Sign-In screen'), async ({ page }) => {
    await expect(page.getByText(/remember me/i)).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('switch')).toHaveCount(0);
  });

  test(qase(30, '[Edge] Email field boundary and special character input does not break validation or layout'), async ({ loginPage }) => {
    await test.step('Enter an extremely long email address (250+ characters)', async () => {
      await loginPage.emailInput.fill(`${'a'.repeat(250)}@example.com`);
      await loginPage.passwordInput.focus();
      expect((await loginPage.emailInput.inputValue()).length).toBeLessThanOrEqual(254);
      await expect(loginPage.emailError).toHaveText(INVALID_EMAIL);
      await expect(loginPage.signInButton).toBeInViewport();
    });
    await test.step('Enter an email with leading/trailing whitespace', async () => {
      await loginPage.emailInput.fill('  qa.user@example.com  ');
      await loginPage.passwordInput.focus();
      await expect(loginPage.emailInput).toHaveValue('qa.user@example.com');
      await expect(loginPage.emailError).toHaveCount(0);
    });
    await test.step('Enter an email containing disallowed special characters', async () => {
      await loginPage.emailInput.fill('user!!@@test');
      await loginPage.passwordInput.focus();
      await expect(loginPage.emailError).toHaveText(INVALID_EMAIL);
      await expect(loginPage.signInButton).toBeInViewport();
    });
  });

  test(qase(31, '[Edge] Password field boundary and special character input handled without UI break'), async ({ loginPage }) => {
    await test.step('Enter a very long password (64+ characters)', async () => {
      const longPwd = 'P@ss'.repeat(20);
      await loginPage.passwordInput.fill(longPwd);
      await expect(loginPage.passwordInput).toHaveValue(longPwd);
      await expect(loginPage.signInButton).toBeInViewport();
    });
    await test.step('Enter a password containing special characters, emoji, and mixed scripts', async () => {
      const exotic = 'Pässwörd😀密码!@#';
      await loginPage.passwordInput.fill(exotic);
      await expect(loginPage.passwordInput).toHaveValue(exotic);
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    });
  });

  test(qase(32, '[Edge] Rapid double-tap on "Sign In to Dashboard" does not trigger duplicate submit requests'), async ({ page, loginPage }) => {
    let loginRequests = 0;
    // Slow, mocked response so the second tap lands while the first request is in flight.
    await page.route('**/auth/login', async (route) => {
      loginRequests++;
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"status":401,"message":"Invalid email or password"}' });
    });
    await loginPage.fill('qa.user@example.com', 'Password@123');
    await loginPage.signInButton.dblclick();
    await expect(loginPage.formError).toBeVisible();
    expect(loginRequests).toBe(1);
  });

  test(qase(33, '[Security] Password value is never exposed in plain text without explicit eye icon interaction'), async ({ page, loginPage }) => {
    await test.step('Type a password without tapping the eye icon', async () => {
      await loginPage.passwordInput.fill('Secret@123');
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
      await loginPage.emailInput.focus();
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
      await loginPage.passwordInput.focus();
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    });
    await test.step('Refresh the page and re-enter the field', async () => {
      await page.reload();
      await loginPage.passwordInput.fill('Secret@123');
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    });
  });

  test(qase(34, '[Security] Unauthenticated user attempting direct Dashboard URL access is redirected to Sign-In screen'), async ({ page, loginPage }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(loginPage.signInButton).toBeVisible();
  });

  test(qase(35, '[UI] Password masking icon visually reflects current visibility state'), async ({ loginPage }) => {
    await loginPage.passwordInput.fill('Secret@123');
    await test.step('Observe the eye icon with the password masked', async () => {
      await expect(loginPage.showPasswordButton).toBeVisible();
      await expect(loginPage.hidePasswordButton).toHaveCount(0);
    });
    await test.step('Tap the eye icon to reveal the password', async () => {
      await loginPage.showPasswordButton.click();
      await expect(loginPage.hidePasswordButton).toBeVisible();
      await expect(loginPage.showPasswordButton).toHaveCount(0);
    });
  });
});
