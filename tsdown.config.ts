/**
 * Standalone build config for dsh-safeguard.
 *
 * Uses the vendored client-bundle preset (build/tsdown.client.ts + its
 * build/web-platform.ts sibling): node-half lib/ plus the browser bundle
 * lib/client.js (closure-factory artifact for the GUI's __ModuleLoader__, CSS
 * Modules inlined with auto-injected <style data-plugin>). Node-half entries
 * point at src; runtime SDK peers are externalized and resolve from the dsh
 * profile tree.
 */
import { clientBundle } from './build/tsdown.client.ts'

export default clientBundle('dsh-safeguard', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-system-prompt',
  ],
})