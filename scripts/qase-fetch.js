// Pull test cases from Qase and scaffold a Playwright spec from them.
//
//   npm run qase:suites                       -> list suites (id, title, case count)
//   npm run qase:fetch -- --suite 2           -> cache cases + scaffold tests/qase-suite-2.spec.js
//   npm run qase:fetch -- --suite 2 --out tests/super-admin/sign-in.spec.js
//
// Cases are cached to qase/suite-<id>.json. An existing spec is never overwritten —
// the scaffold is a starting point: each case becomes a test.fixme() with its Qase steps
// as test.step() blocks, ready to be filled in with page-object calls.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const TOKEN = process.env.QASE_TESTOPS_API_TOKEN;
const PROJECT = process.env.QASE_TESTOPS_PROJECT;
const API = 'https://api.qase.io/v1';

if (!TOKEN || !PROJECT) {
  console.error('QASE_TESTOPS_API_TOKEN and QASE_TESTOPS_PROJECT must be set in .env');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);

async function getAll(endpoint, params = {}) {
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const qs = new URLSearchParams({ ...params, limit: '100', offset: String(offset) });
    const res = await fetch(`${API}/${endpoint}/${PROJECT}?${qs}`, { headers: { Token: TOKEN, accept: 'application/json' } });
    if (!res.ok) throw new Error(`Qase ${endpoint} ${res.status}: ${await res.text()}`);
    const { result } = await res.json();
    items.push(...result.entities);
    if (items.length >= result.filtered || result.entities.length === 0) return items;
  }
}

const q = (s) => JSON.stringify((s || '').replace(/\s+/g, ' ').trim());

function scaffold(suiteId, cases, fixturesImport) {
  const tests = cases.map((c) => {
    const steps = (c.steps || [])
      .map((s) => `    await test.step(${q(s.action)}, async () => {\n      // Expected: ${(s.expected_result || '').replace(/\s+/g, ' ').trim()}\n    });`)
      .join('\n');
    const pre = c.preconditions ? `    // Precondition: ${c.preconditions.replace(/\s+/g, ' ').trim()}\n` : '';
    return `  test.fixme(qase(${c.id}, ${q(c.title)}), async ({ page }) => {\n${pre}${steps}\n  });`;
  });
  return `// @ts-check
// Scaffolded from Qase suite ${suiteId} (${PROJECT}) by scripts/qase-fetch.js.
// Replace test.fixme with test once a case is implemented.
import { test, expect } from '${fixturesImport}';
import { qase } from 'playwright-qase-reporter';

test.describe('Qase suite ${suiteId}', () => {
${tests.join('\n\n')}
});
`;
}

(async () => {
  if (!args.suite) {
    const suites = await getAll('suite');
    suites.forEach((s) => console.log(`${String(s.id).padStart(4)}  ${s.title}  (${s.cases_count} cases)`));
    return;
  }

  // A Qase suite's total includes its child suites (e.g. "Clinic Management - Active Tab" + its "Action Button"
  // child), but the API's suite_id filter returns only direct cases — so walk the tree and fetch every descendant.
  const suites = await getAll('suite');
  const ids = [Number(args.suite)];
  for (let i = 0; i < ids.length; i++) suites.filter((s) => s.parent_id === ids[i]).forEach((s) => ids.push(s.id));
  const cases = [];
  for (const id of ids) {
    const own = await getAll('case', { suite_id: id });
    const title = suites.find((s) => s.id === id)?.title ?? id;
    console.log(`  suite ${id} (${title}): ${own.length} cases`);
    cases.push(...own);
  }
  const cacheDir = path.resolve(__dirname, '..', 'qase');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, `suite-${args.suite}.json`), JSON.stringify(cases, null, 2));
  console.log(`Fetched ${cases.length} cases from suite ${args.suite}${ids.length > 1 ? ' and its child suites' : ''} -> qase/suite-${args.suite}.json`);

  const out = path.resolve(__dirname, '..', args.out || `tests/qase-suite-${args.suite}.spec.js`);
  if (fs.existsSync(out)) {
    console.log(`${path.relative(process.cwd(), out)} already exists — not overwriting.`);
    return;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const fixturesImport = path.relative(path.dirname(out), path.resolve(__dirname, '..', 'fixtures', 'pages.js')).split(path.sep).join('/');
  fs.writeFileSync(out, scaffold(args.suite, cases, fixturesImport));
  console.log(`Scaffolded ${path.relative(process.cwd(), out)}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
