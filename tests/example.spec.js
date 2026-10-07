// @ts-check
import { test, expect } from '../fixtures/pages.js';

test('has title', async ({ page, homePage }) => {
  await homePage.open();

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ homePage, installationPage }) => {
  await homePage.open();
  await homePage.clickGetStarted();

  // Expects page to have a heading with the name of Installation.
  await expect(installationPage.heading).toBeVisible();
});
