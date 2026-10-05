'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DEFAULTS = Object.freeze({
  server: { host: '127.0.0.1', port: 25565, version: '26.2' },
  bots: {
    count: 1,
    usernamePrefix: 'NFLoad',
    password: '',
    connectionIntervalMs: 3200,
    reconnectDelayMs: 10000,
    reconnectJitterMs: 10000
  },
  activity: {
    move: true,
    directionChangeMinMs: 3500,
    directionChangeMaxMs: 9000,
    worldActions: true,
    worldActionMinMs: 12000,
    worldActionMaxMs: 30000,
    maxBlockDistance: 4,
    allowedBlocks: ['dirt', 'grass_block', 'sand']
  },
  reportIntervalMs: 10000
})

function mergeConfig(raw) {
  return {
    server: { ...DEFAULTS.server, ...(raw.server || {}) },
    bots: { ...DEFAULTS.bots, ...(raw.bots || {}) },
    activity: { ...DEFAULTS.activity, ...(raw.activity || {}) },
    reportIntervalMs: raw.reportIntervalMs ?? DEFAULTS.reportIntervalMs
  }
}

function requireInteger(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`)
  }
}

function validateConfig(config) {
  if (typeof config.server.host !== 'string' || config.server.host.trim() === '') {
    throw new Error('server.host must be a non-empty string')
  }
  requireInteger(config.server.port, 'server.port', 1, 65535)
  if (config.server.version !== '26.2') {
    throw new Error('This build is pinned to Minecraft 26.2')
  }
  requireInteger(config.bots.count, 'bots.count', 1, 1000)
  if (!/^[A-Za-z0-9_]+$/.test(config.bots.usernamePrefix)) {
    throw new Error('bots.usernamePrefix may contain only Latin letters, digits and underscore')
  }
  if (config.bots.usernamePrefix.length > 11) {
    throw new Error('bots.usernamePrefix must be at most 11 characters')
  }
  if (typeof config.bots.password !== 'string' || config.bots.password.length < 6) {
    throw new Error('bots.password must contain at least 6 characters')
  }
  requireInteger(config.bots.connectionIntervalMs, 'bots.connectionIntervalMs', 100, 60000)
  requireInteger(config.bots.reconnectDelayMs, 'bots.reconnectDelayMs', 1000, 600000)
  requireInteger(config.bots.reconnectJitterMs, 'bots.reconnectJitterMs', 0, 600000)
  requireInteger(config.activity.directionChangeMinMs, 'activity.directionChangeMinMs', 500, 600000)
  requireInteger(config.activity.directionChangeMaxMs, 'activity.directionChangeMaxMs', config.activity.directionChangeMinMs, 600000)
  requireInteger(config.activity.worldActionMinMs, 'activity.worldActionMinMs', 1000, 600000)
  requireInteger(config.activity.worldActionMaxMs, 'activity.worldActionMaxMs', config.activity.worldActionMinMs, 600000)
  requireInteger(config.activity.maxBlockDistance, 'activity.maxBlockDistance', 2, 6)
  if (!Array.isArray(config.activity.allowedBlocks) || config.activity.allowedBlocks.length === 0) {
    throw new Error('activity.allowedBlocks must be a non-empty array')
  }
  requireInteger(config.reportIntervalMs, 'reportIntervalMs', 1000, 600000)
  makeUsername(config.bots.usernamePrefix, config.bots.count, config.bots.count)
  return config
}

function loadConfig(filePath) {
  const absolute = path.resolve(filePath)
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${absolute}: ${error.message}`)
  }
  return validateConfig(mergeConfig(raw))
}

function makeUsername(prefix, index, count) {
  const width = Math.max(3, String(count).length)
  const username = `${prefix}${String(index).padStart(width, '0')}`
  if (username.length > 16) {
    throw new Error(`Generated username ${username} exceeds Minecraft's 16-character limit`)
  }
  return username
}

function randomBetween(min, max, random = Math.random) {
  return Math.floor(min + random() * (max - min + 1))
}

function plainMessage(message) {
  if (message == null) return ''
  if (typeof message === 'string') return message
  if (typeof message.toString === 'function') return message.toString()
  return String(message)
}

function classifyAuthMessage(message) {
  const text = plainMessage(message).toLowerCase()
  if (text.includes('please register') || text.includes('/register <password>')) return 'register'
  if (text.includes('please log in') || text.includes('/login <password>')) return 'login'
  if (
    text.includes('successfully logged in') ||
    text.includes('successfully registered') ||
    text.includes('account registered successfully') ||
    text.includes('already logged in')
  ) return 'authenticated'
  if (text.includes('wrong password') || text.includes('incorrect password')) return 'auth-error'
  return null
}

function droppedItemName(blockName) {
  if (blockName === 'grass_block') return 'dirt'
  return blockName
}

module.exports = {
  classifyAuthMessage,
  droppedItemName,
  loadConfig,
  makeUsername,
  mergeConfig,
  plainMessage,
  randomBetween,
  validateConfig
}
