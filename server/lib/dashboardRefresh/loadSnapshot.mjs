import {
  mapDashboardAssigneeMetricRow,
  mapDashboardEpicMetricRow,
  mapDashboardSnapshotRow,
} from "../../db/schema.mjs";

export const loadLatestDashboardSnapshot = (db, stmts) => {
  const snapshotRow = stmts.getLatestSnapshotStmt.get();
  if (!snapshotRow) {
    return null;
  }

  const epics = stmts.listEpicMetricsForSnapshotStmt
    .all(snapshotRow.id)
    .map(mapDashboardEpicMetricRow);
  const assignees = stmts.listAssigneeMetricsForSnapshotStmt
    .all(snapshotRow.id)
    .map(mapDashboardAssigneeMetricRow);

  return mapDashboardSnapshotRow(snapshotRow, { epics, assignees });
};
