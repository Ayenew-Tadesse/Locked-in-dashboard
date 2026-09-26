// "Set up my year": the original dashboard's history (daily checklists and
// reports) plus the year plan (goals, milestones and daily tickets). Used by
// Settings for a real account and by the ?demo=history preview.
import { buildLegacyImport, roadmapDone } from "../legacy-import.js";
import { buildYearPlan } from "./year-plan.js";

export function buildYearSetup(legacy, newId) {
  const history = buildLegacyImport(legacy, newId, { roadmap: false });
  const plan = buildYearPlan(newId, roadmapDone(legacy));
  return {
    goals: plan.goals,
    milestones: plan.milestones,
    tasks: [...history.tasks, ...plan.tasks],
    dailyNotes: history.dailyNotes,
  };
}
