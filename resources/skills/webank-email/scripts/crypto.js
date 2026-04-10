const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getDataDir() {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const dir = path.join(home, '.project4-email')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getKeyPath() {
  return path.join(getDataDir(), '.key')
}

function getOrCreateKey() {
  const keyPath = getKeyPath()
  if (fs.existsSync(keyPath)) {
    return Buffer.from(fs.readFileSync(keyPath, 'utf-8').trim(), 'hex')
  }
  const key = crypto.randomBytes(KEY_LENGTH)
  fs.writeFileSync(keyPath, key.toString('hex'), 'utf-8')
  return key
}

function encrypt(plaintext) {
  const key = getOrCreateKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt(ciphertext) {
  const key = getOrCreateKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = Buffer.from(parts[2], 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8')
}

module.exports = { encrypt, decrypt, getDataDir }

if (require.main === module) {
  const args = process.argv.slice(2)
  const cmd = args[0]
  if (cmd === 'encrypt' && args[1]) {
    console.log(encrypt(args[1]))
  } else if (cmd === 'decrypt' && args[1]) {
    console.log(decrypt(args[1]))
  } else {
    console.error('Usage: node crypto.js <encrypt|decrypt> <text>')
    process.exit(1)
  }
}
