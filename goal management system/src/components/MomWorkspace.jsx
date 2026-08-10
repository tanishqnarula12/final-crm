import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Calendar, Plus, Trash2, ArrowLeft, ArrowRight, Printer, Copy,
  CheckCircle, RefreshCw, X, FileDown, Edit, Save
} from 'lucide-react';
import { addMom, addLeadMom, updateMom, deleteMom } from '../services/db';
import { saveGeneratedDocument, wrapStandaloneHtml, printHtmlDocument } from '../utils/documents';
import { buildMomHtml } from '../utils/momHtml';
import { CoolSelect } from './UI';
import { uid } from '../utils/calc';
import { getCurrentUser } from '../utils/auth';
import { loadTasks, saveTasks } from '../utils/tasks';
import { loadMeetings, saveMeetings } from '../utils/meetings';
import { teamName } from '../services/team';
import { updateLead } from '../services/leads';

// subjectType: 'client' (default) — the existing, unchanged flow. 'lead' — the
// MoM is drafted against a Lead (before conversion, the "Create MoM" stage);
// `client` is then a lead-shaped object built by App.jsx's leadAsMomSubject()
// with the same field footprint this component already reads (id, name, pan,
// clientDetails, moms), so the rest of the file needs no other changes.
export default function MomWorkspace({ client, onBack, subjectType = 'client', initialEditMomId = null, sourceMeetingId = null }) {
  const [activeTab, setActiveTab] = useState(0); // 0 to 8
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  // 1. Basic Details
  const [meetingNumber, setMeetingNumber] = useState('');
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [advisorName, setAdvisorName] = useState('');
  const [meetingMode, setMeetingMode] = useState(''); // Call, Physical, Video
  
  // 2. Client Profile
  const [occupation, setOccupation] = useState('');
  const [occupationOther, setOccupationOther] = useState('');
  const [income, setIncome] = useState('');
  const [expenses, setExpenses] = useState('');
  const [maritalStatus, setMaritalStatus] = useState(''); // Single, Married
  const [spouseName, setSpouseName] = useState('');
  const [kids, setKids] = useState([]); // Array of { name, age }

  // 3. Investments & Insurance
  const [investments, setInvestments] = useState({
    mf: '',
    term: '',
    medical: '',
    accidental: '',
    estate: '',
    fd: '',
    stocks: '',
    realestate: ''
  });

  // 4. Financial Goals
  const [selectedGoalChips, setSelectedGoalChips] = useState([]);
  const [goalsData, setGoalsData] = useState({}); // { goalName: { target, accumulated } }
  const [customGoalName, setCustomGoalName] = useState('');

  // 5. Previous Meeting To Do List
  const [lastMeetingDate, setLastMeetingDate] = useState('');
  const [prevOurRecs, setPrevOurRecs] = useState([{ id: 1, text: '', status: '' }]);
  const [prevClientRecs, setPrevClientRecs] = useState([{ id: 1, text: '', status: '' }]);

  // 6. Agenda
  const [selectedAgendaChips, setSelectedAgendaChips] = useState([]);
  const [agendaOther, setAgendaOther] = useState('');

  // 7. Discussion Summary
  const [discussionBullets, setDiscussionBullets] = useState([{ id: 1, text: '' }]);

  // 8. To Do List (Current Meeting)
  const [ourRecs, setOurRecs] = useState([{ id: 1, text: '', dec: '' }]);
  const [clientRecs, setClientRecs] = useState([{ id: 1, text: '', dec: '' }]);

  // 9. Next Follow-up
  const [showFollowupInDraft, setShowFollowupInDraft] = useState(true);
  const [followupRequired, setFollowupRequired] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [followupPurpose, setFollowupPurpose] = useState('');
  const [followupNotes, setFollowupNotes] = useState('');
  // Whether the follow-up Task + calendar Meeting have already been created
  // for this MOM — drives the "Create Follow-up" button's state so it's not
  // fired twice for the same follow-up.
  const [followupCreated, setFollowupCreated] = useState(false);

  const [lastAutoSaved, setLastAutoSaved] = useState(null);
  const autoSaveRef = useRef(null);

  // Preview Mode
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const previewRef = useRef(null);
  const contentRef = useRef(null);
  // Track which client we've already auto-filled for, so a data refresh
  // (e.g. after saving/updating a draft) does not clobber in-progress edits.
  const autoFilledClientRef = useRef(null);

  // Auto-fill from database history if available
  useEffect(() => {
    // Attempt to pull default advisor name or profile fields if they exist
    if (client) {
      // Only auto-fill once per client. Without this guard the effect re-runs on
      // every `client` refresh (including the reload triggered after Update Draft)
      // and overwrites the Previous Meeting section the user just edited.
      // We also bypass this if we are currently editing a specific draft.
      if (autoFilledClientRef.current === client.id || editingMomId) return;
      autoFilledClientRef.current = client.id;

      // Set basic fields if any matching items in client goals or details
      // Pre-fill previous meeting details from database if client has previous MOMs
      if (client.moms && client.moms.length > 0) {
        // Find the immediately PRECEDING meeting — by meetingNumber (the
        // actual sequence: meeting 3's "previous" is meeting 2, not whichever
        // one happens to be oldest/newest), falling back to createdAt as a
        // tiebreaker. Sorting by meetingDate alone (the old behaviour) breaks
        // whenever two meetings share the same calendar date — which is the
        // common case when drafting several MOMs back-to-back, since it's a
        // user-entered field, not a distinguishing timestamp.
        const sortedMoms = [...client.moms].sort((a, b) => {
          const numA = parseInt(a.meetingNumber, 10), numB = parseInt(b.meetingNumber, 10);
          if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numB - numA;
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
        const lastMom = sortedMoms[0];
        if (lastMom && lastMom.meetingDate) {
          setLastMeetingDate(lastMom.meetingDate);
          
          // Pre-fill Section 5: Previous recommendations from the last MOM's Current recommendations
          const lastMomData = lastMom.data || {};
          if (lastMomData.ourRecs && lastMomData.ourRecs.length > 0) {
            setPrevOurRecs(lastMomData.ourRecs.map((r, idx) => ({
              id: idx + 1,
              text: r.text || '',
              status: r.dec === 'Agreed' ? 'Pending' : r.dec === 'Not Agreed' ? 'Dropped' : 'Pending'
            })));
          }
          if (lastMomData.clientRecs && lastMomData.clientRecs.length > 0) {
            setPrevClientRecs(lastMomData.clientRecs.map((r, idx) => ({
              id: idx + 1,
              text: r.text || '',
              status: r.dec === 'Agreed' ? 'Pending' : r.dec === 'Not Agreed' ? 'Dropped' : 'Pending'
            })));
          }
        }
      }
    }
  }, [client]);

  const showToastMsg = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // First meeting has no previous meeting to review — skip that step.
  const isFirstMeeting = meetingNumber === '1';

  // Navigations
  const handleNext = () => {
    if (activeTab < 8) {
      let next = activeTab + 1;
      if (isFirstMeeting && next === 4) next = 5;
      setActiveTab(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBackTab = () => {
    if (activeTab > 0) {
      let prev = activeTab - 1;
      if (isFirstMeeting && prev === 4) prev = 3;
      setActiveTab(prev);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 2. Client Profile helpers
  const handleKidsCountChange = (e) => {
    const count = parseInt(e.target.value) || 0;
    const newKids = [...kids];
    if (newKids.length < count) {
      for (let i = newKids.length; i < count; i++) {
        newKids.push({ name: '', age: '' });
      }
    } else if (newKids.length > count) {
      newKids.splice(count);
    }
    setKids(newKids);
  };

  const handleKidDetailChange = (index, field, value) => {
    const newKids = [...kids];
    newKids[index][field] = value;
    setKids(newKids);
  };

  // 3. Investments Toggles
  const handleToggle = (key, value) => {
    setInvestments(prev => ({
      ...prev,
      [key]: prev[key] === value ? '' : value // toggle off if clicked again
    }));
  };

  // 4. Goals Chip toggles
  const handleGoalChipClick = (goal) => {
    if (selectedGoalChips.includes(goal)) {
      setSelectedGoalChips(prev => prev.filter(c => c !== goal));
      setGoalsData(prev => {
        const copy = { ...prev };
        delete copy[goal];
        return copy;
      });
    } else {
      setSelectedGoalChips(prev => [...prev, goal]);
      setGoalsData(prev => ({
        ...prev,
        [goal]: { target: '', accumulated: '' }
      }));
    }
  };

  const handleGoalDataChange = (goal, field, value) => {
    setGoalsData(prev => ({
      ...prev,
      [goal]: {
        ...prev[goal],
        [field]: value
      }
    }));
  };

  const handleAddCustomGoal = () => {
    const name = customGoalName.trim();
    if (!name) return;
    setSelectedGoalChips(prev => [...prev, name]);
    setGoalsData(prev => ({
      ...prev,
      [name]: { target: '', accumulated: '' }
    }));
    setCustomGoalName('');
  };

  // 5. Previous Recommendations
  const handleAddPrevRec = (side) => {
    const list = side === 'our' ? prevOurRecs : prevClientRecs;
    const setter = side === 'our' ? setPrevOurRecs : setPrevClientRecs;
    setter([...list, { id: Date.now(), text: '', status: '' }]);
  };

  const handleRemovePrevRec = (side, id) => {
    const list = side === 'our' ? prevOurRecs : prevClientRecs;
    const setter = side === 'our' ? setPrevOurRecs : setPrevClientRecs;
    setter(list.filter(item => item.id !== id));
  };

  const handlePrevRecChange = (side, id, field, value) => {
    const list = side === 'our' ? prevOurRecs : prevClientRecs;
    const setter = side === 'our' ? setPrevOurRecs : setPrevClientRecs;
    setter(list.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // 6. Agenda Chips
  const handleAgendaChipClick = (chip) => {
    if (selectedAgendaChips.includes(chip)) {
      setSelectedAgendaChips(prev => prev.filter(c => c !== chip));
    } else {
      setSelectedAgendaChips(prev => [...prev, chip]);
    }
  };

  // 7. Discussion Summary Bullets
  const handleAddDiscussionBullet = () => {
    setDiscussionBullets(prev => [...prev, { id: Date.now(), text: '' }]);
  };

  const handleRemoveDiscussionBullet = (id) => {
    setDiscussionBullets(prev => prev.filter(b => b.id !== id));
  };

  const handleDiscussionBulletChange = (id, text) => {
    setDiscussionBullets(prev => prev.map(b => b.id === id ? { ...b, text } : b));
  };

  // Drag and Drop Bullets
  const [draggedIndex, setDraggedIndex] = useState(null);
  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };
  const handleDragOver = (e, index) => {
    e.preventDefault();
  };
  const handleDrop = (index) => {
    if (draggedIndex === null || draggedIndex === index) return;
    const list = [...discussionBullets];
    const [removed] = list.splice(draggedIndex, 1);
    list.splice(index, 0, removed);
    setDiscussionBullets(list);
    setDraggedIndex(null);
  };

  // 8. To Do List (Current Meeting)
  const handleAddOurRec = (side) => {
    const list = side === 'our' ? ourRecs : clientRecs;
    const setter = side === 'our' ? setOurRecs : setClientRecs;
    setter([...list, { id: Date.now(), text: '', dec: '' }]);
  };

  const handleRemoveOurRec = (side, id) => {
    const list = side === 'our' ? ourRecs : clientRecs;
    const setter = side === 'our' ? setOurRecs : setClientRecs;
    setter(list.filter(item => item.id !== id));
  };

  const handleOurRecChange = (side, id, field, value) => {
    const list = side === 'our' ? ourRecs : clientRecs;
    const setter = side === 'our' ? setOurRecs : setClientRecs;
    setter(list.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // Reset form
  const handleReset = () => {
    if (!window.confirm('Are you sure you want to reset all form data?')) return;
    setMeetingNumber('');
    setMeetingDate(new Date().toISOString().split('T')[0]);
    setAdvisorName('');
    setMeetingMode('');
    setOccupation('');
    setOccupationOther('');
    setIncome('');
    setExpenses('');
    setMaritalStatus('');
    setSpouseName('');
    setKids([]);
    setInvestments({
      mf: '', term: '', medical: '', accidental: '', estate: '', fd: '', stocks: '', realestate: ''
    });
    setSelectedGoalChips([]);
    setGoalsData({});
    setPrevOurRecs([{ id: 1, text: '', status: '' }]);
    setPrevClientRecs([{ id: 1, text: '', status: '' }]);
    setSelectedAgendaChips([]);
    setAgendaOther('');
    setDiscussionBullets([{ id: 1, text: '' }]);
    setOurRecs([{ id: 1, text: '', dec: '' }]);
    setClientRecs([{ id: 1, text: '', dec: '' }]);
    setFollowupRequired('');
    setFollowupDate('');
    setFollowupPurpose('');
    setFollowupNotes('');
    setIsPreviewActive(false);
    setActiveTab(0);
    setEditingMomId(null);
    try { localStorage.removeItem(`crm:mom:auto:${client?.id}`); } catch {}
    setLastAutoSaved(null);
  };

  // Compile final MOM Draft state to JSON object for database
  const getMomPayload = (overrides = {}) => {
    return {
      meetingNumber,
      meetingDate,
      advisorName,
      meetingMode,
      occupation: occupation === 'Others' ? occupationOther : occupation,
      income,
      expenses,
      maritalStatus,
      spouseName,
      kids,
      investments,
      goals: selectedGoalChips.map(name => ({
        name,
        target: goalsData[name]?.target || 0,
        accumulated: goalsData[name]?.accumulated || 0
      })),
      lastMeetingDate,
      prevOurRecs,
      prevClientRecs,
      agenda: [...selectedAgendaChips, ...(agendaOther ? [agendaOther] : [])],
      discussion: discussionBullets.map(b => b.text).filter(Boolean),
      ourRecs,
      clientRecs,
      showFollowupInDraft: showFollowupInDraft ? 'Yes' : 'No',
      followupRequired,
      followupDate,
      followupPurpose,
      followupNotes,
      followupItemsCreated: followupCreated,
      ...overrides,
    };
  };

  // Save/Update Draft (via the clients API — see services/db.js addMom/updateMom)
  const [saving, setSaving] = useState(false);
  const [savedMomsList, setSavedMomsList] = useState([]);
  const [editingMomId, setEditingMomId] = useState(null);

  // Clear the local recovery draft when the advisor actually LEAVES the
  // workspace (switches to a different top tab / closes the lead overlay)
  // after having saved something this session. Without this, the draft
  // written for THIS meeting lingers in localStorage and gets silently
  // "resumed" the next time Draft MOM is opened for the same client/lead —
  // wrong (stale) meeting number, investment toggles, everything — even
  // though that MOM is already finished and this is meant to be the start
  // of the NEXT meeting. Refs (not state) so the cleanup below always reads
  // the latest values instead of whatever was current on mount.
  const editingMomIdRef = useRef(null);
  const clientIdForCleanupRef = useRef(null);
  useEffect(() => { editingMomIdRef.current = editingMomId; });
  useEffect(() => { clientIdForCleanupRef.current = client?.id; });
  useEffect(() => {
    return () => {
      if (editingMomIdRef.current && clientIdForCleanupRef.current) {
        try { localStorage.removeItem(`crm:mom:auto:${clientIdForCleanupRef.current}`); } catch {}
      }
    };
  }, []);

  const fetchClientMoms = () => {
    if (client && client.moms) {
      setSavedMomsList(client.moms);
    }
  };

  useEffect(() => {
    fetchClientMoms();
  }, [client]);

  // Restore auto-saved progress when client changes (on mount). Skipped
  // entirely when an explicit initialEditMomId is pending — that means the
  // caller (e.g. the Meetings table's "MOM Created" button) wants a SPECIFIC
  // already-saved draft loaded, and this effect's job (recover an in-progress
  // autosave, or else seed a brand-new draft's defaults / next meeting
  // number) would otherwise race the initialEditMomId effect below: both
  // depend on `client`, so whichever runs last wins, and without this guard
  // that's nondeterministic (StrictMode's dev-only double-invoke made this
  // resettable-after-the-fact race easy to hit — but the race exists with or
  // without StrictMode any time `client`'s reference changes after mount).
  useEffect(() => {
    if (!client?.id || initialEditMomId) return;
    let editingIdFromDraft = null;
    let followupCreatedFromDraft = false;
    let draftData = null;
    try {
      const raw = localStorage.getItem(`crm:mom:auto:${client.id}`);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.meetingDate) setMeetingDate(d.meetingDate);
        if (d.advisorName) setAdvisorName(d.advisorName);
        if (d.meetingMode) setMeetingMode(d.meetingMode);
        if (d.income) setIncome(d.income);
        if (d.expenses) setExpenses(d.expenses);
        if (d.spouseName) setSpouseName(d.spouseName);
        if (d.kids && d.kids.length) setKids(d.kids);
        if (d.goals && d.goals.length) {
          setSelectedGoalChips(d.goals.map(g => g.name));
          const gObj = {};
          d.goals.forEach(g => { gObj[g.name] = { target: g.target || '', accumulated: g.accumulated || '' }; });
          setGoalsData(gObj);
        }
        if (d.lastMeetingDate) setLastMeetingDate(d.lastMeetingDate);
        if (d.prevOurRecs && d.prevOurRecs.length) setPrevOurRecs(d.prevOurRecs);
        if (d.prevClientRecs && d.prevClientRecs.length) setPrevClientRecs(d.prevClientRecs);
        if (d.agenda && d.agenda.length) {
          const standard = ['Portfolio Review', 'New Investment', 'Goal Mapping', 'Issue Resolution', 'SIP Review', 'Insurance Review', 'Tax Planning', 'Estate Planning'];
          setSelectedAgendaChips(d.agenda.filter(a => standard.includes(a)));
          const other = d.agenda.filter(a => !standard.includes(a));
          setAgendaOther(other.join(', '));
        }
        if (d.discussion && d.discussion.length) setDiscussionBullets(d.discussion.map((text, idx) => ({ id: idx, text })));
        if (d.ourRecs && d.ourRecs.length) setOurRecs(d.ourRecs);
        if (d.clientRecs && d.clientRecs.length) setClientRecs(d.clientRecs);
        setShowFollowupInDraft(d.showFollowupInDraft !== 'No');
        if (d.followupRequired) setFollowupRequired(d.followupRequired);
        if (d.followupDate) setFollowupDate(d.followupDate);
        if (d.followupPurpose) setFollowupPurpose(d.followupPurpose);
        if (d.followupNotes) setFollowupNotes(d.followupNotes);
        if (d._editingMomId) { setEditingMomId(d._editingMomId); editingIdFromDraft = d._editingMomId; }
        if (d._followupItemsCreated) { setFollowupCreated(true); followupCreatedFromDraft = true; }
        if (d._lastAutoSaved) setLastAutoSaved(new Date(d._lastAutoSaved));
        // Meeting # only makes sense to resume from a draft when it belongs
        // to an actual in-progress edit of an existing saved MOM — a fresh
        // MOM always recomputes it below (client.moms.length + 1).
        if (editingIdFromDraft && d.meetingNumber) setMeetingNumber(d.meetingNumber);
        draftData = d;
      }
    } catch { /* ignore corrupt autosave */ }

    if (!editingIdFromDraft) {
      // Meeting # is automatic: 1 for the client's first MOM, then the saved
      // MOM count + 1 every time after (handleSaveDraft re-derives this from
      // the freshly-saved list rather than trusting stale state).
      setMeetingNumber(String((client.moms?.length || 0) + 1));

      // Auto-map Client Profile fields into the MOM — occupation, marital
      // status, and product holdings already live on the client record, so
      // the advisor shouldn't have to re-type them here. This always wins
      // over a stale autosave draft (e.g. from an earlier abandoned attempt).
      const cd = client.clientDetails || {};
      if (cd.profession) {
        const OCCUPATION_MAP = {
          'Salaried – Private Sector': 'Salaried – Private Sector',
          'Salaried – Government Sector': 'Salaried – Government Sector',
          'Business': 'Business',
          'Self-Employed': 'Self-Employed',
          'Professional': 'Professional',
        };
        const mapped = OCCUPATION_MAP[cd.profession];
        if (mapped) {
          setOccupation(mapped);
          setOccupationOther('');
        } else {
          setOccupation('Others');
          setOccupationOther(cd.profession === 'Other' ? (cd.professionOther || '') : cd.profession);
        }
      }
      if (cd.maritalStatus === 'Married' || cd.maritalStatus === 'Single') {
        setMaritalStatus(cd.maritalStatus);
      }
      // Spouse + kids — pulled from the client's Family Details (relation-tagged
      // applicants), not re-typed here.
      const family = Array.isArray(cd.familyDetails) ? cd.familyDetails : [];
      const spouse = family.find(f => f.relation === 'Spouse');
      if (spouse?.name) setSpouseName(spouse.name);
      const ageFromDob = (dobStr) => {
        if (!dobStr) return '';
        const birth = new Date(dobStr);
        if (isNaN(birth.getTime())) return '';
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age >= 0 ? String(age) : '';
      };
      const childRelations = new Set(['Son', 'Daughter']);
      const children = family.filter(f => childRelations.has(f.relation));
      if (children.length) {
        setKids(children.map(c => ({ name: c.name || '', age: ageFromDob(c.dob) })));
      }
      if (cd.mutualFunds || cd.insuranceTerm || cd.insuranceMedical || cd.insuranceAccidental) {
        setInvestments(prev => ({
          ...prev,
          mf: cd.mutualFunds || prev.mf,
          term: cd.insuranceTerm || prev.term,
          medical: cd.insuranceMedical || prev.medical,
          accidental: cd.insuranceAccidental || prev.accidental,
        }));
      }
    }
    // Apply the autosaved draft's own answers LAST, after the client-profile
    // defaults above — so the advisor's actual in-progress typing/toggles for
    // THIS meeting always win over a generic profile default, instead of
    // being silently discarded. This runs for ANY valid draft (not just when
    // resuming an existing saved MOM) — previously these three were gated
    // behind editingIdFromDraft, so if MomWorkspace ever remounted mid-draft
    // (tab switch, overlay close/reopen) before the advisor had explicitly
    // saved once, occupation/marital status/investment toggles they'd
    // already filled in were wiped back to the client's stored defaults
    // (usually blank), which read as "autosave isn't working".
    if (draftData) {
      if (draftData.occupation) {
        const standardOccupations = [
          'Salaried – Private Sector', 'Salaried – Government Sector', 'Business', 'Self-Employed',
          'Professional', 'Agriculturist / Farmer', 'Retired', 'Homemaker', 'Student',
          'Defence Personnel', 'NRI',
        ];
        if (standardOccupations.includes(draftData.occupation)) { setOccupation(draftData.occupation); setOccupationOther(''); }
        else { setOccupation('Others'); setOccupationOther(draftData.occupation); }
      }
      if (draftData.maritalStatus) setMaritalStatus(draftData.maritalStatus);
      if (draftData.investments) setInvestments(draftData.investments);
    }
    if (!followupCreatedFromDraft) setFollowupCreated(false);
  }, [client?.id, initialEditMomId]);

  // Local-only recovery cache — no "Save Draft" button anywhere, and nothing
  // reaches the SERVER until an explicit "Save & Generate MOM Draft" click
  // (handleSaveDraft below). This just protects against losing in-progress
  // typing (accidental navigation, browser crash) — debounced 1s after the
  // user stops typing, written to localStorage only, never creates or
  // updates a real MOM record on its own.
  // Always holds a closure over the LATEST field values (refreshed every
  // render, no dependency array) so the unmount-flush effect below — which
  // intentionally has an empty dependency array, since it must only run
  // once on the actual final unmount, not on every keystroke — can still
  // call it and get current data instead of whatever was current on mount.
  const writeAutosaveRef = useRef(() => {});
  useEffect(() => {
    writeAutosaveRef.current = () => {
      if (!client?.id || !meetingNumber) return;
      const now = new Date().toISOString();
      try {
        const localPayload = {
          meetingNumber, meetingDate, advisorName, meetingMode,
          occupation: occupation === 'Others' ? occupationOther : occupation,
          income, expenses, maritalStatus, spouseName, kids, investments,
          goals: selectedGoalChips.map(name => ({
            name, target: goalsData[name]?.target || 0, accumulated: goalsData[name]?.accumulated || 0
          })),
          lastMeetingDate, prevOurRecs, prevClientRecs,
          agenda: [...selectedAgendaChips, ...(agendaOther ? [agendaOther] : [])],
          discussion: discussionBullets.map(b => b.text).filter(Boolean),
          ourRecs, clientRecs,
          showFollowupInDraft: showFollowupInDraft ? 'Yes' : 'No',
          followupRequired, followupDate, followupPurpose, followupNotes,
          _editingMomId: editingMomId,
          _followupItemsCreated: followupCreated,
          _lastAutoSaved: now,
        };
        localStorage.setItem(`crm:mom:auto:${client.id}`, JSON.stringify(localPayload));
        setLastAutoSaved(new Date(now));
      } catch { /* ignore quota errors */ }
    };
  });

  useEffect(() => {
    if (!client?.id || !meetingNumber) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => writeAutosaveRef.current(), 1000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [
    meetingNumber, meetingDate, advisorName, meetingMode, occupation, occupationOther,
    income, expenses, maritalStatus, spouseName, kids, investments, selectedGoalChips,
    goalsData, lastMeetingDate, prevOurRecs, prevClientRecs, selectedAgendaChips,
    agendaOther, discussionBullets, ourRecs, clientRecs, showFollowupInDraft,
    followupRequired, followupDate, followupPurpose, followupNotes, editingMomId,
    followupCreated, client?.id,
  ]);

  // Flush immediately on the workspace's actual final unmount (Close & Back
  // to Lead, switching top tabs, closing the browser tab) — otherwise
  // whatever the debounced write above hadn't gotten to yet (up to 1s of
  // the most recent typing/toggle clicks) would just be discarded instead
  // of saved, which is exactly the data loss autosave exists to prevent.
  useEffect(() => {
    return () => { writeAutosaveRef.current(); };
  }, []);

  // A follow-up marked in the MOM creates a Task (due on the follow-up date,
  // with its own notification) and a calendar Meeting entry. Returns true if
  // it actually created something (so callers building the save payload know
  // to stamp followupItemsCreated without waiting on the setState to flush).
  const tryCreateFollowUpItems = () => {
    if (followupRequired !== 'Yes' || !followupDate || followupCreated) return false;
    const rmId = client.clientDetails?.relationshipManager || '';
    const rmName = teamName(rmId) || getCurrentUser()?.name || '';
    const title = `Follow-up — ${client.name}`;
    const now = new Date().toISOString();

    const task = {
      id: uid(),
      taskName: title,
      stage: 'Open',
      groupLeader: client.name,
      groupLeaderId: client.id,
      pan: client.pan || '',
      applicant: client.name,
      relatedTo: 'Others',
      otherSpecify: followupPurpose || 'MOM Follow-up',
      assignedTo: rmId,
      dueDate: followupDate,
      description: followupNotes || followupPurpose || 'Follow-up scheduled from Minutes of Meeting',
      createdAt: now,
      updatedAt: now,
    };
    saveTasks([task, ...loadTasks()]);

    const meeting = {
      id: uid(),
      clientId: client.id,
      clientName: client.name,
      pan: client.pan || '',
      title,
      date: followupDate,
      time: '',
      mode: 'Online',
      link: '',
      location: '',
      assignedTo: rmName,
      attendees: [],
      status: 'Scheduled',
      notes: followupNotes || followupPurpose || '',
      history: [{ at: now, by: getCurrentUser()?.name || 'System', action: 'Scheduled', text: 'Follow-up scheduled from MOM' }],
      createdAt: now,
      updatedAt: now,
    };
    saveMeetings([meeting, ...loadMeetings()]);
    setFollowupCreated(true);
    return true;
  };

  // "Create Follow-up" button — explicit, user-visible trigger with feedback,
  // so calendar marking never silently fails to happen.
  const handleCreateFollowUpClick = () => {
    if (followupRequired !== 'Yes' || !followupDate) {
      showToastMsg('⚠ Set "Follow-up Required" to Yes and pick a date first.');
      return;
    }
    if (followupCreated) {
      showToastMsg('This follow-up has already been scheduled.');
      return;
    }
    tryCreateFollowUpItems();
    showToastMsg('📅 Follow-up task created and calendar marked!');
  };

  const handleSaveDraft = async () => {
    if (!meetingNumber) {
      alert("Please provide a Meeting Number (e.g. 01, 02) to save this draft.");
      return;
    }
    setSaving(true);
    try {
      // Fires (silently, no validation toasts) whenever the follow-up is
      // eligible and hasn't been created yet — the explicit button above
      // remains the primary, visible way to trigger this.
      const justCreatedFollowUp = tryCreateFollowUpItems();
      const payload = getMomPayload(justCreatedFollowUp ? { followupItemsCreated: true } : {});
      let momId = editingMomId;
      if (editingMomId) {
        // Update — the MOM row may already exist from a background autosave
        // tick even on this, the advisor's first EXPLICIT save click.
        const updates = {
          meetingNumber,
          meetingDate,
          data: payload
        };
        await updateMom(client.id, editingMomId, updates);
        showToastMsg("✅ MOM Draft updated successfully!");
      } else {
        // Create new
        momId = 'mom_' + Math.random().toString(36).slice(2, 9);
        const newMom = {
          id: momId,
          meetingNumber,
          meetingDate,
          data: payload
        };
        if (subjectType === 'lead') {
          await addLeadMom(client.id, newMom);
        } else {
          await addMom(client.id, newMom);
        }
        setEditingMomId(momId);
        showToastMsg("✅ MOM Draft saved successfully!");
      }
      // Only an EXPLICIT save (this function — autosave never calls it)
      // advances the lead into "Create MoM" and unlocks Convert to Client,
      // and only the first time (client.momId reflects the lead's current
      // stamped state) — whether the MOM row itself already existed from a
      // background autosave tick or was just created above doesn't matter.
      if (subjectType === 'lead' && !client.momId) {
        updateLead(client.id, { stage: 'Create MoM', momId }, getCurrentUser()?.name || 'System');
      }
      // Same idea for a MOM drafted from a specific Completed meeting (the
      // Meetings table's "Create MOM" button) — stamp that meeting with the
      // new MOM's id, once, so the button flips to "MOM Created" instead of
      // re-showing "Create MOM" the next time this meeting is opened.
      if (sourceMeetingId) {
        const updatedMeetings = loadMeetings().map((mt) => (
          mt.id === sourceMeetingId && !mt.momId ? { ...mt, momId } : mt
        ));
        saveMeetings(updatedMeetings);
      }
      // Trigger App.jsx parent to reload data
      if (window.refreshAppData) {
        await window.refreshAppData();
      }
    } catch (err) {
      console.error(err);
      alert("Error saving draft: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSavedMom = (mom) => {
    setEditingMomId(mom.id);
    setMeetingNumber(mom.meetingNumber || '');
    setMeetingDate(mom.meetingDate || '');
    
    const d = mom.data || {};
    if (d.advisorName) setAdvisorName(d.advisorName);
    if (d.meetingMode) setMeetingMode(d.meetingMode);
    
    if (d.occupation) {
      const standard = [
        'Salaried – Private Sector', 'Salaried – Government Sector', 'Business', 'Self-Employed',
        'Professional', 'Agriculturist / Farmer', 'Retired', 'Homemaker', 'Student',
        'Defence Personnel', 'NRI',
      ];
      if (standard.includes(d.occupation)) {
        setOccupation(d.occupation);
        setOccupationOther('');
      } else {
        setOccupation('Others');
        setOccupationOther(d.occupation);
      }
    }
    setIncome(d.income || '');
    setExpenses(d.expenses || '');
    setMaritalStatus(d.maritalStatus || '');
    setSpouseName(d.spouseName || '');
    setKids(d.kids || []);

    // Investments
    setInvestments(d.investments || {
      mf: '', term: '', medical: '', accidental: '', estate: '', fd: '', stocks: '', realestate: ''
    });

    // Goals
    if (d.goals && d.goals.length) {
      setSelectedGoalChips(d.goals.map(g => g.name));
      const gObj = {};
      d.goals.forEach(g => {
        gObj[g.name] = { target: g.target || '', accumulated: g.accumulated || '' };
      });
      setGoalsData(gObj);
    }

    // Previous recs
    setLastMeetingDate(d.lastMeetingDate || '');
    setPrevOurRecs(d.prevOurRecs && d.prevOurRecs.length ? d.prevOurRecs : [{ id: 1, text: '', status: '' }]);
    setPrevClientRecs(d.prevClientRecs && d.prevClientRecs.length ? d.prevClientRecs : [{ id: 1, text: '', status: '' }]);

    // Agenda
    if (d.agenda && d.agenda.length) {
      const standard = ['Portfolio Review', 'New Investment', 'Goal Mapping', 'Issue Resolution', 'SIP Review', 'Insurance Review', 'Tax Planning', 'Estate Planning'];
      setSelectedAgendaChips(d.agenda.filter(a => standard.includes(a)));
      const unmatched = d.agenda.filter(a => !standard.includes(a));
      setAgendaOther(unmatched.join(', '));
    }

    // Discussion
    if (d.discussion && d.discussion.length) {
      setDiscussionBullets(d.discussion.map((text, idx) => ({ id: idx, text })));
    } else {
      setDiscussionBullets([{ id: 1, text: '' }]);
    }

    // Current recs
    setOurRecs(d.ourRecs && d.ourRecs.length ? d.ourRecs : [{ id: 1, text: '', dec: '' }]);
    setClientRecs(d.clientRecs && d.clientRecs.length ? d.clientRecs : [{ id: 1, text: '', dec: '' }]);

    // Follow-up
    setShowFollowupInDraft(d.showFollowupInDraft === 'Yes');
    setFollowupRequired(d.followupRequired || '');
    setFollowupDate(d.followupDate || '');
    setFollowupPurpose(d.followupPurpose || '');
    setFollowupNotes(d.followupNotes || '');
    setFollowupCreated(!!d.followupItemsCreated);

    setIsPreviewActive(false);
    setActiveTab(0);
  };

  // Reopening straight into an existing draft (e.g. clicking the lead's
  // "MoM Created" pill) — auto-runs the same edit-load logic a "Saved MOM
  // Drafts" list click would, once that MOM shows up in client.moms.
  const openedForEditRef = useRef(null);
  useEffect(() => {
    if (!initialEditMomId || openedForEditRef.current === initialEditMomId) return;
    const found = (client?.moms || []).find((m) => m.id === initialEditMomId);
    if (found) {
      openedForEditRef.current = initialEditMomId;
      handleEditSavedMom(found);
    }
  }, [initialEditMomId, client]);

  const handleDeleteSavedMom = async (momId) => {
    if (!window.confirm("Are you sure you want to delete this MOM draft? This cannot be undone.")) return;
    try {
      await deleteMom(client.id, momId);
      showToastMsg("🗑️ MOM Draft deleted.");
      if (editingMomId === momId) {
        handleReset();
        setEditingMomId(null);
      }
      if (window.refreshAppData) {
        await window.refreshAppData();
      }
    } catch (err) {
      alert("Error deleting MOM draft: " + err.message);
    }
  };

  const getMomHtml = () => buildMomHtml({ meetingNumber, meetingDate, data: getMomPayload() }, client);

  // Compile Preview HTML
  const generateMOM = () => {
    setIsPreviewActive(true);
    setTimeout(() => {
      if (previewRef.current) {
        previewRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
    showToastMsg('📄 Draft generated below!');
  };

  // The final-tab action — one click does both instead of requiring "Save
  // Draft" then a separate "Generate MOM Draft" step.
  const handleSaveAndGenerate = async () => {
    await handleSaveDraft();
    generateMOM();
  };

  const handlePrint = () => {
    // Opens the MOM alone in a fresh window instead of window.print() on the
    // live app page — the CRM's own sidebar/header never fully hid behind
    // the print-mode CSS selectors (they didn't match every chrome element),
    // so it kept bleeding into the printed output. An isolated window has
    // none of that chrome to begin with, which is what actually fixes it.
    const filename = meetingNumber
      ? `Minutes of Meeting - ${meetingNumber}_${client.name}`
      : `Minutes of Meeting_${client.name}`;
    printHtmlDocument(wrapStandaloneHtml(getMomHtml(), filename));
  };

  const handleCopyText = () => {
    if (contentRef.current) {
      const text = contentRef.current.innerText;
      navigator.clipboard.writeText(text).then(() => {
        showToastMsg('📋 Copied draft to clipboard!');
      });
    }
  };

  const [savingDoc, setSavingDoc] = useState(false);
  const handleSaveDocument = async () => {
    setSavingDoc(true);
    try {
      const html = wrapStandaloneHtml(getMomHtml(), `Minutes of Meeting — ${client.name}`);
      const name = await saveGeneratedDocument(client, { kind: 'mom', label: 'Minutes of Meeting', html });
      showToastMsg(`✅ Saved to Documents as ${name}`);
    } catch (err) {
      alert(err.message || 'Could not save document.');
    } finally {
      setSavingDoc(false);
    }
  };

  const formatDateLabel = (d) => {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
  };

  const investmentIcons = {
    mf: '📈', term: '🛡️', medical: '🏥', accidental: '🚑', estate: '📜', fd: '🏦', stocks: '📊', realestate: '🏢'
  };

  const investmentLabels = {
    mf: 'Mutual Funds', term: 'Term Insurance', medical: 'Medical Insurance', accidental: 'Accidental Insurance',
    estate: 'Will & Estate Planning', fd: 'Fixed Deposit', stocks: 'Stocks', realestate: 'Real Estate'
  };

  const goalIcons = {
    'Retirement':          '🪑',
    "Kid's Education":     '🎓',
    "Kid's Marriage":      '💍',
    'Dream Home':          '🏠',
    'Dream Car':           '🚗',
    'Emergency Fund':      '🆘',
    'Vacation / Travel':   '✈️',
    'Tax Saving':          '🧾',
    'Higher Education':    '📚',
    'Wedding Planning':    '💒',
  };

  // Tabs labels
  const tabNames = [
    'Basic Details', 'Client Profile', 'Investments', 'Goals',
    'Prev. Meeting', 'Agenda', 'Discussion', 'To Do List', 'Follow-up'
  ];

  return (
    <div className="space-y-6">
      {/* List of saved MOM drafts */}
      {savedMomsList.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm print:hidden">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="text-blue-600 dark:text-blue-400" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Saved MOM Drafts for {client.name}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {savedMomsList.map(mom => (
              <div key={mom.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Meeting #{mom.meetingNumber}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Calendar size={12} />
                    {formatDateLabel(mom.meetingDate)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleEditSavedMom(mom)} 
                    className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-all"
                    title="Edit Draft"
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteSavedMom(mom.id)} 
                    className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all"
                    title="Delete Draft"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Form Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden print:hidden">
        {/* Wizard Header Progress Bar */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabNames.map((name, index) => {
            if (index === 4 && isFirstMeeting) return null; // no previous meeting to review yet
            const isActive = activeTab === index;
            const isCompleted = activeTab > index;
            return (
              <button
                key={index}
                onClick={() => { setActiveTab(index); setIsPreviewActive(false); }}
                className={`flex-1 py-3.5 px-4 text-center border-b-2 font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
                  isActive 
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' 
                    : isCompleted 
                      ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 border-b-2' 
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <div className="text-[9px] opacity-75 font-normal">Step 0{index + 1}</div>
                <div className="flex items-center justify-center gap-1">
                  {name}
                  {isCompleted && <CheckCircle size={10} className="text-emerald-500" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* STEP 1: BASIC DETAILS */}
          {activeTab === 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Basic Meeting Details</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Meeting Number</label>
                  <input
                    type="text"
                    value={meetingNumber}
                    disabled
                    title="Automatic — 1 for the first meeting, then increases by 1 each time a MOM is saved for this client"
                    placeholder="Auto"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500 outline-none cursor-not-allowed"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Meeting Date</label>
                  <input 
                    type="date" 
                    value={meetingDate} 
                    onChange={e => setMeetingDate(e.target.value)} 
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Client Name</label>
                  <input
                    type="text"
                    value={client.name}
                    disabled
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Financial Consultant</label>
                  <input
                    type="text"
                    value={advisorName}
                    onChange={e => setAdvisorName(e.target.value)}
                    placeholder="Advisor name"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Meeting Mode</label>
                <div className="flex gap-2">
                  {['Call', 'Physical', 'Video'].map(mode => {
                    const icons = { Call: '📞', Physical: '👤', Video: '💻' };
                    const isSel = meetingMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => setMeetingMode(mode)}
                        className={`flex-1 py-3 px-4 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                          isSel 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/10' 
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="mr-1.5">{icons[mode]}</span>
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CLIENT PROFILE */}
          {activeTab === 1 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">Client Profile</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Occupation</label>
                  <CoolSelect 
                    value={occupation} 
                    onChange={e => setOccupation(e.target.value)} 
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                  >
                    <option value="">Select Occupation</option>
                    <option value="Salaried – Private Sector">Salaried – Private Sector</option>
                    <option value="Salaried – Government Sector">Salaried – Government Sector</option>
                    <option value="Business">Business</option>
                    <option value="Self-Employed">Self-Employed</option>
                    <option value="Professional">Professional</option>
                    <option value="Agriculturist / Farmer">Agriculturist / Farmer</option>
                    <option value="Retired">Retired</option>
                    <option value="Homemaker">Homemaker</option>
                    <option value="Student">Student</option>
                    <option value="Defence Personnel">Defence Personnel</option>
                    <option value="NRI">NRI</option>
                    <option value="Others">Others</option>
                  </CoolSelect>
                </div>
                {occupation === 'Others' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Specify Occupation</label>
                    <input 
                      type="text" 
                      value={occupationOther} 
                      onChange={e => setOccupationOther(e.target.value)} 
                      placeholder="e.g. Homemaker, Retired"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Annual Income (₹)</label>
                  <input 
                    type="number" 
                    value={income} 
                    onChange={e => setIncome(e.target.value)} 
                    placeholder="e.g. 12,00,000"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Annual Expenses (₹)</label>
                  <input 
                    type="number" 
                    value={expenses} 
                    onChange={e => setExpenses(e.target.value)}
                    placeholder="e.g. 6,00,000"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Marital Status</label>
                <div className="flex gap-2">
                  {['Single', 'Married'].map(status => {
                    const icons = { Single: '🙋', Married: '💍' };
                    const isSel = maritalStatus === status;
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          setMaritalStatus(status);
                          if (status === 'Single') {
                            setSpouseName('');
                            setKids([]);
                          }
                        }}
                        className={`flex-1 py-3 px-4 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                          isSel 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/10' 
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="mr-1.5">{icons[status]}</span>
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>

              {maritalStatus === 'Married' && (
                <div className="space-y-6 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Spouse Name</label>
                      <input 
                        type="text" 
                        value={spouseName} 
                        onChange={e => setSpouseName(e.target.value)} 
                        placeholder="e.g. Sneha"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Number of Kids</label>
                      <input 
                        type="number" 
                        value={kids.length || ''} 
                        onChange={handleKidsCountChange} 
                        placeholder="e.g. 2"
                        min="0"
                        max="10"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  {kids.length > 0 && (
                    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Children Details</div>
                      {kids.map((kid, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Child {idx + 1} Name</label>
                            <input 
                              type="text" 
                              value={kid.name} 
                              onChange={e => handleKidDetailChange(idx, 'name', e.target.value)}
                              placeholder="e.g. Aarav"
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Age</label>
                            <input 
                              type="number" 
                              value={kid.age} 
                              onChange={e => handleKidDetailChange(idx, 'age', e.target.value)}
                              placeholder="e.g. 8"
                              min="0"
                              max="25"
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: INVESTMENTS & INSURANCE */}
          {activeTab === 2 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">Current Investments & Insurance Products</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Fixed order from investmentLabels (a static, hardcoded
                    object), not Object.keys(investments) — Postgres JSONB
                    doesn't preserve object key insertion order, so after a
                    save/reload round-trip the KEYS could come back
                    reordered even though every value is still correctly
                    attached to its own key. Rendering off the data itself
                    made it look like rows randomly shuffled or "lost" their
                    values on reopen. */}
                {Object.keys(investmentLabels).map(key => (
                  <div key={key} className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{investmentIcons[key]}</span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{investmentLabels[key]}</span>
                    </div>
                    <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-1">
                      {['Yes', 'No'].map(val => {
                        const active = investments[key] === val;
                        return (
                          <button
                            key={val}
                            onClick={() => handleToggle(key, val)}
                            className={`px-4 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                              active 
                                ? val === 'Yes'
                                  ? 'bg-emerald-500 text-white shadow-sm'
                                  : 'bg-rose-500 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: FINANCIAL GOALS */}
          {activeTab === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">Financial Goals Mapping</h3>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Select Goals Discussed</label>
                <div className="flex flex-wrap gap-2">
                  {['Retirement', "Kid's Education", "Kid's Marriage", 'Dream Home', 'Dream Car', 'Emergency Fund', 'Vacation / Travel', 'Tax Saving', 'Higher Education', 'Wedding Planning'].map(goal => {
                    const isSelected = selectedGoalChips.includes(goal);
                    return (
                      <button
                        key={goal}
                        onClick={() => handleGoalChipClick(goal)}
                        className={`px-4 py-2 rounded-full border text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10' 
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-blue-500'
                        }`}
                      >
                        <span className="mr-1">{goalIcons[goal] || '🎯'}</span>
                        {goal}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 max-w-sm pt-2">
                  <input 
                    type="text" 
                    value={customGoalName} 
                    onChange={e => setCustomGoalName(e.target.value)} 
                    placeholder="Add custom goal name..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
                  />
                  <button 
                    onClick={handleAddCustomGoal} 
                    className="p-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {selectedGoalChips.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Goals Target Setup</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedGoalChips.map(goal => {
                      const data = goalsData[goal] || { target: '', accumulated: '' };
                      const targetNum = parseFloat(data.target) || 0;
                      const accumNum = parseFloat(data.accumulated) || 0;
                      const pct = targetNum > 0 ? Math.min(100, Math.round((accumNum / targetNum) * 100)) : 0;
                      
                      return (
                        <div key={goal} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                              <span>{goalIcons[goal] || '🎯'}</span>
                              {goal}
                            </span>
                            <button 
                              onClick={() => handleGoalChipClick(goal)} 
                              className="text-slate-400 hover:text-rose-500 transition-all p-1"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Value (₹)</label>
                              <input 
                                type="number" 
                                value={data.target} 
                                onChange={e => handleGoalDataChange(goal, 'target', e.target.value)}
                                placeholder="e.g. 50,00,000"
                                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Accumulated (₹)</label>
                              <input 
                                type="number" 
                                value={data.accumulated} 
                                onChange={e => handleGoalDataChange(goal, 'accumulated', e.target.value)}
                                placeholder="e.g. 10,00,000"
                                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-3 pt-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completion</span>
                            <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div 
                                className="h-full transition-all duration-300" 
                                style={{ 
                                  width: `${pct}%`,
                                  backgroundColor: pct >= 75 ? '#10b981' : pct >= 40 ? '#3b82f6' : '#f97316'
                                }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{targetNum > 0 ? `${pct}%` : '—'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: PREVIOUS MEETING TO DO LIST */}
          {activeTab === 4 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Previous Meeting Action Items</h3>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Last Meeting Date:</label>
                  <input 
                    type="date" 
                    value={lastMeetingDate} 
                    onChange={e => setLastMeetingDate(e.target.value)} 
                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                {/* Our End */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-600 rounded-r-xl">
                    <span className="text-lg">🏢</span>
                    <div>
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Our End (Advisor Actions)</div>
                      <div className="text-[10px] text-slate-400">Status review from last meeting</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {prevOurRecs.map((rec, idx) => (
                      <div key={rec.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 bg-slate-50/20 dark:bg-slate-950/10">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500">Action Item #{idx + 1}</span>
                          <button onClick={() => handleRemovePrevRec('our', rec.id)} className="text-slate-400 hover:text-rose-500 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={rec.text} 
                          onChange={e => handlePrevRecChange('our', rec.id, 'text', e.target.value)}
                          placeholder="e.g. Setup STP in equity funds"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status:</span>
                          <div className="flex gap-1">
                            {['Executed', 'Pending', 'Dropped'].map(s => {
                              const labelMap = { Executed: '✅ Executed', Pending: '⏳ Pending', Dropped: '❌ Dropped' };
                              const active = rec.status === s;
                              return (
                                <button
                                  key={s}
                                  onClick={() => handlePrevRecChange('our', rec.id, 'status', s)}
                                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                                    active 
                                      ? s === 'Executed'
                                        ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                                        : s === 'Pending'
                                          ? 'bg-amber-50 dark:bg-amber-950 border-amber-500 text-amber-700 dark:text-amber-300'
                                          : 'bg-rose-50 dark:bg-rose-950 border-rose-500 text-rose-700 dark:text-rose-300'
                                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-500 hover:border-slate-400'
                                  }`}
                                >
                                  {labelMap[s]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => handleAddPrevRec('our')}
                      className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-500 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer"
                    >
                      + Add Action Item
                    </button>
                  </div>
                </div>

                {/* Client End */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 rounded-r-xl">
                    <span className="text-lg">👤</span>
                    <div>
                      <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Client End (Client Actions)</div>
                      <div className="text-[10px] text-slate-400">Status review from last meeting</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {prevClientRecs.map((rec, idx) => (
                      <div key={rec.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 bg-slate-50/20 dark:bg-slate-950/10">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500">Action Item #{idx + 1}</span>
                          <button onClick={() => handleRemovePrevRec('client', rec.id)} className="text-slate-400 hover:text-rose-500 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={rec.text} 
                          onChange={e => handlePrevRecChange('client', rec.id, 'text', e.target.value)}
                          placeholder="e.g. Provide Term Insurance signatures"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status:</span>
                          <div className="flex gap-1">
                            {['Executed', 'Pending', 'Dropped'].map(s => {
                              const labelMap = { Executed: '✅ Executed', Pending: '⏳ Pending', Dropped: '❌ Dropped' };
                              const active = rec.status === s;
                              return (
                                <button
                                  key={s}
                                  onClick={() => handlePrevRecChange('client', rec.id, 'status', s)}
                                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                                    active 
                                      ? s === 'Executed'
                                        ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                                        : s === 'Pending'
                                          ? 'bg-amber-50 dark:bg-amber-950 border-amber-500 text-amber-700 dark:text-amber-300'
                                          : 'bg-rose-50 dark:bg-rose-950 border-rose-500 text-rose-700 dark:text-rose-300'
                                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-500 hover:border-slate-400'
                                  }`}
                                >
                                  {labelMap[s]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => handleAddPrevRec('client')}
                      className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-amber-500 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50/20 transition-all cursor-pointer"
                    >
                      + Add Action Item
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: AGENDA */}
          {activeTab === 5 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">Meeting Agenda</h3>

              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Select Agenda Topics Discussed</label>
                <div className="flex flex-wrap gap-2.5">
                  {['Portfolio Review', 'New Investment', 'Goal Mapping', 'Issue Resolution', 'SIP Review', 'Insurance Review', 'Tax Planning', 'Estate Planning'].map(agenda => {
                    const active = selectedAgendaChips.includes(agenda);
                    return (
                      <button
                        key={agenda}
                        onClick={() => handleAgendaChipClick(agenda)}
                        className={`px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          active 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/10' 
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                        }`}
                      >
                        {agenda}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1.5 max-w-lg pt-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Other Topics (comma separated)</label>
                  <input 
                    type="text" 
                    value={agendaOther} 
                    onChange={e => setAgendaOther(e.target.value)}
                    placeholder="e.g. Retirement planning breakdown, foreign stocks setup"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 7: DISCUSSION SUMMARY */}
          {activeTab === 6 && (
            <div className="space-y-6">
              <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Discussion Summary</h3>
                <p className="text-xs text-slate-400 mt-1">Capture details of the discussion. You can drag and drop bullets to reorder them.</p>
              </div>

              <div className="space-y-3.5">
                {discussionBullets.map((bullet, idx) => (
                  <div 
                    key={bullet.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    className="flex items-start gap-3 p-3 bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-default transition-all group"
                  >
                    {/* Drag Handle */}
                    <span 
                      className="cursor-grab text-slate-400 hover:text-blue-500 select-none py-1.5 opacity-50 group-hover:opacity-100 transition-all font-bold"
                      title="Drag to reorder"
                    >
                      ⠿
                    </span>
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-3.5 flex-shrink-0" />
                    <textarea
                      value={bullet.text}
                      onChange={e => handleDiscussionBulletChange(bullet.id, e.target.value)}
                      onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                      placeholder="e.g. Client mentioned child's college target may shift to USA instead of India..."
                      rows={2}
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500 resize-y overflow-hidden"
                    />
                    <button 
                      onClick={() => handleRemoveDiscussionBullet(bullet.id)} 
                      className="text-slate-400 hover:text-rose-500 p-2 mt-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={handleAddDiscussionBullet}
                  className="w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-500 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer"
                >
                  + Add Discussion Bullet
                </button>
              </div>
            </div>
          )}

          {/* STEP 8: TO DO LIST (CURRENT MEETING) */}
          {activeTab === 7 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">To Do List from Current Meeting</h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Our End */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-600 rounded-r-xl">
                    <span className="text-lg">🏢</span>
                    <div>
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Our End (Advisor Actions)</div>
                      <div className="text-[10px] text-slate-400">Actions we will take</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {ourRecs.map((rec, idx) => (
                      <div key={rec.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 bg-slate-50/20 dark:bg-slate-950/10">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500">Action Item #{idx + 1}</span>
                          <button onClick={() => handleRemoveOurRec('our', rec.id)} className="text-slate-400 hover:text-rose-500 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={rec.text} 
                          onChange={e => handleOurRecChange('our', rec.id, 'text', e.target.value)}
                          placeholder="e.g. Execute SIP of ₹10,000 in HDFC Mid Cap"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Decision:</span>
                          <div className="flex gap-1">
                            {['Agreed', 'Not Agreed', 'Thinking'].map(d => {
                              const labelMap = { Agreed: '✅ Agreed', 'Not Agreed': '❌ Not Agreed', Thinking: '🤔 Thinking' };
                              const active = rec.dec === d;
                              return (
                                <button
                                  key={d}
                                  onClick={() => handleOurRecChange('our', rec.id, 'dec', d)}
                                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                                    active 
                                      ? d === 'Agreed'
                                        ? 'bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300'
                                        : d === 'Not Agreed'
                                          ? 'bg-rose-50 dark:bg-rose-950 border-rose-500 text-rose-700 dark:text-rose-300'
                                          : 'bg-amber-50 dark:bg-amber-950 border-amber-500 text-amber-700 dark:text-amber-300'
                                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-500 hover:border-slate-400'
                                  }`}
                                >
                                  {labelMap[d]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => handleAddOurRec('our')}
                      className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-500 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer"
                    >
                      + Add Action Item
                    </button>
                  </div>
                </div>

                {/* Client End */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 rounded-r-xl">
                    <span className="text-lg">👤</span>
                    <div>
                      <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Client End (Client Actions)</div>
                      <div className="text-[10px] text-slate-400">Actions client must take</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {clientRecs.map((rec, idx) => (
                      <div key={rec.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 bg-slate-50/20 dark:bg-slate-950/10">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500">Action Item #{idx + 1}</span>
                          <button onClick={() => handleRemoveOurRec('client', rec.id)} className="text-slate-400 hover:text-rose-500 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={rec.text} 
                          onChange={e => handleOurRecChange('client', rec.id, 'text', e.target.value)}
                          placeholder="e.g. Submit KYC documents by Friday"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Decision:</span>
                          <div className="flex gap-1">
                            {['Agreed', 'Not Agreed', 'Thinking'].map(d => {
                              const labelMap = { Agreed: '✅ Agreed', 'Not Agreed': '❌ Not Agreed', Thinking: '🤔 Thinking' };
                              const active = rec.dec === d;
                              return (
                                <button
                                  key={d}
                                  onClick={() => handleOurRecChange('client', rec.id, 'dec', d)}
                                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                                    active 
                                      ? d === 'Agreed'
                                        ? 'bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300'
                                        : d === 'Not Agreed'
                                          ? 'bg-rose-50 dark:bg-rose-950 border-rose-500 text-rose-700 dark:text-rose-300'
                                          : 'bg-amber-50 dark:bg-amber-950 border-amber-500 text-amber-700 dark:text-amber-300'
                                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-500 hover:border-slate-400'
                                  }`}
                                >
                                  {labelMap[d]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => handleAddOurRec('client')}
                      className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-amber-500 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50/20 transition-all cursor-pointer"
                    >
                      + Add Action Item
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 9: FOLLOW-UP */}
          {activeTab === 8 && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">Next Follow-up & Execution</h3>

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Show Follow-up in MOM Draft?</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowFollowupInDraft(prev => !prev)}
                    className={`relative w-12 h-6.5 rounded-full p-0.5 transition-all cursor-pointer ${
                      showFollowupInDraft ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div 
                      className={`w-5.5 h-5.5 rounded-full bg-white transition-all shadow-sm ${
                        showFollowupInDraft ? 'translate-x-5.5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {showFollowupInDraft ? 'Show in Draft (On)' : 'Do Not Show (Off)'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 max-w-sm pt-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Follow-up Required?</label>
                <div className="flex gap-2">
                  {['Yes', 'No'].map(val => {
                    const active = followupRequired === val;
                    return (
                      <button
                        key={val}
                        onClick={() => setFollowupRequired(val)}
                        className={`flex-1 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          active 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>

              {followupRequired === 'Yes' && (
                <div className="space-y-4 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Follow-up Date</label>
                      <input 
                        type="date" 
                        value={followupDate} 
                        onChange={e => setFollowupDate(e.target.value)} 
                        className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Purpose</label>
                      <input 
                        type="text" 
                        value={followupPurpose} 
                        onChange={e => setFollowupPurpose(e.target.value)} 
                        placeholder="e.g. Verify SIP executions"
                        className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Additional Notes</label>
                    <textarea
                      value={followupNotes}
                      onChange={e => setFollowupNotes(e.target.value)}
                      placeholder="Notes for the follow-up meeting..."
                      rows={2}
                      className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white focus:border-blue-500 outline-none resize-y"
                    />
                  </div>

                  <button
                    onClick={handleCreateFollowUpClick}
                    disabled={followupCreated}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                      followupCreated
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer'
                    }`}
                  >
                    {followupCreated ? <CheckCircle size={14} /> : <Calendar size={14} />}
                    {followupCreated ? 'Follow-up Task & Calendar Marked' : 'Create Follow-up Task & Calendar Marking'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form Actions Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-5 mt-6">
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="px-4 py-2.5 text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl transition-all cursor-pointer"
              >
                Reset Form
              </button>
              {lastAutoSaved && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle size={10} />
                  Auto-saved {lastAutoSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              {activeTab > 0 && (
                <button 
                  onClick={handleBackTab} 
                  className="px-5 py-2.5 text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft size={14} /> Back
                </button>
              )}
              {activeTab < 8 ? (
                <button 
                  onClick={handleNext} 
                  className="px-5 py-2.5 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/10 cursor-pointer"
                >
                  Next <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleSaveAndGenerate}
                  disabled={saving}
                  className="px-5 py-2.5 text-xs font-bold bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl hover:brightness-105 transition-all flex items-center gap-1.5 shadow-md shadow-orange-500/10 cursor-pointer disabled:opacity-60"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : '⚡'} Save &amp; Generate MOM Draft
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STEP 10: PREVIEW WRAP */}
      {isPreviewActive && (
        <div ref={previewRef} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg overflow-hidden animate-scale-up print:block mom-print-card">
          <div className="flex items-center justify-between p-4 bg-slate-950 border-b border-slate-900 text-white select-none print:hidden">
            <div className="flex items-center gap-2">
              <FileDown className="text-amber-500" size={18} />
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest">Generated Document</div>
                <div className="text-sm font-bold">Minutes of Meeting</div>
              </div>
            </div>
            <div className="flex gap-2">
              {/* Saves into client.clientDetails.attachments[] — meaningless
                  (and would error) for a lead, which has no Documents store
                  of its own yet. Print/Copy don't depend on a client record,
                  so both stay available either way. */}
              {subjectType !== 'lead' && (
                <button
                  onClick={handleSaveDocument}
                  disabled={savingDoc}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60"
                >
                  <Save size={13} /> {savingDoc ? 'Saving…' : 'Save Document'}
                </button>
              )}
              <button
                onClick={handlePrint}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white border border-slate-700 hover:bg-slate-700 transition-all flex items-center gap-1 cursor-pointer"
              >
                <Printer size={13} /> Print MOM
              </button>
              <button
                onClick={handleCopyText}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 transition-all flex items-center gap-1 cursor-pointer"
              >
                <Copy size={13} /> Copy Text
              </button>
            </div>
          </div>

          <div className="p-8 print:p-0 bg-white text-slate-950 print:bg-white select-text font-sans">
            {/* Inner Draft HTML Style */}
            <div 
              ref={contentRef}
              className="max-w-[800px] mx-auto mom-print-card"
              dangerouslySetInnerHTML={{ __html: getMomHtml() }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
