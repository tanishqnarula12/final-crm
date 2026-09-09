// Manual admin overrides for the Dashboard's Managed Portfolio KPIs — thin
// REST wrapper, mirrors services/notices.js (no client-side cache; only the
// Dashboard renders this, so it just fetches on mount).
import { api } from './api';

// Returns { override, computed } — the manual entries plus the firm-wide
// figures they combine with (computed server-side over every record, so the
// cards read identically for every user).
export const getManagedPortfolio = () => api.get('/managed-portfolio');
// amount: null clears the override (the dashboard reverts to the computed figure).
export const setAumOverride = (amount, asOfDate) => api.put('/managed-portfolio/aum', { amount, asOfDate }).then((d) => d.override);
export const setSipOverride = (amount) => api.put('/managed-portfolio/sip', { amount }).then((d) => d.override);
export const setInsuranceOverride = (amount) => api.put('/managed-portfolio/insurance', { amount }).then((d) => d.override);
