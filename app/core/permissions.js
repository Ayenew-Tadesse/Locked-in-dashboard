// What an admin may do. The owner picks these per admin (Team → Admin
// management); the database enforces them (migration
// 20261012000000_admin_permissions.sql, private.admin_defaults() has the same
// names and defaults). The owner can always do everything.
export const ADMIN_PERMISSION_GROUPS = [
  ["People and team", [
    ["invite", "Invite colleagues", true],
    ["cancel_invites", "Cancel invitations", true],
    ["access_requests", "See and answer access requests", false],
    ["remove_colleagues", "Remove colleagues from the team", false],
    ["rename_team", "Rename the team", false],
  ]],
  ["Colleagues' work", [
    ["see_work", "See colleagues' tasks, files and scores", true],
    ["assign_tasks", "Assign tasks to colleagues", true],
    ["edit_tasks", "Edit and delete colleagues' tasks", true],
    ["see_admins", "See other admins' work (read only)", false],
  ]],
  ["Plans", [
    ["edit_projects", "Add and edit projects", true],
    ["delete_projects", "Delete projects", true],
    ["edit_goals", "Edit team goals and milestones", false],
    ["manage_groups", "Create and manage project groups", false],
  ]],
  ["Messages", [
    ["moderate_chat", "Delete other people's team chat messages", false],
  ]],
];

export const ADMIN_PERMISSIONS = ADMIN_PERMISSION_GROUPS.flatMap(([, list]) => list);
export const ADMIN_DEFAULTS = Object.fromEntries(ADMIN_PERMISSIONS.map(([k, , on]) => [k, on]));

/** An admin's permissions: their saved choices over the defaults (unknown names dropped). */
export function adminPermissions(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  return Object.fromEntries(ADMIN_PERMISSIONS.map(([k, , on]) => [k, typeof s[k] === "boolean" ? s[k] : on]));
}

/** Only what differs from the defaults (what gets saved). */
export function permissionChanges(perms) {
  return Object.fromEntries(ADMIN_PERMISSIONS.filter(([k, , on]) => typeof perms?.[k] === "boolean" && perms[k] !== on).map(([k]) => [k, perms[k]]));
}
