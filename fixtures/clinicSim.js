// @ts-check
// Shared simulation helpers for the Clinic Management specs. They answer API calls for fake clinics so tests never
// create, change or deactivate real QA clinics.

export const CLINICS_CREATE = /\/api\/v1\/clinics$/;
export const CLINICS_DEACTIVATE = /\/api\/v1\/clinics\/[^/]+\/deactivate$/;
const FAKE_CLINIC_ID = '00000000-0000-4000-8000-00000000c1a1';

/**
 * Blocks any real clinic creation or deactivation from the calling spec (a safety net; simulations registered later
 * take priority over it).
 * @param {import('@playwright/test').Page} page
 */
export async function blockClinicWrites(page) {
  await page.route(CLINICS_CREATE, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await page.route(CLINICS_DEACTIVATE, (route) => route.abort());
}

/** @param {number} i @param {'ACTIVE' | 'PENDING'} [status] @param {Partial<any>} [over] */
export const simClinic = (i, status = 'ACTIVE', over = {}) => ({
  organizationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  clinicName: `Sim Clinic ${String.fromCharCode(65 + (i % 26))}${i}`,
  email: `sim.clinic.${i}@example.com`,
  phoneNumber: '+12025550143',
  city: 'Austin',
  state: 'TX',
  status,
  clinicAdmin: { userId: `admin-${i}`, name: `Sim Admin${i}`, email: `sim.admin.${i}@example.com` },
  enrolledPatients: 0,
  apcmEnrolled: 0,
  rpmEnrolled: 0,
  createdAt: '2026-09-25T09:00:00.000Z',
  ...(status === 'PENDING' ? { canResend: true } : {}),
  ...over,
});

/**
 * Serves one tab's list from `items`, paged like the real API.
 * @param {import('@playwright/test').Page} page
 * @param {'ACTIVE' | 'PENDING' | 'DEACTIVATED'} status
 * @param {any[]} items
 */
export async function simulateClinicList(page, status, items) {
  await page.route(new RegExp(`/api/v1/clinics\\?status=${status}`), (route) => {
    const url = new URL(route.request().url());
    const pageNo = Number(url.searchParams.get('page') || 1);
    const limit = Number(url.searchParams.get('limit') || 10);
    const total = items.length;
    const from = total ? (pageNo - 1) * limit + 1 : 0;
    const data = items.slice((pageNo - 1) * limit, pageNo * limit);
    route.fulfill({ json: { data, meta: { page: pageNo, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), from, to: total ? from + data.length - 1 : 0, counts: {} } } });
  });
}

/**
 * Simulates a successful "Send Invite" on the Add New Clinic wizard (no clinic is created). After POST /clinics the
 * app assigns resources (POST /clinics/{id}/resources) and loads the new clinic (GET /clinics/{id}); all three are
 * answered for a fake clinic id. Returns a getter for the simulated clinic.
 * @param {import('@playwright/test').Page} page
 * @param {{ status?: number }} [opts]  status >= 400 simulates a failed submit instead
 */
export async function simulateClinicCreate(page, { status = 201 } = {}) {
  let created;
  await page.route(CLINICS_CREATE, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (status >= 400) return route.fulfill({ status, json: { status, message: 'Something went wrong. Please try again later.' } });
    const b = route.request().postDataJSON();
    created = {
      organizationId: FAKE_CLINIC_ID, clinicName: b.clinicName, email: b.email, phoneNumber: b.phoneNumber, npi: b.npi, tin: b.tin,
      street: b.street, city: b.city, state: b.state, country: b.country, zip: b.zip, status: 'PENDING', emailSent: true,
      clinicAdmin: { userId: 'sim-admin', name: `${b.adminFirstName} ${b.adminLastName}`, email: b.adminEmail },
      enrolledPatients: 0, apcmEnrolled: 0, rpmEnrolled: 0, createdAt: new Date().toISOString(),
    };
    await route.fulfill({ status: 201, json: created });
  });
  await page.route(new RegExp(`/api/v1/clinics/${FAKE_CLINIC_ID}`), (route) =>
    route.fulfill({ json: route.request().method() === 'GET' ? created : { organizationId: FAKE_CLINIC_ID, success: true } })
  );
  return () => created;
}

/** The "Clinic Added Successfully!" confirmation (a plain overlay, not a dialog role). */
export const clinicAddedConfirmation = (/** @type {import('@playwright/test').Page} */ page) =>
  page.locator('.fixed.inset-0').filter({ hasText: 'Clinic Added Successfully!' });

/**
 * Runs the real Add New Clinic wizard steps 1–3 and presses "Send Invite" (pair with simulateClinicCreate).
 * @param {import('@playwright/test').Page} page
 * @param {import('../pages/AddClinicPage.js').AddClinicPage} w
 */
export async function completeClinicWizard(page, w) {
  await w.open();
  const data = await w.fillStep1();
  const dups = await w.submitStep1();
  if (Object.values(dups).some(Boolean)) throw new Error(`generated values reported as duplicates: ${JSON.stringify(dups)}`);
  await w.stepHeading.filter({ hasText: 'Assign Resources' }).waitFor();
  await w.nextButton.click();
  await w.stepHeading.filter({ hasText: 'Connect EHR' }).waitFor();
  await page.getByRole('button', { name: 'Send Invite' }).click();
  return data;
}
