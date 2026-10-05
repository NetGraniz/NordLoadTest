'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  classifyAuthMessage,
  droppedItemName,
  makeUsername,
  mergeConfig,
  randomBetween,
  validateConfig
} = require('../src/core')

test('generates stable Minecraft-safe bot names', () => {
  assert.equal(makeUsername('NFLoad', 1, 100), 'NFLoad001')
  assert.equal(makeUsername('NFLoad', 100, 100), 'NFLoad100')
  assert.throws(() => makeUsername('VeryLongPrefix', 1000, 1000), /16-character/)
})

test('recognizes NordAuth prompts and success messages', () => {
  assert.equal(classifyAuthMessage('Please log in with /login <password>.'), 'login')
  assert.equal(classifyAuthMessage('Please register with /register <password> <password>.'), 'register')
  assert.equal(classifyAuthMessage('Successfully logged in.'), 'authenticated')
  assert.equal(classifyAuthMessage('Incorrect password.'), 'auth-error')
  assert.equal(classifyAuthMessage('Position in queue: 12'), null)
})

test('maps grass block drop back to dirt', () => {
  assert.equal(droppedItemName('grass_block'), 'dirt')
  assert.equal(droppedItemName('sand'), 'sand')
})

test('validates a merged configuration', () => {
  const config = mergeConfig({ server: { version: '26.2' }, bots: { password: 'unit-test-password-only' } })
  assert.equal(validateConfig(config), config)
})

test('requires an explicitly configured bot password', () => {
  assert.throws(() => validateConfig(mergeConfig({})), /bots.password/)
})

test('randomBetween includes deterministic boundaries', () => {
  assert.equal(randomBetween(10, 20, () => 0), 10)
  assert.equal(randomBetween(10, 20, () => 0.999999), 20)
})
