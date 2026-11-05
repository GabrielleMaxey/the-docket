import React, { useMemo, useState } from 'react';
import { flowLinkFor } from '../../../shared/flowMetrics.mjs';
import { BarGroup, Kpi, MonthChart, NarrativeCard, ReportHeader, TakeawaysCard } from './parts.jsx';
import './FlowReport.css';

/**
 * Gantt plan-health report. Presentational: everything comes in through `data`
 * (see shared/ganttPlanHealth.mjs). `comparison` is optional and comes from compareGanttSnapshots.
 */

const SLIP_TONES = { 'Early': 'green', 'On time': 'green', '1–7 d late': 'amber', '8–30 d late': 'red', '31+ d late': 'red' };
const OVERDUE_TONES = { '1–7 d': 'amber', '8–30 d': 'red', '31–90 d': 'red', '90+ d': 'red' };
const withTones = (rows, map) => (rows || []).map((r) => ({ ...r, tone: map[r.label] }));

const COLUMNS = [
  ['key', 'Issue'], ['summary', 'Summary'], ['status', 'Status'], ['assignee', 'Assignee'],
  ['dueDate', 'Due'], ['overdueDays', 'Overdue (d)', true], ['pushedDays', 'Pushed (d)', true],
];

function AttentionTable({ rows, link }) {
  const [sortKey, setSortKey] = useState('overdueDays');
  const [dir, setDir] = useState(-1);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const x = a[sortKey] ?? -Infinity, y = b[sortKey] ?? -Infinity;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  }), [rows, sortKey, dir]);
  const onSort = (k) => {
    if (k === sortKey) setDir((d) => -d);
    else { setSortKey(k); setDir(k === 'overdueDays' || k === 'pushedDays' ? -1 : 1); }
  };
  if (!rows.length) return <p className="fr-note">No open issues are past due.</p>;
  return (
    <div className="fr-scroll">
      <table>
        <thead>
          <tr>
            {COLUMNS.map(([k, label, num]) => (
              <th key={k} className={num ? 'fr-n' : undefined} onClick={() => onSort(k)}>
                {label}{sortKey === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key}>
              <td><a href={link(r.key)} target="_blank" rel="noreferrer">{r.key}</a></td>
              <td>{r.summary}</td>
              <td><span className="fr-pill fr-bl">{r.status}</span></td>
              <td>{r.assignee}</td>
              <td>{r.dueDate}</td>
              <td className="fr-n">{r.overdueDays}</td>
              <td className="fr-n">{r.pushedDays == null ? '' : `+${r.pushedDays}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GapTable({ rows, link }) {
  if (!rows.length) return <p className="fr-note">Every open issue has a due date or planned finish.</p>;
  return (
    <div className="fr-scroll">
      <table>
        <thead><tr><th>Issue</th><th>Summary</th><th>Status</th><th>Assignee</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td><a href={link(r.key)} target="_blank" rel="noreferrer">{r.key}</a></td>
              <td>{r.summary}</td>
              <td><span className="fr-pill fr-bl">{r.status}</span></td>
              <td>{r.assignee}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Comparison({ comparison, link }) {
  if (!comparison) return null;
  const { previousAt, moved, finished, added, removed } = comparison;
  const when = previousAt ? new Date(previousAt).toLocaleDateString() : 'the previous snapshot';
  const none = !moved.length && !finished.length && !added.length && !removed.length;
  return (
    <section className="fr-grid">
      <div className="fr-card">
        <h2>Changes since {when}</h2>
        {none ? <p className="fr-note">Nothing changed in due dates, completions or scope.</p> : (
          <ul className="fr-ins">
            {moved.length > 0 && (
              <li><b>{moved.length} due {moved.length === 1 ? 'date' : 'dates'} moved:</b>{' '}
                {moved.slice(0, 12).map((m, i) => (
                  <React.Fragment key={m.key}>{i > 0 && '; '}<a href={link(m.key)} target="_blank" rel="noreferrer">{m.key}</a> {m.from} → {m.to} ({m.days > 0 ? '+' : ''}{m.days} d)</React.Fragment>
                ))}{moved.length > 12 ? ` and ${moved.length - 12} more` : ''}
              </li>
            )}
            {finished.length > 0 && <li><b>{finished.length} finished:</b> {finished.slice(0, 12).map((r) => r.key).join(', ')}{finished.length > 12 ? '…' : ''}</li>}
            {added.length > 0 && <li><b>{added.length} added to the plan:</b> {added.slice(0, 12).map((r) => r.key).join(', ')}{added.length > 12 ? '…' : ''}</li>}
            {removed.length > 0 && <li><b>{removed.length} removed from the plan:</b> {removed.slice(0, 12).map((r) => r.key).join(', ')}{removed.length > 12 ? '…' : ''}</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function GanttPlanHealth({ data, comparison = null, controls, className = '' }) {
  const d = data;
  const link = (key) => flowLinkFor(d, key);
  return (
    <div className={`flow-report ${className}`}>
      <ReportHeader data={d} controls={controls} />
      <NarrativeCard text={d.narrative} />

      <section className="fr-grid fr-kpis">
        {d.kpis.map((k) => <Kpi key={k.label} {...k} />)}
      </section>

      <Comparison comparison={comparison} link={link} />

      <section className="fr-grid fr-two">
        <div className="fr-card">
          <h2>Planned finishes vs. completions by month</h2>
          {d.flowNote && <p className="fr-sub">{d.flowNote}</p>}
          <MonthChart months={d.months} series={[{ label: 'Planned finishes', values: d.planned, tone: 'violet' }, { label: 'Completed', values: d.completed, tone: 'green' }]} />
        </div>
        <div className="fr-card">
          <h2>Completion vs. planned finish</h2>
          <p className="fr-sub">Finished work measured against its planned finish date</p>
          <BarGroup rows={withTones(d.slipBuckets, SLIP_TONES)} />
          <h2 className="fr-h2-gap">Open work past due</h2>
          <p className="fr-sub">Days past the current due date</p>
          <BarGroup rows={withTones(d.overdueBuckets, OVERDUE_TONES)} />
        </div>
      </section>

      <section className="fr-grid">
        <div className="fr-card">
          <h2>Needing attention</h2>
          <p className="fr-sub">Open issues past their due date. Click a column header to sort.</p>
          <AttentionTable rows={d.attention || []} link={link} />
        </div>
      </section>

      <section className="fr-grid fr-half">
        <div className="fr-card">
          <h2>Schedule gaps</h2>
          <p className="fr-sub">Open issues with no due date or planned finish</p>
          <GapTable rows={d.noSchedule || []} link={link} />
        </div>
        <TakeawaysCard takeaways={d.takeaways} link={link} />
      </section>

      {d.footnote && <p className="fr-note fr-footnote">{d.footnote}</p>}
    </div>
  );
}
