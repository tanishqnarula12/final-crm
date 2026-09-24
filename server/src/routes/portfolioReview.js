// Portfolio Review — AI-powered mutual fund portfolio PDF analysis.
//
// Accepts a base64 PDF, calls Gemini server-side (the API key never reaches
// the browser), and returns the parsed portfolio JSON. The extraction prompt
// is copied verbatim from the original tool so the analysis is byte-for-byte
// the same as what was already tuned and verified there.
//
// Two ways in:
//  - POST /jobs + GET /jobs/:jobId — what the app uses. The upload returns a
//    job id immediately and the browser polls for the result. In production
//    the API sits behind Cloudflare, which kills any request that hasn't
//    answered within 100 seconds (HTTP 524) — and a real family statement
//    takes Gemini ~50s on a good day and well past 100s for bigger ones, so a
//    single long request was failing outright. Each poll answers instantly,
//    so no request ever gets near that limit however long the analysis runs.
//  - POST /analyze — the original single-request endpoint, kept with its exact
//    contract so a PWA still running a cached older bundle keeps working.
//
// Both go through analyzePortfolio(), which retries when Gemini reports it's
// overloaded ("This model is currently experiencing high demand") instead of
// failing the upload on the first such reply.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { can, canSomewhere } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

const analyzeSchema = z.object({
  b64: z.string().min(1, 'No PDF data provided'),
  filename: z.string().optional().default('portfolio.pdf'),
  clientId: z.string().optional(),
});

// Running an analysis is the matrix's Portfolio Review → Create, checked
// against the client the review is for (so Assigned means "a client you're
// the RM of"). An older browser tab that doesn't send the client is let
// through if any of the user's roles holds the right at all.
async function mayRunReview(user, clientId) {
  if (!clientId) return canSomewhere(user, 'portfolioReview', 'create');
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  return !!client && can(user, 'portfolioReview', 'create', client);
}
const NO_REVIEW_RIGHT = 'You don\'t have permission to run a Portfolio Review for this client.';

const SYSTEM = `You are an expert Indian mutual fund portfolio analyst for an MFD (Mutual Fund Distributor).
Read the portfolio PDF and return ONLY a single valid JSON object. No markdown, no code fences, no explanation.

EXTRACTION RULES — FOLLOW EXACTLY:

1. Extract EVERY investor/applicant found in the PDF. Do NOT skip any.
2. First member MUST be "All Members" with combined totals.
3. Use EXACT applicant names as printed in the PDF.
4. All numbers = plain integers or floats. No ₹ symbol, no commas.
5. assetMix for ALL MEMBERS must have exactly 3 keys: "Equity", "Debt", "Gold".
   - Equity = sum of all equity + hybrid + balanced advantage allocation %
   - Debt = sum of all debt + liquid + arbitrage allocation %
   - Gold = gold allocation % (0 if not present)
   - These 3 must sum to 100.
   For individual applicant members, use their actual asset breakdown (any categories).
6. badge values: eq=equity, dt=debt/bond, hy=hybrid/balanced, lq=liquid/arbitrage.
7. Do NOT generate advisor alerts — leave alerts array empty [] for all members. Alerts are computed by the frontend.
8. Unknown values = 0.

SUMMARY SOURCING — CRITICAL — READ EVERY WORD:

IMPORTANT: Use ONLY the "Mutual Fund Allocation by Applicant" table for all summary values.
DO NOT include Shares, SGBs, Fixed Deposits, RBI Bonds, Life Insurance, or any non-MF asset.

For each INDIVIDUAL applicant:
  invested  → find "[APPLICANT NAME] Total:" row in "Mutual Fund Allocation by Applicant" table → Purchase Value column
  current   → same "[APPLICANT NAME] Total:" row → Current Value column
  gain      → current minus invested (computed)
  gainPct   → (gain / invested) x 100 (computed)
  xirr      → same "[APPLICANT NAME] Total:" row → CAGR % column (plain float e.g. 13.83)
  sipTotal  → SIP Summary section → this applicant block → 3rd calendar month column total (e.g. if Jan/Feb/Mar use Mar; if Oct/Nov/Dec use Dec) → plain number e.g. 275000

For "All Members":
  invested  → Grand Total row at BOTTOM of "Mutual Fund Allocation by Applicant" table → Purchase Value column (use directly, do NOT sum manually)
  current   → same Grand Total row → Current Value column (use directly)
  gain      → current minus invested (computed)
  gainPct   → (gain / invested) x 100 (computed)
  xirr      → same Grand Total row → CAGR % column (use directly, do NOT compute weighted average)
  sipTotal  → SIP Summary section → Grand Total row → 3rd calendar month column → plain number

HOLDINGS:
  For INDIVIDUAL applicants: extract each fund row from that applicant's MF Allocation section. No holder field needed.

  For "All Members" holdings: extract EXCLUSIVELY from the "Mutual Fund Allocation by Scheme" table in the PDF.
    CRITICAL RULES:
    1. Use ONLY this table — do NOT combine or merge from individual applicant sections.
    2. Each scheme appears EXACTLY ONCE in this table — already combined across all applicants.
    3. Do NOT add holder field — these are already combined totals.
    4. Extract every row: name (Scheme column), cat (sub-category from scheme name or sub-category table), badge, invested (Purchase Value column), current (Current Value column), xirr (CAGR% column as plain float).
    5. Do NOT skip any scheme row. Every row in that table must appear in holdings.
    6. badge: eq=equity funds, dt=debt/bond funds, hy=hybrid/balanced/multi-asset funds, lq=liquid/arbitrage funds.

SIP SUMMARY DATA (sipSummary field — top level, NOT inside members):
  Source: "SIP Summary" section of the PDF ONLY. Do NOT use holdings or any other section.

  THE TABLE STRUCTURE:
  Columns are always: Scheme | Folio | Col1 | Col2 | Col3 | Col4
  You must ALWAYS extract the value from Col3 (3rd data column after Scheme and Folio).
  Col3 is identified by POSITION not by month name.

  STEP BY STEP PROCESS — FOLLOW EXACTLY:

  Step 1: Identify which column is Col3 by counting from left:
    Column 1 = Scheme, Column 2 = Folio, Column 3 = Col1, Column 4 = Col2, Column 5 = Col3, Column 6 = Col4
    Col3 is always Column 5 in the table (5th column from left).

  Step 2: For EVERY applicant block from top to bottom:
    a) Read the applicant header (e.g. "KAMLESH SHARMA") — skip this row, it has no amounts
    b) For each fund row under this applicant: read the Col3 value from Column 5
    c) Read Col3 directly — do NOT look at Col1 or Col2 to decide if Col3 is valid
       A fund can have Col1=28500, Col2=0, Col3=28500 — Col3 is valid and must be included
       A fund can have Col1=0, Col2=10000, Col3=0 — Col3 is 0, exclude this fund
    d) Skip the "[APPLICANT NAME] Total:" row at the end of each block

  Step 3: After reading all applicant blocks, SKIP the Grand Total row.

  Step 4: Remove any entries where Col3 = 0. Only keep entries with Col3 > 0.

  Step 5: Merge entries with identical fund names by summing their Col3 amounts.

  Step 6: VALIDATE — sum all final amounts. Must equal Grand Total Col3 value exactly.
    If not matching: you skipped an applicant block or misread a column. Re-do from Step 2.

  CONCRETE EXAMPLE from a real PDF:
  DIYA SHARMA block:
    Kotak Midcap Fund (G) | 7673714 | 0 | 10000 | 0 | 0  → Col3=0 → EXCLUDE
    DIYA SHARMA Total: | | 0 | 10000 | 0 | 0 → SKIP (subtotal)

  KAMLESH SHARMA block:
    Aditya Birla SL Large Cap Fund Reg (G) | 1041472019 | 28500 | 0 | 28500 | 28500 → Col3=28500 → INCLUDE
    Bandhan Small Cap Fund Reg (G) | 3251755/25 | 29000 | 0 | 29000 | 29000 → Col3=29000 → INCLUDE
    PGIM India Midcap Fund Reg (G) | 9106398181 | 32500 | 0 | 32500 | 32500 → Col3=32500 → INCLUDE
    KAMLESH SHARMA Total: | | 90000 | 0 | 90000 | 90000 → SKIP (subtotal)

  Note: KAMLESH funds have Col2=0 but Col3=non-zero. These MUST be included.

  If no SIP Summary section in PDF → sipSummary = [].
  Format: [{ "name": "fund name exactly as printed", "amount": 29000 }, ...]

SUB-CATEGORY DATA (subCategories field — top level, NOT inside members):
  Source: "Mutual Fund Allocation by Sub Category" table ONLY. Do NOT compute from holdings.
  Extract every row from that table exactly as printed.
  Format: [{ "cat": "Equity: Mid Cap", "invested": 0, "current": 0, "cagr": 0, "allocation": 0 }, ...]
  allocation = the Allocation % column value from that table (plain float, e.g. 19.61)
  If this table does not exist in the PDF, set subCategories to empty array [].

AMC ALLOCATION DATA (amcAllocation field — top level, NOT inside members):
  Source: "Mutual Fund Allocation by Fund" table in the PDF.
  Extract each AMC row: AMC name, Purchase Value, Current Value, Allocation %.
  Format: [{ "amc": "Tata Mutual Fund", "invested": 0, "current": 0, "allocation": 0 }]
  allocation = Allocation % column value (plain float).
  If table not found, set amcAllocation to empty array [].

Return this exact JSON structure:
{
  "title": "Family/Client Name Portfolio",
  "meta": "N applicants · N schemes · statement date · RM name if available",
  "sipSummary": [{ "name": "fund name", "amount": 0 }],
  "subCategories": [{ "cat": "Equity: Mid Cap", "invested": 0, "current": 0, "cagr": 0, "allocation": 0 }],
  "amcAllocation": [{ "amc": "Tata Mutual Fund", "invested": 0, "current": 0, "allocation": 0 }],
  "investmentSince": "DD MMM YYYY (earliest purchase date found across all holdings in the entire PDF)",
  "members": [
    {
      "name": "All Members",
      "initials": "ALL",
      "summary": { "invested": 0, "current": 0, "gain": 0, "gainPct": 0, "sipTotal": 0, "xirr": 0 },
      "assetMix": { "Equity": 0, "Debt": 0, "Hybrid": 0, "Liquid": 0 },
      "categories": { "Category Name": 0 },
      "holdings": [
        { "name": "Full scheme name", "cat": "category", "badge": "eq", "invested": 0, "current": 0, "xirr": 0, "holder": "applicant name" }
      ],
      "sips": [{ "name": "fund short name", "amount": 0, "date": "20th" }],
      "goals": [],
      "risk": { "score": 6.5, "label": "Moderately Aggressive" },
      "alerts": [{ "type": "warn", "text": "specific insight based on actual data" }]
    }
  ]
}`;

const MISSING_KEY_ERROR = 'Portfolio Review is not configured on the server (missing GEMINI_API_KEY).';

// `retryable` marks failures worth another attempt: Gemini overloaded or
// rate-limited (429 / 5xx), a network blip, or a garbled/empty answer. A 4xx
// such as a bad or revoked API key fails at once — retrying can't fix it.
// `modelGone` is Google's 404 for a model this key can no longer use (it's
// retiring the 2.5 generation: 2.5-pro already answers "no longer available
// to new users").
class AnalysisError extends Error {
  constructor(message, { retryable = false, modelGone = false } = {}) {
    super(message);
    this.retryable = retryable;
    this.modelGone = modelGone;
  }
}

// A 429 is usually a per-minute limit that clears within seconds (retried like
// any overload), but on Google's free tier it can also be the per-day request
// quota — which no retry can fix until it resets, so say so plainly instead.
// Google names the exhausted quota in the error details, e.g.
// quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier".
const DAILY_QUOTA_ERROR = "Today's AI limit for Portfolio Review has been used up (the Gemini API key is on Google's free tier). Please try again tomorrow, or ask the admin to enable billing on the key.";

function isDailyQuotaExhausted(data) {
  return (data.error?.details || []).some((detail) =>
    (detail.violations || []).some((v) => /PerDay/i.test(v.quotaId || '')));
}

async function callGemini(model, b64, filename) {
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: b64 } },
            { text: `Filename: "${filename}". Extract all data from this portfolio statement and return the JSON.` },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });
  } catch (err) {
    throw new AnalysisError('Could not reach the AI service. Please try again.', { retryable: true });
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 429 && isDailyQuotaExhausted(data)) {
    throw new AnalysisError(DAILY_QUOTA_ERROR);
  }
  if (!response.ok) {
    throw new AnalysisError(data.error?.message || `AI service error (${response.status})`, {
      retryable: response.status === 429 || response.status >= 500,
      modelGone: response.status === 404,
    });
  }

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let portfolio;
  try {
    portfolio = JSON.parse(clean);
  } catch (err) {
    throw new AnalysisError('The AI returned an unreadable response. Please try uploading again.', { retryable: true });
  }
  if (!portfolio?.members?.length) {
    throw new AnalysisError('No data returned from AI. Please try again.', { retryable: true });
  }
  return portfolio;
}

// gemini-2.5-flash is the model the prompt was tuned and verified on. Its
// "high demand" 503s come and go within seconds to minutes, so it gets several
// spaced-out tries. The newer flash models were no help there (they were
// overloaded even more often in testing), so the fallback model is only used
// if Google stops serving 2.5-flash to this API key altogether.
const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash';
const RETRY_WAITS_MS = [0, 5000, 15000, 30000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function analyzePortfolio(b64, filename) {
  let model = PRIMARY_MODEL;
  let lastErr;
  for (const waitMs of RETRY_WAITS_MS) {
    if (waitMs) await sleep(waitMs);
    try {
      return await callGemini(model, b64, filename);
    } catch (err) {
      lastErr = err;
      console.warn(`[portfolio-review] ${model} failed: ${err.message}`);
      if (err.modelGone && model !== FALLBACK_MODEL) {
        model = FALLBACK_MODEL;
        continue;
      }
      if (!err.retryable) break;
    }
  }
  throw lastErr;
}

// In-memory job store. The API runs as a single instance (chat presence and
// the permission cache already live in process memory the same way), so a
// Map is enough. A job lost to a restart/deploy mid-analysis just answers 404
// and the user uploads again. Finished jobs are kept for JOB_TTL_MS so a poll
// whose response got lost in transit can simply be repeated.
const JOB_TTL_MS = 15 * 60 * 1000;
const jobs = new Map(); // jobId -> { userId, status: 'running'|'done'|'error', portfolio?, error?, createdAt }

function sweepJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

// POST /api/portfolio-review/jobs — start analyzing a portfolio statement PDF
// (base64). Answers at once with { jobId }; poll GET /jobs/:jobId for the result.
router.post('/jobs', asyncHandler(async (req, res) => {
  const { b64, filename, clientId } = parseBody(analyzeSchema, req.body);
  if (!(await mayRunReview(req.user, clientId))) return res.status(403).json({ error: NO_REVIEW_RIGHT });
  if (!config.geminiApiKey) return res.status(500).json({ error: MISSING_KEY_ERROR });

  sweepJobs();
  const jobId = randomUUID();
  const job = { userId: req.user.id, status: 'running', createdAt: Date.now() };
  jobs.set(jobId, job);

  analyzePortfolio(b64, filename)
    .then((portfolio) => {
      job.status = 'done';
      job.portfolio = portfolio;
    })
    .catch((err) => {
      job.status = 'error';
      job.error = err.message || 'Something went wrong. Please try uploading again.';
    });

  res.status(202).json({ jobId });
}));

// GET /api/portfolio-review/jobs/:jobId — { status: 'running' } until the
// analysis finishes, then { status: 'done', portfolio } or { status: 'error', error }.
router.get('/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.userId !== req.user.id) {
    return res.status(404).json({ error: 'This analysis is no longer available (the server may have restarted). Please upload the PDF again.' });
  }
  if (job.status === 'running') return res.json({ status: 'running' });
  if (job.status === 'error') return res.json({ status: 'error', error: job.error });
  res.json({ status: 'done', portfolio: job.portfolio });
});

// POST /api/portfolio-review/analyze — the original single-request endpoint:
// upload a portfolio statement PDF (base64), get back the portfolio JSON.
// Kept for app bundles cached before the switch to /jobs.
router.post('/analyze', asyncHandler(async (req, res) => {
  const { b64, filename, clientId } = parseBody(analyzeSchema, req.body);
  if (!(await mayRunReview(req.user, clientId))) return res.status(403).json({ error: NO_REVIEW_RIGHT });
  if (!config.geminiApiKey) return res.status(500).json({ error: MISSING_KEY_ERROR });

  try {
    res.json(await analyzePortfolio(b64, filename));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}));

export default router;
