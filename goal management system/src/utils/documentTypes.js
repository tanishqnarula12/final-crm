// The single canonical list of document types used across the app.
//
// This list is the linking key: an uploaded document stores its type's LABEL as
// `attachment.category`, and the prospect KYC sections find already-uploaded
// files by matching that same label (see existingDocsFor in BusinessProspects).
// It therefore has to be one shared list — when the Documents upload picker and
// the prospect checklists each kept their own copy, adding a type to one silently
// broke the link from the other.
//
// key   = stable storage key (never rename — existing records reference it)
// label = display name AND the linking value written to attachment.category
// group = <optgroup> heading in the picker
export const DOCUMENT_TYPES = [
  // Identity Proof
  { key: 'aadharCard',        label: 'Aadhaar Card',                 group: 'Identity Proof' },
  { key: 'panCard',           label: 'PAN Card',                     group: 'Identity Proof' },
  { key: 'passport',          label: 'Passport',                     group: 'Identity Proof' },
  { key: 'voterId',           label: 'Voter ID',                     group: 'Identity Proof' },
  { key: 'drivingLicense',    label: 'Driving License',              group: 'Identity Proof' },
  { key: 'birthCertificate',  label: 'Birth Certificate',            group: 'Identity Proof' },
  { key: 'nomineePanCard',    label: 'Nominee PAN Card',             group: 'Identity Proof' },
  { key: 'nomineeAadharCard', label: 'Nominee Aadhaar Card',         group: 'Identity Proof' },
  { key: 'signature',         label: 'Signature',                    group: 'Identity Proof' },
  { key: 'ociCertificate',    label: 'OCI Certificate',              group: 'Identity Proof' },
  { key: 'visa',              label: 'VISA',                         group: 'Identity Proof' },
  // Address Proof
  { key: 'utilityBill',       label: 'Utility Bill',                 group: 'Address Proof' },
  { key: 'electricityBill',   label: 'Electricity Bill',             group: 'Address Proof' },
  { key: 'rentAgreement',     label: 'Rent Agreement',               group: 'Address Proof' },
  { key: 'rationCard',        label: 'Ration Card',                  group: 'Address Proof' },
  // Financial
  { key: 'cancelledCheque',   label: 'Cancelled Cheque',             group: 'Financial' },
  { key: 'bankPassbook',      label: 'Bank Passbook',                group: 'Financial' },
  { key: 'bankStatement3m',   label: 'Bank Statement (3 Months)',    group: 'Financial' },
  { key: 'bankStatement6m',   label: 'Bank Statement (6 Months)',    group: 'Financial' },
  { key: 'bankStatement12m',  label: 'Bank Statement (12 Months)',   group: 'Financial' },
  { key: 'itr',               label: 'ITR',                          group: 'Financial' },
  { key: 'itr1yr',            label: 'ITR (1 Year)',                 group: 'Financial' },
  { key: 'itr3yr',            label: 'ITR (3 Years)',                group: 'Financial' },
  { key: 'computation3yr',    label: 'Computation (3 Years)',        group: 'Financial' },
  { key: 'form16',            label: 'Form 16',                      group: 'Financial' },
  { key: 'caCertificate',     label: 'CA Certificate',               group: 'Financial' },
  { key: 'balanceSheet',      label: 'Balance Sheet',                group: 'Financial' },
  // Business / Entity
  { key: 'gstCertificate',    label: 'GST Certificate',              group: 'Business / Entity' },
  { key: 'shopRegistration',  label: 'Shop Registration Certificate', group: 'Business / Entity' },
  { key: 'hufDeed',           label: 'HUF Deed',                     group: 'Business / Entity' },
  { key: 'partnershipDeed',   label: 'Partnership Deed',             group: 'Business / Entity' },
  { key: 'shareHoldingPattern', label: 'Share Holding Pattern',      group: 'Business / Entity' },
  { key: 'moa',               label: 'MOA',                          group: 'Business / Entity' },
  { key: 'aoa',               label: 'AOA',                          group: 'Business / Entity' },
  // Employment
  { key: 'salarySlip',        label: 'Salary Slip (Last 3 Months)',  group: 'Employment' },
  { key: 'employmentLetter',  label: 'Employment Letter',            group: 'Employment' },
  { key: 'appointmentLetter', label: 'Appointment Letter',           group: 'Employment' },
  // Medical
  { key: 'medicalReport',     label: 'Medical Report',               group: 'Medical' },
  { key: 'firstPrescription', label: 'First Prescription',           group: 'Medical' },
  { key: 'ecg',               label: 'ECG Report',                   group: 'Medical' },
  { key: 'bloodReport',       label: 'Blood Report',                 group: 'Medical' },
  { key: 'xray',              label: 'X-Ray Report',                 group: 'Medical' },
  // Insurance / Policy
  { key: 'photo',             label: 'Passport Size Photo',          group: 'Insurance' },
  { key: 'policyDocument',    label: 'Policy Document',              group: 'Insurance' },
  { key: 'proposalForm',      label: 'Proposal Form',                group: 'Insurance' },
  { key: 'previousPolicy',    label: 'Previous Policy',              group: 'Insurance' },
  { key: 'surrenderLetter',   label: 'Surrender Letter',             group: 'Insurance' },
  // Other — the uploader types the real document name, which is then stored as
  // the category so it links exactly like a listed type.
  { key: 'other',             label: 'Other',                        group: 'Other' },
];

// Group order for rendering <optgroup>s, derived from the list itself so a new
// group only has to be added above.
export const DOCUMENT_TYPE_GROUPS = DOCUMENT_TYPES.reduce((acc, t) => {
  if (!acc.some((g) => g.group === t.group)) acc.push({ group: t.group, types: [] });
  acc.find((g) => g.group === t.group).types.push(t);
  return acc;
}, []);

export const documentTypeLabel = (key) => DOCUMENT_TYPES.find((d) => d.key === key)?.label || key;
