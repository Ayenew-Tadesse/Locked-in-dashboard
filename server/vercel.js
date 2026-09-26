// Adapts server/api.js to a Vercel Node.js function.
import { handleRequest } from "./api.js";

export function vercelHandler(fixedEndpoint) {
  return async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    const { endpoint, ...query } = req.query || {};
    const out = await handleRequest(fixedEndpoint ?? endpoint, {
      method: req.method, query, body: req.body, headers: req.headers,
    }, { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY });
    res.status(out.status).json(out.body);
  };
}
