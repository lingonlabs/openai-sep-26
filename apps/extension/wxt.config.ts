import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Lingon Labs · Close companion', description: 'A local, workspace-scoped finance assistant powered by Astra.',
    version: '0.1.0', minimum_chrome_version: '120', permissions: ['storage', 'tabs', 'scripting', 'sidePanel', 'debugger', 'alarms'],
    host_permissions: ['http://127.0.0.1/*'], optional_host_permissions: ['https://*/*', 'http://localhost/*'],
    side_panel: { default_path: 'sidepanel.html' },
    action: { default_title: 'Open Lingon Labs' },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
