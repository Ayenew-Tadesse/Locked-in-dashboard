// Settings for the page when it's served straight from this repository
// (GitHub Pages, or opening index.html). Vercel builds write their own
// config.js from environment variables instead (scripts/build.mjs).
//
// Right now the site opens the new design with the tracking history from
// the original dashboard, behind the password screen. It's a preview:
// changes made there are not saved.
//
// To save for real, create the Supabase project (docs/DEPLOYMENT.md) and
// replace the line below with your public values:
//   window.LOCKEDIN_CONFIG = { supabaseUrl: "https://<ref>.supabase.co", supabaseAnonKey: "<publishable key>" };
// Never put the secret / service_role key here.
window.LOCKEDIN_CONFIG = { demo: "history" };
