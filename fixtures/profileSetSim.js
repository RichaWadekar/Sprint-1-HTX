// @ts-check
// Simulated backend for Clinic Admin onboarding Part 2 (Profile Set): first sign-in → Create Profile →
// Review Assigned Users → Review EHR Details → Finish. No real Clinic Admin account is needed and nothing is written to QA.
//   POST  /auth/login                  → CLINIC_ADMIN session, isFirstLogin as configured
//   GET   /resource/profile-details    → admin name (clinicalProfile) + clinic (organizations[0])
//   GET   /clinic/resources?addedBy=SUPER_ADMIN&pagination=false → { data: users[] }
//   PATCH /clinics/me/profile          → { phoneNumber }        (sent on Finish)
//   POST  /clinics/me/profile-picture  → multipart file          (sent on Finish, only when a picture was cropped)
// Any other API call gets an empty 200 so the dashboard shell can render.

export const SIM_ADMIN = { firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@example.com', password: 'Passw0rd!23' };
export const SIM_CLINIC = { organizationId: 'sim-clinic-1', clinicName: 'Sim Wellness Clinic' };

/** @param {Partial<{id:string,firstName:string,lastName:string,email:string,phoneNumber:string,type:string,typeLabel:string,specialties:string[],npi:string,invitedByRole:string}>} u */
const user = (u) => ({ invitedByRole: 'SUPER_ADMIN', ...u, fullName: `${u.firstName} ${u.lastName}` });

/** Mixed roles: Physicians carry Specialty/NPI, the Nurse and DHN have neither. */
export const SIM_USERS = [
  user({ id: 'u1', firstName: 'James', lastName: 'Hartwell', email: 'james.hartwell@example.com', phoneNumber: '+12025550101', type: 'PHYSICIAN', typeLabel: 'Physician', specialties: ['Cardiology'], npi: '1234567893' }),
  user({ id: 'u2', firstName: 'Anna', lastName: 'Chen', email: 'anna.chen@example.com', phoneNumber: '+12025550102', type: 'NURSE', typeLabel: 'Registered Nurse' }),
  user({ id: 'u3', firstName: 'Priya', lastName: 'Nair', email: 'priya.nair@example.com', phoneNumber: '+12025550103', type: 'PHYSICIAN', typeLabel: 'Physician', specialties: ['Neurology', 'Oncology'], npi: '1245319599' }),
  user({ id: 'u4', firstName: 'Omar', lastName: 'Diaz', email: 'omar.diaz@example.com', phoneNumber: '+12025550104', type: 'DHN', typeLabel: 'DHN' }),
];

/** @param {number} n */
export const manyUsers = (n) =>
  Array.from({ length: n }, (_, i) =>
    user({ id: `m${i}`, firstName: `User${i + 1}`, lastName: `Test${i + 1}`, email: `user${i + 1}@example.com`, phoneNumber: `+1202555${String(1000 + i).slice(-4)}`, type: 'NURSE', typeLabel: 'Registered Nurse' }),
  );

const b64 = (/** @type {object} */ o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = () => `${b64({ alg: 'none' })}.${b64({ sub: 'sim-ca', email: SIM_ADMIN.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ isFirstLogin?: boolean, users?: object[], profileStatus?: number, pictureStatus?: number, delay?: number }} [opts]
 *   *Status >= 400 makes that call fail; delay (ms) holds the profile/picture writes so loading states are visible.
 */
export async function simulateProfileSet(page, opts = {}) {
  const state = { logins: 0, profileSaves: 0, pictureUploads: 0, savedPhone: '', isFirstLogin: true, users: SIM_USERS, ...opts };
  const fail = (/** @type {import('@playwright/test').Route} */ route, /** @type {number} */ status) =>
    route.fulfill({ status, json: { status, message: 'Something went wrong. Please try again later.' } });
  await page.route(/\/api\/v1\/.*/, async (route) => {
    const req = route.request();
    const path = req.url().replace(/^.*\/api\/v1/, '').split('?')[0];
    const method = req.method();
    if (method === 'POST' && path === '/auth/login') {
      state.logins++;
      const jwt = fakeJwt();
      return route.fulfill({
        status: 201,
        json: { userId: 'sim-ca', roleCode: 'CLINIC_ADMIN', isActive: true, accessToken: jwt, refreshToken: jwt, expiresIn: 3600, refreshExpiresIn: 28800, isFirstLogin: state.isFirstLogin },
      });
    }
    if (path === '/resource/profile-details') {
      return route.fulfill({
        json: { clinicalProfile: { firstName: SIM_ADMIN.firstName, lastName: SIM_ADMIN.lastName }, organizations: [SIM_CLINIC], roleName: 'CLINIC_ADMIN', email: SIM_ADMIN.email },
      });
    }
    if (method === 'GET' && path === '/clinic/resources') return route.fulfill({ json: { data: state.users } });
    if (path === '/clinics/me/profile') {
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      state.profileSaves++;
      if ((state.profileStatus ?? 200) >= 400) return fail(route, state.profileStatus);
      state.savedPhone = req.postDataJSON()?.phoneNumber ?? '';
      return route.fulfill({ json: { phoneNumber: state.savedPhone } });
    }
    if (path === '/clinics/me/profile-picture') {
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      state.pictureUploads++;
      return (state.pictureStatus ?? 201) >= 400 ? fail(route, state.pictureStatus) : route.fulfill({ status: 201, json: { success: true } });
    }
    if (method !== 'GET') return route.fulfill({ status: 200, json: {} });
    return route.fulfill({ json: { data: [] } });
  });
  return state;
}
