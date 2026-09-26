// How people are named and greeted. Each person picks their own title
// ("Greet me as"); it's a greeting preference, not gender.

export const GREETINGS = [
  { value: "mr", label: "Mr." },
  { value: "ms", label: "Ms." },
  { value: "mrs", label: "Mrs." },
  { value: "dr", label: "Dr." },
  { value: "none", label: "Just my name" },
];

const TITLES = { mr: "Mr.", ms: "Ms.", mrs: "Mrs.", dr: "Dr." };

/** "Mr. Ayenew Shiferaw", or just the name when no title is chosen. */
export function displayName(person) {
  const name = (person?.name || "").trim() || person?.email || "";
  const title = TITLES[person?.greeting];
  return title && name ? `${title} ${name}` : name;
}

/** The database has the greeting column (migration 20260927000000_greeting.sql). */
export function canGreet(profile) {
  return !!profile && "greeting" in profile;
}

/** The profile still needs a name or a greeting choice (asked once after sign-in). */
export function needsProfile(profile) {
  return canGreet(profile) && (!profile.greeting || !(profile.name || "").trim());
}

/** <option>s for a "Greet me as" select. */
export function greetingOptions(selected) {
  return GREETINGS.map((g) => `<option value="${g.value}"${g.value === selected ? " selected" : ""}>${g.label}</option>`).join("");
}
