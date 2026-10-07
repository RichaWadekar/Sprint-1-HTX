// @ts-check
// Simulated backend for a Physician / Registered Nurse onboarding from an invitation sent by a Clinic Admin
// (/resource/invite?token=… → /provider|nurse/verify-email → /provider|nurse/set-password), so the onboarding UI can be
// tested without a real emailed invite link or OTP. Only these calls are answered; any other API call is blocked.
//   GET  /resources/invitations/{token}          → invitation details (below)
//   POST /otp/send                               → code "sent"
//   POST /otp/verify                             → { data: { verified } } — only CORRECT_OTP verifies
//   POST /resources/invitations/{token}/accept   → password set / account activated

export const SIM_TOKEN = 'sim-resource-invite-token';
export const CORRECT_OTP = '482915';

const CLINIC = {
  clinicName: 'Sim Wellness Clinic',
  clinicEmail: 'sim.clinic@example.com',
  clinicPhoneNumber: '+12025550143',
  clinicAddress: '12 Oak Street, Austin, TX 78701',
  npiNumber: '1234567893',
  tinNumber: '12-3456789',
};

/** Invitations sent by the clinic's Clinic Admin (they carry the clinic). */
export const PHYSICIAN_INVITE = { fullName: 'Grace Hopper', assignedRole: 'Physician', email: 'grace.hopper@example.com', npiNumber: '1003000126', invitedByName: 'Maria Lopez', clinic: CLINIC };
export const NURSE_INVITE = { fullName: 'Ada Byron', assignedRole: 'Registered Nurse', email: 'ada.byron@example.com', invitedByName: 'Maria Lopez', clinic: CLINIC };

/** Invitations sent by the Super Admin (no clinic yet). */
export const SA_PHYSICIAN_INVITE = { fullName: 'Grace Hopper', assignedRole: 'Physician', email: 'grace.hopper@example.com', npiNumber: '1003000126', invitedByName: 'Santosh Hundekar' };
export const SA_NURSE_INVITE = { fullName: 'Ada Byron', assignedRole: 'Registered Nurse', email: 'ada.byron@example.com', invitedByName: 'Santosh Hundekar' };
export const SA_DHN_INVITE = { fullName: 'Alan Turing', assignedRole: 'Digital Health Navigator', email: 'alan.turing@example.com', invitedByName: 'Santosh Hundekar' };

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ invitation?: object, sendStatus?: number, verifyStatus?: number, acceptStatus?: number, delay?: number }} [opts]
 *   *Status >= 400 makes that call fail (can be changed on the returned state between steps); delay (ms) holds every write.
 */
export async function simulateResourceInvite(page, opts = {}) {
  const state = { invitation: PHYSICIAN_INVITE, sends: 0, verifies: 0, accepts: 0, lastCode: '', acceptedPassword: '', ...opts };
  const fail = (/** @type {import('@playwright/test').Route} */ route, /** @type {number} */ status) =>
    route.fulfill({ status, json: { status, message: 'Something went wrong. Please try again later.' } });
  await page.route(/\/api\/v1\/.*/, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && url.includes('/resources/invitations/')) return route.fulfill({ json: state.invitation });
    if (state.delay && req.method() !== 'GET') await new Promise((r) => setTimeout(r, state.delay));
    if (url.includes('/otp/send')) {
      state.sends++;
      return (state.sendStatus ?? 200) >= 400 ? fail(route, /** @type {number} */ (state.sendStatus)) : route.fulfill({ json: { status: 200, message: 'OTP sent' } });
    }
    if (url.includes('/otp/verify')) {
      state.verifies++;
      state.lastCode = req.postDataJSON()?.code ?? '';
      if ((state.verifyStatus ?? 200) >= 400) return fail(route, /** @type {number} */ (state.verifyStatus));
      return route.fulfill({ json: { status: 200, data: { verified: state.lastCode === CORRECT_OTP } } });
    }
    if (url.includes('/resources/invitations/') && url.endsWith('/accept')) {
      state.accepts++;
      state.acceptedPassword = req.postDataJSON()?.newPassword ?? '';
      return (state.acceptStatus ?? 201) >= 400 ? fail(route, /** @type {number} */ (state.acceptStatus)) : route.fulfill({ status: 201, json: { success: true } });
    }
    return route.fulfill({ status: 500, json: { message: 'blocked by test' } });
  });
  return state;
}
