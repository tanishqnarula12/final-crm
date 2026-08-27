// Dashboard notice board — thin REST wrapper. No client-side cache (unlike
// services/team.js / notifications.js): only the Dashboard renders this, so
// it just fetches on mount and after local actions — see NoticeBoard.jsx.
import { api } from './api';

export const NOTICE_TYPES = ['GENERAL', 'ANNOUNCEMENT', 'HOLIDAY', 'BIRTHDAY', 'EVENT', 'LEAVE'];

// Duration presets (days) for "how long this notice stays visible" — null
// means it never expires. Shared with the create form's dropdown.
export const VISIBLE_FOR_OPTIONS = [
  { label: '1 Day', days: 1 },
  { label: '3 Days', days: 3 },
  { label: '1 Week', days: 7 },
  { label: '2 Weeks', days: 14 },
  { label: '1 Month', days: 30 },
  { label: 'No Expiry', days: null },
];

export const listNotices = () => api.get('/notices').then((d) => d.notices || []);
// Returns { notice, scheduled } — scheduled=true means the date picked is in
// the future, so the notice is saved but stays invisible to everyone
// (including the poster) until that date arrives.
export const createNotice = (payload) => api.post('/notices', payload);
export const deleteNotice = (id) => api.del(`/notices/${id}`);
