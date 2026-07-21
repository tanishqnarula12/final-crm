import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Target, FileBarChart, Plus, ChevronLeft, ChevronRight, Trash2, X,
  Calendar, Percent, Search, SlidersHorizontal, Pencil, Info, Shield, Plane, Car,
  Home, Heart, GraduationCap, Gift, CheckCircle2,
  AlertCircle, Download, RefreshCw, Save, FileText, Wallet, PieChart, User, UserPlus, UserCheck,
  LayoutDashboard, Video, TrendingUp, Bell, MessageSquare, Sun, Moon, LogOut, ArrowLeft
} from 'lucide-react';

// DB Service & Calculation Utils
import { 
  getClients, addClient, updateClient, deleteClient, addGoal, updateGoal, deleteGoal 
} from './services/db';
import {
  calcGoal, CURRENT_YEAR, CURRENT_MONTH, uid, monthsBetween, buildGoalEdits, initials
} from './utils/calc';
import { loadAdvisorProfile, hydrateAdvisorProfile } from './utils/advisorProfile';
import logoImg from './assets/logo.png';

// Subcomponents
import ClientList from './components/ClientList';
import ClientDetail from './components/ClientDetail';
import GoalDetail from './components/GoalDetail';
import { GoalsOverview, GoalGroupDetail } from './components/GoalsOverview';
import ReportsView from './components/ReportsView';
import { ClientFormModal, GoalFormModal, ExcelImportModal } from './components/Modals';
import { AssetAllocationList, AssetAllocationDetail } from './components/AssetAllocation';
import AssetAllocationModal from './components/AssetAllocationModal';
import ClientProfileView from './components/ClientProfile';
import MyProfileView from './components/MyProfile';
import UsersAdmin from './components/UsersAdmin';
import ActivityLogView from './components/ActivityLogView';
import PermissionsMatrix from './components/PermissionsMatrix';
import ChangePasswordModal from './components/ChangePasswordModal';
import ChatView from './components/chat/ChatView';
import { connectChat, disconnectChat, onChatEvent, fetchConversations as fetchChatConversations, fetchChatUsers } from './services/chat';
import ChatHoverPreview from './components/ChatHoverPreview';
import { normalizeAllocation, buildAllocationEdits, hasAllocation } from './utils/assets';
import { StatTile } from './components/UI';
import Login from './components/Login';
import { isAuthenticated, isViewerRole, isAdminRole, refreshSession, logout as apiLogout, getCurrentUser } from './utils/auth';
import MomWorkspace from './components/MomWorkspace';
import ProposalWorkspace from './components/ProposalWorkspace';
import Sidebar from './components/Sidebar';
import TasksView, { TaskFormModal } from './components/TasksView';
import QueriesView, { QueryFormModal } from './components/QueriesView';
import LeaveView from './components/LeaveView';
import CobrView from './components/CobrView';
import CobrFormModal from './components/CobrFormModal';
import CobrTaskModal from './components/CobrTaskModal';
import DocumentsView from './components/DocumentsView';
import ProspectsView, { ProspectModal } from './components/BusinessProspects';
import ReviewWorkspace from './components/ReviewWorkspace';
import MeetingsView, { MeetingFormModal } from './components/MeetingsView';
import DashboardView from './components/DashboardView';
import LeadsView from './components/LeadsView';
import OthersView from './components/OthersView';
import { loadLeads, hydrateLeads, updateLead, clientPayloadFromLead, markConnectedFromTask, syncMeetingToLead, leadName as leadNameOf } from './services/leads';
import { loadTasks, saveTasks, hydrateTasks } from './utils/tasks';
import { loadQueries, saveQueries, hydrateQueries, QUERY_STAGES } from './utils/queries';
import { loadLeave, hydrateLeave } from './utils/leave';
import { canRespondToLeave } from './utils/permissions';
import { loadProspects, saveProspects, hydrateProspects } from './utils/prospects';
import { loadMeetings, saveMeetings, hydrateMeetings } from './utils/meetings';
import { hydrateTeam, loadTeam, teamName } from './services/team';
import { hydratePermissions } from './services/permissions';
import {
  hydrateNotifications, startNotificationStream, stopNotificationStream, loadNotifications,
  onNotificationsUpdated, onNotificationArrival, markNotificationRead, markAllNotificationsRead, clearNotifications,
} from './services/notifications';
import NotificationPanel from './components/NotificationPanel';
import NotificationToaster from './components/NotificationToaster';
import InstallPrompt from './components/InstallPrompt';
import { subscribeToPush, unsubscribeFromPush } from './services/push';

export default function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [isViewer, setIsViewer] = useState(() => isViewerRole());
  const [isAdmin, setIsAdmin] = useState(() => isAdminRole());
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('dashboard'); // top-level: 'dashboard' | 'leads' | 'clients' | 'tasks' | 'meetings' | 'documents' | 'prospects' | 'reports' | 'myprofile'
  const [tab, setTab] = useState('clients');
  const [activeDropdown, setActiveDropdown] = useState(null); // 'chat' | 'bell' | 'profile' | null
  const [activeAnim, setActiveAnim] = useState({ chat: false, bell: false, profile: false });

  const [advisorProfile, setAdvisorProfile] = useState(() => loadAdvisorProfile());

  useEffect(() => {
    const handler = () => setAdvisorProfile(loadAdvisorProfile());
    window.addEventListener('crm:advisor-profile-updated', handler);
    return () => window.removeEventListener('crm:advisor-profile-updated', handler);
  }, []);



  const triggerAnim = (type) => {
    setActiveAnim(prev => ({ ...prev, [type]: true }));
    setTimeout(() => {
      setActiveAnim(prev => ({ ...prev, [type]: false }));
    }, 750);
  };

  const handleToolbarClick = (type) => {
    triggerAnim(type);
    setActiveDropdown(prev => (prev === type ? null : type));
  };

  const handleLogin = (user) => {
    setIsViewer(false);
    setIsAdmin((user.roles || []).includes('ADMIN'));
    setAuthed(true);
  };

  const handleLogout = async () => {
    await unsubscribeFromPush(); // before the session cookie is cleared, so the request authenticates
    apiLogout();
    disconnectChat();
    setChatUnread(0);
    clearNotifications();
    setNotifications([]);
    setAuthed(false);
    setIsViewer(false);
    setIsAdmin(false);
    if (view === 'users' || view === 'chat') setView('dashboard');
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setSelectedGoalName(null);
    setAssetClientId(null);
    setMomClientId(null);
    setClientProfileId(null);
    setProposalClientId(null);
    setReviewClientId(null);
  };
  
  // Selection States
  const [selectedClientId, setSelectedClientId] = useState(null);
  // Set by the client search dropdown's "Applicants" results — tells
  // ClientProfile which family member to scroll to/highlight once open.
  const [highlightApplicant, setHighlightApplicant] = useState(null); // { clientId, pan, name } | null
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [selectedGoalName, setSelectedGoalName] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeQueryId, setActiveQueryId] = useState(null);

  // Modal states
  const [showAddClient, setShowAddClient] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [editingClientId, setEditingClientId] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [tasksChangeCounter, setTasksChangeCounter] = useState(0);
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [editingQuery, setEditingQuery] = useState(null);
  const [queriesChangeCounter, setQueriesChangeCounter] = useState(0);
  const [showCobrForm, setShowCobrForm] = useState(false);
  const [editingCobr, setEditingCobr] = useState(null);
  const [cobrAllowReopen, setCobrAllowReopen] = useState(false);
  const [cobrInteractive, setCobrInteractive] = useState(true);
  const [showProspectForm, setShowProspectForm] = useState(false);
  const [editingProspect, setEditingProspect] = useState(null);
  const [prospectsChangeCounter, setProspectsChangeCounter] = useState(0);
  const [activeProspectId, setActiveProspectId] = useState(null);
  const [prospectQuery, setProspectQuery] = useState('');
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [meetingFormLocked, setMeetingFormLocked] = useState(false);
  const [meetingsChangeCounter, setMeetingsChangeCounter] = useState(0);
  const [activeMeetingId, setActiveMeetingId] = useState(null);
  const [leadsChangeCounter, setLeadsChangeCounter] = useState(0);
  const [leadsBadge, setLeadsBadge] = useState(0);
  // Sidebar "pending" count badges per module (tasks/cobr/meetings/prospects/queries).
  const [moduleBadges, setModuleBadges] = useState({ tasks: 0, cobr: 0, meetings: 0, prospects: 0, queries: 0 });
  // Pending-leave-requests-awaiting-my-decision count (Admin / Internal Manager
  // only) — shown next to the "Leave" item in the Account Settings dropdown,
  // since Leave has no sidebar nav icon to badge instead.
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [convertingLead, setConvertingLead] = useState(null);

  // Asset allocation tab states
  const [assetClientId, setAssetClientId] = useState(null);
  const [momClientId, setMomClientId] = useState(null);
  const [clientProfileId, setClientProfileId] = useState(null);
  const [proposalClientId, setProposalClientId] = useState(null);
  const [reviewClientId, setReviewClientId] = useState(null);
  const [proposalSubTab, setProposalSubTab] = useState('insurance');
  const [reviewSubTab, setReviewSubTab] = useState('policy');
  const [othersSubTab, setOthersSubTab] = useState('other_tools');
  const [showAllocModal, setShowAllocModal] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  // Hover-preview data for the chat dock icon — a lightweight mirror of what
  // ChatView itself fetches, kept here so the preview works without having
  // to mount the whole Chat module first.
  const [chatConversationsPreview, setChatConversationsPreview] = useState([]);
  const [chatUsersById, setChatUsersById] = useState(new Map());
  const [chatPreviewOpen, setChatPreviewOpen] = useState(false);
  const chatPreviewCloseTimer = useRef(null);
  // Set by clicking a chat hover-preview item — tells ChatView which
  // conversation (and MessagePane which message) to jump straight into.
  const [pendingChatOpen, setPendingChatOpen] = useState(null); // { conversationId, messageId } | null
  const [notifications, setNotifications] = useState([]);
  const [showChatSplash, setShowChatSplash] = useState(false);
  
  // Filters & Report view states
  const [reportGoalFilter, setReportGoalFilter] = useState('all');
  const [reportTimeframe, setReportTimeframe] = useState(5);

  // Dynamic light/dark theme preference
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('gms:theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('gms:theme', theme);
  }, [theme]);

  // Load clients + hydrate the leads/tasks caches on startup
  const loadData = async () => {
    try {
      const [data] = await Promise.all([
        getClients(),
        hydrateLeads().catch((err) => console.error('Failed to load leads:', err)),
        hydrateTasks().catch((err) => console.error('Failed to load tasks:', err)),
        hydrateQueries().catch((err) => console.error('Failed to load queries:', err)),
        hydrateLeave().catch((err) => console.error('Failed to load leave requests:', err)),
        hydrateMeetings().catch((err) => console.error('Failed to load meetings:', err)),
        hydrateProspects().catch((err) => console.error('Failed to load prospects:', err)),
        hydrateAdvisorProfile().catch((err) => console.error('Failed to load advisor profile:', err)),
        hydrateTeam().catch((err) => console.error('Failed to load team directory:', err)),
        hydratePermissions().catch((err) => console.error('Failed to load permissions:', err)),
      ]);
      setClients(data);
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    window.refreshAppData = loadData;
    return () => {
      delete window.refreshAppData;
    };
  }, []);

  // When any proposal page creates a new prospect it dispatches this event but
  // never touches prospectsChangeCounter (that counter is edit-only). Increment
  // it here so every subscriber that depends on the counter also refreshes.
  useEffect(() => {
    const bump = () => setProspectsChangeCounter(prev => prev + 1);
    window.addEventListener('crm:prospects-updated', bump);
    return () => window.removeEventListener('crm:prospects-updated', bump);
  }, []);

  // Tasks are hydrated from the API asynchronously (see loadData); once that
  // completes it dispatches this event so every subscriber depending on
  // tasksChangeCounter (TasksView, DashboardView, ClientProfile) refreshes.
  useEffect(() => {
    const bump = () => setTasksChangeCounter(prev => prev + 1);
    window.addEventListener('crm:tasks-updated', bump);
    return () => window.removeEventListener('crm:tasks-updated', bump);
  }, []);

  // Same for queries.
  useEffect(() => {
    const bump = () => setQueriesChangeCounter(prev => prev + 1);
    window.addEventListener('crm:queries-updated', bump);
    return () => window.removeEventListener('crm:queries-updated', bump);
  }, []);

  // Same for meetings — MeetingsView/DashboardView already self-listen to
  // this event, but ClientProfile only reacts to meetingsChangeCounter.
  useEffect(() => {
    const bump = () => setMeetingsChangeCounter(prev => prev + 1);
    window.addEventListener('crm:meetings-updated', bump);
    return () => window.removeEventListener('crm:meetings-updated', bump);
  }, []);

  // Chat: keep one socket alive for the whole session so real-time messages
  // (and the topbar/sidebar unread badge) work from any screen, not just the
  // chat view. The badge is re-derived from the server on every relevant
  // event, so it can never drift.
  useEffect(() => {
    if (!authed) return;
    connectChat();
    let cancelled = false;
    const refreshChatPreview = async () => {
      try {
        const { conversations } = await fetchChatConversations();
        if (cancelled) return;
        setChatUnread(conversations.reduce((sum, c) => sum + (c.unread || 0), 0));
        setChatConversationsPreview(conversations);
      } catch { /* server unreachable — keep last value */ }
    };
    refreshChatPreview();
    // Directory for the hover preview (names/photos) — fetched once per
    // session, same source ChatView itself uses.
    fetchChatUsers().then(({ users }) => {
      if (!cancelled) setChatUsersById(new Map(users.map((u) => [u.id, u])));
    }).catch(() => {});
    const meId = getCurrentUser()?.id;
    const offNew = onChatEvent('message:new', ({ message }) => {
      if (message.senderId !== meId) refreshChatPreview();
    });
    const offRead = onChatEvent('read', ({ userId }) => {
      if (userId === meId) refreshChatPreview();
    });
    const offConv = onChatEvent('conversation:new', refreshChatPreview);
    return () => { cancelled = true; offNew(); offRead(); offConv(); };
  }, [authed]);

  // A pending chat-preview jump only makes sense while we're about to enter
  // (or are in) Chat — drop it once the user navigates elsewhere, so
  // reopening the same conversation later via the sidebar list doesn't
  // unexpectedly re-jump/highlight an old message.
  useEffect(() => {
    if (view !== 'chat') setPendingChatOpen(null);
  }, [view]);

  // Same idea for a pending client-search "jump to this applicant" —
  // once we've left the Client Profile tab, drop it so returning to a
  // profile later (via the normal client list) doesn't re-highlight.
  useEffect(() => {
    if (tab !== 'profile') setHighlightApplicant(null);
  }, [tab]);

  // Notifications: hydrate the unread list, attach the live stream (the shared
  // chat socket also carries `notification:new`), and mirror the store's cache
  // into React state so the bell badge + panel re-render on every change.
  useEffect(() => {
    if (!authed) return;
    connectChat();
    startNotificationStream();
    hydrateNotifications();
    subscribeToPush(); // OS-level push, alongside the socket stream above — no-op if unsupported/declined
    const off = onNotificationsUpdated(() => setNotifications(loadNotifications()));
    setNotifications(loadNotifications());
    // Detach the socket listener when this session ends (authed -> false on
    // logout) so a later re-login in the same tab — a fresh socket instance
    // — reattaches instead of silently staying subscribed to nothing.
    return () => { off(); stopNotificationStream(); };
  }, [authed]);

  // When a notification ARRIVES live (e.g. someone assigns you a task, raises a
  // query, or schedules a meeting), the bell/toast updated — but the actual
  // module data (your task list, prospects, etc.) was NOT re-fetched, so the
  // new item only showed up after a manual page refresh. Re-hydrate the
  // relevant module on arrival so the item appears in real time. Each
  // hydrate() dispatches its own `crm:*-updated` event, which bumps the change
  // counters the views already listen on, so TasksView / DashboardView /
  // ClientProfile / etc. re-render with the fresh data automatically.
  useEffect(() => {
    if (!authed) return;
    return onNotificationArrival((n) => {
      const refreshers = {
        TASK_ASSIGNED: hydrateTasks,
        TASK_DUE: hydrateTasks,
        PROSPECT_ASSIGNED: hydrateProspects,
        MEETING_SOON: hydrateMeetings,
        LEAD_NEW: hydrateLeads,
        LEAD_RM_ASSIGNED: hydrateLeads,
        QUERY_RAISED: hydrateQueries,
        LEAVE_APPLIED: hydrateLeave,
        LEAVE_RESPONDED: hydrateLeave,
      };
      const refresh = refreshers[n?.type];
      if (refresh) refresh().catch(() => { /* transient — the next arrival or a manual refresh recovers */ });
    });
  }, [authed]);

  // Clicking an OS push notification posts a message from the service worker
  // (src/sw.js) with the same {view,id} link shape the in-app bell uses —
  // route through the exact same handler as clicking it in-app.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type !== 'notification-click') return;
      handleOpenNotification({ id: event.data.notificationId, link: event.data.link });
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed]);

  // On startup, re-validate the session against the server (the httpOnly cookie
  // is the real credential; the cached user is only a UI hint). This corrects a
  // stale cache and logs the user out if the session has expired / was revoked.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await refreshSession();
      if (cancelled) return;
      if (user) {
        setIsViewer(false);
        setIsAdmin((user.roles || []).includes('ADMIN'));
        setAuthed(true);
      } else if (isAuthenticated() === false) {
        // Server says no valid session and cache is cleared -> ensure logged out.
        setAuthed(false);
        setIsViewer(false);
        setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const selectedGoal = selectedClient?.goals?.find(g => g.id === selectedGoalId);
  const assetClient = clients.find(c => c.id === assetClientId);
  const momClient = clients.find(c => c.id === momClientId);
  const profileClient = clients.find(c => c.id === clientProfileId);
  const proposalClient = clients.find(c => c.id === proposalClientId);
  const reviewClient = clients.find(c => c.id === reviewClientId);

  // Whenever either a goals-view client, an asset-allocation-view client, a profile-view client,
  // an MOM-view client, or a proposal-view client is open, we're "inside" a single client's profile — swap the main tab
  // bar for a per-client sub-nav.
  const profileClientId = selectedClientId || assetClientId || momClientId || clientProfileId || proposalClientId || reviewClientId;
  const inClientProfile = Boolean(profileClientId);

  const goToGoalMapping = (clientId) => {
    setAssetClientId(null);
    setMomClientId(null);
    setClientProfileId(null);
    setProposalClientId(null);
    setReviewClientId(null);
    setSelectedGoalId(null);
    setSelectedClientId(clientId);
    setTab('clients');
  };

  const goToAssetMapping = (clientId) => {
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setMomClientId(null);
    setClientProfileId(null);
    setProposalClientId(null);
    setReviewClientId(null);
    setAssetClientId(clientId);
    setTab('assets');
  };

  const goToClientProfile = (clientId) => {
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setAssetClientId(null);
    setMomClientId(null);
    setProposalClientId(null);
    setReviewClientId(null);
    setClientProfileId(clientId);
    setTab('profile');
  };

  const goToClientProfileFreshly = async (clientId) => {
    await loadData();
    goToClientProfile(clientId);
  };

  // From the client search dropdown's "Applicants" results — open the
  // owning Group Leader's profile and scroll/highlight that specific
  // family member in the Family & Applicants Details table.
  const goToApplicant = (clientId, applicant) => {
    setHighlightApplicant({ clientId, pan: applicant?.pan || '', name: applicant?.name || '' });
    goToClientProfile(clientId);
  };

  const handleOpenTask = (task) => {
    // COBR tasks (relatedTo: 'COBR') open the specialized checklist editor even
    // when opened from the Tasks module / dashboard / a profile task list —
    // the interactive Mark Done/Rejected checklist lives HERE (the working
    // view), not the generic Task form. Reopen stays COBR-module-only.
    if (task && task.relatedTo === 'COBR') {
      setEditingCobr(task);
      setCobrInteractive(true);
      setCobrAllowReopen(false);
      return;
    }
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const handleSaveTaskGlobal = (task) => {
    const allTasks = loadTasks();
    const exists = allTasks.some(t => t.id === task.id);
    const updatedTasks = exists 
      ? allTasks.map(t => t.id === task.id ? task : t) 
      : [task, ...allTasks];
    saveTasks(updatedTasks);
    setShowTaskForm(false);
    setEditingTask(null);
    setTasksChangeCounter(prev => prev + 1);
    // If this is a lead's Initial Call task and it's now Completed (Won),
    // advance the linked lead Qualified → Connected.
    if (task.leadId && task.stage === 'Completed' && task.otherSpecify === 'Initial Call') {
      const lastComment = (task.comments || []).slice(-1)[0]?.text || '';
      markConnectedFromTask(task.leadId, lastComment, getCurrentUser()?.name || 'System');
      setLeadsChangeCounter(prev => prev + 1);
    }
  };

  const handleOpenQuery = (q) => {
    setEditingQuery(q);
    setShowQueryForm(true);
  };

  const handleSaveQueryGlobal = (q) => {
    const allQueries = loadQueries();
    const exists = allQueries.some(x => x.id === q.id);
    const updatedQueries = exists
      ? allQueries.map(x => x.id === q.id ? q : x)
      : [q, ...allQueries];
    saveQueries(updatedQueries);
    setShowQueryForm(false);
    setEditingQuery(null);
    setQueriesChangeCounter(prev => prev + 1);
  };

  // COBR (Change of Broker) records are Task rows — same save pipeline as
  // handleSaveTaskGlobal above, just closing the COBR-specific modal state.
  // The COBR module opens a READ-ONLY summary (interactive=false) whose only
  // action is reopen (allowReopen — "we can reopen the cobr task from the cobr
  // module only"); the interactive Mark Done/Rejected checklist is reached from
  // the Tasks module via handleOpenTask above.
  const handleNewCobr = () => setShowCobrForm(true);
  const handleOpenCobr = (task, allowReopen = false) => {
    setEditingCobr(task);
    setCobrInteractive(false);
    setCobrAllowReopen(allowReopen);
  };
  const handleSaveCobr = (task) => {
    const allTasks = loadTasks();
    const exists = allTasks.some(t => t.id === task.id);
    const updatedTasks = exists
      ? allTasks.map(t => t.id === task.id ? task : t)
      : [task, ...allTasks];
    saveTasks(updatedTasks);
    setShowCobrForm(false);
    setEditingCobr(null);
    setCobrAllowReopen(false);
    setCobrInteractive(true);
    setTasksChangeCounter(prev => prev + 1);
  };

  const handleOpenProspect = (prospect) => {
    setEditingProspect(prospect);
    setShowProspectForm(true);
  };

  // Saves edits to an existing prospect (the "Create Prospect" flow from the
  // proposal pages writes new prospects directly and is not routed through here).
  const handleSaveProspectGlobal = (list) => {
    const updated = list[0];
    const allProspects = loadProspects();
    const updatedProspects = allProspects.map(p => p.id === updated.id ? updated : p);
    saveProspects(updatedProspects);
    window.dispatchEvent(new Event('crm:prospects-updated'));
    setShowProspectForm(false);
    setEditingProspect(null);
    setProspectsChangeCounter(prev => prev + 1);
  };

  // Open an existing meeting for edit (from the Meetings module or a profile).
  // Lock the client field for lead meetings so the name can't be overwritten.
  const handleOpenMeeting = (meeting) => {
    setEditingMeeting(meeting);
    setMeetingFormLocked(!!meeting?.leadId);
    setShowMeetingForm(true);
  };

  // Open the meeting form pre-filled for a lead (Connected stage button).
  const handleOpenLeadMeetingForm = (lead) => {
    setEditingMeeting({
      leadId: lead.id,
      clientName: leadNameOf(lead),
      assignedTo: teamName(lead.ownerId) || '',
      title: `Intro Meeting — ${leadNameOf(lead)}`,
    });
    setMeetingFormLocked(true);
    setShowMeetingForm(true);
  };

  // Schedule a brand-new meeting. When `client` is supplied (from a client
  // profile), the client field is pre-filled and locked.
  const handleScheduleMeeting = (client) => {
    if (client) {
      setEditingMeeting({ clientId: client.id, clientName: client.name, pan: client.pan });
      setMeetingFormLocked(true);
    } else {
      setEditingMeeting(null);
      setMeetingFormLocked(false);
    }
    setShowMeetingForm(true);
  };

  const handleSaveMeetingGlobal = (meeting) => {
    const all = loadMeetings();
    const exists = all.some(m => m.id === meeting.id);
    const updated = exists ? all.map(m => m.id === meeting.id ? meeting : m) : [meeting, ...all];
    saveMeetings(updated);
    setShowMeetingForm(false);
    setEditingMeeting(null);
    setMeetingFormLocked(false);
    setMeetingsChangeCounter(prev => prev + 1);
    // Keep a linked lead's stage in sync with its meeting.
    if (meeting.leadId) {
      const when = `${meeting.date || ''} ${meeting.time || ''}`.trim();
      if (meeting.status === 'Completed') syncMeetingToLead(meeting.leadId, 'completed', { mode: meeting.mode, when });
      else if (meeting.status === 'Scheduled') syncMeetingToLead(meeting.leadId, 'scheduled', { mode: meeting.mode, when });
      setLeadsChangeCounter(prev => prev + 1);
    }
  };

  // Lead → Client conversion: open the New Client form PREFILLED with the
  // lead's details so the advisor completes the client record. On save the
  // client is created (status Inactive) and the lead is stamped Converted.
  const handleConvertLead = (lead) => {
    setConvertingLead(lead);
    setEditingClientId(null);
    setShowAddClient(true);
  };

  // Same conversion, triggered from a completed lead meeting in the Meetings
  // module — so the advisor doesn't have to go back to Leads to convert.
  const handleConvertLeadFromMeeting = (meeting) => {
    const lead = loadLeads().find(l => l.id === meeting.leadId);
    if (!lead) { alert('Could not find the lead linked to this meeting.'); return; }
    setShowMeetingForm(false);
    setEditingMeeting(null);
    setMeetingFormLocked(false);
    handleConvertLead(lead);
  };

  // Schedule a meeting from a lead (Online/Offline + date/time) — creates a real
  // meeting in the Meetings module (carrying leadId) and moves the lead to
  // Meeting Pending. For Offline meetings a location log is captured.
  const handleScheduleLeadMeeting = (lead, { mode, date, time, title, location }) => {
    const id = uid();
    const meeting = {
      id, leadId: lead.id, clientId: '', clientName: leadNameOf(lead), pan: lead.pan || '',
      title: title || `Intro Meeting — ${leadNameOf(lead)}`,
      date, time, mode: mode || 'Online',
      link: '', location: mode === 'Offline' ? (location || '') : '',
      assignedTo: teamName(lead.ownerId) || '', attendees: [], status: 'Scheduled', notes: '',
      history: [{ at: new Date().toISOString(), by: getCurrentUser()?.name || 'System', action: 'Scheduled', text: `${mode} meeting scheduled from lead` }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    saveMeetings([meeting, ...loadMeetings()]);
    setMeetingsChangeCounter(p => p + 1);
    syncMeetingToLead(lead.id, 'scheduled', { mode, when: `${date} ${time}`.trim() });
    setLeadsChangeCounter(p => p + 1);
    // Navigate to Meetings view so the user sees the newly scheduled lead meeting
    setView('meetings');
  };

  // Mark a lead's pending meeting as Done → lead moves to Meeting Done.
  const handleLeadMeetingDone = (lead) => {
    const all = loadMeetings();
    const m = all.find(x => x.leadId === lead.id && x.status === 'Scheduled');
    if (m) {
      const updated = all.map(x => x.id === m.id ? { ...x, status: 'Completed', updatedAt: new Date().toISOString(), history: [...(x.history || []), { at: new Date().toISOString(), by: getCurrentUser()?.name || 'System', action: 'Completed', text: 'Marked done from lead' }] } : x);
      saveMeetings(updated);
      setMeetingsChangeCounter(p => p + 1);
    }
    syncMeetingToLead(lead.id, 'completed', {});
    setLeadsChangeCounter(p => p + 1);
  };

  // Keep the sidebar "new leads" badge live (count of leads awaiting assignment).
  useEffect(() => {
    const recompute = () => setLeadsBadge(loadLeads().filter(l => (l.stage || 'Waiting for Assignment') === 'Waiting for Assignment' && (l.status || 'Active') === 'Active').length);
    recompute();
    window.addEventListener('crm:leads-updated', recompute);
    window.addEventListener('crm:lead-received', recompute);
    return () => {
      window.removeEventListener('crm:leads-updated', recompute);
      window.removeEventListener('crm:lead-received', recompute);
    };
  }, [leadsChangeCounter]);

  // Sidebar "pending" count badges — how many open/unfinished items sit in each
  // module (only what THIS user can see, since the caches are already
  // server-view-filtered). Recomputed whenever the underlying caches change.
  useEffect(() => {
    const TASK_DONE = new Set(['Completed', 'Lost']);
    const PROSPECT_DONE = new Set(['Close Won', 'Close Lost', 'Policy Issued', 'Policy Rejected']);
    const QUERY_DONE = new Set(['Resolved', 'Closed']);
    const recompute = () => {
      const tasks = loadTasks();
      setModuleBadges({
        // COBR rows are tasks too — split them out so each badge counts its own.
        tasks: tasks.filter(t => t.relatedTo !== 'COBR' && !TASK_DONE.has(t.stage || 'Open')).length,
        cobr: tasks.filter(t => t.relatedTo === 'COBR' && (t.stage || 'Open') !== 'Completed').length,
        meetings: loadMeetings().filter(m => (m.status || 'Scheduled') === 'Scheduled').length,
        prospects: loadProspects().filter(p => !PROSPECT_DONE.has(p.stage)).length,
        queries: loadQueries().filter(q => !QUERY_DONE.has(q.stage || 'Open')).length,
      });
    };
    recompute();
    window.addEventListener('crm:tasks-updated', recompute);
    window.addEventListener('crm:meetings-updated', recompute);
    window.addEventListener('crm:prospects-updated', recompute);
    window.addEventListener('crm:queries-updated', recompute);
    return () => {
      window.removeEventListener('crm:tasks-updated', recompute);
      window.removeEventListener('crm:meetings-updated', recompute);
      window.removeEventListener('crm:prospects-updated', recompute);
      window.removeEventListener('crm:queries-updated', recompute);
    };
  }, [tasksChangeCounter, meetingsChangeCounter, prospectsChangeCounter, queriesChangeCounter]);

  // Leave has no sidebar icon, so its "needs my attention" count is tracked
  // separately and surfaced in the Account Settings dropdown instead.
  useEffect(() => {
    const recompute = () => {
      if (!canRespondToLeave()) { setPendingLeaveCount(0); return; }
      const me = getCurrentUser();
      setPendingLeaveCount(loadLeave().filter((l) => l.status === 'Pending' && l.createdBy !== me?.id).length);
    };
    recompute();
    window.addEventListener('crm:leave-updated', recompute);
    window.addEventListener('crm:permissions-updated', recompute);
    return () => {
      window.removeEventListener('crm:leave-updated', recompute);
      window.removeEventListener('crm:permissions-updated', recompute);
    };
  }, []);

  const goToMomMapping = (clientId) => {
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setAssetClientId(null);
    setClientProfileId(null);
    setProposalClientId(null);
    setReviewClientId(null);
    setMomClientId(clientId);
    setTab('mom');
  };

  // From a completed meeting → jump to that client's MOM (Draft MOM) workspace.
  // For lead meetings, the meeting's clientId is empty, but if the lead was
  // converted the lead record carries the resulting clientId — use that.
  const handleCreateMomFromMeeting = (meeting) => {
    let clientId = meeting?.clientId;
    if (!clientId && meeting?.leadId) {
      const lead = loadLeads().find(l => l.id === meeting.leadId);
      if (lead?.clientId) clientId = lead.clientId;
    }
    if (!clientId || !clients.some(c => c.id === clientId)) {
      alert('This meeting is not linked to a saved client (or the lead hasn\'t been converted yet), so its MOM workspace can\'t be opened.');
      return;
    }
    setShowMeetingForm(false);
    setEditingMeeting(null);
    setMeetingFormLocked(false);
    setView('clients');
    goToMomMapping(clientId);
  };

  const goToProposal = (clientId) => {
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setAssetClientId(null);
    setClientProfileId(null);
    setMomClientId(null);
    setReviewClientId(null);
    setProposalClientId(clientId);
    setTab('proposal');
  };

  const goToReview = (clientId) => {
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setAssetClientId(null);
    setClientProfileId(null);
    setMomClientId(null);
    setProposalClientId(null);
    setReviewClientId(clientId);
    setTab('review');
  };

  const backToClients = () => {
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setAssetClientId(null);
    setMomClientId(null);
    setClientProfileId(null);
    setProposalClientId(null);
    setReviewClientId(null);
    setTab('clients');
  };

  // Group goals for overview tab
  const allGoalNames = useMemo(() => {
    const map = new Map();
    clients.forEach(c => (c.goals || []).forEach(g => {
      const key = g.name.trim();
      if (!map.has(key)) map.set(key, { name: key, count: 0, clients: [] });
      const e = map.get(key);
      e.count++;
      e.clients.push({ id: c.id, name: c.name, goal: g });
    }));
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [clients]);

  // Calculate totals for active client
  const totals = useMemo(() => {
    if (!selectedClient || !selectedClient.goals) return { totalSip: 0, totalAdditional: 0, totalLump: 0, totalCurrentSip: 0 };
    let totalAdditional = 0, totalLump = 0, totalCurrentSip = 0;
    selectedClient.goals.forEach(g => {
      const c = calcGoal(g);
      totalAdditional += c.additionalSip;
      totalLump += c.lumpSumRequired;
      totalCurrentSip += (Number(g.currentSip) || 0);
    });
    // Total SIP is simply Current SIP + Additional SIP (signed)
    const totalSip = totalCurrentSip + totalAdditional;
    return { totalSip, totalAdditional, totalLump, totalCurrentSip };
  }, [selectedClient]);

  // Build global statistics
  const globalStats = useMemo(() => {
    const totalClients = clients.length;
    let activeGoals = 0;
    let clientsWithGoals = 0;
    let clientsWithoutGoals = 0;
    let clientsWithAllocation = 0;
    let clientsWithoutAllocation = 0;

    clients.forEach(c => {
      const gc = c.goals ? c.goals.length : 0;
      activeGoals += gc;
      if (gc > 0) clientsWithGoals++;
      else clientsWithoutGoals++;
      if (hasAllocation(c)) clientsWithAllocation++;
      else clientsWithoutAllocation++;
    });

    return {
      totalClients,
      activeGoals,
      clientsWithGoals,
      clientsWithoutGoals,
      clientsWithAllocation,
      clientsWithoutAllocation,
    };
  }, [clients]);

  // Build rows for Reports timeline tab
  const reportRows = useMemo(() => {
    const cutoffKey = (CURRENT_YEAR + reportTimeframe) * 12 + CURRENT_MONTH;
    const rows = [];
    clients.forEach(c => (c.goals || []).forEach(g => {
      const gKey = g.targetYear * 12 + (g.targetMonth || 1);
      if (gKey <= cutoffKey && (reportGoalFilter === 'all' || g.name === reportGoalFilter)) {
        rows.push({ clientName: c.name, clientId: c.id, goal: g, calc: calcGoal(g) });
      }
    }));
    return rows.sort((a, b) => {
      const ka = a.goal.targetYear * 12 + (a.goal.targetMonth || 1);
      const kb = b.goal.targetYear * 12 + (b.goal.targetMonth || 1);
      return ka - kb;
    });
  }, [clients, reportGoalFilter, reportTimeframe]);

  // Operations wrapped in try-catch and reload triggers
  const handleAddClient = async (name, pan, age, clientDetails) => {
    const newClient = { id: uid(), name, pan, age: Number(age) || 0, clientDetails, createdAt: new Date().toISOString() };
    try {
      await addClient(newClient);
      await loadData();
    } catch (err) {
      alert('Error adding client: ' + err.message);
    }
  };

  const handleUpdateClient = async (clientId, updates) => {
    try {
      await updateClient(clientId, updates);
      await loadData();
    } catch (err) {
      alert('Error updating client: ' + err.message);
    }
  };

  const handleDeleteClient = async (clientId) => {
    if (!window.confirm('Are you sure you want to delete this client and all their goals? This action cannot be undone.')) return;
    try {
      await deleteClient(clientId);
      if (selectedClientId === clientId || assetClientId === clientId || momClientId === clientId || clientProfileId === clientId || proposalClientId === clientId || reviewClientId === clientId) {
        backToClients();
      }
      await loadData();
    } catch (err) {
      alert('Error deleting client: ' + err.message);
    }
  };

  const handleAddGoal = async (clientId, goal) => {
    const newGoal = { ...goal, id: uid() };
    try {
      await addGoal(clientId, newGoal);
      await loadData();
    } catch (err) {
      alert('Error adding goal: ' + err.message);
    }
  };

  const handleUpdateGoal = async (clientId, goalId, updates) => {
    try {
      await updateGoal(clientId, goalId, updates);
      await loadData();
    } catch (err) {
      alert('Error updating goal: ' + err.message);
    }
  };

  const handleDeleteGoal = async (clientId, goalId) => {
    if (!window.confirm('Are you sure you want to delete this goal?')) return;
    try {
      await deleteGoal(clientId, goalId);
      if (selectedGoalId === goalId) setSelectedGoalId(null);
      await loadData();
    } catch (err) {
      alert('Error deleting goal: ' + err.message);
    }
  };

  const handleSaveAssumptions = async (clientId, text) => {
    await handleUpdateClient(clientId, { assumptions: text });
  };

  // Save an asset-allocation patch (full form payload, or a remark-only patch).
  // Diffs against the previous allocation and appends an edit-history entry.
  const handleSaveAllocation = async (clientId, patch) => {
    const client = clients.find(c => c.id === clientId);
    const prev = normalizeAllocation(client?.assetAllocation);
    const merged = normalizeAllocation({
      values: patch.values || prev.values,
      custom: patch.custom || prev.custom,
      remark: patch.remark !== undefined ? patch.remark : prev.remark,
      peRatio: patch.peRatio !== undefined ? patch.peRatio : prev.peRatio,
    });
    const changes = buildAllocationEdits(prev, merged);
    if (changes.length === 0) return; // nothing actually changed — skip the write
    const history = [...prev.history, { at: new Date().toISOString(), by: getCurrentUser()?.name || 'System', changes }];
    const assetAllocation = { ...merged, history, updatedAt: new Date().toISOString() };
    await handleUpdateClient(clientId, { assetAllocation });
  };

  const handleImportClients = async (rows) => {
    // Resolve a team-member NAME from the sheet to its account id (managers are
    // stored as ids for RBAC). Accepts an id verbatim too. Blank if unmatched.
    const team = loadTeam();
    const idByName = new Map(team.map(m => [m.name.trim().toLowerCase(), m.id]));
    const resolveManager = (v) => {
      if (!v) return '';
      if (team.some(m => m.id === v)) return v;
      return idByName.get(String(v).trim().toLowerCase()) || '';
    };
    const computeAge = (dob) => {
      if (!dob) return 0;
      const d = new Date(dob);
      if (isNaN(d.getTime())) return 0;
      const t = new Date();
      let a = t.getFullYear() - d.getFullYear();
      const m = t.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
      return a >= 0 ? a : 0;
    };

    let ok = 0, fail = 0;
    for (const r of rows) {
      const mg = r.managers || {};
      const clientDetails = {
        mobile: r.mobile || '', email: r.email || '', clientType: r.clientType || '', maritalStatus: r.maritalStatus || '', dob: r.dob || '',
        address1: r.address1 || '', address2: r.address2 || '', address3: r.address3 || '',
        country: r.country || 'India', state: r.state || '', city: r.city || '', pinCode: r.pinCode || '',
        profession: r.profession || '', professionOther: '',
        relationshipManager: resolveManager(mg.relationshipManager),
        portfolioManager: resolveManager(mg.portfolioManager),
        insuranceManager: resolveManager(mg.insuranceManager),
        serviceManager: resolveManager(mg.serviceManager),
        owner: resolveManager(mg.owner),
        operationManager: resolveManager(mg.operationManager),
        internalManager: resolveManager(mg.internalManager),
        familyDetails: Array.isArray(r.familyDetails) ? r.familyDetails : [],
        mutualFunds: r.mutualFunds || 'No', insuranceTerm: r.insuranceTerm || 'No',
        insuranceMedical: r.insuranceMedical || 'No', insuranceAccidental: r.insuranceAccidental || 'No',
        status: r.status || 'Active',
        openActivities: [], closedActivities: [], meetingHistory: [], businessProspects: [], attachments: [], notes: '',
      };
      const newClient = { id: uid(), name: r.name, pan: r.pan, age: Number(r.age) || computeAge(r.dob), clientDetails };
      try { await addClient(newClient); ok++; }
      catch (err) { fail++; console.error(`Import failed for ${r.name}:`, err); }
    }
    await loadData();
    if (fail > 0) alert(`Imported ${ok} client(s). ${fail} row(s) failed — see console for details.`);
  };

  const handleSetView = (newView) => {
    setView(newView);
    if (newView === 'prospects') {
      setProspectQuery('');
    }
  };

  // Clicking a notification (in the panel or a toast) marks it read and jumps to
  // the relevant module. The record-level id is carried on the link for future
  // deep-linking; for now we land on the module view.
  const handleOpenNotification = (n) => {
    setActiveDropdown(null);
    if (n?.id) markNotificationRead(n.id);
    const target = n?.link?.view;
    if (target) handleSetView(target);
  };

  const handleNavDoubleClick = async (id) => {
    if (id === 'clients') {
      try {
        setSelectedClientId(null);
        setSelectedGoalId(null);
        setSelectedGoalName(null);
        setAssetClientId(null);
        setMomClientId(null);
        setClientProfileId(null);
        setProposalClientId(null);
        setReviewClientId(null);
        setTab('clients');
        await loadData();
      } catch (err) {
        console.error('Failed to reload fresh client directory:', err);
      }
    }
  };

  if (!authed) {
    return <Login onLogin={handleLogin} theme={theme} setTheme={setTheme} />;
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        <span className="font-semibold text-sm animate-pulse">Initializing Financial Workspace...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50/40 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 antialiased font-sans">
      {/* On-screen toast previews (business notifications + new-chat popups) */}
      <NotificationToaster
        view={view}
        onOpen={handleOpenNotification}
        onOpenChat={() => { setActiveDropdown(null); setView('chat'); }}
        onBellShake={() => triggerAnim('bell')}
      />
      <InstallPrompt />
      {view !== 'chat' && (
        <Sidebar
          view={view}
          setView={handleSetView}
          onNavDoubleClick={handleNavDoubleClick}
          badges={{ leads: leadsBadge, chat: chatUnread, tasks: moduleBadges.tasks, cobr: moduleBadges.cobr, meetings: moduleBadges.meetings, prospects: moduleBadges.prospects, queries: moduleBadges.queries }}
          othersSubTab={othersSubTab}
          onSelectOthersTab={setOthersSubTab}
        />
      )}

      <div className={`flex-1 min-w-0 flex flex-col min-h-screen relative ${view === 'chat' ? 'pt-0' : 'pt-14'}`}>
        {/* Top Right Floating Trapezoid Dock */}
        {view !== 'chat' && (
          <div className="no-print fixed top-0 right-12 z-30 flex flex-col items-end filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.06)] dark:drop-shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
            <div 
              style={{
                clipPath: 'polygon(0 0, 100% 0, 89% 82%, 87% 92%, 84% 100%, 16% 100%, 13% 92%, 11% 82%)'
              }}
              className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-x border-slate-200/20 dark:border-slate-800/40 pl-9 pr-9 py-2.5 flex items-center gap-5.5"
            >
              {/* Chat Icon Button — hover for an unread-messages preview,
                  click to open the full Chat module as before. */}
              <button
                onClick={() => {
                  triggerAnim('chat');
                  setActiveDropdown(null);
                  setChatPreviewOpen(false);
                  setView('chat');
                  setShowChatSplash(true);
                  setTimeout(() => {
                    setShowChatSplash(false);
                  }, 1800);
                }}
                onMouseEnter={() => {
                  clearTimeout(chatPreviewCloseTimer.current);
                  setChatPreviewOpen(true);
                }}
                onMouseLeave={() => {
                  chatPreviewCloseTimer.current = setTimeout(() => setChatPreviewOpen(false), 250);
                }}
                className={`p-1.5 transition-all duration-300 relative cursor-pointer text-slate-500 dark:text-slate-400
                  hover:scale-125 hover:text-blue-600 dark:hover:text-blue-400 hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]
                  ${view === 'chat' ? 'text-blue-600 dark:text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : ''}
                  ${activeAnim.chat ? 'animate-chat-bounce' : ''}`}
                title="Chat"
              >
                <MessageSquare size={19} />
                {chatUnread > 0 && (
                  <span className="absolute -top-0.5 -right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[8px] font-black rounded-full bg-blue-600 text-white ring-2 ring-white dark:ring-slate-900">
                    {chatUnread > 9 ? '9+' : chatUnread}
                  </span>
                )}
              </button>

              {/* Notification Bell Button */}
              <button
                onClick={() => handleToolbarClick('bell')}
                className={`p-1.5 transition-all duration-300 relative cursor-pointer text-slate-500 dark:text-slate-400
                  hover:scale-125 hover:text-amber-500 dark:hover:text-amber-400 hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]
                  ${activeDropdown === 'bell' ? 'text-amber-500 dark:text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] scale-110' : ''}
                  ${activeAnim.bell ? 'animate-bell-ring' : ''}`}
                title="Notifications"
              >
                <Bell size={19} />
                {notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[8px] font-black rounded-full bg-rose-500 text-white ring-2 ring-white dark:ring-slate-900">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>

              {/* Profile Avatar Button */}
              <button
                onClick={() => handleToolbarClick('profile')}
                className={`w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shadow-sm border border-blue-500/20 transition-all duration-300 cursor-pointer shrink-0 relative overflow-hidden
                  hover:scale-115 active:scale-95 hover:ring-2 hover:ring-blue-500/50 hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]
                  ${activeAnim.profile ? 'animate-profile-pop' : ''}`}
                title="Advisor Profile"
              >
                {advisorProfile.photo ? (
                  <img src={advisorProfile.photo} alt={advisorProfile.name} className="w-full h-full object-cover" />
                ) : (
                  initials(advisorProfile.name || 'NL')
                )}
              </button>
            </div>

            {/* Chat unread-messages hover preview */}
            {chatPreviewOpen && (
              <div
                className="absolute top-11 right-24 w-80 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/80 shadow-2xl z-45 animate-scale-up p-4 mt-2 text-left"
                onMouseEnter={() => clearTimeout(chatPreviewCloseTimer.current)}
                onMouseLeave={() => {
                  chatPreviewCloseTimer.current = setTimeout(() => setChatPreviewOpen(false), 250);
                }}
              >
                <ChatHoverPreview
                  conversations={chatConversationsPreview}
                  usersById={chatUsersById}
                  me={getCurrentUser()}
                  online={new Set()}
                  onOpen={(conversationId, messageId) => {
                    setChatPreviewOpen(false);
                    setPendingChatOpen({ conversationId, messageId });
                    triggerAnim('chat');
                    setActiveDropdown(null);
                    setView('chat');
                  }}
                />
              </div>
            )}

            {/* Dropdown Popovers - Outside the clipped dock */}
            {activeDropdown === 'bell' && (
              <div className="absolute top-11 right-10 w-80 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/80 shadow-2xl z-45 animate-scale-up p-4 mt-2 text-left">
                <NotificationPanel
                  notifications={notifications}
                  onMarkRead={markNotificationRead}
                  onMarkAllRead={markAllNotificationsRead}
                  onOpen={handleOpenNotification}
                />
              </div>
            )}

            {/* Profile Dropdown */}
            {activeDropdown === 'profile' && (
              <div className="absolute top-11 right-0 w-64 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/80 shadow-2xl z-45 animate-scale-up p-4 mt-2 text-left">
                <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0 overflow-hidden">
                    {advisorProfile.photo ? (
                      <img src={advisorProfile.photo} alt={advisorProfile.name} className="w-full h-full object-cover" />
                    ) : (
                      initials(advisorProfile.name || 'NL')
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{advisorProfile.name || getCurrentUser()?.name || 'User'}</h4>
                    <p className="text-[9px] text-slate-450 dark:text-slate-500 truncate font-semibold">{advisorProfile.email || 'nitesh@teamfintness.com'}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-widest">
                    Account and General Settings
                  </div>
                  <button
                    onClick={() => { setActiveDropdown(null); setView('myprofile'); }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
                  >
                    Profile Settings
                  </button>
                  <button
                    onClick={() => { setActiveDropdown(null); setView('leave'); }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
                  >
                    <span>Leave</span>
                    {pendingLeaveCount > 0 && (
                      <span className="text-[9px] font-black text-white bg-amber-500 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                        {pendingLeaveCount > 99 ? '99+' : pendingLeaveCount}
                      </span>
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => { setActiveDropdown(null); setView('users'); }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
                    >
                      <span>User Management</span>
                      <span className="text-[8px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 ml-1.5 px-1.5 py-0.5 rounded uppercase tracking-wider">Admin</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => { setActiveDropdown(null); setView('permissions'); }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
                    >
                      <span>Permission Matrix</span>
                      <span className="text-[8px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 ml-1.5 px-1.5 py-0.5 rounded uppercase tracking-wider">Admin</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => { setActiveDropdown(null); setView('activity-log'); }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
                    >
                      <span>Activity Log</span>
                      <span className="text-[8px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 ml-1.5 px-1.5 py-0.5 rounded uppercase tracking-wider">Admin</span>
                    </button>
                  )}
                  <button className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all">
                    Preferences <span className="text-[8px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-550 ml-1.5 px-1 py-0.5 rounded">Soon</span>
                  </button>
                  <button
                    onClick={() => { setActiveDropdown(null); setShowChangePassword(true); }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
                  >
                    Change Password
                  </button>
                  <div className="border-t border-slate-100 dark:border-slate-800 my-2" />
                  <button
                    onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
                  >
                    <span>Theme Mode</span>
                    {theme === 'dark' ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-slate-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setActiveDropdown(null);
                      handleLogout();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-455 hover:bg-rose-50 dark:hover:bg-rose-955/20 cursor-pointer transition-all"
                  >
                    <span>Sign Out</span>
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Global Transparent Click Handler to close dropdowns */}
        {activeDropdown && (
          <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(null)} />
        )}

        {view === 'dashboard' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <DashboardView
              clients={clients}
              advisorName={advisorProfile.name}
              tasksChangeCounter={tasksChangeCounter}
              prospectsChangeCounter={prospectsChangeCounter}
              meetingsChangeCounter={meetingsChangeCounter}
              setView={handleSetView}
              onNewClient={() => { setEditingClientId(null); setShowAddClient(true); }}
              onNewMeeting={() => { setEditingMeeting(null); setShowMeetingForm(true); }}
              onNewTask={() => { setEditingTask(null); setShowTaskForm(true); }}
              onOpenTask={handleOpenTask}
              onOpenMeeting={handleOpenMeeting}
              onOpenProspect={handleOpenProspect}
            />
          </main>
        )}

        {view === 'myprofile' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <MyProfileView />
          </main>
        )}

        {view === 'leave' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <LeaveView />
          </main>
        )}

        {view === 'users' && isAdmin && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <UsersAdmin />
          </main>
        )}

        {view === 'activity-log' && isAdmin && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <ActivityLogView />
          </main>
        )}

        {view === 'permissions' && isAdmin && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <PermissionsMatrix />
          </main>
        )}

        {view === 'chat' && (
          <div className="w-full flex-1 flex select-none bg-slate-50 dark:bg-slate-950">
            {showChatSplash ? (
              <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-50 dark:bg-slate-950 transition-colors duration-300 animate-fade-in pb-12 pt-24">
                <div />
                <div className="flex flex-col items-center gap-4">
                  <img
                    src={logoImg}
                    className="w-20 h-20 object-contain rounded-2xl shadow-xl ring-2 ring-blue-500/20 dark:ring-blue-500/10 animate-bounce-subtle"
                    alt="Team Fintness"
                  />
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100 font-heading">
                    Fintness Chat
                  </h2>
                  <div className="w-36 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-4">
                    <div className="h-full bg-blue-600 rounded-full animate-loading-bar" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1.5 animate-slide-up">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    from
                  </span>
                  <span className="text-sm font-black tracking-wider bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent uppercase">
                    fintness finserv
                  </span>
                </div>
              </div>
            ) : (
              <>
                <ChatSidebar
                  advisorProfile={advisorProfile}
                  isAdmin={isAdmin}
                  theme={theme}
                  setTheme={setTheme}
                  onLogout={handleLogout}
                  setShowChangePassword={setShowChangePassword}
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                  setView={setView}
                  pendingLeaveCount={pendingLeaveCount}
                  notifications={notifications}
                  onMarkRead={markNotificationRead}
                  onMarkAllRead={markAllNotificationsRead}
                  onOpenNotification={handleOpenNotification}
                />
                <div className="flex-1 min-w-0 h-screen flex flex-col">
                  <ChatView
                    onQuickAction={(action) => {
                      if (action === 'task') { setEditingTask(null); setShowTaskForm(true); }
                      else if (action === 'meeting') setView('meetings');
                      else if (action === 'lead') setView('leads');
                      else if (action === 'client') setView('clients');
                      else if (action === 'dash') setView('dashboard');
                    }}
                    initialConversationId={pendingChatOpen?.conversationId}
                    initialMessageId={pendingChatOpen?.messageId}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {view === 'leads' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <LeadsView
              isViewer={isViewer}
              clients={clients}
              leadsChangeCounter={leadsChangeCounter}
              onConvertLead={handleConvertLead}
              onScheduleLeadMeeting={handleScheduleLeadMeeting}
              onLeadMeetingDone={handleLeadMeetingDone}
              onOpenLeadMeetingForm={handleOpenLeadMeetingForm}
            />
          </main>
        )}

        {view === 'tasks' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <TasksView 
              clients={clients} 
              isViewer={isViewer} 
              activeTaskId={activeTaskId} 
              setActiveTaskId={setActiveTaskId}
              onOpenTask={handleOpenTask}
              tasksChangeCounter={tasksChangeCounter}
            />
          </main>
        )}

        {view === 'cobr' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <CobrView
              isViewer={isViewer}
              tasksChangeCounter={tasksChangeCounter}
              onNewCobr={handleNewCobr}
              onOpenCobr={handleOpenCobr}
            />
          </main>
        )}

        {view === 'meetings' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <MeetingsView
              clients={clients}
              isViewer={isViewer}
              onOpenMeeting={handleOpenMeeting}
              onScheduleMeeting={handleScheduleMeeting}
              onCreateMom={handleCreateMomFromMeeting}
              onConvertLead={handleConvertLeadFromMeeting}
              meetingsChangeCounter={meetingsChangeCounter}
              activeMeetingId={activeMeetingId}
              setActiveMeetingId={setActiveMeetingId}
            />
          </main>
        )}

        {view === 'documents' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <DocumentsView clients={clients} />
          </main>
        )}

        {view === 'queries' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <QueriesView
              isViewer={isViewer}
              activeQueryId={activeQueryId}
              setActiveQueryId={setActiveQueryId}
              onOpenQuery={handleOpenQuery}
              queriesChangeCounter={queriesChangeCounter}
            />
          </main>
        )}

        {view === 'prospects' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <ProspectsView
              isViewer={isViewer}
              onOpenProspect={handleOpenProspect}
              prospectsChangeCounter={prospectsChangeCounter}
              activeProspectId={activeProspectId}
              setActiveProspectId={setActiveProspectId}
              clients={clients}
              initialQuery={prospectQuery}
            />
          </main>
        )}

        {view === 'reports' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <div className="flex flex-col items-center justify-center text-center py-24 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 mb-5">
                <TrendingUp size={28} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Reports</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm">This section is coming soon — advanced reports and data exports will live here.</p>
            </div>
          </main>
        )}

        {view === 'others' && (
          <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
            <OthersView
              clients={clients}
              isViewer={isViewer}
              subTab={othersSubTab}
              onSubTabChange={setOthersSubTab}
            />
          </main>
        )}

        {view === 'clients' && (
        <>
      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto px-6 pt-4 pb-8">
        {/* Global Summary Statistics Dashboard */}
        {!inClientProfile && !selectedGoalName && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6 animate-fade-in">
            <StatTile label="Total Clients" value={globalStats.totalClients} icon={Users} accent="blue" />
            <StatTile label="Clients with Goals" value={globalStats.clientsWithGoals} icon={CheckCircle2} accent="emerald" />
            <StatTile label="Clients without Goals" value={globalStats.clientsWithoutGoals} icon={AlertCircle} accent="amber" />
            <StatTile label="Total Goals" value={globalStats.activeGoals} icon={Target} accent="indigo" />
            <StatTile label="Clients with Asset Allocation" value={globalStats.clientsWithAllocation} icon={Wallet} accent="emerald" />
            <StatTile label="Clients without Asset Allocation" value={globalStats.clientsWithoutAllocation} icon={PieChart} accent="amber" />
          </div>
        )}

        {/* Navigation Tabs (top-level) OR per-client profile sub-nav */}
        {!inClientProfile ? (
          <div className="w-full overflow-x-auto mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm transition-colors">
              {[
                { id: 'clients', label: 'Clients', icon: Users },
                { id: 'goals', label: 'Goals Summary', icon: Target },
                { id: 'assets', label: 'Asset Allocation', icon: Wallet },
                { id: 'reports', label: 'Timeline Reports', icon: FileBarChart }
              ].map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id);
                      setSelectedClientId(null);
                      setSelectedGoalId(null);
                      setSelectedGoalName(null);
                      setAssetClientId(null);
                      setMomClientId(null);
                      setClientProfileId(null);
                      setReviewClientId(null);
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                      active
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden animate-fade-in no-print">
            <div className="inline-flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm transition-colors">
              <button
                onClick={backToClients}
                title="Back to Clients"
                className="flex items-center justify-center w-9 h-9 rounded-xl transition-all cursor-pointer shrink-0 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => goToClientProfile(profileClientId)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  clientProfileId
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <User size={14} />
                Client Profile
              </button>
              <button
                onClick={() => goToGoalMapping(profileClientId)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  selectedClientId
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Target size={14} />
                Goal Mapping
              </button>
              <button
                onClick={() => goToAssetMapping(profileClientId)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  assetClientId
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Wallet size={14} />
                Asset Allocation Mapping
              </button>
              <button
                onClick={() => goToProposal(profileClientId)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  proposalClientId
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText size={14} />
                Proposals
              </button>
              <button
                onClick={() => goToMomMapping(profileClientId)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  momClientId
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText size={14} />
                Draft MOM
              </button>
              <button
                onClick={() => goToReview(profileClientId)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  reviewClientId
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText size={14} />
                Review
              </button>
            </div>
          </div>
        )}

        {/* Tab Routing */}
        {tab === 'clients' && !selectedClientId && (
          <div className="animate-scale-up">
            <ClientList
              clients={clients}
              onSelect={goToClientProfile}
              onSelectFreshly={goToClientProfileFreshly}
              onSelectApplicant={goToApplicant}
              onAdd={() => setShowAddClient(true)}
              onDelete={handleDeleteClient}
              onImport={() => setShowImportExcel(true)}
              isViewer={isViewer}
            />
          </div>
        )}
        
        {tab === 'clients' && selectedClientId && !selectedGoalId && (
          <div className="animate-scale-up">
            <ClientDetail
              client={selectedClient}
              totals={totals}
              onAddGoal={() => { setEditingGoalId(null); setShowGoalForm(true); }}
              onSelectGoal={setSelectedGoalId}
              onDeleteGoal={(gid) => handleDeleteGoal(selectedClientId, gid)}
              onSaveAssumptions={(text) => handleSaveAssumptions(selectedClientId, text)}
              onEditClient={() => { setEditingClientId(selectedClientId); setShowAddClient(true); }}
              isViewer={isViewer}
            />
          </div>
        )}

        {tab === 'clients' && selectedGoalId && (
          <div className="animate-scale-up">
            <GoalDetail
              goal={selectedGoal}
              clientName={selectedClient.name}
              onBack={() => setSelectedGoalId(null)}
              onEdit={() => { setEditingGoalId(selectedGoalId); setShowGoalForm(true); }}
              onSaveActuals={(actuals, changes) => {
                const prevHistory = Array.isArray(selectedGoal?.history) ? selectedGoal.history : [];
                const history = (changes && changes.length)
                  ? [...prevHistory, { at: new Date().toISOString(), by: getCurrentUser()?.name || 'System', changes }]
                  : prevHistory;
                handleUpdateGoal(selectedClientId, selectedGoalId, { actuals, history });
              }}
              isViewer={isViewer}
            />
          </div>
        )}

        {tab === 'goals' && !selectedGoalName && (
          <div className="animate-scale-up">
            <GoalsOverview goalGroups={allGoalNames} onSelect={setSelectedGoalName} />
          </div>
        )}

        {tab === 'goals' && selectedGoalName && (
          <div className="animate-scale-up">
            <GoalGroupDetail
              groupName={selectedGoalName}
              entries={allGoalNames.find(g => g.name === selectedGoalName)?.clients || []}
              onBack={() => setSelectedGoalName(null)}
              onSelectClient={(cid) => { goToClientProfile(cid); setSelectedGoalName(null); }}
            />
          </div>
        )}

        {tab === 'assets' && !assetClientId && (
          <div className="animate-scale-up">
            <AssetAllocationList clients={clients} onSelect={setAssetClientId} />
          </div>
        )}

        {tab === 'assets' && assetClientId && assetClient && (
          <div className="animate-scale-up">
            <AssetAllocationDetail
              client={assetClient}
              onEdit={() => setShowAllocModal(true)}
              onSaveRemark={(remark) => handleSaveAllocation(assetClientId, { remark })}
              isViewer={isViewer}
            />
          </div>
        )}

        {tab === 'profile' && clientProfileId && profileClient && (
          <div className="animate-scale-up">
            <ClientProfileView
              client={profileClient}
              clients={clients}
              onEditClient={() => { setEditingClientId(clientProfileId); setShowAddClient(true); }}
              onDeleteClient={() => handleDeleteClient(clientProfileId)}
              isViewer={isViewer}
              highlightApplicant={highlightApplicant?.clientId === clientProfileId ? highlightApplicant : null}
              onNavigateToTasks={(taskId) => {
                setView('tasks');
                setActiveTaskId(taskId);
              }}
              onOpenTask={handleOpenTask}
              tasksChangeCounter={tasksChangeCounter}
              onOpenCobr={(task) => handleOpenCobr(task, false)}
              onNavigateToProspects={(prospectId, clientName) => {
                setView('prospects');
                setProspectQuery(clientName || '');
                setActiveProspectId(prospectId);
              }}
              onOpenProspect={handleOpenProspect}
              prospectsChangeCounter={prospectsChangeCounter}
              onScheduleMeeting={handleScheduleMeeting}
              onOpenMeeting={handleOpenMeeting}
              meetingsChangeCounter={meetingsChangeCounter}
              onNavigateToMeetings={(meetingId) => {
                setView('meetings');
                setActiveMeetingId(meetingId);
              }}
            />
          </div>
        )}

        {tab === 'mom' && momClientId && momClient && (
          <div className="animate-scale-up">
            <MomWorkspace
              client={momClient}
              onBack={backToClients}
            />
          </div>
        )}

        {tab === 'review' && reviewClientId && reviewClient && (
          <div className="animate-scale-up">
            <ReviewWorkspace
              client={reviewClient}
              subTab={reviewSubTab}
              setSubTab={setReviewSubTab}
            />
          </div>
        )}

        {tab === 'proposal' && proposalClientId && proposalClient && (
          <div className="animate-scale-up">
            <ProposalWorkspace
              client={proposalClient}
              subTab={proposalSubTab}
              setSubTab={setProposalSubTab}
              isViewer={isViewer}
            />
          </div>
        )}

        {tab === 'reports' && (
          <div className="animate-scale-up">
            <ReportsView
              goalNames={allGoalNames.map(g => g.name)}
              goalFilter={reportGoalFilter}
              setGoalFilter={setReportGoalFilter}
              timeframe={reportTimeframe}
              setTimeframe={setReportTimeframe}
              rows={reportRows}
              onOpenClient={goToClientProfile}
            />
          </div>
        )}
      </main>
        </>
        )}

      {/* Footer */}
      {view !== 'chat' && (
        <footer className="max-w-7xl w-full mx-auto px-6 py-10 text-xs text-slate-400 dark:text-slate-500 text-center border-t border-slate-200/40 dark:border-slate-800/40 mt-12">
          © {CURRENT_YEAR} Team Fintness · Building fitter financial futures
        </footer>
      )}
      </div>

      {/* Modals */}
      {showAddClient && (
        <ClientFormModal
          initial={editingClientId ? clients.find(c => c.id === editingClientId) : (convertingLead ? clientPayloadFromLead(convertingLead) : null)}
          clients={clients}
          autosaveKey={convertingLead ? `lead-${convertingLead.id}` : undefined}
          onClose={() => { setShowAddClient(false); setEditingClientId(null); setConvertingLead(null); }}
          onSave={async (name, pan, age, clientDetails) => {
            if (editingClientId) {
              await handleUpdateClient(editingClientId, { name, pan, age: Number(age) || 0, clientDetails });
            } else if (convertingLead) {
              // Lead → Client: create the client, link it back to the lead, mark
              // the lead Converted, then open the new client's profile.
              const newId = uid();
              try {
                await addClient({ id: newId, name, pan, age: Number(age) || 0, clientDetails, createdAt: new Date().toISOString() });
                updateLead(convertingLead.id, { stage: 'Converted', clientId: newId }, advisorProfile.name || getCurrentUser()?.name || 'System');
                await loadData();
                setLeadsChangeCounter(c => c + 1);
                setView('clients');
                goToClientProfile(newId);
              } catch (err) {
                alert('Conversion failed — the lead stays at Meeting Done. ' + err.message);
              }
            } else {
              await handleAddClient(name, pan, age, clientDetails);
            }
            setShowAddClient(false);
            setEditingClientId(null);
            setConvertingLead(null);
          }}
        />
      )}
      
      {showImportExcel && (
        <ExcelImportModal
          onClose={() => setShowImportExcel(false)}
          onImport={handleImportClients}
          clients={clients}
        />
      )}

      {showAllocModal && assetClient && (
        <AssetAllocationModal
          clientName={assetClient.name}
          initial={assetClient.assetAllocation}
          onClose={() => setShowAllocModal(false)}
          onSave={(patch) => {
            handleSaveAllocation(assetClientId, patch);
            setShowAllocModal(false);
          }}
        />
      )}

      {showGoalForm && selectedClient && (
        <GoalFormModal
          initial={editingGoalId ? selectedClient.goals.find(g => g.id === editingGoalId) : null}
          onClose={() => { setShowGoalForm(false); setEditingGoalId(null); }}
          onSave={(g) => {
            if (editingGoalId) {
              const prev = selectedClient.goals.find(x => x.id === editingGoalId);
              const changes = prev ? buildGoalEdits(prev, g) : [];
              const prevHistory = Array.isArray(prev?.history) ? prev.history : [];
              const history = changes.length
                ? [...prevHistory, { at: new Date().toISOString(), by: getCurrentUser()?.name || 'System', changes }]
                : prevHistory;
              handleUpdateGoal(selectedClient.id, editingGoalId, { ...g, history });
            } else {
              handleAddGoal(selectedClient.id, { ...g, createdAt: g.createdAt || new Date().toISOString(), history: [] });
            }
            setShowGoalForm(false);
            setEditingGoalId(null);
          }}
        />
      )}

      {showTaskForm && (
        <TaskFormModal
          initial={editingTask}
          clients={clients}
          isViewer={isViewer}
          onClose={() => { setShowTaskForm(false); setEditingTask(null); }}
          onSave={handleSaveTaskGlobal}
        />
      )}

      {showQueryForm && (
        <QueryFormModal
          initial={editingQuery}
          isViewer={isViewer}
          onClose={() => { setShowQueryForm(false); setEditingQuery(null); }}
          onSave={handleSaveQueryGlobal}
        />
      )}

      {showCobrForm && (
        <CobrFormModal
          clients={clients}
          onClose={() => setShowCobrForm(false)}
          onSave={handleSaveCobr}
        />
      )}

      {editingCobr && (
        <CobrTaskModal
          task={editingCobr}
          interactive={cobrInteractive}
          allowReopen={cobrAllowReopen}
          onClose={() => { setEditingCobr(null); setCobrAllowReopen(false); setCobrInteractive(true); }}
          onSave={handleSaveCobr}
        />
      )}

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {showProspectForm && editingProspect && (
        <ProspectModal
          mode="edit"
          initial={editingProspect}
          clients={clients}
          isViewer={isViewer}
          onClose={() => { setShowProspectForm(false); setEditingProspect(null); }}
          onConfirm={handleSaveProspectGlobal}
        />
      )}

      {showMeetingForm && (
        <MeetingFormModal
          initial={editingMeeting}
          clients={clients}
          isViewer={isViewer}
          lockClient={meetingFormLocked}
          onCreateMom={handleCreateMomFromMeeting}
          onConvertLead={handleConvertLeadFromMeeting}
          onClose={() => { setShowMeetingForm(false); setEditingMeeting(null); setMeetingFormLocked(false); }}
          onSave={handleSaveMeetingGlobal}
        />
      )}
    </div>
  );
}

function ChatSidebar({
  advisorProfile, isAdmin, theme, setTheme, onLogout,
  setShowChangePassword, activeDropdown, setActiveDropdown, setView,
  notifications = [], onMarkRead, onMarkAllRead, onOpenNotification, pendingLeaveCount = 0
}) {
  return (
    <aside
      style={{ width: '64px' }}
      className="no-print h-screen flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200/70 dark:border-slate-800/70 z-30 shrink-0 shadow-md dark:shadow-none overflow-hidden"
    >
      <div className="flex flex-col h-full w-full py-6 justify-between items-center min-h-0">
        {/* Top: Back Button */}
        <div className="flex flex-col items-center shrink-0 w-full mb-6">
          <button
            onClick={() => setView('dashboard')}
            title="Back to Dashboard"
            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer text-slate-500 hover:bg-slate-100/60 dark:hover:bg-slate-850 hover:text-slate-900 dark:hover:text-white border border-slate-200/60 dark:border-slate-800/60 shadow-sm bg-slate-50 dark:bg-slate-950/40 hover:scale-105"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        {/* Bottom: Bell and Profile */}
        <div className="w-full px-2 flex flex-col items-center gap-4 shrink-0">
          {/* Bell Icon Button */}
          <button
            onClick={() => setActiveDropdown(prev => prev === 'bell' ? null : 'bell')}
            className={`dock-item w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative text-slate-500 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-850 hover:text-slate-900 dark:hover:text-white
              ${activeDropdown === 'bell' ? 'text-amber-500 dark:text-amber-400 bg-slate-100/60 dark:bg-slate-850' : ''}`}
            title="Notifications"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[8px] font-black rounded-full bg-rose-500 text-white ring-2 ring-white dark:ring-slate-900">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>

          {/* Profile Avatar Button */}
          <button
            onClick={() => setActiveDropdown(prev => prev === 'profile' ? null : 'profile')}
            className={`w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shadow-sm border border-blue-500/20 transition-all duration-300 cursor-pointer shrink-0 relative overflow-hidden hover:scale-110 active:scale-95 hover:ring-2 hover:ring-blue-500/50 hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]
              ${activeDropdown === 'profile' ? 'ring-2 ring-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.3)]' : ''}`}
            title="Advisor Profile"
          >
            {advisorProfile.photo ? (
              <img src={advisorProfile.photo} alt={advisorProfile.name} className="w-full h-full object-cover" />
            ) : (
              advisorProfile.name ? advisorProfile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'NL'
            )}
          </button>
        </div>
      </div>

      {/* ── Bell popover rendered next to the sidebar ── */}
      {activeDropdown === 'bell' && createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: '72px',
            left: '76px',
            zIndex: 9999,
          }}
          className="w-80 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/80 shadow-2xl animate-scale-up p-4 text-left"
        >
          {/* Arrow */}
          <div
            style={{ position: 'absolute', left: -6, bottom: '16px', transform: 'rotate(-45deg)' }}
            className="w-3 h-3 bg-white dark:bg-slate-900 border-l border-b border-slate-200/70 dark:border-slate-700/60"
          />

          <NotificationPanel
            notifications={notifications}
            onMarkRead={onMarkRead}
            onMarkAllRead={onMarkAllRead}
            onOpen={onOpenNotification}
          />
        </div>,
        document.body
      )}

      {/* ── Profile popover rendered next to the sidebar ── */}
      {activeDropdown === 'profile' && createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '76px',
            zIndex: 9999,
          }}
          className="w-64 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/80 shadow-2xl animate-scale-up p-4 text-left"
        >
          {/* Arrow */}
          <div
            style={{ position: 'absolute', left: -6, bottom: '16px', transform: 'rotate(-45deg)' }}
            className="w-3 h-3 bg-white dark:bg-slate-900 border-l border-b border-slate-200/70 dark:border-slate-700/60"
          />

          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0 overflow-hidden">
              {advisorProfile.photo ? (
                <img src={advisorProfile.photo} alt={advisorProfile.name} className="w-full h-full object-cover" />
              ) : (
                advisorProfile.name ? advisorProfile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'NL'
              )}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{advisorProfile.name || getCurrentUser()?.name || 'User'}</h4>
              <p className="text-[9px] text-slate-450 dark:text-slate-500 truncate font-semibold">{advisorProfile.email || 'nitesh@teamfintness.com'}</p>
            </div>
          </div>
          <div className="space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-widest">
              Account and General Settings
            </div>
            <button
              onClick={() => { setActiveDropdown(null); setView('myprofile'); }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
            >
              Profile Settings
            </button>
            <button
              onClick={() => { setActiveDropdown(null); setView('leave'); }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
            >
              <span>Leave</span>
              {pendingLeaveCount > 0 && (
                <span className="text-[9px] font-black text-white bg-amber-500 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {pendingLeaveCount > 99 ? '99+' : pendingLeaveCount}
                </span>
              )}
            </button>
            {isAdmin && (
              <button
                onClick={() => { setActiveDropdown(null); setView('users'); }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
              >
                <span>User Management</span>
                <span className="text-[8px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 ml-1.5 px-1.5 py-0.5 rounded uppercase tracking-wider">Admin</span>
              </button>
            )}
            <button className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all">
              Preferences <span className="text-[8px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-550 ml-1.5 px-1 py-0.5 rounded">Soon</span>
            </button>
            <button
              onClick={() => { setActiveDropdown(null); setShowChangePassword(true); }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
            >
              Change Password
            </button>
            <div className="border-t border-slate-100 dark:border-slate-800 my-2" />
            <button
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-all"
            >
              <span>Theme Mode</span>
              {theme === 'dark' ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-slate-400" />}
            </button>
            <button
              onClick={() => {
                setActiveDropdown(null);
                onLogout();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-455 hover:bg-rose-50 dark:hover:bg-rose-955/20 cursor-pointer transition-all"
            >
              <span>Sign Out</span>
              <LogOut size={14} />
            </button>
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
}
