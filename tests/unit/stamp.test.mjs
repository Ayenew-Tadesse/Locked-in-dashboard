import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("index.html version stamps match the app files", () => {
  // Fails when an app file changed without re-running `npm run stamp`, which
  // would let phones and computers keep showing the previous version.
  const out = execFileSync(process.execPath, ["scripts/stamp.mjs", "--check"], { cwd: new URL("../..", import.meta.url) }).toString();
  assert.match(out, /up to date/);
});
