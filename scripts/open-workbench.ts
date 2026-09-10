import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { config } from "dotenv";
config({ quiet: true });
const token = readFileSync(resolve(".local/relay-token"), "utf8").trim();
const url = `http://127.0.0.1:${process.env.APP_PORT || 4318}/#pair=${encodeURIComponent(token)}`;
const command =
  process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
execFile(
  command,
  process.platform === "win32" ? ["/c", "start", "", url] : [url],
  (error) => {
    if (error)
      console.error(
        "Could not open the workbench. Open localhost and paste the local pairing token.",
      );
  },
);
