import React from 'react';
import './FlowReport.css';

/**
 * Presentational building blocks shared by the Flow report and the Gantt plan-health report.
 * They only render props, so any report layout can compose them.
 */

export const TONES = ['green', 'blue', 'amber', 'red', 'violet', 'muted'];
export const tone = (t) => (TONES.includes(t) ? t : 'blue');

export function Kpi({ label, value, sub, tone: t }) {
  return (
    <div className="fr-card fr-kpi">
      <div className="fr-kpi-l">{label}</div>
      <div className={`fr-kpi-v${t ? ` fr-c-${tone(t)}` : ''}`}>{value}</div>
      {sub && <div className="fr-kpi-s">{sub}</div>}
    </div>
  );
}

export function BarRow({ label, value, max, tone: t, suffix = '', wide }) {
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

export function BarGroup({ rows, max, suffix }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.count ?? r.days ?? 0));
  return rows.map((r) => (
    <BarRow key={r.label} label={r.label} value={r.count ?? r.days} max={m} tone={r.tone} suffix={suffix} />
  ));
}

/** Grouped monthly bars. series: [{ label, values, tone }] (two or three series fit well). */
export function MonthChart({ months, series }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  return (
    <>
      <div className="fr-chart">
        {months.map((m, i) => (
          <div className="fr-col" key={m}>
            <div className="fr-bars">
              {series.map((s) => (
                <div key={s.label} className={`fr-bar fr-bg-${tone(s.tone)}`} style={{ height: `${(s.values[i] / max) * 88}%` }}>
                  <span>{s.values[i]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="fr-xl">
        {months.map((m) => <div key={m}>{m}</div>)}
      </div>
      <div className="fr-legend">
        {series.map((s) => <span key={s.label}><i className={`fr-dot fr-bg-${tone(s.tone)}`} />{s.label}</span>)}
      </div>
    </>
  );
}

export function Controls({ controls }) {
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


export function ReportHeader({ data, controls }) {
  return (
    <header className="fr-header">
      <h1>{data.title}</h1>
      <p>{data.subtitle}</p>
      {data.chips?.map((c) => <span className="fr-chip" key={c}>{c}</span>)}
      <Controls controls={controls} />
    </header>
  );
}

export function NarrativeCard({ text }) {
  if (!text) return null;
  return (
    <section className="fr-card fr-narrative">
      <h3>AI summary</h3>
      {String(text).split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
    </section>
  );
}

export function TakeawaysCard({ takeaways, link }) {
  return (
    <div className="fr-card">
      <h2>Key takeaways</h2>
      <ul className="fr-ins">
        {(takeaways || []).map((t, i) => (
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
  );
}
