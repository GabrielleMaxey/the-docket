CREATE TABLE team_issue_metadata (
  site_host TEXT NOT NULL,
  issue_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 20),
  follow_up TEXT CHECK (follow_up IN ('now', 'next')),
  note TEXT NOT NULL DEFAULT '',
  requestor TEXT NOT NULL DEFAULT '',
  open_decision_note TEXT NOT NULL DEFAULT '',
  pm_override TEXT NOT NULL DEFAULT '',
  has_open_decision BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_gantt BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE,
  complete_date DATE,
  planned_start DATE,
  planned_finish DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (site_host, issue_key)
);

CREATE TABLE shared_programs (
  slug TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE shared_program_epics (
  program_slug TEXT NOT NULL REFERENCES shared_programs(slug) ON DELETE CASCADE,
  site_host TEXT NOT NULL,
  issue_key TEXT NOT NULL,
  PRIMARY KEY (program_slug, site_host, issue_key)
);
