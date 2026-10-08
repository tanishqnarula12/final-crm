// Opens an uploaded proposal PDF in the browser and hands its positioned
// text to proposalPdfParse.js. Nothing is uploaded anywhere: the file is read
// on this device only. The PDF library (pdf.js, ~1 MB) is loaded the first
// time someone uses Upload Proposal, never as part of the normal app load.
import { pageFromTextContent, parseInvestmentProposal, parseInsuranceProposal } from './proposalPdfParse';

const MAX_BYTES = 20 * 1024 * 1024;

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((err) => { pdfjsPromise = null; throw err; });
  }
  return pdfjsPromise;
}

export class ProposalPdfError extends Error {}

// Anything typed in a proposal form (blank strings, false flags and the
// skipped keys don't count) — to decide whether filling from a PDF needs a
// "replace what's there?" confirmation.
export function hasEnteredData(value, skipKeys = []) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some((v) => hasEnteredData(v, skipKeys));
  if (typeof value === 'object') return Object.entries(value).some(([k, v]) => !skipKeys.includes(k) && hasEnteredData(v, skipKeys));
  return false;
}

async function readPages(file) {
  if (!file) throw new ProposalPdfError('No file chosen.');
  if (!/\.pdf$/i.test(file.name || '') && file.type !== 'application/pdf') throw new ProposalPdfError('Please choose a PDF file.');
  if (file.size > MAX_BYTES) throw new ProposalPdfError('This PDF is larger than 20 MB — a proposal PDF is much smaller. Please check the file.');
  let pdfjs;
  try {
    pdfjs = await loadPdfjs();
  } catch {
    throw new ProposalPdfError('Could not load the PDF reader — please check your internet connection and try again.');
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (err) {
      if (err?.name === 'PasswordException') throw new ProposalPdfError('This PDF is password-protected. Please upload the proposal PDF without a password.');
      throw new ProposalPdfError('This file could not be opened as a PDF.');
    }
    const pages = [];
    for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      pages.push(pageFromTextContent(await page.getTextContent(), vp.width, vp.height));
      page.cleanup();
    }
    return pages;
  } finally {
    task.destroy();
  }
}

const NOT_OURS = 'This PDF doesn\'t look like a proposal made by this CRM. Only proposal PDFs saved from the CRM\'s own "Print / Save PDF" can be read — not scanned copies or other documents.';

// → the parsed proposal, or throws ProposalPdfError with a message to show.
export async function readInvestmentProposalPdf(file, { schemes }) {
  const r = parseInvestmentProposal(await readPages(file), { schemes });
  if (r.ok) return r;
  if (r.error === 'insurance') throw new ProposalPdfError('This is an Insurance proposal — please upload it in the Insurance Proposal tab.');
  throw new ProposalPdfError(NOT_OURS);
}

export async function readInsuranceProposalPdf(file) {
  const r = parseInsuranceProposal(await readPages(file));
  if (r.ok) return r;
  if (r.error === 'investment') throw new ProposalPdfError('This is an Investment proposal — please upload it in the Investment Proposal (or Other Code) tab.');
  throw new ProposalPdfError(NOT_OURS);
}
