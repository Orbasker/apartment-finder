import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Apartment Finder - FB Groups",
  description: "Scrapes Facebook group posts you visit into Apartment Finder.",
  version: "0.1.0",
  permissions: ["storage", "activeTab"],
  host_permissions: [
    "https://www.facebook.com/*",
    "https://m.facebook.com/*",
    "http://localhost/*",
    "http://localhost:3000/*",
    "http://127.0.0.1/*",
    "http://127.0.0.1:3000/*",
    "https://apartment-finder-eight.vercel.app/*"
  ],
  background: {
    service_worker: "src/background.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: [
        "https://www.facebook.com/groups/*",
        "https://m.facebook.com/groups/*"
      ],
      js: ["src/content/index.ts"],
      run_at: "document_idle"
    }
  ],
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true
  },
  action: {
    default_title: "Apartment Finder"
  }
});
