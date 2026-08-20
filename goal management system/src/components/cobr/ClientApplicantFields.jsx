// Group Leader / Applicant / PAN — the identity trio every COBR-workspace
// register opens with. Reuses the Tasks module's GroupLeaderSelect so the
// picker behaves identically to the one in the COBR and Task forms.
import React, { useMemo } from 'react';
import { Field, inputCls, selectCls, CoolSelect } from '../UI';
import { GroupLeaderSelect } from '../TasksView';

// Derives a client's selectable applicants: the group leader themself (Self)
// plus every named family member, each carrying its own PAN.
function applicantOptionsFor(client) {
  if (!client) return [];
  const opts = [{ name: client.name, relation: 'Self', pan: client.pan || '' }];
  (client.clientDetails?.familyDetails || []).forEach((f) => {
    if (f.name) opts.push({ name: f.name, relation: f.relation || 'Member', pan: f.pan || '' });
  });
  return opts;
}

export default function ClientApplicantFields({
  clients = [],
  groupLeaderId,
  groupLeader,
  applicant,
  pan,
  onChange,
  disabled = false,
}) {
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === groupLeaderId) || clients.find((c) => c.name === groupLeader) || null,
    [clients, groupLeaderId, groupLeader]
  );

  const options = useMemo(() => applicantOptionsFor(selectedClient), [selectedClient]);

  return (
    <>
      <Field label="Group Leader *">
        {disabled ? (
          <div className={inputCls + ' bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed'}>{groupLeader || '—'}</div>
        ) : (
          <GroupLeaderSelect
            options={clients}
            value={groupLeader}
            pan={selectedClient?.pan}
            onSelect={(c) => onChange({ groupLeaderId: c.id, groupLeader: c.name, applicant: '', pan: '' })}
          />
        )}
      </Field>

      <Field label="Client / Applicant Name *">
        {disabled ? (
          <div className={inputCls + ' bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed'}>{applicant || '—'}</div>
        ) : options.length > 0 ? (
          <CoolSelect
            showValueOnSelect
            value={applicant}
            onChange={(e) => {
              const name = e.target.value;
              const opt = options.find((o) => o.name === name);
              onChange({ applicant: name, pan: opt?.pan || '' });
            }}
            className={selectCls}
          >
            <option value="">Select applicant…</option>
            {options.map((o) => <option key={o.name} value={o.name}>{o.name} — {o.relation}</option>)}
          </CoolSelect>
        ) : (
          <input value={applicant} disabled placeholder="Select a group leader first" className={inputCls + ' opacity-60 cursor-not-allowed'} />
        )}
      </Field>

      <Field label="Applicant PAN" hint="Auto-fetched from the applicant">
        <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-mono tracking-widest">
          {pan || '—'}
        </div>
      </Field>
    </>
  );
}
