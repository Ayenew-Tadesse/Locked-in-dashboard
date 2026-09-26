// Settings for the page when it's served straight from this repository
// (GitHub Pages, or opening index.html). Vercel builds write their own
// config.js from environment variables instead (scripts/build.mjs).
//
// The site is connected to the team's Supabase project: sign-in replaces the
// password screen and everything is saved in the database.
//
// Both values are public by design. The publishable key only lets a browser
// talk to the project; Row Level Security decides what each signed-in person
// can read or change. Never put the secret / service_role key here.
//
// To go back to the no-database preview, use: window.LOCKEDIN_CONFIG = { demo: "history" };
window.LOCKEDIN_CONFIG = {
  supabaseUrl: "https://uzbgbtzcnufaebifkeab.supabase.co",
  supabaseAnonKey: "sb_publishable_SQJ5lLAJZCKInfCnnQyXmw_VO715R2N"
};
