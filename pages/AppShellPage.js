// @ts-check
import { BasePage } from './BasePage.js';

/**
 * Authenticated layout shared by every Super Admin screen: left sidebar, top bar, and the Log Out
 * confirmation modal. While the modal is open, Radix hides the rest of the page from the
 * accessibility tree, so sidebar elements are located by CSS rather than by role.
 */
export class AppShellPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    this.sidebarNav = page.getByRole('navigation');
    this.clinicManagementLink = page.locator('a[href="/clinics"]');
    this.settingsLink = page.locator('a[href="/settings"]');
    this.sidebarLogOutButton = page.locator('button:not([role="alertdialog"] button)', { hasText: 'Log Out' });
    this.moduleHeading = page.getByRole('banner').getByRole('heading', { level: 1 });

    // Log Out confirmation modal
    this.logoutModal = page.getByRole('alertdialog', { name: 'Log Out' });
    this.modalOverlay = page.locator('[class*="bg-black/50"][data-state="open"]');
    this.modalIconBadge = this.logoutModal.locator('.rounded-full:has(svg.lucide-log-out)');
    this.modalHeading = this.logoutModal.getByRole('heading', { name: 'Log Out' });
    this.modalBody = this.logoutModal.getByText('Are you sure you want to log out? Any unsaved changes will be lost.');
    this.modalCloseButton = this.logoutModal.getByRole('button', { name: '✕' });
    this.modalCancelButton = this.logoutModal.getByRole('button', { name: 'Cancel' });
    this.modalLogOutButton = this.logoutModal.getByRole('button', { name: 'Log Out' });

    this.toast = page.locator('[data-sonner-toast]');
  }

  async openLogoutModal() {
    await this.sidebarLogOutButton.click();
    await this.logoutModal.waitFor();
  }

  async logOut() {
    await this.openLogoutModal();
    await this.modalLogOutButton.click();
    await this.page.waitForURL(/\/login/);
  }

  /**
   * Resolves any CSS colour (rgb, oklch, …) to [r, g, b] by painting it on a canvas.
   * @param {import('@playwright/test').Locator} locator
   * @param {'color' | 'backgroundColor'} prop
   * @returns {Promise<number[]>}
   */
  async rgbOf(locator, prop) {
    return locator.evaluate((el, p) => {
      const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
      ctx.fillStyle = getComputedStyle(el)[p];
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    }, prop);
  }
}

/** @param {number[]} rgb */
export const isRed = ([r, g, b]) => r > 180 && r - g > 60 && r - b > 40;
