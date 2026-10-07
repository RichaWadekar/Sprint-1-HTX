# HealthTeleMatrix
## Clinic Admin portal tests

Specs for the Clinic Admin portal (`CLINIC_ADMIN_BASE_URL`, e.g. https://clinic.qa.healthtelematix.com) live in
`tests/clinic-admin/`, kept separate from `tests/super-admin/`. Each spec sets its own base URL with
`test.use({ baseURL: process.env.CLINIC_ADMIN_BASE_URL })`.

The specs run on a simulated backend (`fixtures/onboardingSim.js`, `fixtures/profileSetSim.js`, `fixtures/clinicUsersSim.js`), so no
real invite email or Clinic Admin account is needed and no real invites are sent.

Run: `npm run test:clinic-admin`
