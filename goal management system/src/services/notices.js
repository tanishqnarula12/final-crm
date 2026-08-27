// Dashboard notice board — thin REST wrapper. No client-side cache (unlike
// services/team.js / notifications.js): only the Dashboard renders this, so
// it just fetches on mount and after local actions — see NoticeBoard.jsx.
import { api } from './api';

export const NOTICE_TYPES = ['GENERAL', 'ANNOUNCEMENT', 'HOLIDAY', 'BIRTHDAY', 'EVENT'];

export const listNotices = () => api.get('/notices').then((d) => d.notices || []);
export const createNotice = (payload) => api.post('/notices', payload).then((d) => d.notice);
export const deleteNotice = (id) => api.del(`/notices/${id}`);
