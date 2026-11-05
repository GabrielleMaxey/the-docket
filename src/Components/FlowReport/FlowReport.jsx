import React, { useMemo, useState } from 'react';
import { flowLinkFor } from '../../../shared/flowMetrics.mjs';
import { BarGroup, Kpi, MonthChart, NarrativeCard, ReportHeader, TakeawaysCard, tone } from './parts.jsx';
import './FlowReport.css';

/**
 * FlowReport: "My Flow" metrics panel.
 * Pure presentational: everything comes in through the `data` prop, so the data layer can change
 * without touching layout. Optional `controls` = { instances, instance, onInstanceChange,
 * ranges, range, onRangeChange } shows the instance / date-range toolbar.
 */

const SORT_DEFAULT_DESC = new Set(['age', 'idle']);

function OpenTable({ rows, link, stalledDays, showAssignee = false }) {
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('idle');
  const [dir, setDir] = useState(-1);

  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))], [rows]);
  const stalledCount = rows.filter((r) => r.idle >= stalledDays).length;

  const visible = useMemo(() => {
    const filtered = rows.filter((r) =>
      filter === 'all' ? true : filter === 'stalled' ? r.idle >= stalledDays : r.status === filter
    );
    return [...filtered].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
  }, [rows, filter, sortKey, dir, stalledDays]);

  const onSort = (k) => {
    if (k === sortKey) setDir((d) => -d);
    else { setSortKey(k); setDir(SORT_DEFAULT_DESC.has(k) ? -1 : 1); }
  };
  const th = (k, label, num) => (
    <th className={num ? 'fr-n' : undefined} onClick={() => onSort(k)}>
      {label}{sortKey === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  const count = (f) => (f === 'all' ? rows.length : f === 'stalled' ? stalledCount : rows.filter((r) => r.status === f).length);
  const filters = [['all', 'All open'], ['stalled', 'Stalled'], ...statuses.map((s) => [s, s])];

  return (
    <>
      <div className="fr-filters">
        {filters.map(([f, label]) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {label} ({count(f)})
          </button>
        ))}
      </div>
      <div className="fr-scroll">
        <table>
          <thead>
            <tr>
              {th('key', 'Issue')}{th('summary', 'Summary')}{th('status', 'Status')}{showAssignee && th('assignee', 'Assignee')}{th('parent', 'Parent')}
              {th('age', 'Age (d)', true)}{th('idle', 'Idle (d)', true)}<th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const stalled = r.idle >= stalledDays;
              return (
                <tr key={r.key}>
                  <td><a href={link(r.key)} target="_blank" rel="noreferrer">{r.key}</a></td>
                  <td>{r.summary}</td>
                  <td><span className={`fr-pill ${r.status === 'In Progress' ? 'fr-ip' : 'fr-bl'}`}>{r.status}</span></td>
                  {showAssignee && <td>{r.assignee}</td>}
                  <td>{r.parent && <a href={link(r.parent)} target="_blank" rel="noreferrer">{r.parent}</a>}</td>
                  <td className="fr-n">{r.age}</td>
                  <td className="fr-n">{r.idle}</td>
                  <td><span className={`fr-pill ${stalled ? 'fr-stl' : 'fr-ok'}`}>{stalled ? 'Stalled' : 'Active'}</span></td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={showAssignee ? 8 : 7} className="fr-note">Nothing matches this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}


export default function FlowReport({ data, controls, className = '' }) {
  const d = data;
  const link = (key) => flowLinkFor(d, key);
  const stalledDays = d.stalledDays ?? 30;
  const statusTotal = d.status.reduce((s, x) => s + x.count, 0);

  return (
    <div className={`flow-report ${className}`}>
      <ReportHeader data={d} controls={controls} />
      <NarrativeCard text={d.narrative} />

      <section className="fr-grid fr-kpis">
        {d.kpis.map((k) => <Kpi key={k.label} {...k} />)}
      </section>

      <section className="fr-grid fr-two">
        <div className="fr-card">
          <h2>Throughput: created vs. resolved by month</h2>
          {d.flowNote && <p className="fr-sub">{d.flowNote}</p>}
          <MonthChart months={d.months} series={[{ label: 'Created', values: d.created, tone: 'violet' }, { label: 'Resolved', values: d.resolved, tone: 'green' }]} />
        </div>
        <div className="fr-card">
          <h2>Status breakdown</h2>
          <p className="fr-sub">Current status of all {statusTotal} issues</p>
          <div className="fr-stack">
            {d.status.map((s) => (
              <div key={s.label} className={`fr-bg-${tone(s.tone)}`} style={{ width: `${(s.count / statusTotal) * 100}%` }} title={`${s.label}: ${s.count}`} />
            ))}
          </div>
          <BarGroup rows={d.status} max={statusTotal} />
          <h2 className="fr-h2-gap">By type and priority</h2>
          <BarGroup rows={d.types} max={statusTotal} />
          <BarGroup rows={d.priorities} max={statusTotal} />
        </div>
      </section>

      <section className="fr-grid fr-half">
        <div className="fr-card">
          <h2>Aging of open work</h2>
          <p className="fr-sub">Days since each of the {d.open.length} open issues was created</p>
          <BarGroup rows={d.aging} max={d.open.length} />
          <h2 className="fr-h2-gap">Days since last update</h2>
          <BarGroup rows={d.idleBuckets} max={d.open.length} />
        </div>
        <div className="fr-card">
          <h2>Lead time distribution</h2>
          <p className="fr-sub">{d.leadNote}</p>
          <BarGroup rows={d.leadBuckets} />
          <h2 className="fr-h2-gap">Median lead time by type</h2>
          <BarGroup rows={d.leadByType} suffix=" d" />
          {d.dueNote && <p className="fr-note">{d.dueNote}</p>}
        </div>
      </section>

      <section className="fr-grid">
        <div className="fr-card">
          <h2>Open work: aging and stalled items</h2>
          <p className="fr-sub">"Stalled" means {d.stalledDefinition ?? `no update for ${stalledDays}+ days`}. Click a column header to sort.</p>
          <OpenTable rows={d.open} link={link} stalledDays={stalledDays} showAssignee={Boolean(d.meta?.allAssignees || d.meta?.includeHandedOn)} />
        </div>
      </section>

      <section className="fr-grid fr-half">
        <div className="fr-card">
          <h2>Progress by parent (largest groups)</h2>
          <p className="fr-sub">Your assigned items under each parent issue</p>
          {d.parents.map((p) => {
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            const t = pct === 100 ? 'green' : pct === 0 ? 'red' : 'blue';
            return (
              <div className="fr-hrow fr-hrow-parent" key={p.key}>
                <span><a href={link(p.key)} target="_blank" rel="noreferrer">{p.key}</a> <span className="fr-note">{p.name}</span></span>
                <div className="fr-track"><div className={`fr-fill fr-bg-${t}`} style={{ width: `${pct}%` }} /></div>
                <span className="fr-hval">{p.done}/{p.total}</span>
              </div>
            );
          })}
        </div>
        <TakeawaysCard takeaways={d.takeaways} link={link} />
      </section>

      {d.footnote && <p className="fr-note fr-footnote">{d.footnote}</p>}
    </div>
  );
}
