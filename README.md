# NordLoadTest

External headless load generator for the Nord-Fjell Minecraft 26.2 stack. It connects through Velocity, waits in NordQueue, registers or logs in through NordAuth, then keeps the bots moving and makes them mine and replace nearby safe blocks.

The program has no duration limit. It reconnects bots after proxy or server restarts and runs until the operator presses `Ctrl+C` in its console.

## Important

Run this against a staging copy of the server first. Bots really alter the world. They try to put every mined block back, but a disconnect, full inventory, protection plugin, lag or another player can interrupt that cycle. Do not aim the first 100-bot run at the only copy of the production world.

One hundred Mineflayer clients can also consume several gigabytes of RAM on the load-generator computer. Prefer a second PC with at least 8–16 GB of free memory so the test machine does not distort Paper's results.

## Start and stop

1. Copy `config.example.json` to the ignored local `config.json`. Set a password used only by your test bots, the staging target and the bot count. The example deliberately contains no usable password.
2. Double-click `start.bat`.
3. Stop only with `Ctrl+C` in that window. The program then disconnects all bots cleanly.

The sources may live on a network drive. `start.bat` deliberately installs npm dependencies into `%LOCALAPPDATA%\NordLoadTest\runtime-26.2` on the local `C:` drive because npm cannot reliably create and remove `node_modules` over SMB. Git is not required: pinned GitHub source archives are downloaded over HTTPS.

The first 100 connections take about 5 minutes because they are intentionally spaced by 3.2 seconds. This respects Velocity's current 3000 ms login rate limit for clients coming from one IP.

## What the bots do

- enter through Velocity and NordQueue;
- automatically use `/register` on their first visit and `/login` afterward;
- reconnect and rejoin the queue after a Paper or Velocity restart;
- walk, sprint, turn and jump;
- mine a nearby block from `activity.allowedBlocks`, collect its drop and try to place it back;
- print aggregate connection, queue, authentication, digging, placement and error counters every 10 seconds.

Bot names are stable (`NFLoad001` ... `NFLoad100`), so NordAuth accounts and last positions are reused between runs. Keep the same password in `config.json` after the first registration.

Never commit `config.json`, bot credentials or account databases. No password is embedded in the source. A missing or short password fails validation before clients connect. The example uses loopback, one bot, and no movement or world changes. Existing local configuration is not overwritten.

## Recommended ramp-up

Start with 5 bots, then 20, 50 and finally 100. At each step watch Paper TPS/MSPT, CPU, heap, GC pauses, disk activity, chunk generation and Velocity errors. A gradual ramp makes the first real bottleneck much easier to identify.

## Configuration notes

- `connectionIntervalMs` should stay above Velocity's `login-ratelimit` when all bots use one public IP.
- `worldActionMinMs` and `worldActionMaxMs` control how often each bot mines/builds.
- `allowedBlocks` deliberately excludes containers, ores, gravity-affected blocks and blocks that require tools.
- `worldActions: false` disables block changes while retaining movement and chunk loading.
