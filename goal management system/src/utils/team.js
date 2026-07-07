// Client role-assignment labels & relationship options.
//
// The hardcoded preview roster (TEAM_MEMBERS / FIXED_ROLES) has been removed —
// assignment pickers now read the real accounts from services/team.js
// (loadTeam) and store account ids. Actor/author fields use the logged-in
// account (getCurrentUser). This file keeps only the static label lists.

// The editable manager roles, in display order. Each maps a clientDetails key
// to its human label — used by both the form and the profile view.
export const MANAGER_ROLES = [
  { key: 'relationshipManager', label: 'Relationship Manager' },
  { key: 'portfolioManager', label: 'Portfolio Manager' },
  { key: 'insuranceManager', label: 'Insurance Manager' },
  { key: 'serviceManager', label: 'Service Manager' },
];

// Relationship options — shared by family/applicant details and nominee pickers.
export const RELATIONS = [
  'Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister',
  'Grandfather', 'Grandmother', 'Grandson', 'Granddaughter',
  'Father-in-law', 'Mother-in-law', 'Son-in-law', 'Daughter-in-law',
  'Nephew', 'Niece', 'Uncle', 'Aunt', 'Cousin',
  'Legal Guardian', 'Relative', 'Friend', 'Business Partner',
  'Employee', 'Employer', 'Trustee',
];
