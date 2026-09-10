import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Close Copilot",
    description:
      "A workspace-aware invoice assistant. Local relay, selected tabs, human final save.",
    version: "0.2.2",
    permissions: ["storage", "tabs", "sidePanel", "scripting", "activeTab"],
    host_permissions: [
      "https://11816061-sb1.app.netsuite.com/*",
      "https://mail.google.com/*",
      "https://docs.google.com/spreadsheets/*",
      "http://127.0.0.1:4318/*",
    ],
    side_panel: { default_path: "sidepanel.html" },
    action: { default_title: "Open Close Copilot" },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src ws://127.0.0.1:4318 http://127.0.0.1:4318",
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
