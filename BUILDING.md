# NordLoadTest release

This is a Node.js test tool, not a Paper or Velocity plugin. The release ZIP
contains source, the dependency lockfile, tests and a clean config example. It
does not bundle node_modules or an installed configuration.

Use Node.js 22+ and npm. In a dedicated test workspace run `npm ci --ignore-scripts`,
then `npm run prepare-data` to install the pinned fork's Minecraft 26.2 data.
Copy `config.example.json` to `config.json` and choose a test-only password. Run
`npm run check` before connecting clients. `--validate` does not launch clients.

The example uses loopback, one bot and no world actions. Never point this tool at
a server without authorization, and do not publish the configured config.json.
Minecraft 26.2 support currently depends on the forks and revisions pinned in
package-lock.json; it is not guaranteed for arbitrary client-library upgrades.

This release has automated configuration tests and a dependency/data validation
check. It is not evidence that the production server can support 1000 players.
