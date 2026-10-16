import React from "react";
import { useTaskManagerJira } from "../hooks/useTaskManagerJira.js";
import { COMBINED_STATE_FIELDS } from "../combinedWorkModel.js";

export default function CombinedSiteEditor({ site, onModel, confirmedIssues, onConfirmedIssue }) {
  const model = useTaskManagerJira({ siteContext: site.sourceContext, combinedRun: site, onConfirmedIssue });
  React.useEffect(() => {
    onModel(site.instanceId, model);
  }, [site.instanceId, onModel, model.jqlRuns, model.jqlError, model.teamAvailable,
    model.collapsedRowKeys, model.expandedPlanningKey, ...COMBINED_STATE_FIELDS.map((field) => model[field])]);
  React.useEffect(() => {
    for (const issue of Object.values(confirmedIssues || {})) model.reconcileIssue(issue);
  }, [confirmedIssues, model.reconcileIssue]);
  return null;
}
