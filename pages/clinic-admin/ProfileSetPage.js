// @ts-check
import { BasePage } from '../BasePage.js';

/**
 * Clinic Admin onboarding Part 2 (Profile Set) — the 3-step wizard shown on a Clinic Admin's first sign-in:
 *   1. /admin/create-profile   "Create your profile"   (Account Details card, profile picture + crop, phone)
 *   2. /admin/review-users     "Review Assigned Users" (table of users the Super Admin assigned)
 *   3. /admin/review-ehr       "Review EHR Details"    (Coming Soon + Finish → "Onboarding Complete!")
 * The profile is only sent to the server on Finish (PATCH /clinics/me/profile, then POST /clinics/me/profile-picture).
 */
export class ProfileSetPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    // Sign in
    this.emailInput = page.getByRole('textbox', { name: 'Email Address' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.signInButton = page.getByRole('button', { name: 'Sign In to Dashboard' });

    // Create Profile
    this.createProfileHeading = page.getByRole('heading', { name: 'Create your profile' });
    this.accountCard = page.locator('div.rounded-xl').filter({ hasText: 'Account Details' }).filter({ hasText: 'From invitation' });
    this.fileInput = page.locator('input[type=file]');
    this.avatarButton = page.getByRole('button', { name: 'Upload profile picture' });
    this.uploadButton = page.getByRole('button', { name: /Upload Photo|Change Photo/ });
    this.removePhotoButton = page.getByRole('button', { name: 'Remove' });
    this.avatarPreview = page.getByRole('img', { name: 'Profile' });
    this.uploadError = page.locator('p.text-destructive');
    this.phoneInput = page.getByPlaceholder('Enter phone number');
    this.countryButton = page.getByRole('button', { name: '+1' });
    this.saveContinueButton = page.getByRole('button', { name: /Save & Continue/ });

    // Crop dialog
    this.cropDialog = page.locator('.fixed.inset-0').filter({ hasText: 'Crop Profile Photo' });
    this.cropSelection = page.locator('.ReactCrop__crop-selection');
    this.zoomIn = page.getByRole('button', { name: 'Zoom in' });
    this.zoomOut = page.getByRole('button', { name: 'Zoom out' });
    this.zoomLevel = this.cropDialog.getByText(/^\d+%$/);
    this.applyCropButton = page.getByRole('button', { name: 'Apply Crop' });

    // Review Assigned Users
    this.reviewUsersHeading = page.getByRole('heading', { name: 'Review Assigned Users' });
    this.countBadge = this.reviewUsersHeading.locator('xpath=following-sibling::span[1]');
    this.usersTable = page.getByRole('table');
    this.userRows = this.usersTable.getByRole('rowgroup').nth(1).getByRole('row');
    this.summaryLine = page.getByText(/^\d+ users? assigned to your clinic/);
    this.emptyState = page.getByText('No users have been assigned to your clinic yet.');
    this.contactNote = page.getByText(/Need to make changes\?/).locator('xpath=..');
    this.backButton = page.getByRole('button', { name: '← Back' });
    this.continueButton = page.getByRole('button', { name: /Continue & Proceed/ });

    // Review EHR Details
    this.reviewEhrHeading = page.getByRole('heading', { name: 'Review EHR Details' });
    this.finishButton = page.getByRole('button', { name: /Finish|Saving/ });
    this.alert = page.getByRole('alert');
    this.completeDialog = page.getByRole('dialog').filter({ hasText: 'Onboarding Complete!' });
    this.goToDashboardButton = page.getByRole('button', { name: /Go to Dashboard/ });
  }

  /** @param {string} email @param {string} password */
  async signIn(email, password) {
    await this.goto('/admin/login');
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  /**
   * The step's number/check circle in the progress stepper.
   * @param {'Create Profile'|'Review Assigned Users'|'Review EHR Details'} label
   */
  stepCircle(label) {
    return this.page.getByText(label, { exact: true }).locator('xpath=preceding-sibling::div[1]');
  }

  /** @param {'Create Profile'|'Review Assigned Users'|'Review EHR Details'} label */
  stepLabel(label) {
    return this.page.getByText(label, { exact: true });
  }

  /** Uploads an image and waits for the crop dialog. @param {{name:string,mimeType:string,buffer:Buffer}} file */
  async chooseFile(file) {
    await this.fileInput.setInputFiles(file);
  }

  /** @param {{name:string,mimeType:string,buffer:Buffer}} file */
  async uploadAndCrop(file) {
    await this.chooseFile(file);
    await this.applyCropButton.click();
    await this.avatarPreview.waitFor();
  }

  /** @param {string} digits */
  async enterPhone(digits) {
    await this.phoneInput.click();
    await this.phoneInput.pressSequentially(digits);
  }

  /** Header name → cell locator for a row. @param {import('@playwright/test').Locator} row @param {number} col */
  cell(row, col) {
    return row.getByRole('cell').nth(col);
  }
}
