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

// Fetches the logged-in user's profile from the server and populates the
// cache. Call once on login/app-load (App.jsx `loadData`).
export async function hydrateAdvisorProfile() {
  const { profile } = await api.get('/profile');
  cache = mergeWithDefaults(profile);
  window.dispatchEvent(new Event('crm:advisor-profile-updated'));
  return cache;
}

export const saveAdvisorProfile = (profile) => {
  cache = profile;
  window.dispatchEvent(new Event('crm:advisor-profile-updated'));
  api.put('/profile', { data: profile }).catch((err) => console.error('Failed to persist advisor profile:', err));
};
