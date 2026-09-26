// "Set up my year": the original dashboard's history (daily checklists and
// reports) plus the year plan (goals, milestones and daily tickets). Used by
// Settings for a real account and by the ?demo=history preview.
import { buildLegacyImport, roadmapDone } from "../legacy-import.js";
import { buildYearPlan } from "./year-plan.js";

// With a teamId, the plan's goals and milestones are shared with the team
// (the owner's roadmap becomes the team's); tasks stay the owner's own.
export function buildYearSetup(legacy, newId, { teamId = null } = {}) {
  const history = buildLegacyImport(legacy, newId, { roadmap: false });
  const plan = buildYearPlan(newId, roadmapDone(legacy));
  const share = (rows) => (teamId ? rows.map((r) => ({ ...r, team_id: teamId })) : rows);
  return {
    goals: share(plan.goals),
    milestones: share(plan.milestones),
    tasks: [...history.tasks, ...plan.tasks],
    dailyNotes: history.dailyNotes,
  };
}
