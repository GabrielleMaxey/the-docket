ALTER TABLE team_issue_metadata ADD COLUMN has_tracking BOOLEAN NOT NULL DEFAULT FALSE;

-- Older consolidated false-only/cleared rows have no recoverable tracking provenance.
-- Backfill meaningful values only; explicitly shared empty records need a manual re-save.
UPDATE team_issue_metadata
SET has_tracking = TRUE
WHERE start_date IS NOT NULL OR complete_date IS NOT NULL
   OR planned_start IS NOT NULL OR planned_finish IS NOT NULL
   OR has_open_decision OR pm_override <> '' OR requestor <> '' OR open_decision_note <> '';
