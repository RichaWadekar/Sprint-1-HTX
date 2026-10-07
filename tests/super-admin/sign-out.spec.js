// @ts-check
// Qase: HTM › Super Admin › Sign Out (suite 18). Titles carry Qase case IDs via qase(id, title).
// Every test signs in with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env against the QA portal.
//
// Inactivity cases (HTM-72, 85, 86, 89) use Playwright's fake clock instead of waiting 4 real hours.
// The app checks `htx-sa-last-activity` every 30s and signs out once 4h (14,400,000 ms) have elapsed,
// so "at 4 hours" here means within one 30s check interval after the threshold.
import { test, expect } from '../../fixtures/pages.js';
import { isRed } from '../../pages/AppShellPage.js';
import { qase } from 'playwright-qase-reporter';

const { SUPER_ADMIN_EMAIL = '', SUPER_ADMIN_PASSWORD = '' } = process.env;
const IDLE_LOGOUT_TOAST = 'You have been logged out due to inactivity.';

test.describe('Super Admin — Sign Out', () => {
  test.skip(!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD, 'Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env');
  // All tests share one account — run them one at a time so a logout in one test can't disturb another.
  test.describe.configure({ mode: 'default' });

  test.beforeEach(async ({ page, loginPage }) => {
    await loginPage.open();
    await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test(qase(70, '[SMOKE] | Tapping "Log Out" shows a confirmation modal rather than logging out immediately'), async ({ page, appShell }) => {
    await appShell.sidebarLogOutButton.click();
    await expect(appShell.logoutModal).toBeVisible();
    await expect(appShell.modalOverlay).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test(qase(71, '[SMOKE] | Confirming Log Out in the modal ends the session and redirects to Sign In with blank fields'), async ({ page, appShell, loginPage }) => {
    await appShell.openLogoutModal();
    await test.step('Tap the solid red "Log Out" button inside the modal', async () => {
      await appShell.modalLogOutButton.click();
      await expect(page).toHaveURL(/\/login/);
    });
    await test.step('Inspect the Email Address and Password fields', async () => {
      await expect(loginPage.emailInput).toHaveValue('');
      await expect(loginPage.passwordInput).toHaveValue('');
    });
  });

  test(qase(73, '[Functional] | "Log Out" option displays in red with a red exit/door icon at the bottom of the sidebar'), async ({ appShell }) => {
    await expect(appShell.sidebarLogOutButton).toBeVisible();
    expect(isRed(await appShell.rgbOf(appShell.sidebarLogOutButton, 'color'))).toBe(true);
    const icon = appShell.sidebarLogOutButton.locator('svg.lucide-log-out');
    await expect(icon).toBeVisible();
    expect(isRed(await appShell.rgbOf(icon, 'color'))).toBe(true);

    const navBox = await appShell.sidebarNav.boundingBox();
    const btnBox = await appShell.sidebarLogOutButton.boundingBox();
    expect(navBox && btnBox).toBeTruthy();
    if (navBox && btnBox) expect(btnBox.y).toBeGreaterThan(navBox.y + navBox.height);
  });

  test(qase(74, '[Functional] | Confirmation modal displays red circular exit icon, heading, and confirmation text'), async ({ appShell }) => {
    await appShell.openLogoutModal();
    await test.step('Inspect the top of the modal', async () => {
      await expect(appShell.modalIconBadge).toBeVisible();
      expect(isRed(await appShell.rgbOf(appShell.modalIconBadge.locator('svg'), 'color'))).toBe(true);
      const icon = await appShell.modalIconBadge.boundingBox();
      const heading = await appShell.modalHeading.boundingBox();
      expect(icon && heading).toBeTruthy();
      if (icon && heading) expect(icon.y + icon.height).toBeLessThanOrEqual(heading.y);
    });
    await test.step('Inspect the body text of the modal', async () => {
      await expect(appShell.modalBody).toBeVisible();
    });
  });

  test(qase(75, '[Functional] | Modal displays a neutral/outline "Cancel" button and a solid red "Log Out" button'), async ({ appShell }) => {
    await appShell.openLogoutModal();
    const [r, g, b] = await appShell.rgbOf(appShell.modalCancelButton, 'backgroundColor');
    expect(Math.min(r, g, b)).toBeGreaterThan(230); // white/neutral fill
    expect(isRed(await appShell.rgbOf(appShell.modalLogOutButton, 'backgroundColor'))).toBe(true);
  });

  test(qase(76, '[Functional] | "X" close icon is present at the top-right corner of the modal'), async ({ appShell }) => {
    await appShell.openLogoutModal();
    await expect(appShell.modalCloseButton).toBeVisible();
    const modal = await appShell.logoutModal.boundingBox();
    const close = await appShell.modalCloseButton.boundingBox();
    expect(modal && close).toBeTruthy();
    if (!modal || !close) return;
    expect(close.x).toBeGreaterThan(modal.x + modal.width / 2);
    expect(close.y).toBeLessThan(modal.y + modal.height / 4);
  });

  test(qase(77, '[Functional] | Tapping "Cancel" dismisses the modal and keeps the user signed in with no navigation change'), async ({ page, appShell }) => {
    await appShell.clinicManagementLink.click();
    await expect(page).toHaveURL(/\/clinics/);
    await appShell.openLogoutModal();
    await appShell.modalCancelButton.click();
    await expect(appShell.logoutModal).toBeHidden();
    await expect(page).toHaveURL(/\/clinics/);
    await page.reload();
    await expect(page).toHaveURL(/\/clinics/);
  });

  test(qase(78, '[Functional] | Tapping the "X" icon dismisses the modal and keeps the user signed in with no navigation change'), async ({ page, appShell }) => {
    await appShell.clinicManagementLink.click();
    await expect(page).toHaveURL(/\/clinics/);
    await appShell.openLogoutModal();
    await appShell.modalCloseButton.click();
    await expect(appShell.logoutModal).toBeHidden();
    await expect(page).toHaveURL(/\/clinics/);
    await page.reload();
    await expect(page).toHaveURL(/\/clinics/);
  });

  test(qase(79, '[Negative] | Single tap on "Log Out" does not end the session without confirmation'), async ({ page, appShell }) => {
    let logoutRequests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/auth/logout')) logoutRequests++;
    });
    await appShell.sidebarLogOutButton.click();
    await expect(appShell.logoutModal).toBeVisible();
    await page.waitForTimeout(1000); // give any unintended logout call a chance to fire
    expect(logoutRequests).toBe(0);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test(qase(80, '[Negative] | Background screen is non-interactive while the Log Out confirmation modal is open'), async ({ page, appShell }) => {
    const settings = await appShell.settingsLink.boundingBox();
    expect(settings).toBeTruthy();
    await appShell.openLogoutModal();
    if (settings) await page.mouse.click(settings.x + settings.width / 2, settings.y + settings.height / 2);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(appShell.logoutModal).toBeVisible();
    // Focus stays trapped inside the modal
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    expect(await appShell.logoutModal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  });

  test(qase(81, '[Negative] | Browser back button after logout does not restore the Dashboard or any authenticated screen'), async ({ page, appShell, loginPage }) => {
    await appShell.logOut();
    await page.goBack();
    await expect(page).not.toHaveURL(/\/dashboard/);
    await expect(appShell.sidebarNav).toHaveCount(0);
    if (page.url() !== 'about:blank') await expect(loginPage.signInButton).toBeVisible();
  });

  test(qase(82, '[Negative] | Logout API/network failure does not leave the user in an inconsistent authenticated state'), async ({ page, appShell }) => {
    await page.route('**/auth/logout', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500}' }));
    await appShell.openLogoutModal();
    await appShell.modalLogOutButton.click();
    // App fails secure: local session cleared and user sent to Sign In.
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test(qase(83, '[Edge] | Rapid double-tap on sidebar "Log Out" does not open multiple stacked confirmation modals'), async ({ appShell }) => {
    await appShell.sidebarLogOutButton.dblclick();
    await expect(appShell.logoutModal).toHaveCount(1);
    await expect(appShell.logoutModal).toBeVisible();
  });

  test(qase(84, '[Edge] | Rapid double-tap on the modal\'s red "Log Out" button does not trigger duplicate logout requests'), async ({ page, appShell }) => {
    let logoutRequests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/auth/logout')) logoutRequests++;
    });
    await appShell.openLogoutModal();
    await appShell.modalLogOutButton.dblclick();
    await expect(page).toHaveURL(/\/login/);
    await page.waitForTimeout(1000);
    expect(logoutRequests).toBe(1);
  });

  test.describe('inactivity (fake clock)', () => {
    // Re-sign-in under a fake clock; the clock must be installed before the app boots.
    test.beforeEach(async ({ page, appShell, loginPage }) => {
      await appShell.logOut();
      await page.clock.install();
      await loginPage.open();
      await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test(qase(72, '[SMOKE] | User is automatically logged out after 4 hours of inactivity'), async ({ page }) => {
      await page.clock.runFor('04:00:30');
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByText(IDLE_LOGOUT_TOAST)).toBeVisible();
    });

    test(qase(85, '[Edge] | User activity just before the 4-hour threshold resets the inactivity timer'), async ({ page, appShell }) => {
      await test.step('Idle 3h59m, then interact', async () => {
        await page.clock.runFor('03:59:00');
        await expect(page).toHaveURL(/\/dashboard/);
        await appShell.clinicManagementLink.click();
        await expect(page).toHaveURL(/\/clinics/);
      });
      await test.step('Remain idle past the original 4h mark — still signed in', async () => {
        await page.clock.runFor('01:00:00'); // 4h59m since sign-in, 1h since last activity
        await expect(page).toHaveURL(/\/clinics/);
      });
      await test.step('Idle 4h from the last interaction — signed out', async () => {
        await page.clock.runFor('03:00:30');
        await expect(page).toHaveURL(/\/login/);
      });
    });

    test(qase(86, '[Edge] | Auto-logout triggers at the 4-hour inactivity boundary, not earlier'), async ({ page }) => {
      await test.step('At 3h58m idle the user is still signed in', async () => {
        await page.clock.runFor('03:58:00');
        await expect(page).toHaveURL(/\/dashboard/);
      });
      await test.step('At 3h59m30s idle the user is still signed in', async () => {
        await page.clock.runFor('00:01:30');
        await expect(page).toHaveURL(/\/dashboard/);
      });
      await test.step('Just past 4h (within one 30s check) the user is signed out', async () => {
        await page.clock.runFor('00:01:00');
        await expect(page).toHaveURL(/\/login/);
        await expect(page.getByText(IDLE_LOGOUT_TOAST)).toBeVisible();
      });
    });

    test(qase(89, '[Security] | Auto-logout after 4 hours of inactivity occurs even if the browser tab remains open in the background'), async ({ page, loginPage }) => {
      const otherTab = await page.context().newPage();
      await otherTab.goto('about:blank');
      await otherTab.bringToFront();
      await page.clock.runFor('04:05:00');
      await page.bringToFront();
      await expect(page).toHaveURL(/\/login/);
      await expect(loginPage.signInButton).toBeVisible();
      await otherTab.close();
    });
  });

  test(qase(87, '[Security] | Authenticated screens are inaccessible via browser back/forward navigation after logout'), async ({ page, appShell, loginPage }) => {
    await appShell.clinicManagementLink.click();
    await expect(page).toHaveURL(/\/clinics/);
    await appShell.logOut();
    await test.step('Browser back button', async () => {
      // Pressing back right after logout is a known race: the app can get stuck on a blank /dashboard
      // instead of redirecting, so this step fails intermittently until that is fixed.
      await page.goBack();
      await expect(appShell.sidebarNav).toHaveCount(0);
      await expect(loginPage.signInButton).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
    await test.step('Re-enter a bookmarked authenticated URL', async () => {
      await page.goto('/clinics');
      await expect(page).toHaveURL(/\/login/);
      await expect(appShell.sidebarNav).toHaveCount(0);
    });
  });

  test(qase(88, '[Security] | No credentials are auto-filled or remembered by the application after logout'), async ({ appShell, loginPage }) => {
    await appShell.logOut();
    await test.step('Observe the fields immediately after logout', async () => {
      await expect(loginPage.emailInput).toHaveValue('');
      await expect(loginPage.passwordInput).toHaveValue('');
    });
    await test.step('Attempt to sign in without re-entering the email', async () => {
      await loginPage.passwordInput.fill(SUPER_ADMIN_PASSWORD);
      await expect(loginPage.signInButton).toBeDisabled();
    });
  });

  test(qase(90, '[UI] | Hover state produces a visible visual change on both the Cancel and Log Out modal buttons'), async ({ appShell }) => {
    await appShell.openLogoutModal();
    for (const [name, button] of /** @type {const} */ ([['Cancel', appShell.modalCancelButton], ['Log Out', appShell.modalLogOutButton]])) {
      await test.step(`Hover over "${name}"`, async () => {
        const before = await appShell.rgbOf(button, 'backgroundColor');
        await button.hover();
        await expect.poll(() => appShell.rgbOf(button, 'backgroundColor')).not.toEqual(before);
      });
    }
  });

  test(qase(91, '[E2E] | Full lifecycle: cancel once, then confirm logout, and verify post-logout navigation is locked down'), async ({ page, appShell, loginPage }) => {
    await test.step('Tap "Log Out" in the sidebar', async () => {
      await appShell.openLogoutModal();
      await expect(appShell.modalOverlay).toBeVisible();
    });
    await test.step('Tap "Cancel"', async () => {
      await appShell.modalCancelButton.click();
      await expect(appShell.logoutModal).toBeHidden();
      await expect(page).toHaveURL(/\/dashboard/);
    });
    await test.step('Tap "Log Out" again and confirm', async () => {
      await appShell.logOut();
      await expect(loginPage.emailInput).toHaveValue('');
      await expect(loginPage.passwordInput).toHaveValue('');
    });
    await test.step("Tap the browser's back button", async () => {
      await page.goBack();
      await expect(page).not.toHaveURL(/\/dashboard/);
    });
    await test.step('Manually re-enter valid credentials and sign in', async () => {
      await loginPage.open();
      await loginPage.signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
});
