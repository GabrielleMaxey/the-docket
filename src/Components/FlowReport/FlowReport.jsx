import React, { useMemo, useState } from 'react';
import { flowLinkFor } from '../../../shared/flowMetrics.mjs';
import './FlowReport.css';

/**
 * FlowReport — "My Flow" metrics panel.
 * Pure presentational: everything comes in through the `data` prop (see mockData.js
 * for the shape), so the data layer can be swapped in later without touching layout.
 *
 * Optional controls: pass `controls` = { instances, instance, onInstanceChange,
 * ranges, range, onRangeChange } to show the instance / date-range toolbar.
 */

const TONES = ['green', 'blue', 'amber', 'red', 'violet', 'muted'];
const tone = (t) => (TONES.includes(t) ? t : 'blue');

function Kpi({ label, value, sub, tone: t }) {
  return (
    <div className="fr-card fr-kpi">
      <div className="fr-kpi-l">{label}</div>
      <div className={`fr-kpi-v${t ? ` fr-c-${tone(t)}` : ''}`}>{value}</div>
      {sub && <div className="fr-kpi-s">{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, tone: t, suffix = '', wide }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`fr-hrow${wide ? ' fr-hrow-wide' : ''}`}>
      <span>{label}</span>
      <div className="fr-track">
        <div className={`fr-fill fr-bg-${tone(t)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="fr-hval">{value}{suffix}</span>
    </div>
  );
}

function BarGroup({ rows, max, suffix }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.count ?? r.days ?? 0));
  return rows.map((r) => (
    <BarRow key={r.label} label={r.label} value={r.count ?? r.days} max={m} tone={r.tone} suffix={suffix} />
  ));
}

function FlowChart({ months, created, resolved }) {
  const max = Math.max(1, ...created, ...resolved);
  return (
    <>
      <div className="fr-chart">
        {months.map((m, i) => (
          <div className="fr-col" key={m}>
            <div className="fr-bars">
              <div className="fr-bar fr-bg-violet" style={{ height: `${(created[i] / max) * 88}%` }}>
                <span>{created[i]}</span>
              </div>
              <div className="fr-bar fr-bg-green" style={{ height: `${(resolved[i] / max) * 88}%` }}>
                <span>{resolved[i]}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="fr-xl">
        {months.map((m) => <div key={m}>{m}</div>)}
      </div>
      <div className="fr-legend">
        <span><i className="fr-dot fr-bg-violet" />Created</span>
        <span><i className="fr-dot fr-bg-green" />Resolved</span>
      </div>
    </>
  );
}

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

function Controls({ controls }) {
  if (!controls) return null;
  const { instances, instance, onInstanceChange, ranges, range, onRangeChange } = controls;
  return (
    <div className="fr-controls">
      {instances && (
        <label>Jira instance
          <select value={instance} onChange={(e) => onInstanceChange?.(e.target.value)}>
            {instances.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </label>
      )}
      {ranges && (
        <label>Range
          <select value={range} onChange={(e) => onRangeChange?.(e.target.value)}>
            {ranges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export default function FlowReport({ data, controls, className = '' }) {
  const d = data;
  const link = (key) => flowLinkFor(d, key);
  const stalledDays = d.stalledDays ?? 30;
  const statusTotal = d.status.reduce((s, x) => s + x.count, 0);

  return (
    <div className={`flow-report ${className}`}>
      <header className="fr-header">
        <h1>{d.title}</h1>
        <p>{d.subtitle}</p>
        {d.chips?.map((c) => <span className="fr-chip" key={c}>{c}</span>)}
        <Controls controls={controls} />
      </header>

      {d.narrative ? (
        <section className="fr-card fr-narrative">
          <h3>AI summary</h3>
          {String(d.narrative).split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
        </section>
      ) : null}

      <section className="fr-grid fr-kpis">
        {d.kpis.map((k) => <Kpi key={k.label} {...k} />)}
      </section>

      <section className="fr-grid fr-two">
        <div className="fr-card">
          <h2>Throughput: created vs. resolved by month</h2>
          {d.flowNote && <p className="fr-sub">{d.flowNote}</p>}
          <FlowChart months={d.months} created={d.created} resolved={d.resolved} />
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
        <div className="fr-card">
          <h2>Key takeaways</h2>
          <ul className="fr-ins">
            {d.takeaways.map((t, i) => (
              <li key={i}>
                <b>{t.lead}:</b> {t.text}
                {t.keys?.length > 0 && (
                  <> {t.keys.map((k, j) => (
                    <React.Fragment key={k}>{j > 0 && ', '}<a href={link(k)} target="_blank" rel="noreferrer">{k}</a></React.Fragment>
                  ))}</>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {d.footnote && <p className="fr-note fr-footnote">{d.footnote}</p>}
    </div>
  );
}
