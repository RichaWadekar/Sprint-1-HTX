// @ts-check
import { test as base } from '@playwright/test';
import { HomePage } from '../pages/HomePage.js';
import { InstallationPage } from '../pages/InstallationPage.js';
import { SuperAdminLoginPage } from '../pages/SuperAdminLoginPage.js';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage.js';
import { ResetPasswordPage } from '../pages/ResetPasswordPage.js';
import { AppShellPage } from '../pages/AppShellPage.js';
import { AddClinicPage } from '../pages/AddClinicPage.js';
import { ResourcesPage } from '../pages/ResourcesPage.js';
import { ChangePasswordPage } from '../pages/ChangePasswordPage.js';
import { ClinicsPage } from '../pages/ClinicsPage.js';
import { OnboardingPage } from '../pages/clinic-admin/OnboardingPage.js';
import { ProfileSetPage } from '../pages/clinic-admin/ProfileSetPage.js';
import { UserManagementPage } from '../pages/clinic-admin/UserManagementPage.js';

/**
 * @typedef {Object} Pages
 * @property {HomePage} homePage
 * @property {InstallationPage} installationPage
 * @property {SuperAdminLoginPage} loginPage
 * @property {ForgotPasswordPage} forgotPasswordPage
 * @property {ResetPasswordPage} resetPasswordPage
 * @property {AppShellPage} appShell
 * @property {AddClinicPage} addClinicPage
 * @property {ResourcesPage} resourcesPage
 * @property {ChangePasswordPage} changePasswordPage
 * @property {ClinicsPage} clinicsPage
 * @property {OnboardingPage} onboardingPage
 * @property {ProfileSetPage} profileSetPage
 * @property {UserManagementPage} userManagementPage
 */

/** @type {import('@playwright/test').TestType<import('@playwright/test').PlaywrightTestArgs & Pages, {}>} */
export const test = base.extend({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  installationPage: async ({ page }, use) => {
    await use(new InstallationPage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new SuperAdminLoginPage(page));
  },
  forgotPasswordPage: async ({ page }, use) => {
    await use(new ForgotPasswordPage(page));
  },
  resetPasswordPage: async ({ page }, use) => {
    await use(new ResetPasswordPage(page));
  },
  appShell: async ({ page }, use) => {
    await use(new AppShellPage(page));
  },
  addClinicPage: async ({ page }, use) => {
    await use(new AddClinicPage(page));
  },
  resourcesPage: async ({ page }, use) => {
    await use(new ResourcesPage(page));
  },
  changePasswordPage: async ({ page }, use) => {
    await use(new ChangePasswordPage(page));
  },
  clinicsPage: async ({ page }, use) => {
    await use(new ClinicsPage(page));
  },
  onboardingPage: async ({ page }, use) => {
    await use(new OnboardingPage(page));
  },
  profileSetPage: async ({ page }, use) => {
    await use(new ProfileSetPage(page));
  },
  userManagementPage: async ({ page }, use) => {
    await use(new UserManagementPage(page));
  },
});

export const expect = test.expect;
