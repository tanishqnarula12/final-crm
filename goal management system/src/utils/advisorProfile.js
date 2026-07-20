// Advisor / team-member "My Profile" — backed by the CRM API (Postgres),
// scoped per-user (each account has its own profile row, keyed off the
// logged-in session — see server/src/routes/profile.js). This is the
// logged-in user's own HR-style profile (identity, contact, family & bank
// details).
//
// Same "in-memory cache hydrated from the API" seam as the other stores:
// `loadAdvisorProfile()` stays synchronous, `saveAdvisorProfile()` updates
// the cache immediately and persists to the server in the background.

import { api } from '../services/api';
import { getCurrentUser } from './auth';

export const ADVISOR_ROLES = [
  'Owner',
  'Team Head',
  'Relationship Manager',
  'Portfolio Manager',
  'Insurance Manager',
  'Service Manager',
  'Operation Manager',
  'Internal Manager',
  'Associate',
];

export const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'];

// Seeded from the logged-in account (name/email) rather than a hardcoded
// person now that there are real, distinct user accounts.
const defaultProfile = () => {
  const user = getCurrentUser();
  return {
    photo: '',
    name: user?.name || '',
    role: 'Owner',
    dob: '',
    pan: '',
    aadhar: '',
    mobile: '',
    email: user?.email || '',
    address1: '',
    address2: '',
    address3: '',
    city: '',
    state: '',
    country: 'India',
    pinCode: '',
    maritalStatus: '',
    disease: '',
    teamMemberSince: '',
    familyDetails: [],
    bankDetails: {
      accountHolder: '',
      bankName: '',
      accountNumber: '',
      ifsc: '',
      branch: '',
    },
  };
};

const mergeWithDefaults = (parsed) => {
  const base = defaultProfile();
  if (!parsed) return base;
  return { ...base, ...parsed, bankDetails: { ...base.bankDetails, ...(parsed.bankDetails || {}) } };
};

let cache = defaultProfile();

export const loadAdvisorProfile = () => cache;

// Every save chains onto this so a hydrate that happens to run concurrently
// (e.g. an unrelated `window.refreshAppData()` elsewhere in the app, which
// re-hydrates this cache alongside everything else) always waits for any
// in-flight write to land first — otherwise the hydrate's GET can win the
// race against the save's PUT and overwrite the cache (photo, etc.) with the
// pre-save server state, making a just-saved change look like it "didn't
// save" or got silently cleared.
let saveChain = Promise.resolve();

// Fetches the logged-in user's profile from the server and populates the
// cache. Call once on login/app-load (App.jsx `loadData`) — also safe to
// call again later (e.g. a global refresh) since it always waits for any
// pending save first.
export async function hydrateAdvisorProfile() {
  await saveChain;
  const { profile } = await api.get('/profile');
  cache = mergeWithDefaults(profile);
  window.dispatchEvent(new Event('crm:advisor-profile-updated'));
  return cache;
}

export const saveAdvisorProfile = (profile) => {
  cache = profile;
  window.dispatchEvent(new Event('crm:advisor-profile-updated'));
  // Swallow the error *inside* the chain (not via a separate .catch() off to
  // the side) so a failed PUT can't leave `saveChain` permanently rejected —
  // that would make every future `await saveChain` in hydrateAdvisorProfile
  // throw, breaking hydration app-wide until a page reload.
  saveChain = saveChain.then(() =>
    api.put('/profile', { data: profile }).catch((err) => console.error('Failed to persist advisor profile:', err))
  );
};
