// @ts-check
// Simulated backend for a signed-in Clinic Admin on User Management (Clinic Admin portal), so the user list and Add New User can be
// tested without a real Clinic Admin account and without sending real invites. Only these calls are answered:
//   POST /auth/login                        → session for `role` (CLINIC_ADMIN by default), already onboarded
//   GET  /resource/profile-details          → admin name + clinic (organizations[0])
//   GET  /clinic/resources?status=…         → { data, meta } for the Active / Pending / Deactivated tab
//   GET  /resources/specialties             → [{ code, display }]
//   POST /clinics/{clinicId}/users          → invite; recorded in `invites` and added to the Pending list
//   POST   /clinic/resources/{id}/resend-invite → recorded in `resends`; 409 once the invite is no longer pending
//   DELETE /clinic/resources/{id}/invite        → recorded in `cancels`, removes the row from Pending; 409 once not pending
//   PATCH  /clinics/{clinicId}/users/{id}/deactivate → Active → Deactivated (deactivatedOn = now); recorded in `deactivations`
//   PATCH  /clinics/{clinicId}/users/{id}/reactivate → Deactivated → Active; recorded in `reactivations`
//   DELETE /clinic/resources/{id}                → removes a deactivated user for good; recorded in `deletions`
// Any other API call gets an empty 200 so the portal shell can render.

export const SIM_ADMIN = { firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@example.com', password: 'Passw0rd!23' };
export const SIM_CLINIC_ID = 'sim-clinic-1';

export const SPECIALTIES = [
  { code: 'CARDIOLOGY', display: 'Cardiology' },
  { code: 'DERMATOLOGY', display: 'Dermatology' },
  { code: 'FAMILY_MEDICINE', display: 'Family Medicine' },
  { code: 'NEUROLOGY', display: 'Neurology' },
];

/**
 * A user row as GET /clinic/resources returns it.
 * @param {{ id: string, firstName: string, lastName: string, email: string, phoneNumber: string, type: 'PHYSICIAN'|'NURSE'|'DHN',
 *   npi?: string, specialties?: string[], addedByMe?: boolean, status?: string }} u
 */
export const simUser = ({ addedByMe = false, status = 'ACTIVE', ...u }) => ({
  ...u,
  fullName: `${u.firstName} ${u.lastName}`,
  status,
  invitedByRole: addedByMe ? 'CLINIC_ADMIN' : 'SUPER_ADMIN',
});

/** Emails already used by some account on the platform (the invite API answers 409 for these). */
export const EXISTING_EMAILS = ['taken.user@example.com'];

const b64 = (/** @type {object} */ o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = () => `${b64({ alg: 'none' })}.${b64({ sub: 'sim-user', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ role?: string, inviteStatus?: number, delay?: number, emailSent?: boolean, listStatus?: number, searchStatus?: number,
 *   resendStatus?: number, cancelStatus?: number, deactivateStatus?: number, reactivateStatus?: number, deleteStatus?: number,
 *   actionDelay?: number, active?: object[], pending?: object[], deactivated?: object[] }} [opts]
 *   inviteStatus / resendStatus / cancelStatus / deactivateStatus / reactivateStatus / deleteStatus >= 400 make those calls
 *   fail; actionDelay (ms) holds deactivate / reactivate / delete so double-clicks land while the first is in flight; listStatus >= 400 fails every list load, searchStatus >= 400 only
 *   list loads with a search term (all can be changed on the returned state between steps).
 *   delay (ms) holds each invite so the sending state is visible.
 *   The list honours status / role / addedBy (ME = added by a Clinic Admin) / search (name or email) / page / limit;
 *   every list request's query is recorded in `listCalls`.
 */
export async function simulateClinicUsers(page, opts = {}) {
  const state = {
    role: 'CLINIC_ADMIN',
    inviteStatus: 201,
    emailSent: true,
    delay: 0,
    listStatus: 200,
    searchStatus: 200,
    resendStatus: 200,
    deactivateStatus: 200,
    reactivateStatus: 200,
    deleteStatus: 200,
    actionDelay: 0,
    deactivations: /** @type {string[]} */ ([]),
    reactivations: /** @type {string[]} */ ([]),
    deletions: /** @type {string[]} */ ([]),
    cancelStatus: 200,
    resends: /** @type {string[]} */ ([]),
    cancels: /** @type {string[]} */ ([]),
    active: /** @type {object[]} */ ([]),
    pending: /** @type {object[]} */ ([]),
    deactivated: /** @type {object[]} */ ([]),
    invites: /** @type {any[]} */ ([]),
    listCalls: /** @type {Record<string,string>[]} */ ([]),
    ...opts,
  };
  const reply = (/** @type {import('@playwright/test').Route} */ route, /** @type {number} */ status, /** @type {string} */ message) =>
    route.fulfill({ status, json: { status, message } });
  await page.route(/\/api\/v1\/.*/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = req.method();
    if (method === 'POST' && path === '/auth/login') {
      const jwt = fakeJwt();
      return route.fulfill({
        status: 201,
        json: { userId: 'sim-user', roleCode: state.role, isActive: true, accessToken: jwt, refreshToken: jwt, expiresIn: 3600, refreshExpiresIn: 28800, isFirstLogin: false },
      });
    }
    if (path === '/resource/profile-details') {
      return route.fulfill({
        json: {
          clinicalProfile: { firstName: SIM_ADMIN.firstName, lastName: SIM_ADMIN.lastName },
          organizations: [{ organizationId: SIM_CLINIC_ID, clinicName: 'Sim Wellness Clinic' }],
          roleName: state.role,
          email: SIM_ADMIN.email,
        },
      });
    }
    if (method === 'GET' && path === '/clinic/resources') {
      const q = Object.fromEntries(url.searchParams);
      state.listCalls.push(q);
      if (state.listStatus >= 400 || (state.searchStatus >= 400 && q.search)) return reply(route, state.listStatus >= 400 ? state.listStatus : state.searchStatus, 'Something went wrong. Please try again later.');
      const status = q.status ?? 'ACTIVE';
      const term = (q.search ?? '').toLowerCase();
      const rows = (status === 'PENDING' ? state.pending : status === 'ACTIVE' ? state.active : state.deactivated).filter(
        (/** @type {any} */ r) =>
          (!q.role || r.type === q.role) &&
          (!q.addedBy || (q.addedBy === 'ME') === (r.invitedByRole === 'CLINIC_ADMIN')) &&
          (!term || r.fullName.toLowerCase().includes(term) || String(r.email).toLowerCase().includes(term)),
      );
      const limit = Number(url.searchParams.get('limit') ?? 10);
      const page_ = Number(url.searchParams.get('page') ?? 1);
      const data = rows.slice((page_ - 1) * limit, page_ * limit);
      const total = rows.length;
      return route.fulfill({
        json: { data, meta: { total, page: page_, limit, totalPages: Math.max(1, Math.ceil(total / limit)), from: total ? (page_ - 1) * limit + 1 : 0, to: (page_ - 1) * limit + data.length } },
      });
    }
    if (method === 'GET' && path === '/resources/specialties') return route.fulfill({ json: SPECIALTIES });
    const lifecycle = path.match(/^\/clinics\/[^/]+\/users\/([^/]+)\/(deactivate|reactivate)$/);
    const del = method === 'DELETE' && path.match(/^\/clinic\/resources\/([^/]+)$/);
    if ((method === 'PATCH' && lifecycle) || del) {
      const id = /** @type {RegExpMatchArray} */ (lifecycle || del)[1];
      const action = lifecycle ? lifecycle[2] : 'delete';
      const log = { deactivate: state.deactivations, reactivate: state.reactivations, delete: state.deletions }[action];
      log.push(id);
      if (state.actionDelay) await new Promise((res) => setTimeout(res, state.actionDelay));
      const status = { deactivate: state.deactivateStatus, reactivate: state.reactivateStatus, delete: state.deleteStatus }[action];
      if (status >= 400) return reply(route, status, 'Something went wrong. Please try again later.');
      const from = action === 'deactivate' ? state.active : state.deactivated;
      const i = from.findIndex((/** @type {any} */ x) => x.id === id);
      if (i < 0) return reply(route, 404, 'User not found.');
      const [user] = from.splice(i, 1);
      if (action === 'deactivate') state.deactivated.unshift({ ...user, status: 'DEACTIVATED', deactivatedOn: new Date().toISOString() });
      if (action === 'reactivate') state.active.unshift({ ...user, status: 'ACTIVE', deactivatedOn: undefined });
      return route.fulfill({ json: { userId: id } });
    }
    const resend = path.match(/^\/clinic\/resources\/([^/]+)\/resend-invite$/);
    const cancel = path.match(/^\/clinic\/resources\/([^/]+)\/invite$/);
    if ((method === 'POST' && resend) || (method === 'DELETE' && cancel)) {
      const id = /** @type {RegExpMatchArray} */ (resend ?? cancel)[1];
      (resend ? state.resends : state.cancels).push(id);
      const status = resend ? state.resendStatus : state.cancelStatus;
      if (status >= 400) return reply(route, status, 'Something went wrong. Please try again later.');
      const i = state.pending.findIndex((/** @type {any} */ r) => r.id === id);
      if (i < 0) return reply(route, 409, 'This invite is no longer pending.');
      if (resend) return route.fulfill({ status: 201, json: { userId: id, emailSent: state.emailSent } });
      state.pending.splice(i, 1);
      return route.fulfill({ json: { userId: id, keycloakDeleted: true, practitionerDeleted: true } });
    }
    const invite = path.match(/^\/clinics\/([^/]+)\/users$/);
    if (method === 'POST' && invite) {
      const body = req.postDataJSON();
      state.invites.push({ clinicId: invite[1], ...body });
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      if (state.inviteStatus >= 400) return reply(route, state.inviteStatus, 'Something went wrong. Please try again later.');
      if (EXISTING_EMAILS.includes(String(body.email).toLowerCase())) return reply(route, 409, 'An account with this email already exists.');
      const userId = `sim-invite-${state.invites.length}`;
      state.pending.unshift({
        id: userId,
        firstName: body.firstName,
        lastName: body.lastName,
        fullName: `${body.firstName} ${body.lastName}`,
        email: body.email,
        phoneNumber: body.phoneNumber,
        npi: body.npi,
        specialties: body.specialties,
        type: body.role,
        status: 'PENDING',
        invitedByRole: 'CLINIC_ADMIN',
        canResend: true,
      });
      return route.fulfill({ status: 201, json: { userId, status: 'PENDING', emailSent: state.emailSent } });
    }
    if (method !== 'GET') return route.fulfill({ status: 200, json: {} });
    return route.fulfill({ json: { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1, from: 0, to: 0 } } });
  });
  return state;
}
