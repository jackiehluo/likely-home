import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Likely Home for Are.na",
    description: "Connect pages to Are.na, with likely channels suggested by Jev.",
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; style-src 'self'; font-src 'self'",
    },
    permissions: ["activeTab", "contextMenus", "identity", "scripting", "storage"],
    host_permissions: ["https://api.are.na/*", "https://api.typesafe.ai/*"],
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+A" },
        description: "Open Likely Home",
      },
    },
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    action: {
      default_title: "Connect to Are.na",
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
        48: "icons/icon-48.png",
      },
    },
  },
});
