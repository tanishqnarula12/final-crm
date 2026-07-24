// Portfolio Review — AI-powered mutual fund portfolio PDF analysis.
//
// Ported from the standalone "portfolio review" tool (other tools on html/),
// kept functionally identical on purpose: same extraction logic (server-side
// now, see server/src/routes/portfolioReview.js), same dashboard rendering,
// same advisory-alert rules, same charts, same print output. The only
// changes are integration ones — where the Gemini call goes, and a new
// "Save to Profile" action that reuses this app's existing generated-document
// pipeline (see utils/documents.js), the same way Policy Review already does.
//
// Like PolicyReview.jsx, this component keeps the tool's own imperative
// DOM-driven rendering (element ids, innerHTML template functions, Chart.js
// canvases) intact rather than translating it into React state — the least
// risky way to carry over a large, already-tuned tool byte-for-byte.
import React, { useEffect, useRef } from 'react';
// Chart.js is BUNDLED (not loaded from a CDN) — a CDN <script> can be blocked
// by the user's ad-blocker / privacy extension / corporate proxy, and the
// ported tool's upload handler then waits forever on `window.Chart` and the
// dashboard never renders ("no data after upload"). `chart.js/auto`
// pre-registers every controller/scale/element, so the ported code that does
// `new window.Chart(...)` works unchanged once we expose it on window.
import Chart from 'chart.js/auto';
import { api } from '../services/api';
import { saveGeneratedDocument, wrapStandaloneHtml, snapshotElementHtml } from '../utils/documents';

// ---------------------------------------------------------------------------
// Styles — copied verbatim from the standalone tool's <style> block.
// ---------------------------------------------------------------------------
const PORTFOLIO_REVIEW_STYLES = `
    /* ── PRINT STYLES ── */
    @media print {
      @page {
        size: landscape;
        margin: 20mm 10mm 15mm 10mm;
      }
      @page :first {
        margin-top: 12mm;
      }
      .portfolio-review-widget * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .portfolio-review-widget body {
        background: #fff !important;
        font-size: 9pt !important;
        overflow: visible !important;
      }
      
      .portfolio-review-widget header, .portfolio-review-widget #upload-page, .portfolio-review-widget .dash-btns, .portfolio-review-widget .tabs, .portfolio-review-widget .print-btn-wrap,
      .portfolio-review-widget .rcol, .portfolio-review-widget #scheme-search, .portfolio-review-widget #search-results,
      .portfolio-review-widget .unwanted-input-row, .portfolio-review-widget #unwanted-tags,
      .portfolio-review-widget .gauge-wrap, .portfolio-review-widget .risk-lbl, .portfolio-review-widget .risk-sc, .portfolio-review-widget .risk-desc,
      .portfolio-review-widget #btn-new, .portfolio-review-widget .browse-btn, .portfolio-review-widget .prog-wrap, .portfolio-review-widget .steps, .portfolio-review-widget .err-box,
      .portfolio-review-widget .badge-h, .portfolio-review-widget .print-btn {
        display: none !important;
      }
      
      .portfolio-review-widget #dash-page {
        display: block !important;
        max-width: 260mm !important;
        margin: 0 auto !important;
        width: 100% !important;
      }
      
      .portfolio-review-widget .dash-hdr {
        padding: .5rem 0 !important;
        border-bottom: 2px solid #1e40af !important;
        margin-bottom: .5rem !important;
        background: #fff !important;
      }
      .portfolio-review-widget .dash-top {
        justify-content: flex-start !important;
      }
      .portfolio-review-widget .client-name {
        font-size: 14pt !important;
      }
      .portfolio-review-widget .client-meta {
        font-size: 8pt !important;
      }
      
      .portfolio-review-widget .kpi-row {
        display: grid !important;
        grid-template-columns: repeat(5, 1fr) !important;
        gap: 0 !important;
        border: 1px solid #ddd !important;
        margin-bottom: .5rem !important;
        background: #fff !important;
        max-width: 100% !important;
      }
      .portfolio-review-widget .kpi {
        padding: .5rem .6rem !important;
        border-right: 1px solid #eee !important;
        background: #fff !important;
      }
      .portfolio-review-widget .kpi::before {
        height: 2px !important;
      }
      .portfolio-review-widget .kpi-lbl {
        font-size: 6pt !important;
        margin-bottom: .2rem !important;
      }
      .portfolio-review-widget .kpi-val {
        font-size: 10pt !important;
        margin-bottom: .1rem !important;
      }
      .portfolio-review-widget .kpi-sub {
        font-size: 6.5pt !important;
      }
      
      .portfolio-review-widget .main-grid {
        display: block !important;
      }
      .portfolio-review-widget .lcol {
        border-right: none !important;
        padding: 0 !important;
      }
      
      .portfolio-review-widget .chart-row {
        display: flex !important;
        flex-direction: row !important;
        justify-content: center !important;
        gap: 1rem !important;
        margin-bottom: .5rem !important;
      }
      .portfolio-review-widget .cbox {
        flex: 1 !important;
        max-width: 450px !important;
        border: 1px solid #ddd !important;
        border-radius: 6px !important;
        padding: .6rem !important;
        background: #fff !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .portfolio-review-widget .cwrap {
        height: 200px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .portfolio-review-widget canvas {
        max-height: 200px !important;
        max-width: 100% !important;
        object-fit: contain !important;
      }
      .portfolio-review-widget .clbl {
        font-size: 7.5pt !important;
        margin-bottom: .3rem !important;
      }
      
      .portfolio-review-widget .bar-box {
        border: 1px solid #ddd !important;
        border-radius: 6px !important;
        padding: .6rem !important;
        margin-bottom: .8rem !important;
        background: #fff !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        max-width: 860px !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      .portfolio-review-widget .bar-box > div[style*="height:220px"] {
        height: 230px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .portfolio-review-widget .bar-box canvas {
        max-height: 230px !important;
        max-width: 100% !important;
        object-fit: contain !important;
      }
      
      .portfolio-review-widget .sec-ttl {
        font-size: 10pt !important;
        margin-bottom: .4rem !important;
        margin-top: .3rem !important;
      }
      
      .portfolio-review-widget #holdings-title {
        page-break-before: always !important;
      }
      
      .portfolio-review-widget .tbl {
        font-size: 8pt !important;
        width: 100% !important;
        table-layout: auto !important;
        border-collapse: collapse !important;
      }
      .portfolio-review-widget .tbl thead th {
        font-size: 7.5pt !important;
        padding: .4rem .5rem !important;
        white-space: nowrap !important;
        background: #1e3a5f !important;
        color: #fff !important;
      }
      .portfolio-review-widget .tbl tbody td {
        padding: .4rem .5rem !important;
        font-size: 8pt !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }
      .portfolio-review-widget .tbl .fn {
        font-size: 8pt !important;
      }
      .portfolio-review-widget .tbl .fc {
        font-size: 6.5pt !important;
      }
      .portfolio-review-widget .cbadge {
        font-size: 6.5pt !important;
        padding: 1px 4px !important;
      }
      .portfolio-review-widget .abar {
        min-width: 30px !important;
      }
      
      .portfolio-review-widget #consol-overview {
        page-break-before: always;
      }
      
      .portfolio-review-widget .consol-grid {
        display: block !important;
      }
      .portfolio-review-widget .consol-grid > div {
        display: block !important;
        width: 100% !important;
      }
      .portfolio-review-widget .consol-box {
        border: 1px solid #ddd !important;
        border-radius: 6px !important;
        overflow: hidden !important;
        background: #fff !important;
        max-width: 800px !important;
        margin: 0 auto 1.5rem auto !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .portfolio-review-widget .consol-hdr {
        font-size: 8.5pt !important;
        padding: .4rem .6rem !important;
        background: #1e3a5f !important;
        color: #fff !important;
        font-weight: bold !important;
      }
      .portfolio-review-widget .consol-box table {
        width: 100% !important;
        table-layout: auto !important;
        font-size: 8pt !important;
        border-collapse: collapse !important;
      }
      .portfolio-review-widget .consol-box table th {
        font-size: 7.5pt !important;
        padding: .4rem .6rem !important;
        white-space: nowrap !important;
        background: #f8f9fa !important;
        color: #333 !important;
        border-bottom: 1px solid #eee !important;
      }
      .portfolio-review-widget .consol-box table td {
        font-size: 8pt !important;
        padding: .4rem .6rem !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }
      .portfolio-review-widget .consol-box table tfoot td {
        font-size: 8pt !important;
        padding: .4rem .6rem !important;
      }
      .portfolio-review-widget .alloc-bar, .portfolio-review-widget .alloc-bar-wrap div[style*="width:60px"] {
        width: 35px !important;
        min-width: 35px !important;
      }
      
      .portfolio-review-widget .print-advisory-section {
        display: block !important;
        page-break-before: auto !important;
        margin-top: 2rem !important;
        padding-top: 1rem !important;
        padding-bottom: .5rem !important;
        max-width: 800px !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      .portfolio-review-widget .print-advisory-section .sec-ttl {
        font-size: 11pt !important;
        margin-bottom: .6rem !important;
        border-bottom: 2px solid #1e40af;
        padding-bottom: .3rem;
        break-after: avoid !important;
        page-break-after: avoid !important;
      }
      .portfolio-review-widget .alert-box-wrap {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        display: block !important;
      }
      .portfolio-review-widget .print-advisory-section .alert-box {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        margin-bottom: .5rem !important;
        padding: .5rem .6rem !important;
        font-size: 8.5pt !important;
        border-radius: 5px !important;
      }
      .portfolio-review-widget .print-advisory-section .alert-box span[style*="font-size:1.1rem"] {
        font-size: .85rem !important;
      }
      
      .portfolio-review-widget div[style*="overflow-x:auto"] {
        overflow: visible !important;
        max-width: 900px !important;
        margin: 0 auto 1.5rem auto !important;
        border: 1px solid #ddd !important;
        border-radius: 8px !important;
      }
      
      .portfolio-review-widget .alert-edit-hint {
        display: none !important;
      }
      .portfolio-review-widget .alert-editable {
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
    }
    .portfolio-review-widget .print-advisory-section {
      display: none;
    }
    .portfolio-review-widget .print-btn-wrap {
      display: inline-flex;
    }
    .portfolio-review-widget .print-btn {
      background: linear-gradient(135deg, #1e3a5f, #1e40af);
      color: #fff;
      border: none;
      padding: .5rem 1.2rem;
      border-radius: 8px;
      font: 600 .8rem 'DM Sans', sans-serif;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      transition: .2s;
      box-shadow: 0 2px 8px rgba(30,64,175,.2);
    }
    .portfolio-review-widget .print-btn:hover {
      background: linear-gradient(135deg, #1e40af, #2563eb);
      box-shadow: 0 4px 14px rgba(30,64,175,.3);
      transform: translateY(-1px);
    }
    .portfolio-review-widget .print-btn svg {
      width: 16px; height: 16px;
    }
    .portfolio-review-widget {
      --ink: #1a2744;
      --paper: #f5f8fc;
      --cream: #e8eef6;
      --gold: #2563eb;
      --gold-l: #60a5fa;
      --green: #1a5c4a;
      --green-l: #2d8a6e;
      --coral: #e05c45;
      --sky: #3d7abf;
      --violet: #6b4fa0;
      --border: rgba(26, 39, 68, 0.1);
      --blue: #2563eb;
      --blue-l: #3b82f6;
      --blue-d: #1e40af
    }

    .portfolio-review-widget * {
      margin: 0;
      padding: 0;
      box-sizing: border-box
    }

    .portfolio-review-widget body {
      font-family: 'DM Sans', sans-serif;
      background: var(--paper);
      color: var(--ink);
      min-height: 100vh;
      overflow-x: hidden
    }

    .portfolio-review-widget header {
      background: #fff;
      padding: 0 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 60px;
      position: sticky;
      top: 0;
      z-index: 100;
      border-bottom: 1px solid var(--border);
      box-shadow: 0 1px 4px rgba(26, 39, 68, .06)
    }

    @media(max-width:600px) {
      .portfolio-review-widget header {
        padding: 0 1rem;
        height: 50px;
      }
    }

    .portfolio-review-widget .logo {
      font-family: 'DM Sans', sans-serif;
      font-size: 1.1rem;
      color: var(--blue);
      font-weight: 700;
      letter-spacing: -.01em
    }

    .portfolio-review-widget .logo span {
      color: var(--ink);
      font-weight: 500
    }

    .portfolio-review-widget .badge-h {
      font-size: .68rem;
      background: rgba(37, 99, 235, .1);
      color: var(--blue);
      padding: 3px 10px;
      border-radius: 20px;
      letter-spacing: .1em;
      text-transform: uppercase;
      font-weight: 600
    }

    
    .portfolio-review-widget #upload-page {
      min-height: calc(100vh - 60px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      background: radial-gradient(ellipse at 60% 40%, rgba(37, 99, 235, .05) 0%, transparent 65%)
    }

    .portfolio-review-widget .eyebrow {
      font-size: .72rem;
      letter-spacing: .2em;
      text-transform: uppercase;
      color: var(--blue);
      font-weight: 600;
      margin-bottom: .8rem
    }

    .portfolio-review-widget .hero {
      font-family: 'Playfair Display', serif;
      font-size: clamp(1.8rem, 5vw, 3rem);
      font-weight: 900;
      text-align: center;
      line-height: 1.1;
      margin-bottom: .7rem;
      max-width: 640px
    }

    .portfolio-review-widget .hero em {
      color: var(--blue);
      font-style: normal
    }

    .portfolio-review-widget .sub {
      color: rgba(15, 17, 23, .5);
      font-size: .95rem;
      text-align: center;
      margin-bottom: 2rem;
      max-width: 440px;
      line-height: 1.6
    }

    .portfolio-review-widget .drop {
      width: 100%;
      max-width: 520px;
      border: 2px dashed var(--blue);
      border-radius: 18px;
      padding: 3rem 2rem;
      text-align: center;
      cursor: pointer;
      transition: .3s;
      background: rgba(37, 99, 235, .02)
    }

    .portfolio-review-widget .drop:hover,
    .portfolio-review-widget .drop.over {
      border-color: var(--blue-l);
      background: rgba(37, 99, 235, .05);
      transform: translateY(-2px);
      box-shadow: 0 12px 50px rgba(26, 39, 68, .1)
    }

    .portfolio-review-widget .drop-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1rem;
      background: var(--blue);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center
    }

    .portfolio-review-widget .drop-icon svg {
      width: 30px;
      height: 30px
    }

    .portfolio-review-widget .drop-main {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: .3rem
    }

    .portfolio-review-widget .drop-hint {
      font-size: .82rem;
      color: rgba(15, 17, 23, .4)
    }

    .portfolio-review-widget .or {
      display: block;
      margin: .9rem 0;
      font-size: .75rem;
      color: rgba(15, 17, 23, .3);
      text-transform: uppercase;
      letter-spacing: .1em
    }

    .portfolio-review-widget .browse-btn {
      background: var(--blue);
      color: #fff;
      border: none;
      padding: .65rem 1.6rem;
      border-radius: 8px;
      font: 600 .88rem 'DM Sans', sans-serif;
      cursor: pointer;
      transition: .2s
    }

    .portfolio-review-widget .browse-btn:hover {
      background: var(--blue-d)
    }

    .portfolio-review-widget #file-in {
      display: none
    }

    
    .portfolio-review-widget .prog-wrap {
      width: 100%;
      max-width: 520px;
      margin-top: 1.5rem;
      display: none
    }

    .portfolio-review-widget .prog-lbl {
      font-size: .78rem;
      color: rgba(15, 17, 23, .45);
      margin-bottom: .4rem;
      display: flex;
      justify-content: space-between
    }

    .portfolio-review-widget .prog-bar {
      height: 4px;
      background: var(--cream);
      border-radius: 4px;
      overflow: hidden
    }

    .portfolio-review-widget .prog-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--blue), var(--blue-l));
      border-radius: 4px;
      transition: width .4s;
      width: 0%
    }

    .portfolio-review-widget .steps {
      width: 100%;
      max-width: 520px;
      margin-top: 1rem;
      display: none
    }

    .portfolio-review-widget .step {
      display: flex;
      align-items: center;
      gap: .6rem;
      padding: .3rem 0;
      font-size: .82rem;
      color: rgba(15, 17, 23, .35);
      transition: .3s
    }

    .portfolio-review-widget .step.active {
      color: var(--blue);
      font-weight: 600
    }

    .portfolio-review-widget .step.done {
      color: rgba(15, 17, 23, .6)
    }

    .portfolio-review-widget .step-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--border);
      flex-shrink: 0;
      transition: .3s
    }

    .portfolio-review-widget .step.active .step-dot {
      background: var(--blue);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, .2)
    }

    .portfolio-review-widget .step.done .step-dot {
      background: var(--blue-d)
    }

    
    .portfolio-review-widget #dash-page {
      display: none
    }

    .portfolio-review-widget .dash-hdr {
      background: #fff;
      padding: 1.6rem 2rem;
      color: var(--ink);
      border-bottom: 1px solid var(--border)
    }

    @media(max-width:600px) {
      .portfolio-review-widget .dash-hdr {
        padding: 1rem 1rem;
      }
    }

    .portfolio-review-widget .dash-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: .8rem
    }

    .portfolio-review-widget .client-name {
      font-family: 'Playfair Display', serif;
      font-size: 1.7rem;
      font-weight: 700
    }

    @media(max-width:600px) {
      .portfolio-review-widget .client-name {
        font-size: 1.2rem;
      }
    }

    .portfolio-review-widget .client-meta {
      font-size: .78rem;
      color: rgba(26, 39, 68, .5);
      margin-top: .25rem;
      font-family: 'DM Mono', monospace
    }

    @media(max-width:600px) {
      .portfolio-review-widget .client-meta {
        font-size: .68rem;
      }
    }

    .portfolio-review-widget .dash-btns {
      display: flex;
      gap: .6rem;
      align-items: center;
      flex-wrap: wrap
    }

    .portfolio-review-widget .btn-ol {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--ink);
      padding: .45rem 1rem;
      border-radius: 7px;
      font: .78rem 'DM Sans', sans-serif;
      cursor: pointer;
      transition: .2s
    }

    .portfolio-review-widget .btn-ol:hover {
      border-color: var(--blue);
      color: var(--blue)
    }

    .portfolio-review-widget .btn-gold {
      background: var(--blue);
      border: none;
      color: #fff;
      padding: .45rem 1.1rem;
      border-radius: 7px;
      font: 700 .78rem 'DM Sans', sans-serif;
      cursor: pointer
    }

    .portfolio-review-widget .tabs {
      display: flex;
      margin-top: 1.2rem;
      border-bottom: 1px solid var(--border);
      overflow-x: auto
    }

    .portfolio-review-widget .tab {
      padding: .55rem 1.2rem;
      font-size: .82rem;
      font-weight: 600;
      color: rgba(26, 39, 68, .4);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: .2s;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: .35rem
    }

    .portfolio-review-widget .tab:hover {
      color: var(--ink)
    }

    .portfolio-review-widget .tab.on {
      color: var(--blue);
      border-bottom-color: var(--blue)
    }

    .portfolio-review-widget .av {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(26, 39, 68, .1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: .62rem;
      font-weight: 700;
      color: var(--ink)
    }

    .portfolio-review-widget .tab.on .av {
      background: var(--blue);
      color: #fff
    }

    
    .portfolio-review-widget .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1px;
      background: var(--border);
      border-bottom: 1px solid var(--border)
    }

    @media(max-width:600px) {
      .portfolio-review-widget .kpi-row {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media(max-width:380px) {
      .portfolio-review-widget .kpi-row {
        grid-template-columns: 1fr;
      }
    }

    .portfolio-review-widget .kpi {
      background: var(--paper);
      padding: 1.2rem 1.5rem;
      position: relative
    }

    .portfolio-review-widget .kpi::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px
    }

    .portfolio-review-widget .kpi.c0::before {
      background: var(--blue)
    }

    .portfolio-review-widget .kpi.c1::before {
      background: var(--blue-l)
    }

    .portfolio-review-widget .kpi.c2::before {
      background: var(--coral)
    }

    .portfolio-review-widget .kpi.c3::before {
      background: var(--sky)
    }

    .portfolio-review-widget .kpi.c4::before {
      background: var(--violet)
    }

    .portfolio-review-widget .kpi-lbl {
      font-size: .68rem;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: rgba(15, 17, 23, .4);
      font-weight: 600;
      margin-bottom: .4rem
    }

    .portfolio-review-widget .kpi-val {
      font-family: 'DM Sans', sans-serif;
      font-size: 1.35rem;
      font-weight: 500;
      line-height: 1;
      margin-bottom: .25rem
    }

    .portfolio-review-widget .kpi-sub {
      font-size: .75rem;
      font-weight: 600
    }

    .portfolio-review-widget .up {
      color: var(--green-l)
    }

    .portfolio-review-widget .dn {
      color: var(--coral)
    }

    .portfolio-review-widget .neu {
      color: var(--sky)
    }

    
    .portfolio-review-widget .main-grid {
      display: grid;
      grid-template-columns: 1fr 320px
    }

    @media(max-width:880px) {
      .portfolio-review-widget .main-grid {
        grid-template-columns: 1fr
      }
    }

    @media(max-width:600px) {
      .portfolio-review-widget .lcol {
        padding: 1rem !important;
      }
      .portfolio-review-widget .rcol {
        padding: 1rem !important;
      }
    }

    .portfolio-review-widget .lcol {
      padding: 1.75rem 2rem;
      border-right: 1px solid var(--border)
    }

    .portfolio-review-widget .rcol {
      padding: 1.5rem;
      background: var(--cream)
    }

    .portfolio-review-widget .sec-ttl {
      font-family: 'Playfair Display', serif;
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: .5rem
    }

    .portfolio-review-widget .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--blue);
      flex-shrink: 0
    }

    .portfolio-review-widget .chart-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.2rem;
      margin-bottom: 1.5rem
    }

    @media(max-width:600px) {
      .portfolio-review-widget .chart-row {
        grid-template-columns: 1fr
      }
    }

    .portfolio-review-widget .cbox {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.1rem
    }

    .portfolio-review-widget .clbl {
      font-size: .72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: rgba(15, 17, 23, .4);
      margin-bottom: .9rem
    }

    .portfolio-review-widget .cwrap {
      position: relative;
      height: 170px;
      display: flex;
      align-items: center;
      justify-content: center
    }

    .portfolio-review-widget .bar-box {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.1rem;
      margin-bottom: 1.5rem
    }

    
    .portfolio-review-widget .tbl {
      width: 100%;
      border-collapse: collapse;
      font-size: .82rem
    }

    @media(max-width:600px) {
      .portfolio-review-widget .tbl {
        font-size: .72rem;
      }
      .portfolio-review-widget .tbl thead th {
        font-size: .6rem !important;
        padding: .45rem .4rem !important;
      }
      .portfolio-review-widget .tbl tbody td {
        padding: .5rem .4rem !important;
      }
    }

    .portfolio-review-widget .tbl thead th {
      text-align: left;
      padding: .65rem .7rem;
      font-size: .68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #fff;
      border-bottom: none;
      background: linear-gradient(135deg, #1e3a5f, #1e40af)
    }

    .portfolio-review-widget .tbl tbody td {
      padding: .7rem .7rem;
      border-bottom: 1px solid rgba(56, 64, 89, 0.04);
      vertical-align: middle
    }

    .portfolio-review-widget .tbl tbody tr:hover {
      background: rgba(37, 99, 235, .04)
    }

    .portfolio-review-widget .fn {
      font-weight: 600;
      font-size: .83rem
    }

    .portfolio-review-widget .fc {
      font-size: .68rem;
      color: rgba(63, 72, 98, 0.4);
      margin-top: 1px
    }

    .portfolio-review-widget .cbadge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 20px;
      font-size: .67rem;
      font-weight: 600
    }

    .portfolio-review-widget .eq {
      background: rgba(26, 92, 74, .1);
      color: var(--green)
    }

    .portfolio-review-widget .dt {
      background: rgba(57, 118, 250, 0.1);
      color: var(--blue)
    }

    .portfolio-review-widget .hy {
      background: rgba(107, 79, 160, .1);
      color: var(--violet)
    }

    .portfolio-review-widget .lq {
      background: rgba(37, 99, 235, .08);
      color: var(--blue-d)
    }

    .portfolio-review-widget .rp {
      color: var(--green-l);
      font-weight: 700
    }

    .portfolio-review-widget .rn {
      color: var(--coral);
      font-weight: 700
    }

    .portfolio-review-widget .ab {
      display: flex;
      align-items: center;
      gap: .45rem
    }

    .portfolio-review-widget .abar {
      flex: 1;
      height: 5px;
      background: rgba(79, 89, 120, 0.06);
      border-radius: 5px;
      overflow: hidden;
      min-width: 50px
    }

    .portfolio-review-widget .afill {
      height: 100%;
      border-radius: 5px
    }

    
    .portfolio-review-widget .gauge-wrap {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      height: 120px
    }

    .portfolio-review-widget .risk-lbl {
      text-align: center;
      margin-top: .4rem
    }

    .portfolio-review-widget .risk-sc {
      font-family: 'Playfair Display', serif;
      font-size: 1.8rem;
      font-weight: 900;
      line-height: 1
    }

    .portfolio-review-widget .risk-desc {
      font-size: .7rem;
      color: rgba(15, 17, 23, .4);
      text-transform: uppercase;
      letter-spacing: .1em;
      font-weight: 600;
      margin-top: .2rem
    }

    .portfolio-review-widget .divider {
      height: 1px;
      background: var(--border);
      margin: 1.2rem 0
    }

    .portfolio-review-widget .sip-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: .6rem 0;
      border-bottom: 1px solid var(--border);
      font-size: .82rem
    }

    .portfolio-review-widget .sip-row:last-child {
      border-bottom: none
    }

    .portfolio-review-widget .sip-nm {
      font-weight: 500
    }

    .portfolio-review-widget .sip-dt {
      font-size: .68rem;
      color: rgba(15, 17, 23, .38)
    }

    .portfolio-review-widget .sip-amt {
      font-family: 'DM Sans', sans-serif;
      font-weight: 500;
      font-size: .82rem;
      color: var(--ink)
    }

    .portfolio-review-widget .goal {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: .9rem;
      margin-bottom: .65rem
    }

    .portfolio-review-widget .goal-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: .65rem
    }

    .portfolio-review-widget .goal-nm {
      font-weight: 600;
      font-size: .85rem
    }

    .portfolio-review-widget .goal-pct {
      font-family: 'DM Sans', sans-serif;
      font-size: .85rem;
      font-weight: 600;
      color: var(--green)
    }

    .portfolio-review-widget .gbar {
      height: 5px;
      background: rgba(15, 17, 23, .06);
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: .35rem
    }

    .portfolio-review-widget .gfill {
      height: 100%;
      background: linear-gradient(90deg, var(--blue), var(--blue-l));
      border-radius: 5px
    }

    .portfolio-review-widget .gmeta {
      display: flex;
      justify-content: space-between;
      font-size: .7rem;
      color: rgba(15, 17, 23, .38);
      font-family: 'DM Sans', sans-serif
    }

    .portfolio-review-widget .alert-box {
      display: flex;
      gap: .65rem;
      padding: .85rem 1rem;
      border-radius: 10px;
      margin-bottom: .6rem;
      font-size: .8rem;
      line-height: 1.5;
      border-left: 4px solid transparent;
      position: relative;
      transition: transform .15s, box-shadow .15s
    }

    .portfolio-review-widget .alert-box:hover {
      transform: translateX(3px);
      box-shadow: 0 2px 12px rgba(0, 0, 0, .06)
    }

    .portfolio-review-widget .alert-box.warn {
      background: rgba(224, 92, 69, .08);
      border: 1px solid rgba(224, 92, 69, .18);
      border-left: 4px solid #e05c45;
      box-shadow: 0 1px 6px rgba(224, 92, 69, .08)
    }

    .portfolio-review-widget .alert-box.info {
      background: rgba(37, 99, 235, .07);
      border: 1px solid rgba(37, 99, 235, .18);
      border-left: 4px solid #3b82f6;
      box-shadow: 0 1px 6px rgba(37, 99, 235, .08)
    }

    .portfolio-review-widget .alert-box.ok {
      background: rgba(26, 92, 74, .08);
      border: 1px solid rgba(26, 92, 74, .18);
      border-left: 4px solid #2d8a6e;
      box-shadow: 0 1px 6px rgba(26, 92, 74, .08)
    }

    .portfolio-review-widget .advisor-section-title {
      background: linear-gradient(135deg, rgba(37, 99, 235, .1), rgba(37, 99, 235, .03));
      border: 1px solid rgba(37, 99, 235, .15);
      border-radius: 10px;
      padding: .7rem .9rem;
      margin-bottom: .8rem;
      display: flex;
      align-items: center;
      gap: .5rem
    }

    .portfolio-review-widget .advisor-section-title .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--blue);
      animation: pulse-dot 2s ease-in-out infinite
    }

    @keyframes pulse-dot {

      0%,
      100% {
        box-shadow: 0 0 0 0 rgba(37, 99, 235, .4)
      }

      50% {
        box-shadow: 0 0 0 6px rgba(37, 99, 235, 0)
      }
    }

    .portfolio-review-widget .alert-count {
      background: var(--blue);
      color: #fff;
      font-size: .65rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 12px;
      margin-left: auto
    }

    

    
    .portfolio-review-widget .alert-editable {
      outline: none;
      border: 1px dashed transparent;
      border-radius: 5px;
      transition: all .2s ease;
      min-height: 1em;
      display: block;
      cursor: text;
      position: relative;
      padding: 2px 4px;
    }
    .portfolio-review-widget .alert-editable:hover {
      border-color: rgba(37,99,235,.3);
      background: rgba(37,99,235,.03);
    }
    .portfolio-review-widget .alert-editable:focus {
      border-color: var(--blue);
      background: rgba(37,99,235,.05);
      box-shadow: 0 0 0 2px rgba(37,99,235,.1);
    }
    .portfolio-review-widget .alert-edit-hint {
      font-size: .6rem;
      color: rgba(37,99,235,.5);
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: .25rem;
      opacity: 0;
      transition: opacity .2s;
    }
    .portfolio-review-widget .alert-box:hover .alert-edit-hint {
      opacity: 1;
    }

    
    .portfolio-review-widget .consol-wrap {
      margin-bottom: 1.5rem
    }

    .portfolio-review-widget .consol-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.2rem;
      margin-bottom: 0
    }

    @media(max-width:700px) {
      .portfolio-review-widget .consol-grid {
        grid-template-columns: 1fr
      }
    }

    .portfolio-review-widget .consol-cat-amc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.2rem;
      margin-top: 1.2rem !important
    }

    @media(max-width:700px) {
      .portfolio-review-widget .consol-cat-amc-grid {
        grid-template-columns: 1fr
      }
    }

    .portfolio-review-widget .consol-box {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden
    }

    .portfolio-review-widget .consol-hdr {
      padding: .8rem 1.1rem;
      background: linear-gradient(135deg, #1e3a5f, #1e40af);
      border-bottom: none;
      font-size: .76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #fff;
      display: flex;
      align-items: center;
      gap: .5rem;
      position: relative;
      overflow: hidden
    }

    .portfolio-review-widget .consol-hdr::after {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 80px;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .06));
      pointer-events: none
    }

    .portfolio-review-widget .ctbl {
      width: 100%;
      border-collapse: collapse;
      font-size: .82rem
    }

    .portfolio-review-widget .ctbl thead th {
      text-align: left;
      padding: .55rem .85rem;
      font-size: .67rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: rgba(26, 39, 68, .55);
      border-bottom: 2px solid rgba(37, 99, 235, .12);
      background: linear-gradient(135deg, rgba(37, 99, 235, .06), rgba(37, 99, 235, .02))
    }

    .portfolio-review-widget .ctbl tbody td {
      padding: .65rem .85rem;
      border-bottom: 1px solid rgba(15, 17, 23, .04);
      vertical-align: middle
    }

    .portfolio-review-widget .ctbl tbody tr:last-child td {
      border-bottom: none
    }

    .portfolio-review-widget .ctbl tbody tr:hover {
      background: rgba(37, 99, 235, .04)
    }

    .portfolio-review-widget .ctbl tfoot td {
      padding: .65rem .85rem;
      font-weight: 700;
      font-size: .82rem;
      background: rgba(15, 17, 23, .03);
      border-top: 2px solid var(--border)
    }

    .portfolio-review-widget .ctbl .mono {
      font-family: 'DM Sans', sans-serif;
      font-size: .78rem
    }

    .portfolio-review-widget .cat-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: .4rem;
      flex-shrink: 0
    }

    .portfolio-review-widget .alloc-bar-wrap {
      display: flex;
      align-items: center;
      gap: .4rem
    }

    .portfolio-review-widget .alloc-bar {
      flex: 1;
      height: 4px;
      background: rgba(15, 17, 23, .06);
      border-radius: 4px;
      overflow: hidden;
      min-width: 40px
    }

    .portfolio-review-widget .alloc-fill {
      height: 100%;
      border-radius: 4px
    }

    .portfolio-review-widget .err-box {
      width: 100%;
      max-width: 520px;
      margin-top: 1.2rem;
      background: rgba(224, 92, 69, .07);
      border: 1px solid rgba(224, 92, 69, .2);
      border-radius: 12px;
      padding: 1rem 1.2rem;
      font-size: .83rem;
      color: var(--coral);
      display: none;
      line-height: 1.5
    }

    .portfolio-review-widget .fadein {
      animation: fi .4s ease forwards
    }

    @keyframes fi {
      from {
        opacity: 0;
        transform: translateY(8px)
      }

      to {
        opacity: 1;
        transform: none
      }
    }

    .portfolio-review-widget .tag-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: .4rem;
      margin-top: .5rem
    }

    .portfolio-review-widget .tag {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      background: rgba(224, 92, 69, .1);
      border: 1px solid rgba(224, 92, 69, .2);
      color: var(--coral);
      padding: 3px 10px;
      border-radius: 20px;
      font-size: .72rem;
      font-weight: 600
    }

    .portfolio-review-widget .tag-rm {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--coral);
      font-size: .85rem;
      line-height: 1;
      padding: 0;
      margin-left: 2px
    }

    .portfolio-review-widget .tag-rm:hover {
      color: #a03020
    }

    .portfolio-review-widget .unwanted-input-row {
      display: flex;
      gap: .4rem;
      margin-bottom: .5rem
    }

    .portfolio-review-widget .unwanted-input-row input {
      flex: 1;
      padding: .55rem .75rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      font: 500 .82rem 'DM Sans', sans-serif;
      color: var(--ink);
      background: #fff;
      outline: none;
      transition: .2s
    }

    .portfolio-review-widget .unwanted-input-row input:focus {
      border-color: var(--coral)
    }

    .portfolio-review-widget .unwanted-input-row button {
      background: var(--coral);
      color: #fff;
      border: none;
      padding: .55rem .85rem;
      border-radius: 8px;
      font: 600 .78rem 'DM Sans', sans-serif;
      cursor: pointer;
      white-space: nowrap
    }

    .portfolio-review-widget .unwanted-input-row button:hover {
      background: #c04030
    }



.portfolio-review-widget #scheme-search:focus {
  border-color: var(--green-l);
}
`;

// ---------------------------------------------------------------------------
// Page shell — copied verbatim from the standalone tool's <body> (upload page
// + dashboard page), with two integration-only additions: the shared app
// logo (instead of a redundant embedded copy) and a "Save to Profile" button
// next to Print (shown/hidden together, same as the original).
// ---------------------------------------------------------------------------
const PAGE_HTML = `
  <!-- UPLOAD PAGE -->
  <section id="upload-page">
    <div class="eyebrow">Team Fintness · Portfolio Review</div>
    <h1 class="hero">Smart Portfolio <em>Review</em> &amp; Analysis</h1>
    <p class="sub">Upload any client portfolio PDF — CAMS, KFintech, Groww, Zerodha or any broker statement. AI reads it
      instantly.</p>

    <div class="drop" id="drop-zone">
      <div class="drop-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <polyline points="9,15 12,12 15,15" />
        </svg>
      </div>
      <div class="drop-main">Drop your client portfolio PDF here</div>
      <div class="drop-hint">CAMS · KFintech · MFU · Zerodha · Groww · Any broker statement</div>
      <span class="or">or</span><br>
      <button class="browse-btn">Browse File</button>
      <input type="file" id="file-in" accept=".pdf,application/pdf">
    </div>

    <div class="prog-wrap" id="pw">
      <div class="prog-lbl"><span id="prog-step">Starting…</span><span id="prog-pct">0%</span></div>
      <div class="prog-bar">
        <div class="prog-fill" id="pf"></div>
      </div>
    </div>

    <div class="steps" id="steps-el">
      <div class="step" id="s1"><span class="step-dot"></span>Reading PDF file</div>
      <div class="step" id="s2"><span class="step-dot"></span>Sending to AI for analysis</div>
      <div class="step" id="s3"><span class="step-dot"></span>Extracting holdings, values &amp; SIP data</div>
      <div class="step" id="s4"><span class="step-dot"></span>Building portfolio dashboard</div>
    </div>

    <div class="err-box" id="err-box"></div>
  </section>

  <!-- DASHBOARD PAGE -->
  <div id="dash-page">
    <div class="dash-hdr">
      <div class="dash-top">
        <div>
          <div class="client-name" id="p-title">—</div>
          <div class="client-meta" id="p-meta">—</div>
        </div>
        <div class="dash-btns">
          <div class="print-btn-wrap" id="save-btn-wrap" style="display:none">
            <button class="print-btn" id="save-profile-btn" style="background:linear-gradient(135deg,#1a5c4a,#2d8a6e)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span id="save-profile-btn-label">Save to Profile</span>
            </button>
          </div>
          <div class="print-btn-wrap" id="print-btn-wrap" style="display:none">
            <button class="print-btn" id="print-portfolio-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print
            </button>
          </div>
          <button class="btn-ol" id="btn-new">↑ New Client</button>
        </div>
      </div>
      <div class="tabs" id="tabs-el"></div>
    </div>
    <div class="kpi-row" id="kpi-row"></div>
    <div class="main-grid">
      <div class="lcol">
        <div class="sec-ttl"><span class="dot"></span>Portfolio Allocation</div>
        <div class="chart-row">
          <div class="cbox">
            <div class="clbl">Asset Class Mix</div>
            <div class="cwrap"><canvas id="ca"></canvas></div>
          </div>
          <div class="cbox">
            <div class="clbl">Category Breakdown</div>
            <div class="cwrap"><canvas id="cc"></canvas></div>
          </div>
        </div>
        <div class="bar-box">
          <div class="clbl">Top Schemes — Invested vs Current Value</div>
          <div style="height:220px;position:relative"><canvas id="cb"></canvas></div>
        </div>
        <div id="consol-overview" style="display:none;margin-bottom:1.5rem"></div>
        <div class="sec-ttl" id="holdings-title" style="margin-bottom:.8rem"><span class="dot"></span>All Holdings</div>
        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:12px;overflow:hidden">
          <table class="tbl">
            <thead>
              <tr>
                <th>Fund Name</th>
                <th>Category</th>
                <th>Invested</th>
                <th>Current</th>
                <th>Gain/Loss</th>
                <th>Allocation</th>
                <th>CAGR</th>
              </tr>
            </thead>
            <tbody id="t-body"></tbody>
          </table>
        </div>
        <!-- Print-only advisory notes section (rendered right after Holdings table in print) -->
        <div class="print-advisory-section" id="print-advisory-section">
          <div class="sec-ttl"><span class="dot"></span>Advisory Notes</div>
          <div id="print-alert-list"></div>
        </div>
      </div>
      <div class="rcol">
        <div class="sec-ttl" style="font-size:.88rem"><span class="dot"></span>Risk Score</div>
        <div class="gauge-wrap"><canvas id="gauge" width="220" height="120"></canvas></div>
        <div class="risk-lbl">
          <div class="risk-sc" id="rs-val">—</div>
          <div class="risk-desc" id="rs-lbl">—</div>
        </div>
        <div class="divider"></div>
        <div class="sec-ttl" style="font-size:.88rem"><span class="dot"></span>Active SIPs</div>
        <div id="sip-list"></div>
        <div class="divider"></div>
        <div class="sec-ttl" style="font-size:.88rem"><span class="dot"></span>Scheme Search</div>
        <div style="margin-bottom:.8rem">
          <input id="scheme-search" type="text" placeholder="Search scheme name..."
            style="width:100%;padding:.6rem .85rem;border:1px solid var(--border);border-radius:8px;font:500 .82rem 'DM Sans',sans-serif;color:var(--ink);background:#fff;outline:none;transition:.2s">
        </div>
        <div id="search-results" style="font-size:.8rem;color:rgba(15,17,23,.4)">Type to search schemes in this
          portfolio</div>
        <div class="divider"></div>
        <div class="sec-ttl" style="font-size:.88rem"><span class="dot"></span>Schemes We Don't Want</div>
        <div class="unwanted-input-row">
          <input id="unwanted-input" type="text" placeholder="Enter fund name & press Add...">
          <button id="add-unwanted-btn">+ Add</button>
        </div>
        <div class="tag-wrap" id="unwanted-tags"></div>
        <div style="font-size:.74rem;color:rgba(15,17,23,.35);margin-top:.5rem">Added funds will appear as warnings in
          Advisor Notes if found in portfolio</div>
        <div class="divider"></div>
        <div class="advisor-section-title" style="font-size:.88rem"><span class="dot"></span><span
            style="font-family:'Playfair Display',serif;font-weight:700">Advisor Notes</span><span class="alert-count"
            id="alert-count" style="display:none">0</span></div>
        <div id="alert-list"></div>
      </div>
    </div>
  </div>
`;

export default function PortfolioReview({ client }) {
  // React 18 StrictMode (dev only) intentionally mounts → cleans up → mounts
  // again to help catch missing cleanup. This component's mount effect below
  // is a one-time imperative bootstrap of a large legacy tool (10+
  // addEventListener bindings against ids in the dangerouslySetInnerHTML
  // markup) — re-running that whole setup a second time would double-wire
  // every listener rather than genuinely re-synchronizing anything, so full
  // idempotent cleanup isn't practical here. These refs let the effect
  // detect StrictMode's second invocation and skip redoing setup, while
  // still tearing down correctly on the real, final unmount.
  const initializedRef = useRef(false);
  const chartsRef = useRef({});
  const removeUnwantedFnRef = useRef(null);

  // Expose the BUNDLED Chart.js on window so the ported imperative render code
  // (which calls `new window.Chart(...)`) finds it synchronously — no CDN, no
  // network wait, nothing an ad-blocker can strip out. Set once at module use.
  if (typeof window !== 'undefined' && !window.Chart) window.Chart = Chart;

  // Mounts the tool's own logic exactly once. Ported near-verbatim from the
  // standalone tool's <script> tag — same element ids, same render functions,
  // same advisory-alert rules, same Chart.js usage — so the behavior here is
  // byte-for-byte the tool that was already built and tuned. Only the Gemini
  // call (now proxied through our backend) and the "Save to Profile" action
  // are new.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initializedRef.current) {
      // StrictMode's second invocation — setup below already ran once and
      // is still fully wired up. Just re-arm the one thing the interim
      // cleanup (below) undid, and hand back a proper final-unmount cleanup.
      window.removeUnwanted = removeUnwantedFnRef.current;
      return () => {
        Object.values(chartsRef.current).forEach((c) => c?.destroy());
        delete window.removeUnwanted;
      };
    }
    initializedRef.current = true;

    // `qs` is declared by the ported script itself, below. `charts` is a ref
    // (not a local object) so the branch above can still reach it to tear
    // down chart instances on the real final unmount.
    const qs = id => document.getElementById(id);
    const charts = chartsRef.current;

    function fmt(n) {
      if (n === undefined || n === null || isNaN(n)) return '₹0';
      n = Math.round(Number(n));
      const neg = n < 0; if (neg) n = -n;
      let s;
      if (n >= 1e7) s = '₹' + (n / 1e7).toFixed(2) + ' Cr';
      else if (n >= 1e5) s = '₹' + (n / 1e5).toFixed(2) + 'L';
      else if (n >= 1e3) s = '₹' + (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'K';
      else s = '₹' + n.toLocaleString('en-IN');
      return neg ? '-' + s : s;
    }

    // ── GLOBAL UTILITY: AMC & CATEGORY DETECTION ──
    function detectAMC(name) {
      const n = (name || '').toLowerCase();
      if (n.includes('sbi')) return 'SBI Mutual Fund';
      if (n.includes('axis')) return 'Axis Mutual Fund';
      if (n.includes('icici')) return 'ICICI Prudential MF';
      if (n.includes('hdfc')) return 'HDFC Mutual Fund';
      if (n.includes('kotak')) return 'Kotak Mutual Fund';
      if (n.includes('dsp')) return 'DSP Mutual Fund';
      if (n.includes('aditya birla') || n.includes('ab sl') || n.includes('absl')) return 'Aditya Birla Sun Life MF';
      if (n.includes('nippon')) return 'Nippon India MF';
      if (n.includes('mirae')) return 'Mirae Asset MF';
      if (n.includes('franklin')) return 'Franklin Templeton MF';
      if (n.includes('tata')) return 'Tata Mutual Fund';
      if (n.includes('uti')) return 'UTI Mutual Fund';
      if (n.includes('pgim')) return 'PGIM India MF';
      if (n.includes('sundaram')) return 'Sundaram MF';
      if (n.includes('bandhan')) return 'Bandhan MF';
      if (n.includes('parag parikh') || n.includes('ppfas')) return 'PPFAS MF';
      if (n.includes('motilal')) return 'Motilal Oswal MF';
      if (n.includes('invesco')) return 'Invesco MF';
      if (n.includes('l&t') || n.includes('l and t')) return 'L&T MF';
      if (n.includes('canara')) return 'Canara Robeco MF';
      if (n.includes('edelweiss')) return 'Edelweiss MF';
      if (n.includes('whiteoak')) return 'WhiteOak MF';
      if (n.includes('quant')) return 'Quant MF';
      if (n.includes('jm')) return 'JM Financial MF';
      if (n.includes('navi')) return 'Navi MF';
      if (n.includes('360 one') || n.includes('360one')) return '360 ONE MF';
      if (n.includes('groww')) return 'Groww MF';
      return 'Other';
    }

    function detectCategory(name) {
      const n = (name || '').toLowerCase();
      if (n.includes('large & mid') || n.includes('large and mid') || n.includes('large & midcap')) return 'Large & Mid Cap';
      if (n.includes('mid cap') || n.includes('midcap')) return 'Mid Cap';
      if (n.includes('small cap') || n.includes('smallcap')) return 'Small Cap';
      if (n.includes('multi cap') || n.includes('multicap')) return 'Multi Cap';
      if (n.includes('flexi cap') || n.includes('flexicap') || n.includes('flexi-cap')) return 'Flexi Cap';
      if (n.includes('large cap') || n.includes('largecap')) return 'Large Cap';
      if (n.includes('elss') || n.includes('tax saver') || n.includes('tax saving') || n.includes('long term equity')) return 'ELSS';
      if (n.includes('nifty') || n.includes('sensex') || n.includes('index') || n.includes('bse')) return 'Index';
      if (n.includes('multi asset')) return 'Multi Asset';
      if (n.includes('balanced advantage') || n.includes('baf')) return 'Balanced Advantage';
      if (n.includes('hybrid') || n.includes('balanced') || n.includes('conservative hybrid') || n.includes('aggressive hybrid')) return 'Hybrid';
      if (n.includes('focused')) return 'Focused';
      if (n.includes('value') || n.includes('contra')) return 'Value/Contra';
      if (n.includes('liquid') || n.includes('overnight') || n.includes('money market')) return 'Liquid';
      if (n.includes('arbitrage')) return 'Arbitrage';
      if (n.includes('dynamic bond') || n.includes('gilt') || n.includes('g-sec')) return 'Dynamic Bond/Gilt';
      if (n.includes('short duration') || n.includes('short term')) return 'Short Duration';
      if (n.includes('corporate bond') || n.includes('credit risk')) return 'Corporate Bond';
      if (n.includes('ultra short') || n.includes('low duration')) return 'Ultra Short/Low Duration';
      if (n.includes('bond') || n.includes('debt') || n.includes('income') || n.includes('fixed')) return 'Debt';
      if (n.includes('savings') || n.includes('regular savings')) return 'Savings';
      if (n.includes('gold') || n.includes('commodity')) return 'Gold/Commodity';
      return 'Other';
    }

    function setStep(n) {
      for (let i = 1; i <= 4; i++) {
        const el = qs('s' + i); if (!el) continue;
        el.className = 'step' + (i < n ? ' done' : i === n ? ' active' : '');
      }
    }

    function setProg(pct, label) {
      qs('pf').style.width = pct + '%';
      qs('prog-pct').textContent = Math.round(pct) + '%';
      if (label) qs('prog-step').textContent = label;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function showErr(msg) {
      const e = qs('err-box');
      e.textContent = '⚠️ ' + msg;
      e.style.display = 'block';
    }

    function hideErr() { qs('err-box').style.display = 'none'; }

    // FILE → BASE64
    function toBase64(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.substring(r.result.indexOf(',') + 1));
        r.onerror = () => reject(new Error('Could not read file'));
        r.readAsDataURL(file);
      });
    }


    // GEMINI API CALL — proxied through our own backend (server/src/routes/portfolioReview.js)
    // so the API key never reaches the browser. Same request/response shape
    // the tool always used, just server-side now.
    async function callGeminiAPI(b64, filename) {
      return api.post('/portfolio-review/analyze', { b64, filename });
    }

    // MAIN HANDLER
    let currentData = null;

    async function handleFile(file) {
      if (!file) return;
      // Chart.js is now bundled and set on window synchronously, so this is
      // effectively immediate — but keep a BOUNDED wait (never an infinite
      // loop) so that if it's ever somehow missing, the user gets a clear
      // error instead of a silent forever-hang ("no data after upload").
      for (let i = 0; i < 100 && !window.Chart; i++) { await sleep(50); }
      if (!window.Chart) { showErr('Charts library failed to load. Please refresh and try again.'); return; }
      hideErr();
      qs('pw').style.display = 'block';
      qs('steps-el').style.display = 'block';
      setProg(0, 'Starting…'); setStep(1);

      let pct = 0;
      const ticker = setInterval(() => { if (pct < 78) { pct += 0.5; setProg(Math.min(pct, 78)); } }, 150);

      try {
        setStep(1); setProg(5, 'Reading PDF…');
        const b64 = await toBase64(file);
        setProg(20, 'File loaded ✓');

        setStep(2); setProg(25, 'Sending to AI for analysis…');
        const portfolio = await callGeminiAPI(b64, file.name);
        setProg(82, 'AI analysis complete ✓');

        setStep(3); setProg(88, 'Processing holdings & SIP data…');
        if (!portfolio?.members?.length) throw new Error('No data returned from AI. Please try again.');
        await sleep(400);

        setStep(4); setProg(96, 'Building dashboard…');
        clearInterval(ticker);
        setProg(100, 'Complete!');
        await sleep(500);

        qs('pw').style.display = 'none';
        qs('steps-el').style.display = 'none';
        buildDashboard(portfolio);

      } catch (err) {
        clearInterval(ticker);
        console.error(err);
        qs('pw').style.display = 'none';
        qs('steps-el').style.display = 'none';
        showErr(err.message || 'Something went wrong. Please try uploading again.');
        setProg(0, '');
      }
    }

    // DASHBOARD BUILD
    function buildDashboard(data) {
      currentData = data;
      
      function toTitleCase(str) {
        if (!str) return '';
        if (str.toLowerCase() === 'all members') return 'All Members';
        return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      
      qs('p-title').textContent = toTitleCase(data.title || 'Portfolio Dashboard');
      qs('p-meta').textContent = data.meta || '';

      // Find earliest investment start date across all holdings
      let earliest = null;
      (data.members || []).forEach(m => {
        (m.holdings || []).forEach(h => {
          if (h.startDate) {
            const d = new Date(h.startDate);
            if (!earliest || d < earliest) earliest = d;
          }
        });
      });
      // Also check top-level startDate if AI provides it
      if (data.startDate) {
        const d = new Date(data.startDate);
        if (!earliest || d < earliest) earliest = d;
      }

      const startBadge = earliest
        ? `<span style="font-size:.7rem;background:rgba(201,168,76,.15);color:#8a6f1e;padding:3px 10px;border-radius:20px;font-family:'DM Mono',monospace;margin-left:.8rem;font-weight:600">📅 Since ${earliest.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>`
        : (data.investmentSince
          ? `<span style="font-size:.7rem;background:rgba(201,168,76,.15);color:#8a6f1e;padding:3px 10px;border-radius:20px;font-family:'DM Mono',monospace;margin-left:.8rem;font-weight:600">📅 Since ${data.investmentSince}</span>`
          : '');

      const te = qs('tabs-el'); te.innerHTML = '';
      data.members.forEach((m, i) => {
        const t = document.createElement('div');
        t.className = 'tab' + (i === 0 ? ' on' : '');
        t.innerHTML = `<div class="av">${m.initials || '?'}</div>${toTitleCase(m.name)}${i === 0 ? startBadge : ''}`;
        t.onclick = () => switchMember(i);
        te.appendChild(t);
      });

      switchMember(0);
      qs('upload-page').style.display = 'none';
      qs('dash-page').style.display = 'block';
      qs('dash-page').classList.add('fadein');
      // Show print button
      qs('print-btn-wrap').style.display = 'inline-flex';
      qs('save-btn-wrap').style.display = 'inline-flex';
    }

    function switchMember(idx) {
      const m = currentData.members[idx];
      const isAll = idx === 0;
      document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('on', i === idx));
      renderKPI(m);
      renderCharts(m);
      renderTable(m);
      renderSidebar(m, isAll);
      renderConsolidated(m, isAll);
    }

    function renderKPI(m) {
      const s = m.summary || {};
      const gain = s.gain ?? ((s.current || 0) - (s.invested || 0));
      const gainPct = s.gainPct || 0;
      // For All Members, compute sipTotal from sipSummary (3rd month column from PDF)
      const isAllMember = (m.name || '').toLowerCase().includes('all');
      let computedSipTotal = s.sipTotal || 0;
      if (isAllMember && currentData.sipSummary && currentData.sipSummary.length > 0) {
        computedSipTotal = currentData.sipSummary.reduce((sum, s) => sum + (s.amount || 0), 0);
      }
      let sipL = '—';
      if (computedSipTotal) {
        if (computedSipTotal >= 1e7) sipL = (computedSipTotal / 1e7).toFixed(2) + ' Cr';
        else if (computedSipTotal >= 1e5) sipL = (computedSipTotal / 1e5).toFixed(2).replace(/\.?0+$/, '') + 'L';
        else if (computedSipTotal >= 1e3) sipL = (computedSipTotal / 1e3).toFixed(computedSipTotal % 1e3 === 0 ? 0 : 1) + 'K';
        else sipL = computedSipTotal.toString();
      }
      const sipSub = computedSipTotal ? ((m.sips || []).length + ' mandates · 3rd Month') : 'No active SIP';
      qs('kpi-row').innerHTML =
        kpiCard(0, 'Total Invested', fmt(s.invested), (m.holdings || []).length + ' schemes', 'neu') +
        kpiCard(1, 'Current Value', fmt(s.current), (gainPct >= 0 ? '▲ ' : '▼ ') + Math.abs(gainPct).toFixed(2) + '%', gainPct >= 0 ? 'up' : 'dn') +
        kpiCard(2, 'Total Gain / Loss', `<span style="color:${gain >= 0 ? 'var(--green-l)' : 'var(--coral)'}">${gain >= 0 ? '+' : ''}${fmt(gain)}</span>`, gain >= 0 ? 'Profit' : 'Loss', gain >= 0 ? 'up' : 'dn') +
        kpiCard(3, 'Monthly SIP', computedSipTotal ? '₹' + sipL : '₹—', sipSub, 'neu') +
        kpiCard(4, 'XIRR / CAGR', `<span style="color:${(s.xirr || 0) >= 0 ? 'var(--green-l)' : 'var(--coral)'}">${(s.xirr || 0).toFixed(2)}%</span>`, 'From MF Allocation Total', 'neu');
    }

    function kpiCard(c, label, val, sub, cls) {
      return `<div class="kpi c${c}"><div class="kpi-lbl">${label}</div><div class="kpi-val">${val}</div><div class="kpi-sub ${cls}">${sub}</div></div>`;
    }

    const PAL = ['#1a5c4a', '#3d7abf', '#6b4fa0', '#c9a84c', '#e05c45', '#2d8a6e', '#88b04b', '#e8912a', '#d4845a', '#5c9bd6'];
    function killChart(k) { if (charts[k]) { charts[k].destroy(); charts[k] = null; } }

    function renderCharts(m) {
      killChart('ca'); killChart('cc'); killChart('cb');

      // Asset Class Mix — always 3 categories: Equity, Debt, Gold
      const rawAm = m.assetMix || {};
      let eqPct = 0, dtPct = 0, goldPct = 0;
      Object.keys(rawAm).forEach(k => {
        const v = rawAm[k] || 0;
        const kl = k.toLowerCase();
        if (kl.includes('gold')) goldPct += v;
        else if (kl.includes('debt') || kl.includes('liquid') || kl.includes('arbitrage')) dtPct += v;
        else eqPct += v; // equity, hybrid, balanced, other all go to equity
      });
      // If AI already gave 3-key format use directly
      if (rawAm['Equity'] !== undefined && rawAm['Debt'] !== undefined) {
        eqPct = rawAm['Equity'] || 0;
        dtPct = rawAm['Debt'] || 0;
        goldPct = rawAm['Gold'] || 0;
      }
      
      // Fallback: Compute from holdings if assetMix wasn't provided
      if (eqPct === 0 && dtPct === 0 && goldPct === 0 && m.holdings && m.holdings.length > 0) {
        let totalVal = 0, e = 0, d = 0, g = 0;
        m.holdings.forEach(h => {
           let val = h.current || 0;
           totalVal += val;
           const cat = (h.cat || '').toLowerCase();
           const name = (h.name || '').toLowerCase();
           if (name.includes('gold') || cat.includes('gold') || h.badge === 'go' || h.badge === 'co') {
              g += val;
           } else if (name.includes('debt') || name.includes('liquid') || name.includes('arbitrage') || cat.includes('debt') || cat.includes('liquid') || h.badge === 'dt') {
              d += val;
           } else {
              e += val;
           }
        });
        if (totalVal > 0) {
           eqPct = parseFloat(((e / totalVal) * 100).toFixed(1));
           dtPct = parseFloat(((d / totalVal) * 100).toFixed(1));
           goldPct = parseFloat(((g / totalVal) * 100).toFixed(1));
        }
      }
      const amLabels = [], amData = [], amColors = [];
      if (eqPct > 0) { amLabels.push('Equity'); amData.push(parseFloat(eqPct.toFixed(1))); amColors.push('#2d8a6e'); }
      if (dtPct > 0) { amLabels.push('Debt'); amData.push(parseFloat(dtPct.toFixed(1))); amColors.push('#3d7abf'); }
      if (goldPct > 0) { amLabels.push('Gold'); amData.push(parseFloat(goldPct.toFixed(1))); amColors.push('#c9a84c'); }

      charts.ca = new Chart(qs('ca'), {
        type: 'doughnut',
        data: { labels: amLabels, datasets: [{ data: amData, backgroundColor: amColors, borderWidth: 2, borderColor: '#fff', hoverOffset: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 10 }, padding: 8, boxWidth: 9, color: '#0f1117' } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw}%` } } } }
      });

      // Category Breakdown — use subCategories from PDF's "Mutual Fund Allocation by Sub Category" table
      const subCatData = (currentData.subCategories || []).filter(sc => (sc.allocation || 0) > 0);
      let ccLabels = [], ccData = [];
      if (subCatData.length > 0) {
        ccLabels = subCatData.map(sc => sc.cat);
        ccData = subCatData.map(sc => parseFloat((sc.allocation || 0).toFixed(2)));
      } else {
        // fallback to categories field if subCategories not available
        const cat = m.categories || {}, cl = Object.keys(cat).filter(k => cat[k] > 0);
        ccLabels = cl; ccData = cl.map(k => cat[k]);
      }
      
      // Secondary Fallback: If both are empty, compute from holdings
      if (ccLabels.length === 0 && m.holdings && m.holdings.length > 0) {
        let totalVal = 0;
        const catMap = {};
        m.holdings.forEach(h => {
           let val = h.current || 0;
           totalVal += val;
           let c = h.cat || 'Other';
           if (!c || c === '—') c = 'Other';
           if (!catMap[c]) catMap[c] = 0;
           catMap[c] += val;
        });
        if (totalVal > 0) {
           ccLabels = Object.keys(catMap);
           ccData = ccLabels.map(k => parseFloat(((catMap[k] / totalVal) * 100).toFixed(1)));
        }
      }
      charts.cc = new Chart(qs('cc'), {
        type: 'doughnut',
        data: { labels: ccLabels, datasets: [{ data: ccData, backgroundColor: PAL, borderWidth: 2, borderColor: '#fff', hoverOffset: 5 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: {
            legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 9 }, padding: 6, boxWidth: 9, color: '#0f1117' } },
            tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw}%` } }
          }
        }
      });

      const top = (m.holdings || []).slice().sort((a, b) => (b.current || 0) - (a.current || 0)).slice(0, 8);
      const bc = top.map(h => h.badge === 'eq' ? '#2d8a6e' : h.badge === 'dt' ? '#3d7abf' : h.badge === 'hy' ? '#6b4fa0' : '#c9a84c');
      charts.cb = new Chart(qs('cb'), {
        type: 'bar',
        data: {
          labels: top.map(h => (h.name || '').replace(/ Reg \(G\)/g, '').replace(/ \(G\)/g, '').substring(0, 28)),
          datasets: [
            { label: 'Invested', data: top.map(h => h.invested || 0), backgroundColor: 'rgba(15,17,23,0.09)', borderRadius: 4 },
            { label: 'Current', data: top.map(h => h.current || 0), backgroundColor: bc, borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { font: { family: 'DM Sans', size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
          scales: { x: { ticks: { font: { family: 'DM Sans', size: 8 }, maxRotation: 28 }, grid: { display: false } }, y: { ticks: { callback: v => fmt(v), font: { family: 'DM Mono', size: 9 } }, grid: { color: 'rgba(15,17,23,0.05)' } } }
        }
      });

      drawGauge(m.risk || { score: 5, label: 'Moderate' });
    }

    function drawGauge(risk) {
      const cv = qs('gauge'), ctx = cv.getContext('2d'), cx = cv.width / 2, cy = cv.height - 5, r = 88;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0, false); ctx.lineWidth = 16; ctx.strokeStyle = '#e8e5df'; ctx.lineCap = 'round'; ctx.stroke();
      [{ from: 0, to: .3, c: '#2d8a6e' }, { from: .3, to: .55, c: '#c9a84c' }, { from: .55, to: .8, c: '#e8912a' }, { from: .8, to: 1, c: '#e05c45' }].forEach(s => {
        ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI + s.from * Math.PI, Math.PI + s.to * Math.PI, false);
        ctx.lineWidth = 16; ctx.strokeStyle = s.c; ctx.lineCap = 'butt'; ctx.stroke();
      });
      const score = Math.min(10, Math.max(0, risk.score || 5)), ang = Math.PI + (score / 10) * Math.PI;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 70 * Math.cos(ang), cy + 70 * Math.sin(ang));
      ctx.strokeStyle = '#0f1117'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = '#0f1117'; ctx.fill();
      qs('rs-val').textContent = score.toFixed(1);
      qs('rs-lbl').textContent = risk.label || '—';
    }

    function renderTable(m) {
      const rawHoldings = m.holdings || [];
      const grouped = {};
      
      rawHoldings.forEach(h => {
        const rawName = (h.name || 'Unknown').trim();
        const cleanName = rawName.replace(/\s*\[.*?\]\s*$/, '').trim();
        const key = rawName.toLowerCase();
        
        if (!grouped[key]) {
          grouped[key] = { ...h, name: cleanName };
        } else {
          const cur1 = grouped[key].current || 0;
          const cur2 = h.current || 0;
          const totCur = cur1 + cur2;
          
          let newXirr = 0;
          if (totCur > 0) {
            newXirr = ((grouped[key].xirr || 0) * (cur1 / totCur)) + ((h.xirr || 0) * (cur2 / totCur));
          }
          
          grouped[key].invested = (grouped[key].invested || 0) + (h.invested || 0);
          grouped[key].current = totCur;
          grouped[key].xirr = newXirr;
          
          if (h.holder && grouped[key].holder && !grouped[key].holder.includes(h.holder)) {
            grouped[key].holder += ', ' + h.holder;
          } else if (h.holder && !grouped[key].holder) {
            grouped[key].holder = h.holder;
          }
        }
      });
      
      const holdings = Object.values(grouped);
      holdings.sort((a, b) => (b.current || 0) - (a.current || 0));
      
      const total = holdings.reduce((s, h) => s + (h.current || 0), 0) || 1;
      
      qs('t-body').innerHTML = holdings.map(h => {
        const g = (h.current || 0) - (h.invested || 0);
        const gp = h.invested ? (g / h.invested * 100).toFixed(1) : '0.0';
        const al = ((h.current || 0) / total * 100).toFixed(1);
        const col = h.badge === 'eq' ? '#2d8a6e' : h.badge === 'dt' ? '#3d7abf' : h.badge === 'hy' ? '#6b4fa0' : '#c9a84c';
        const xirr = h.xirr || 0;
        return `<tr>
      <td><div class="fn">${h.name || '—'}</div>${h.holder ? `<div class="fc">Holder: ${h.holder}</div>` : ''}</td>
      <td><span class="cbadge ${h.badge || 'eq'}">${h.cat || '—'}</span></td>
      <td style="font-family:'DM Sans',sans-serif;font-weight:500;font-size:.82rem;color:var(--ink)">${fmt(h.invested)}</td>
      <td style="font-family:'DM Sans',sans-serif;font-weight:600;font-size:.82rem;color:var(--ink)">${fmt(h.current)}</td>
      <td class="${g >= 0 ? 'rp' : 'rn'}">${g >= 0 ? '+' : ''}${gp}%</td>
      <td><div class="ab"><div class="abar"><div class="afill" style="width:${al}%;background:${col}"></div></div><span style="font-family:'DM Sans',sans-serif;font-size:.72rem;color:rgba(15,17,23,.45)">${al}%</span></div></td>
      <td class="${xirr >= 10 ? 'rp' : xirr >= 0 ? 'neu' : 'rn'}">${xirr.toFixed(2)}%</td>
    </tr>`;
      }).join('');
    }

    function renderSidebar(m, isAll) {
      // Hide SIP section in sidebar for All Members tab
      const sipSection = qs('sip-list');
      const sipTitle = sipSection ? sipSection.previousElementSibling : null;
      const sipDivider = sipTitle ? sipTitle.previousElementSibling : null;
      if (isAll) {
        if (sipSection) sipSection.style.display = 'none';
        if (sipTitle) sipTitle.style.display = 'none';
        if (sipDivider) sipDivider.style.display = 'none';
      } else {
        if (sipSection) sipSection.style.display = '';
        if (sipTitle) sipTitle.style.display = '';
        if (sipDivider) sipDivider.style.display = '';
      }
      const sips = m.sips || [];
      qs('sip-list').innerHTML = sips.length
        ? sips.map(s => `<div class="sip-row"><div><div class="sip-nm">${s.name}</div><div class="sip-dt">Every month · ${s.date || '—'}</div></div><div class="sip-amt">₹${(s.amount || 0).toLocaleString('en-IN')}</div></div>`).join('')
        : '<div style="font-size:.8rem;color:rgba(15,17,23,.4);padding:.5rem 0">No active SIP found</div>';

      // Goal tracker removed — replaced by scheme search

      const icons = { warn: '⚠️', info: 'ℹ️', ok: '✅' };
      const typeLabels = { warn: 'Warning', info: 'Insight', ok: 'Good' };
      const typeColors = { warn: '#e05c45', info: '#3b82f6', ok: '#2d8a6e' };
      // Compute smart advisory alerts
      const smartAlerts = computeAdvisoryAlerts(m, isAll);
      const allAlerts = [...smartAlerts, ...(m.alerts || [])];

      // Update count badge
      const countEl = qs('alert-count');
      if (countEl) {
        if (allAlerts.length > 0) {
          countEl.textContent = allAlerts.length;
          countEl.style.display = 'inline-block';
          // Color badge based on most severe alert
          const hasWarn = allAlerts.some(a => a.type === 'warn');
          countEl.style.background = hasWarn ? '#e05c45' : 'var(--blue)';
        } else {
          countEl.style.display = 'none';
        }
      }

      qs('alert-list').innerHTML = allAlerts.length
        ? allAlerts.map((a, i) => `<div class="alert-box-wrap"><div class="alert-box ${a.type}"><span style="flex-shrink:0;font-size:1.1rem">${icons[a.type] || '•'}</span><div style="flex:1"><div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${typeColors[a.type] || '#666'};margin-bottom:3px">${typeLabels[a.type] || 'Note'}</div><div class="alert-editable" contenteditable="true" data-alert-idx="${i}">${a.text}</div><div class="alert-edit-hint">✏️ Click to edit this note</div></div></div></div>`).join('')
        : '<div style="font-size:.8rem;color:rgba(15,17,23,.4);padding:.5rem 0">No alerts</div>';

      // Also update print advisory section (will be re-synced on print)
      qs('print-alert-list').innerHTML = allAlerts.length
        ? allAlerts.map(a => `<div class="alert-box-wrap"><div class="alert-box ${a.type}" style="margin-bottom:.5rem"><span style="flex-shrink:0;font-size:1.1rem">${icons[a.type] || '•'}</span><div style="flex:1"><div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${typeColors[a.type] || '#666'};margin-bottom:3px">${typeLabels[a.type] || 'Note'}</div><span>${a.text}</span></div></div></div>`).join('')
        : '<div style="font-size:.8rem;color:rgba(15,17,23,.4);padding:.5rem 0">No alerts</div>';
    }

    function computeAdvisoryAlerts(m, isAll) {
      const alerts = [];
      const holdings = m.holdings || [];
      const totalCurrent = holdings.reduce((s, h) => s + (h.current || 0), 0) || 1;
      const subCats = currentData.subCategories || [];

      // ── DYNAMIC ASSET & CATEGORY CALCULATION ──
      // Dynamic arrays ensure correctness for individual applicants and combined totals alike
      const memberAmcMap = {};
      let midCapPct = 0;
      let smallCapPct = 0;
      let flexiCapPct = 0;
      let largeCapPct = 0;
      let largeMidCapPct = 0;
      let multiAssetPct = 0;
      let goldPct = 0;
      let eqPct = 0;
      let dtPct = 0;

      holdings.forEach(h => {
        const val = h.current || 0;
        const al = (val / totalCurrent) * 100;
        const c = (h.cat || '').toLowerCase();
        const n = (h.name || '').toLowerCase();
        const amc = detectAMC(h.name);

        // AMC map summation
        if (!memberAmcMap[amc]) memberAmcMap[amc] = 0;
        memberAmcMap[amc] += val;

        // Asset Class Mix logic (Equity, Debt, Gold)
        if (n.includes('gold') || c.includes('gold') || h.badge === 'go' || h.badge === 'co') {
          goldPct += al;
        } else if (n.includes('debt') || n.includes('liquid') || n.includes('arbitrage') || c.includes('debt') || c.includes('liquid') || h.badge === 'dt' || h.badge === 'lq') {
          dtPct += al;
        } else {
          eqPct += al; // equity, hybrid, balanced, other go to equity
        }

        // Subcategory allocation breakdown
        if (c.includes('large & mid') || c.includes('large and mid') || c.includes('large & midcap')) {
          largeMidCapPct += al;
        } else if (c.includes('mid cap') || c.includes('midcap')) {
          midCapPct += al;
        } else if (c.includes('small cap') || c.includes('smallcap')) {
          smallCapPct += al;
        } else if (c.includes('flexi cap') || c.includes('flexicap') || c.includes('flexi-cap')) {
          flexiCapPct += al;
        } else if (c.includes('large cap') || c.includes('largecap')) {
          largeCapPct += al;
        } else if (c.includes('multi asset') || c.includes('multi-asset') || n.includes('multi asset') || n.includes('multi-asset')) {
          multiAssetPct += al;
        }
      });

      const memberAmcAllocations = Object.entries(memberAmcMap).map(([amc, val]) => ({
        amc,
        allocation: (val / totalCurrent) * 100
      })).sort((a, b) => b.allocation - a.allocation);

      // Overwrite with PDF data if All Members tab contains verified tables
      if (isAll && subCats && subCats.length > 0) {
        subCats.forEach(sc => {
          const c = (sc.cat || '').toLowerCase();
          const pct = sc.allocation || 0;
          if (c.includes('large & mid') || c.includes('large and mid') || c.includes('large & midcap')) {
            largeMidCapPct = pct;
          } else if (c.includes('mid cap') || c.includes('midcap')) {
            midCapPct = pct;
          } else if (c.includes('small cap') || c.includes('smallcap')) {
            smallCapPct = pct;
          } else if (c.includes('flexi cap') || c.includes('flexicap') || c.includes('flexi-cap')) {
            flexiCapPct = pct;
          } else if (c.includes('large cap') || c.includes('largecap')) {
            largeCapPct = pct;
          } else if (c.includes('multi asset') || c.includes('multi-asset')) {
            multiAssetPct = pct;
          }
        });
      }

      const rawAm = m.assetMix || {};
      if (isAll && rawAm['Equity'] !== undefined) {
        eqPct = rawAm['Equity'] || 0;
        dtPct = rawAm['Debt'] || 0;
        goldPct = rawAm['Gold'] || 0;
      }

      // ── RULE 1: AMC concentration > 20% ──
      // Dynamic shift suggestions are formulated by querying existing lower-allocated AMCs in client's portfolio
      const activeAmcs = isAll ? (currentData.amcAllocation || []) : memberAmcAllocations;
      activeAmcs.forEach(a => {
        const allocVal = a.allocation || 0;
        if (allocVal > 20) {
          const underAllocated = activeAmcs.filter(x => x.amc !== a.amc && x.amc !== 'Other' && (x.allocation || 0) < 10).slice(0, 3).map(x => x.amc);
          let shiftText = "";
          if (underAllocated.length > 0) {
            shiftText = ` Consider shifting the excess allocation to other under-allocated AMCs in the portfolio such as ${underAllocated.join(', ')} to reduce concentration risk.`;
          } else {
            shiftText = ` Consider shifting the excess allocation to leading Indian AMCs with lower exposure (e.g., SBI Mutual Fund, HDFC Mutual Fund, or ICICI Prudential MF) to improve diversification.`;
          }
          alerts.push({ type: 'warn', text: `⚠️ AMC Concentration Warning: ${a.amc} accounts for ${allocVal.toFixed(1)}% of the portfolio, which exceeds the safe threshold of 20%.${shiftText}` });
        }
      });

      // ── RULE 2: Thematic, Sectoral, or ELSS schemes ──
      const thematicFunds = [];
      const elssFunds = [];
      holdings.forEach(h => {
        const name = (h.name || '').toLowerCase();
        const cat = (h.cat || '').toLowerCase();
        const cleanName = h.name.replace(/ Reg \(G\)|\(G\)/g, '');
        if (name.includes('elss') || name.includes('tax saver') || name.includes('tax saving') || cat.includes('elss') || cat.includes('tax saver') || cat.includes('tax saving')) {
          elssFunds.push(cleanName);
        } else if (['thematic', 'sector', 'sectoral', 'banking', 'pharma', 'infra', 'infrastructure', 'technology', 'tech', 'consumption', 'psu', 'energy', 'defence', 'manufacturing', 'healthcare', 'auto', 'fmcg', 'service'].some(k => name.includes(k) || cat.includes(k))) {
          thematicFunds.push(cleanName);
        }
      });
      if (thematicFunds.length > 0) {
        alerts.push({ type: 'info', text: `📌 Thematic/Sectoral Schemes: We detected thematic/sectoral funds (${thematicFunds.join(', ')}). These funds carry high sector-specific concentration risk. Ensure their combined exposure is limited to 10-15% of the total portfolio.` });
      }
      if (elssFunds.length > 0) {
        alerts.push({ type: 'info', text: `📌 ELSS (Tax Saving) Schemes: We detected tax saver funds (${elssFunds.join(', ')}). Remember that ELSS investments have a mandatory 3-year lock-in period from the date of investment.` });
      }

      // ── RULE 3: Equity > 80% and Debt > 20% ──
      if (eqPct > 80) {
        alerts.push({ type: 'warn', text: `⚠️ High Equity Allocation: Equity is ${eqPct.toFixed(1)}% of the portfolio, which is above the 80% threshold. This high equity exposure increases volatility. Consider rebalancing some profits into debt or gold to cushion against market corrections.` });
      }
      if (dtPct > 20) {
        alerts.push({ type: 'info', text: `ℹ️ Elevated Debt Allocation: Debt is ${dtPct.toFixed(1)}% of the portfolio, which is above the 20% threshold. While debt provides safety, excessive debt for a long-term goal might lower overall portfolio returns. Ensure this matches the client's asset allocation strategy.` });
      }

      // ── RULE 4: Single scheme > 10% allocation ──
      holdings.forEach(h => {
        const al = (h.current || 0) / totalCurrent * 100;
        if (al > 10) {
          alerts.push({ type: 'warn', text: `⚠️ Scheme Concentration: ${(h.name || '').replace(/ Reg \(G\)|\(G\)/g, '')} accounts for ${al.toFixed(1)}% of the total portfolio, exceeding the safe limit of 10%. Consider trimming this scheme and distributing the funds to reduce single-fund risk.` });
        }
      });

      // ── RULE 5: Category allocation vs ideal ranges ──
      // Mid cap ideal range: 25% to 30%
      if (midCapPct > 0) {
        if (midCapPct < 25) {
          alerts.push({ type: 'info', text: `📊 Category Deviation: Mid Cap is at ${midCapPct.toFixed(1)}% — below the ideal range of 25%–30%. Consider increasing allocation to capture mid-sized company growth.` });
        } else if (midCapPct > 30) {
          alerts.push({ type: 'warn', text: `⚠️ Category Over-exposure: Mid Cap is at ${midCapPct.toFixed(1)}% — above the ideal range of 25%–30%. Consider booking profits and rebalancing.` });
        }
      } else {
        alerts.push({ type: 'info', text: `📊 Category Deviation: Mid Cap is at 0.0% — below the ideal range of 25%–30%. Consider adding mid-cap funds to capture mid-sized company growth.` });
      }

      // Small cap ideal range: 15% to 20%
      if (smallCapPct > 0) {
        if (smallCapPct < 15) {
          alerts.push({ type: 'info', text: `📊 Category Deviation: Small Cap is at ${smallCapPct.toFixed(1)}% — below the ideal range of 15%–20%. Consider increasing allocation if risk profile permits high volatility.` });
        } else if (smallCapPct > 20) {
          alerts.push({ type: 'warn', text: `⚠️ Category Over-exposure: Small Cap is at ${smallCapPct.toFixed(1)}% — above the ideal range of 15%–20%. Small-cap stocks are highly volatile; consider trimming this exposure.` });
        }
      } else {
        alerts.push({ type: 'info', text: `📊 Category Deviation: Small Cap is at 0.0% — below the ideal range of 15%–20%. Consider adding small-cap funds if risk profile permits high volatility.` });
      }

      // Flexi cap ideal range: 20% to 25%
      if (flexiCapPct > 0) {
        if (flexiCapPct < 20) {
          alerts.push({ type: 'info', text: `📊 Category Deviation: Flexi Cap is at ${flexiCapPct.toFixed(1)}% — below the ideal range of 20%–25%. Consider adding Flexi Cap funds for dynamic go-anywhere market cap exposure.` });
        } else if (flexiCapPct > 25) {
          alerts.push({ type: 'warn', text: `⚠️ Category Over-exposure: Flexi Cap is at ${flexiCapPct.toFixed(1)}% — above the ideal range of 20%–25%.` });
        }
      } else {
        alerts.push({ type: 'info', text: `📊 Category Deviation: Flexi Cap is at 0.0% — below the ideal range of 20%–25%. Consider adding Flexi Cap funds for dynamic market cap exposure.` });
      }

      // Large cap and Large & Mid cap (combined) ideal range: 30% to 35%
      const combinedLargePct = largeCapPct + largeMidCapPct;
      if (combinedLargePct > 0) {
        if (combinedLargePct < 30) {
          alerts.push({ type: 'info', text: `📊 Category Deviation: Large Cap + Large & Mid Cap combined is ${combinedLargePct.toFixed(1)}% — below the ideal range of 30%–35%. Consider increasing allocation to add stability and steady growth.` });
        } else if (combinedLargePct > 35) {
          alerts.push({ type: 'warn', text: `⚠️ Category Over-exposure: Large Cap + Large & Mid Cap combined is ${combinedLargePct.toFixed(1)}% — above the ideal range of 30%–35%. Portfolio might be overly conservative; consider reallocating to mid or small caps for growth.` });
        }
      } else {
        alerts.push({ type: 'info', text: `📊 Category Deviation: Large Cap + Large & Mid Cap combined is at 0.0% — below the ideal range of 30%–35%. Consider adding large-cap exposure to add stability and steady growth.` });
      }

      // Multi asset ideal allocation: 10% (tolerance range 8% to 12% is checked)
      if (multiAssetPct > 0) {
        if (multiAssetPct < 8 || multiAssetPct > 12) {
          alerts.push({ type: 'info', text: `📊 Category Deviation: Multi Asset is at ${multiAssetPct.toFixed(1)}% — deviating from the ideal allocation of 10%. Multi-asset funds provide excellent asset diversification.` });
        }
      } else {
        alerts.push({ type: 'info', text: `📊 Category Deviation: Multi Asset is at 0.0% — below the ideal allocation of 10%. Consider adding multi-asset funds for stable asset diversification.` });
      }

      // ── RULE 6: No Gold in portfolio ──
      if (goldPct === 0) {
        alerts.push({ type: 'info', text: `💡 Gold Missing: No gold allocation found in this portfolio. Consider adding 5–10% in Gold ETF or Sovereign Gold Bonds for inflation hedging and diversification.` });
      }

      // ── TAX OPTIMIZATION: IDCW schemes (dividend option) ──
      const idcwFunds = holdings.filter(h => (h.name || '').toUpperCase().includes('IDCW'));
      if (idcwFunds.length > 0) {
        alerts.push({ type: 'warn', text: `⚠️ IDCW Schemes Detected: ${idcwFunds.map(f => f.name.replace(/ Reg \(G\)/g, '').replace(/\(G\)/g, '')).join(', ')} — IDCW (dividend) option creates tax liability on payouts. Consider switching to Growth option for better long-term compounding.` });
      }

      // ── CONFLICTING/UNWANTED SCHEMES ──
      if (unwantedSchemes && unwantedSchemes.length > 0) {
        unwantedSchemes.forEach(unwanted => {
          const matched = holdings.filter(h =>
            (h.name || '').toLowerCase().includes(unwanted.toLowerCase())
          );
          if (matched.length > 0) {
            const names = matched.map(h => h.name.replace(/ Reg \(G\)/g, '').replace(/\(G\)/g, '')).join(', ');
            alerts.push({ type: 'warn', text: `🚫 Unwanted Scheme Alert: "${unwanted}" is present in this portfolio (${names}). Consider switching to a better alternative.` });
          }
        });
      }

      return alerts;
    }

    // CONSOLIDATED OVERVIEW (All Members only)
    function renderConsolidated(m, isAll) {
      const wrap = qs('consol-overview');
      if (!isAll) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';

      const COLORS = ['#1a5c4a', '#3d7abf', '#6b4fa0', '#c9a84c', '#e05c45', '#2d8a6e', '#88b04b', '#e8912a', '#d4845a', '#5c9bd6', '#b04f6f', '#4f8ab0', '#2196f3', '#9c27b0', '#ff5722'];

      // ── SIP: use sipSummary (3rd month column from PDF) for consolidated view ──
      const sipSummaryData = (currentData.sipSummary || []).filter(s => (s.amount || 0) > 0);
      // Merge duplicates by fund name
      const sipMap = {};
      sipSummaryData.forEach(s => {
        const key = (s.name || '').trim().toLowerCase()
          .replace(/\s+reg\s*/gi, '').replace(/\s*\(g\)\s*/gi, '').replace(/\s+/g, ' ').trim();
        if (!sipMap[key]) sipMap[key] = { name: (s.name || '').trim(), amount: 0 };
        sipMap[key].amount += (s.amount || 0);
      });
      const sipRows = Object.values(sipMap).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);
      const sipTotal = sipRows.reduce((s, r) => s + r.amount, 0);

      // ── SIP TABLE HTML ──
      let sipBody = sipRows.length === 0
        ? `<tr><td colspan="3" style="text-align:center;padding:2rem;color:rgba(15,17,23,.35);font-size:.82rem">No active SIP found</td></tr>`
        : sipRows.map((r, i) => {
          const pct = sipTotal > 0 ? (r.amount / sipTotal * 100) : 0;
          const color = COLORS[i % COLORS.length];
          return `<tr style="border-bottom:1px solid rgba(15,17,23,.04)">
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
              <span style="font-weight:600;font-size:.82rem">${r.name}</span>
            </div>
          </td>
          <td style="padding:.65rem .85rem;text-align:right;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.82rem;color:var(--ink)">₹${r.amount.toLocaleString('en-IN')}</td>
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.4rem;justify-content:flex-end">
              <div style="width:60px;height:4px;background:rgba(15,17,23,.06);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${Math.min(pct, 100).toFixed(1)}%;background:${color};border-radius:4px"></div>
              </div>
              <span style="font-family:'DM Sans',sans-serif;font-weight:600;font-size:.72rem;color:rgba(15,17,23,.5);min-width:38px;text-align:right">${pct.toFixed(1)}%</span>
            </div>
          </td>
        </tr>`;
        }).join('');

      const sipFooter = sipRows.length > 0 ? `
    <tfoot>
      <tr style="background:rgba(26,92,74,.05);border-top:2px solid var(--border)">
        <td style="font-weight:700;font-size:.82rem;padding:.75rem .85rem">Total Monthly SIP</td>
        <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;color:var(--green-l);font-size:.85rem;padding:.75rem .85rem">₹${sipTotal.toLocaleString('en-IN')}</td>
        <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;padding:.75rem .85rem">100%</td>
      </tr>
    </tfoot>` : '';

      const sipSection = `
    <div class="consol-box">
      <div class="consol-hdr">📅 &nbsp;Consolidated SIP Details</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--cream)">
            <th style="text-align:left;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Fund Name</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Amount</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Allocation</th>
          </tr>
        </thead>
        <tbody>${sipBody}</tbody>
        ${sipFooter}
      </table>
    </div>`;

      // ── SUB-CATEGORY from subCategories field ──
      let catRows = (currentData.subCategories || []).filter(r => (r.allocation || 0) > 0);
      if (catRows.length === 0) {
        const catMap = {};
        let totalCur = 0;
        (currentData.members || []).forEach(m => {
          (m.holdings || []).forEach(h => {
            const cat = h.cat || detectCategory(h.name);
            if (!catMap[cat]) catMap[cat] = { cat, invested: 0, current: 0 };
            catMap[cat].invested += (h.invested || 0);
            catMap[cat].current += (h.current || 0);
            totalCur += (h.current || 0);
          });
        });
        catRows = Object.values(catMap).map(c => {
          c.allocation = totalCur > 0 ? (c.current / totalCur * 100) : 0;
          return c;
        });
      }
      catRows = catRows.sort((a, b) => (b.current || 0) - (a.current || 0));
      const catTotalInv = catRows.reduce((s, r) => s + (r.invested || 0), 0);
      const catTotalCur = catRows.reduce((s, r) => s + (r.current || 0), 0);

      let catBody = catRows.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:2rem;color:rgba(15,17,23,.35);font-size:.82rem">No sub-category data available</td></tr>`
        : catRows.map((r, i) => {
          const pct = (r.allocation || 0);
          const cagr = r.cagr || 0;
          const color = COLORS[i % COLORS.length];
          const gain = (r.current || 0) - (r.invested || 0);
          const gainPct = r.invested ? (gain / r.invested * 100) : 0;
          return `<tr style="border-bottom:1px solid rgba(15,17,23,.04)">
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
              <span style="font-weight:600;font-size:.82rem">${r.cat}</span>
            </div>
          </td>
          <td style="padding:.65rem .85rem;text-align:right;font-family:'DM Sans',sans-serif;font-weight:500;font-size:.82rem;color:var(--ink)">${fmt(r.invested)}</td>
          <td style="padding:.65rem .85rem;text-align:right;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.82rem;color:var(--ink)">${fmt(r.current)}</td>
          <td style="padding:.65rem .85rem;text-align:right;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.78rem;color:${gainPct >= 0 ? 'var(--green-l)' : 'var(--coral)'}">${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%</td>
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.4rem;justify-content:flex-end">
              <div style="width:60px;height:4px;background:rgba(15,17,23,.06);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${Math.min(pct, 100).toFixed(1)}%;background:${color};border-radius:4px"></div>
              </div>
              <span style="font-family:'DM Sans',sans-serif;font-weight:600;font-size:.72rem;color:rgba(15,17,23,.5);min-width:38px;text-align:right">${pct.toFixed(1)}%</span>
            </div>
          </td>
        </tr>`;
        }).join('');

      const catFooter = catRows.length > 0 ? `
    <tfoot>
      <tr style="background:rgba(26,92,74,.05)">
        <td style="font-weight:700;font-size:.82rem;padding:.75rem .85rem">Total</td>
        <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:600;padding:.75rem .85rem">${fmt(catTotalInv)}</td>
        <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;color:var(--green-l);padding:.75rem .85rem">${fmt(catTotalCur)}</td>
        <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;color:var(--green-l);padding:.75rem .85rem">
          ${catTotalInv > 0 ? (((catTotalCur - catTotalInv) / catTotalInv) * 100).toFixed(1) + '%' : '—'}
        </td>
        <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;padding:.75rem .85rem">100%</td>
      </tr>
    </tfoot>` : '';

      const catSection = `
    <div class="consol-box">
      <div class="consol-hdr">📊 &nbsp;Sub-Category Breakdown</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--cream)">
            <th style="text-align:left;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Sub-Category</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Invested</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Current</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Gain%</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Allocation</th>
          </tr>
        </thead>
        <tbody>${catBody}</tbody>
        ${catFooter}
      </table>
    </div>`;

      // detectAMC and detectCategory moved to global scope to support calling from computeAdvisoryAlerts.

      // ── SECTION 2: Category Wise SIP ──
      const catSipMap = {};
      sipRows.forEach(r => {
        const cat = detectCategory(r.name);
        if (!catSipMap[cat]) catSipMap[cat] = { cat, amount: 0 };
        catSipMap[cat].amount += r.amount;
      });
      const catSipRows = Object.values(catSipMap).sort((a, b) => b.amount - a.amount);

      const catSipBody = catSipRows.length === 0
        ? `<tr><td colspan="3" style="text-align:center;padding:2rem;color:rgba(15,17,23,.35);font-size:.82rem">No data</td></tr>`
        : catSipRows.map((r, i) => {
          const pct = sipTotal > 0 ? (r.amount / sipTotal * 100) : 0;
          const color = COLORS[i % COLORS.length];
          return `<tr style="border-bottom:1px solid rgba(15,17,23,.04)">
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
              <span style="font-weight:600;font-size:.82rem">${r.cat}</span>
            </div>
          </td>
          <td style="padding:.65rem .85rem;text-align:right;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.82rem;color:var(--ink)">₹${r.amount.toLocaleString('en-IN')}</td>
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.4rem;justify-content:flex-end">
              <div style="width:60px;height:4px;background:rgba(15,17,23,.06);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${Math.min(pct, 100).toFixed(1)}%;background:${color};border-radius:4px"></div>
              </div>
              <span style="font-family:'DM Sans',sans-serif;font-weight:600;font-size:.72rem;color:rgba(15,17,23,.5);min-width:38px;text-align:right">${pct.toFixed(1)}%</span>
            </div>
          </td>
        </tr>`;
        }).join('');

      const catSipSection = `
    <div class="consol-box" style="margin-top:1.2rem">
      <div class="consol-hdr">📂 &nbsp;Category Wise SIP Allocation</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--cream)">
            <th style="text-align:left;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Category</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Amount</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Allocation</th>
          </tr>
        </thead>
        <tbody>${catSipBody}</tbody>
        <tfoot>
          <tr style="background:rgba(26,92,74,.05);border-top:2px solid var(--border)">
            <td style="font-weight:700;font-size:.82rem;padding:.75rem .85rem">Total</td>
            <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;color:var(--green-l);padding:.75rem .85rem">₹${sipTotal.toLocaleString('en-IN')}</td>
            <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;padding:.75rem .85rem">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

      // ── SECTION 3: AMC Wise SIP ──
      const amcSipMap = {};
      sipRows.forEach(r => {
        const amc = detectAMC(r.name);
        if (!amcSipMap[amc]) amcSipMap[amc] = { amc, amount: 0 };
        amcSipMap[amc].amount += r.amount;
      });
      const amcSipRows = Object.values(amcSipMap).sort((a, b) => b.amount - a.amount);

      const amcSipBody = amcSipRows.length === 0
        ? `<tr><td colspan="3" style="text-align:center;padding:2rem;color:rgba(15,17,23,.35);font-size:.82rem">No data</td></tr>`
        : amcSipRows.map((r, i) => {
          const pct = sipTotal > 0 ? (r.amount / sipTotal * 100) : 0;
          const color = COLORS[i % COLORS.length];
          return `<tr style="border-bottom:1px solid rgba(15,17,23,.04)">
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
              <span style="font-weight:600;font-size:.82rem">${r.amc}</span>
            </div>
          </td>
          <td style="padding:.65rem .85rem;text-align:right;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.82rem;color:var(--ink)">₹${r.amount.toLocaleString('en-IN')}</td>
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.4rem;justify-content:flex-end">
              <div style="width:60px;height:4px;background:rgba(15,17,23,.06);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${Math.min(pct, 100).toFixed(1)}%;background:${color};border-radius:4px"></div>
              </div>
              <span style="font-family:'DM Sans',sans-serif;font-weight:600;font-size:.72rem;color:rgba(15,17,23,.5);min-width:38px;text-align:right">${pct.toFixed(1)}%</span>
            </div>
          </td>
        </tr>`;
        }).join('');

      const amcSipSection = `
    <div class="consol-box" style="margin-top:1.2rem">
      <div class="consol-hdr">🏦 &nbsp;AMC Wise SIP Allocation</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--cream)">
            <th style="text-align:left;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">AMC</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Amount</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Allocation</th>
          </tr>
        </thead>
        <tbody>${amcSipBody}</tbody>
        <tfoot>
          <tr style="background:rgba(26,92,74,.05);border-top:2px solid var(--border)">
            <td style="font-weight:700;font-size:.82rem;padding:.75rem .85rem">Total</td>
            <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;color:var(--green-l);padding:.75rem .85rem">₹${sipTotal.toLocaleString('en-IN')}</td>
            <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;padding:.75rem .85rem">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

      // ── AMC Wise Allocation from amcAllocation field ──
      let amcAllocRows = (currentData.amcAllocation || []).slice();
      if (amcAllocRows.length === 0) {
        const amcMap = {};
        let totalCur = 0;
        (currentData.members || []).forEach(m => {
          (m.holdings || []).forEach(h => {
            const amc = detectAMC(h.name);
            if (!amcMap[amc]) amcMap[amc] = { amc, invested: 0, current: 0 };
            amcMap[amc].invested += (h.invested || 0);
            amcMap[amc].current += (h.current || 0);
            totalCur += (h.current || 0);
          });
        });
        amcAllocRows = Object.values(amcMap).map(a => {
          a.allocation = totalCur > 0 ? (a.current / totalCur * 100) : 0;
          return a;
        });
      }
      amcAllocRows = amcAllocRows.sort((a, b) => (b.allocation || 0) - (a.allocation || 0));
      const amcAllocTotalInv = amcAllocRows.reduce((s, r) => s + (r.invested || 0), 0);
      const amcAllocTotalCur = amcAllocRows.reduce((s, r) => s + (r.current || 0), 0);

      const amcAllocBody = amcAllocRows.length === 0
        ? `<tr><td colspan="4" style="text-align:center;padding:2rem;color:rgba(15,17,23,.35);font-size:.82rem">No AMC data available</td></tr>`
        : amcAllocRows.map((r, i) => {
          const pct = (r.allocation || 0);
          const color = COLORS[i % COLORS.length];
          return `<tr style="border-bottom:1px solid rgba(15,17,23,.04)">
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
              <span style="font-weight:600;font-size:.82rem">${r.amc}</span>
            </div>
          </td>
          <td style="padding:.65rem .85rem;text-align:right;font-family:'DM Sans',sans-serif;font-weight:500;font-size:.82rem;color:var(--ink)">${fmt(r.invested)}</td>
          <td style="padding:.65rem .85rem;text-align:right;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.82rem;color:var(--ink)">${fmt(r.current)}</td>
          <td style="padding:.65rem .85rem">
            <div style="display:flex;align-items:center;gap:.4rem;justify-content:flex-end">
              <div style="width:60px;height:4px;background:rgba(15,17,23,.06);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${Math.min(pct, 100).toFixed(1)}%;background:${color};border-radius:4px"></div>
              </div>
              <span style="font-family:'DM Sans',sans-serif;font-weight:600;font-size:.72rem;color:rgba(15,17,23,.5);min-width:38px;text-align:right">${pct.toFixed(1)}%</span>
            </div>
          </td>
        </tr>`;
        }).join('');

      const amcAllocSection = `
    <div class="consol-box">
      <div class="consol-hdr">🏦 &nbsp;AMC Wise Allocation</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--cream)">
            <th style="text-align:left;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">AMC</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Invested</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Current</th>
            <th style="text-align:right;padding:.55rem .85rem;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(15,17,23,.4);border-bottom:1px solid var(--border)">Allocation</th>
          </tr>
        </thead>
        <tbody>${amcAllocBody}</tbody>
        <tfoot>
          <tr style="background:rgba(26,92,74,.05);border-top:2px solid var(--border)">
            <td style="font-weight:700;font-size:.82rem;padding:.75rem .85rem">Total</td>
            <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:600;padding:.75rem .85rem">${fmt(amcAllocTotalInv)}</td>
            <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;color:var(--green-l);padding:.75rem .85rem">${fmt(amcAllocTotalCur)}</td>
            <td style="text-align:right;font-family:'DM Sans',sans-serif;font-weight:700;padding:.75rem .85rem">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

      wrap.innerHTML = `
    <div class="sec-ttl"><span class="dot"></span>Consolidated Overview</div>
    <div class="consol-grid">${amcAllocSection}${catSection}</div>
    <div class="consol-grid" style="margin-top:1.2rem">${sipSection}
      <div style="display:flex;flex-direction:column;gap:1.2rem">${catSipSection}${amcSipSection}</div>
    </div>`;
    }

    // UNWANTED SCHEMES — global list persists across tabs and uploads
    let unwantedSchemes = [];

    function addUnwanted() {
      const input = qs('unwanted-input');
      const val = (input.value || '').trim();
      if (!val) return;
      // avoid duplicates
      if (!unwantedSchemes.some(s => s.toLowerCase() === val.toLowerCase())) {
        unwantedSchemes.push(val);
        renderUnwantedTags();
        // re-render advisor notes for current tab
        const idx = Array.from(document.querySelectorAll('.tab')).findIndex(t => t.classList.contains('on'));
        if (idx >= 0 && currentData) renderSidebar(currentData.members[idx], idx === 0);
      }
      input.value = '';
      input.focus();
    }

    function removeUnwanted(name) {
      unwantedSchemes = unwantedSchemes.filter(s => s !== name);
      renderUnwantedTags();
      const idx = Array.from(document.querySelectorAll('.tab')).findIndex(t => t.classList.contains('on'));
      if (idx >= 0 && currentData) renderSidebar(currentData.members[idx], idx === 0);
    }

    function renderUnwantedTags() {
      const wrap = qs('unwanted-tags');
      if (!wrap) return;
      wrap.innerHTML = unwantedSchemes.length === 0
        ? ''
        : unwantedSchemes.map(s =>
          `<span class="tag">${s}<button class="tag-rm" onclick="removeUnwanted('${s.replace(/'/g, "\'")}')">×</button></span>`
        ).join('');
    }

    // SCHEME SEARCH
    function searchScheme(query) {
      const resultsEl = qs('search-results');
      if (!query || query.trim().length < 2) {
        resultsEl.innerHTML = '<span style="color:rgba(15,17,23,.4)">Type to search schemes in this portfolio</span>';
        return;
      }
      const q = query.trim().toLowerCase();
      const currentMemberData = currentData.members[document.querySelectorAll('.tab.on')[0] ? Array.from(document.querySelectorAll('.tab')).findIndex(t => t.classList.contains('on')) : 0];
      const holdings = (currentMemberData || {}).holdings || [];
      const matches = holdings.filter(h => (h.name || '').toLowerCase().includes(q));
      if (matches.length === 0) {
        resultsEl.innerHTML = '<span style="color:var(--coral)">No scheme found matching "' + query + '"</span>';
        return;
      }
      const total = holdings.reduce((s, h) => s + (h.current || 0), 0) || 1;
      resultsEl.innerHTML = matches.map(h => {
        const g = (h.current || 0) - (h.invested || 0);
        const gp = h.invested ? (g / h.invested * 100).toFixed(1) : '0';
        const al = ((h.current || 0) / total * 100).toFixed(1);
        const col = h.badge === 'eq' ? 'var(--green)' : h.badge === 'dt' ? 'var(--sky)' : h.badge === 'hy' ? 'var(--violet)' : 'var(--gold)';
        return `<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:.8rem;margin-bottom:.5rem">
      <div style="font-weight:600;font-size:.82rem;margin-bottom:.4rem;color:var(--ink)">${h.name}</div>
      ${h.holder ? `<div style="font-size:.68rem;color:rgba(15,17,23,.4);margin-bottom:.4rem">Holder: ${h.holder}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.3rem;font-size:.75rem">
        <div><span style="color:rgba(15,17,23,.4)">Invested</span><br><span style="font-family:'DM Sans',sans-serif;font-weight:500;color:var(--ink)">${fmt(h.invested)}</span></div>
        <div><span style="color:rgba(15,17,23,.4)">Current</span><br><span style="font-family:'DM Sans',sans-serif;font-weight:600;color:var(--green-l)">${fmt(h.current)}</span></div>
        <div><span style="color:rgba(15,17,23,.4)">Gain</span><br><span style="font-family:'DM Sans',sans-serif;font-weight:600;color:${g >= 0 ? 'var(--green-l)' : 'var(--coral)'}">${g >= 0 ? '+' : ''}${gp}%</span></div>
        <div><span style="color:rgba(15,17,23,.4)">CAGR</span><br><span style="font-family:'DM Sans',sans-serif;font-weight:600;color:${(h.xirr || 0) >= 0 ? 'var(--green-l)' : 'var(--coral)'}">${(h.xirr || 0).toFixed(2)}%</span></div>
        <div><span style="color:rgba(15,17,23,.4)">Allocation</span><br><span style="font-family:'DM Sans',sans-serif;font-weight:600">${al}%</span></div>
        <div><span style="color:rgba(15,17,23,.4)">Category</span><br><span style="font-size:.72rem;background:rgba(15,17,23,.07);padding:1px 6px;border-radius:10px;color:${col}">${h.cat || '—'}</span></div>
      </div>
    </div>`;
      }).join('');
    }

    // EVENTS
    document.querySelector('.browse-btn').addEventListener('click', e => { e.stopPropagation(); qs('file-in').click(); });
    qs('file-in').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; });
    qs('drop-zone').addEventListener('click', () => qs('file-in').click());
    qs('drop-zone').addEventListener('dragover', e => { e.preventDefault(); qs('drop-zone').classList.add('over'); });
    qs('drop-zone').addEventListener('dragleave', () => qs('drop-zone').classList.remove('over'));
    qs('drop-zone').addEventListener('drop', e => {
      e.preventDefault(); qs('drop-zone').classList.remove('over');
      const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
    });
    qs('btn-new').addEventListener('click', () => {
      Object.values(charts).forEach(c => c?.destroy());
      qs('dash-page').style.display = 'none';
      qs('upload-page').style.display = 'flex';
      qs('pw').style.display = 'none';
      qs('steps-el').style.display = 'none';
      qs('pf').style.width = '0%';
      qs('print-btn-wrap').style.display = 'none';
      qs('save-btn-wrap').style.display = 'none';
      hideErr();
    });
    qs('print-portfolio-btn').addEventListener('click', printPortfolio);
    qs('scheme-search').addEventListener('input', e => searchScheme(e.target.value));
    qs('unwanted-input').addEventListener('keydown', e => { if (e.key === 'Enter') addUnwanted(); });
    qs('add-unwanted-btn').addEventListener('click', addUnwanted);
    qs('save-profile-btn').addEventListener('click', handleSaveToProfile);

    // Bridge for the one inline "onclick" handler generated via innerHTML
    // (renderUnwantedTags' per-tag remove button) — inline handlers in
    // injected HTML resolve against `window`, not this closure.
    window.removeUnwanted = removeUnwanted;
    removeUnwantedFnRef.current = removeUnwanted;

    // PRINT FUNCTION
    function printPortfolio() {
      if (!currentData) return;
      // Sync editable advisory notes from sidebar to print section
      const sidebarAlerts = qs('alert-list').querySelectorAll('.alert-box-wrap');
      const printList = qs('print-alert-list');
      printList.innerHTML = '';
      sidebarAlerts.forEach(a => {
        const clone = a.cloneNode(true);
        // Remove contenteditable and edit hints for print
        clone.querySelectorAll('[contenteditable]').forEach(el => {
          el.removeAttribute('contenteditable');
          el.classList.remove('alert-editable');
          el.style.border = 'none';
          el.style.padding = '0';
        });
        clone.querySelectorAll('.alert-edit-hint').forEach(el => el.remove());
        printList.appendChild(clone);
      });
      // Set document title for PDF filename
      const clientName = (currentData.title || 'Client').replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
      const origTitle = document.title;
      document.title = 'portfolio_review_' + clientName;
      window.print();
      document.title = origTitle;
    }

    // SAVE TO CLIENT PROFILE — reuses the app's existing generated-document
    // pipeline (same one Policy Review uses): snapshot the dashboard's current
    // DOM (canvases become static images), wrap as a standalone HTML document,
    // and attach it to this client's profile so it shows up in Documents.
    function showDocMsg(text) {
      const toast = qs('doc-msg-toast');
      if (!toast) return;
      toast.textContent = text;
      toast.style.display = 'block';
      clearTimeout(showDocMsg._t);
      showDocMsg._t = setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }

    async function handleSaveToProfile() {
      if (!currentData) return;
      if (!client?.id) {
        showDocMsg('⚠️ Not linked to a saved client — cannot save.');
        return;
      }
      const dashEl = qs('dash-page');
      if (!dashEl) return;
      const btn = qs('save-profile-btn');
      const btnLabel = qs('save-profile-btn-label');
      btn.disabled = true;
      btnLabel.textContent = 'Saving…';
      try {
        const inner = snapshotElementHtml(dashEl);
        const html = wrapStandaloneHtml(
          `<div class="portfolio-review-widget">${inner}</div>`,
          `Portfolio Review — ${client.name}`,
          PORTFOLIO_REVIEW_STYLES
        );
        const name = await saveGeneratedDocument(client, {
          kind: 'portfolioReviewAI',
          label: 'Portfolio Review Report',
          html,
        });
        showDocMsg(`✅ Saved to Documents as ${name}`);
      } catch (err) {
        showDocMsg(`⚠️ ${err.message || 'Could not save document.'}`);
      } finally {
        btn.disabled = false;
        btnLabel.textContent = 'Save to Profile';
      }
    }

    return () => {
      Object.values(charts).forEach((c) => c?.destroy());
      delete window.removeUnwanted;
    };
  }, []);

  return (
    <div className="portfolio-review-widget">
      <style>{PORTFOLIO_REVIEW_STYLES}</style>
      {/*
        The save-status toast is a plain, always-present (initially hidden)
        element that `handleSaveToProfile` above shows/hides imperatively via
        #doc-msg-toast — deliberately NOT React state. This component hands
        the whole dashboard subtree below to imperative DOM code right after
        mount (ids, .innerHTML template functions, addEventListener), so any
        state change here that causes a re-render risks React touching that
        subtree and silently detaching the listeners the mount effect
        attached to it.
      */}
      <div id="doc-msg-toast" className="no-print" style={{ display: 'none', position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '12px 20px', borderRadius: '12px', background: '#059669', color: '#fff', fontSize: '14px', fontWeight: 600, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }} />
      <div dangerouslySetInnerHTML={{ __html: PAGE_HTML }} />
    </div>
  );
}
