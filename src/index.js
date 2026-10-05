'use strict'

const path = require('node:path')
const mineflayer = require('mineflayer')
const { Vec3 } = require('vec3')
const {
  classifyAuthMessage,
  droppedItemName,
  loadConfig,
  makeUsername,
  plainMessage,
  randomBetween
} = require('./core')

const config = loadConfig(path.join(__dirname, '..', 'config.json'))
const allowedBlocks = new Set(config.activity.allowedBlocks)

validateRuntimeData()
if (process.argv.includes('--validate')) {
  console.log(`Configuration and Minecraft ${config.server.version} data are valid.`)
  process.exit(0)
}

const slots = []
const connectionQueue = []
let connectionTimer = null
let reportTimer = null
let stopping = false

const totals = {
  connections: 0,
  reconnects: 0,
  authSuccesses: 0,
  digs: 0,
  placements: 0,
  actionErrors: 0
}

function validateRuntimeData() {
  const minecraftData = require('minecraft-data')(config.server.version)
  if (!minecraftData || minecraftData.version?.version !== 776) {
    throw new Error('Minecraft 26.2 runtime data is missing. Run: npm run prepare-data')
  }
  for (const blockName of allowedBlocks) {
    if (!minecraftData.blocksByName[blockName]) {
      throw new Error(`Unknown block in activity.allowedBlocks: ${blockName}`)
    }
    const itemName = droppedItemName(blockName)
    if (!minecraftData.itemsByName[itemName]) {
      throw new Error(`Block ${blockName} has no placeable item mapping for ${itemName}`)
    }
  }
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function shortReason(reason) {
  const text = plainMessage(reason).replace(/\s+/g, ' ').trim()
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function clearSlotTimers(slot) {
  for (const timer of slot.timers) clearTimeout(timer)
  slot.timers.clear()
}

function later(slot, callback, delay) {
  const timer = setTimeout(() => {
    slot.timers.delete(timer)
    callback()
  }, delay)
  slot.timers.add(timer)
  return timer
}

function enqueueConnection(slot, delay = 0) {
  if (stopping || slot.queuedForConnection) return
  slot.queuedForConnection = true
  slot.state = 'reconnect-wait'
  later(slot, () => {
    if (stopping) return
    connectionQueue.push(slot)
    pumpConnectionQueue()
  }, delay)
}

function pumpConnectionQueue() {
  if (stopping || connectionTimer || connectionQueue.length === 0) return
  const slot = connectionQueue.shift()
  slot.queuedForConnection = false
  connect(slot)
  connectionTimer = setTimeout(() => {
    connectionTimer = null
    pumpConnectionQueue()
  }, config.bots.connectionIntervalMs)
}

function connect(slot) {
  if (stopping || slot.bot) return
  slot.state = 'connecting'
  slot.authenticated = false
  slot.lastAuthCommandAt = 0
  slot.generation += 1
  const generation = slot.generation
  log(`${slot.username}: connecting`)

  let bot
  try {
    bot = mineflayer.createBot({
      host: config.server.host,
      port: config.server.port,
      username: slot.username,
      password: config.bots.password,
      auth: 'offline',
      version: config.server.version,
      checkTimeoutInterval: 300000,
      hideErrors: true
    })
  } catch (error) {
    log(`${slot.username}: create failed: ${error.message}`)
    scheduleReconnect(slot, generation)
    return
  }
  slot.bot = bot

  bot.once('login', () => {
    if (generation !== slot.generation) return
    totals.connections += 1
    slot.state = 'queue'
    log(`${slot.username}: connected to proxy/queue`)
  })

  bot.on('spawn', () => {
    if (generation !== slot.generation || slot.authenticated) return
    slot.state = 'awaiting-auth'
  })

  bot.on('messagestr', (message) => handleMessage(slot, generation, message))
  bot.on('message', (message) => handleMessage(slot, generation, message))

  bot.on('kicked', (reason) => {
    if (generation !== slot.generation) return
    log(`${slot.username}: kicked: ${shortReason(reason)}`)
  })

  bot.on('error', (error) => {
    if (generation !== slot.generation) return
    log(`${slot.username}: error: ${error.message}`)
  })

  bot.once('end', (reason) => {
    if (generation !== slot.generation) return
    clearSlotTimers(slot)
    stopMovement(slot)
    slot.bot = null
    slot.authenticated = false
    slot.actionRunning = false
    if (!stopping) {
      log(`${slot.username}: disconnected (${shortReason(reason) || 'connection ended'})`)
      scheduleReconnect(slot, generation)
    }
  })
}

function scheduleReconnect(slot, generation) {
  if (stopping || generation !== slot.generation || slot.queuedForConnection) return
  totals.reconnects += 1
  const delay = config.bots.reconnectDelayMs + randomBetween(0, config.bots.reconnectJitterMs)
  enqueueConnection(slot, delay)
}

function handleMessage(slot, generation, message) {
  if (stopping || generation !== slot.generation || !slot.bot) return
  const authEvent = classifyAuthMessage(message)
  if (!authEvent) return
  const now = Date.now()

  if (authEvent === 'authenticated') {
    if (!slot.authenticated) {
      slot.authenticated = true
      slot.state = 'active'
      totals.authSuccesses += 1
      log(`${slot.username}: authenticated; activity started`)
      startActivity(slot, generation)
    }
    return
  }

  if (authEvent === 'auth-error') {
    slot.state = 'auth-error'
    log(`${slot.username}: authentication rejected; check bots.password`)
    return
  }

  if (now - slot.lastAuthCommandAt < 4000) return
  slot.lastAuthCommandAt = now
  if (authEvent === 'register') {
    slot.state = 'registering'
    slot.bot.chat(`/register ${config.bots.password} ${config.bots.password}`)
  } else if (authEvent === 'login') {
    slot.state = 'logging-in'
    slot.bot.chat(`/login ${config.bots.password}`)
  }
}

function startActivity(slot, generation) {
  if (config.activity.move) scheduleMovement(slot, generation, randomBetween(300, 2000))
  if (config.activity.worldActions) {
    scheduleWorldAction(slot, generation, randomBetween(3000, config.activity.worldActionMaxMs))
  }
}

function scheduleMovement(slot, generation, delay) {
  later(slot, () => {
    if (!isActive(slot, generation)) return
    if (!slot.actionRunning) randomMovement(slot)
    scheduleMovement(
      slot,
      generation,
      randomBetween(config.activity.directionChangeMinMs, config.activity.directionChangeMaxMs)
    )
  }, delay)
}

function randomMovement(slot) {
  const bot = slot.bot
  stopMovement(slot)
  const yaw = Math.random() * Math.PI * 2
  bot.look(yaw, 0, true).catch(() => {})
  bot.setControlState('forward', true)
  bot.setControlState('sprint', Math.random() < 0.55)
  if (Math.random() < 0.45) {
    bot.setControlState('jump', true)
    later(slot, () => {
      if (slot.bot) slot.bot.setControlState('jump', false)
    }, randomBetween(350, 900))
  }
}

function stopMovement(slot) {
  if (!slot.bot) return
  for (const control of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']) {
    slot.bot.setControlState(control, false)
  }
}

function scheduleWorldAction(slot, generation, delay) {
  later(slot, async () => {
    if (!isActive(slot, generation)) return
    await mineAndRestore(slot, generation)
    if (isActive(slot, generation)) {
      scheduleWorldAction(
        slot,
        generation,
        randomBetween(config.activity.worldActionMinMs, config.activity.worldActionMaxMs)
      )
    }
  }, delay)
}

function isActive(slot, generation) {
  return !stopping && generation === slot.generation && slot.authenticated && slot.bot != null
}

async function mineAndRestore(slot, generation) {
  if (slot.actionRunning || !isActive(slot, generation)) return
  slot.actionRunning = true
  const bot = slot.bot
  stopMovement(slot)
  try {
    const block = bot.findBlock({
      maxDistance: config.activity.maxBlockDistance,
      matching: (candidate) => candidate != null && allowedBlocks.has(candidate.name) && bot.canDigBlock(candidate)
    })
    if (!block) return

    const originalPosition = block.position.clone()
    const expectedItem = droppedItemName(block.name)
    await bot.dig(block, true)
    totals.digs += 1

    const item = await waitForInventoryItem(bot, expectedItem, 5000)
    if (!item || !isActive(slot, generation)) return
    const reference = bot.blockAt(originalPosition.offset(0, -1, 0))
    const target = bot.blockAt(originalPosition)
    if (!reference || reference.boundingBox === 'empty' || !target || !target.name.endsWith('air')) return

    await bot.equip(item, 'hand')
    await bot.placeBlock(reference, new Vec3(0, 1, 0))
    totals.placements += 1
  } catch (error) {
    totals.actionErrors += 1
    if (totals.actionErrors <= 10 || totals.actionErrors % 100 === 0) {
      log(`${slot.username}: world action failed: ${error.message}`)
    }
  } finally {
    slot.actionRunning = false
  }
}

async function waitForInventoryItem(bot, itemName, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && bot.entity) {
    const item = bot.inventory.items().find((entry) => entry.name === itemName)
    if (item) return item
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

function report() {
  const states = {}
  for (const slot of slots) states[slot.state] = (states[slot.state] || 0) + 1
  const stateText = Object.entries(states).map(([state, count]) => `${state}=${count}`).join(' ')
  log(
    `STATUS ${stateText} | connects=${totals.connections} reconnects=${totals.reconnects} ` +
    `digs=${totals.digs} placed=${totals.placements} actionErrors=${totals.actionErrors}`
  )
}

function shutdown(signal) {
  if (stopping) return
  stopping = true
  log(`${signal}: stopping all bots...`)
  if (connectionTimer) clearTimeout(connectionTimer)
  if (reportTimer) clearInterval(reportTimer)
  connectionQueue.length = 0
  for (const slot of slots) {
    clearSlotTimers(slot)
    stopMovement(slot)
    if (slot.bot) {
      try { slot.bot.quit('Load test stopped by operator') } catch {}
    }
  }
  setTimeout(() => process.exit(0), 1500).unref()
}

process.once('SIGINT', () => shutdown('Ctrl+C'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.on('uncaughtException', (error) => log(`uncaught exception: ${error.stack || error.message}`))
process.on('unhandledRejection', (error) => log(`unhandled rejection: ${error?.stack || error}`))

log(`NordLoadTest starting: ${config.bots.count} bots -> ${config.server.host}:${config.server.port}, Minecraft ${config.server.version}`)
log(`Connections are serialized every ${config.bots.connectionIntervalMs} ms; press Ctrl+C to stop.`)
for (let index = 1; index <= config.bots.count; index += 1) {
  const slot = {
    username: makeUsername(config.bots.usernamePrefix, index, config.bots.count),
    bot: null,
    state: 'pending',
    generation: 0,
    queuedForConnection: false,
    authenticated: false,
    lastAuthCommandAt: 0,
    actionRunning: false,
    timers: new Set()
  }
  slots.push(slot)
  enqueueConnection(slot, 0)
}
reportTimer = setInterval(report, config.reportIntervalMs)
