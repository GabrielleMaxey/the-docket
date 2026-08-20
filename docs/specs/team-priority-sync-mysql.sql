-- Shared program priority schema (MySQL 8+)
-- Spec: docs/specs/team-priority-sync.md
-- Priority 0 is not stored: DELETE the team_issue_priority row instead.

CREATE TABLE shared_program (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(64) NOT NULL,
  display_name  VARCHAR(255) NOT NULL,
  enabled       TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY shared_program_slug_uq (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shared_program_root (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  program_id    BIGINT UNSIGNED NOT NULL,
  epic_key      VARCHAR(32) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY shared_program_root_program_epic_uq (program_id, epic_key),
  KEY shared_program_root_epic_key_idx (epic_key),
  CONSTRAINT shared_program_root_program_fk
    FOREIGN KEY (program_id) REFERENCES shared_program (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shared_program_admin (
  jira_account_id  VARCHAR(128) NOT NULL,
  display_name     VARCHAR(255) NOT NULL DEFAULT '',
  added_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  added_by         VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (jira_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_issue_priority (
  issue_key    VARCHAR(32) NOT NULL,
  priority     TINYINT UNSIGNED NOT NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by   VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (issue_key),
  KEY team_issue_priority_updated_at_idx (updated_at),
  CONSTRAINT team_issue_priority_range_chk
    CHECK (priority >= 1 AND priority <= 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ad-hoc "start date" for shared-program issues (feeds Gantt charts). No Jira field
-- backs this. Deliberately its own table, not a column on team_issue_priority: that
-- table deletes its row whenever priority hits 0, and a start date must survive that.
CREATE TABLE team_issue_date (
  issue_key    VARCHAR(32) NOT NULL,
  start_date   DATE NOT NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by   VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (issue_key),
  KEY team_issue_date_updated_at_idx (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional seed (confirm epic keys with PMs before PROD)
-- INSERT INTO shared_program (slug, display_name) VALUES
--   ('nora', 'NORA'),
--   ('ask-greg', 'MCP - Ask Greg');
--
-- INSERT INTO shared_program_root (program_id, epic_key)
-- SELECT id, 'ODI-23957' FROM shared_program WHERE slug = 'nora';
--
-- INSERT INTO shared_program_root (program_id, epic_key)
-- SELECT id, epic_key FROM shared_program
-- CROSS JOIN (
--   SELECT 'ODI-23066' AS epic_key UNION ALL SELECT 'ODI-18520'
-- ) AS roots
-- WHERE shared_program.slug = 'ask-greg';
--
-- INSERT INTO shared_program_admin (jira_account_id, display_name, added_by)
-- VALUES ('your-atlassian-account-id', 'Your Name', 'seed');
