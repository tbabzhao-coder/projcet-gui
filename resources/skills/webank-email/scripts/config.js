const fs = require('fs')
const path = require('path')
const { encrypt, decrypt, getDataDir } = require('./crypto')

const CONFIG_FILE = 'credentials.json'

function getConfigPath() {
  return path.join(getDataDir(), CONFIG_FILE)
}

function loadConfig() {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) return null
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return null
  }
}

function saveConfig(email, password) {
  const encryptedPass = encrypt(password)
  const config = {
    email,
    password: encryptedPass,
    imap: {
      host: 'imap.webank.com',
      port: 993,
      tls: true
    },
    smtp: {
      host: 'smtp.webank.com',
      port: 465,
      secure: true
    },
    updatedAt: new Date().toISOString()
  }
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return config
}

function getCredentials() {
  const config = loadConfig()
  if (!config) return null
  return {
    email: config.email,
    password: decrypt(config.password),
    imap: config.imap,
    smtp: config.smtp
  }
}

function printStatus() {
  const config = loadConfig()
  if (!config) {
    console.log(JSON.stringify({ configured: false }))
  } else {
    console.log(JSON.stringify({
      configured: true,
      email: config.email,
      updatedAt: config.updatedAt
    }))
  }
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (cmd === 'status') {
    printStatus()
  } else if (cmd === 'save') {
    let email, password
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--email' && args[i + 1]) email = args[++i]
      else if (args[i] === '--password' && args[i + 1]) password = args[++i]
    }
    if (!email || !password) {
      console.error('Usage: node config.js save --email <email> --password <password>')
      process.exit(1)
    }
    saveConfig(email, password)
    console.log(JSON.stringify({ success: true, email }))
  } else if (cmd === 'get') {
    const creds = getCredentials()
    if (!creds) {
      console.error('Not configured. Run: node config.js save --email <email> --password <password>')
      process.exit(1)
    }
    console.log(JSON.stringify({ email: creds.email, hasPassword: true }))
  } else if (cmd === 'delete') {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
      console.log(JSON.stringify({ success: true, message: 'Credentials deleted' }))
    } else {
      console.log(JSON.stringify({ success: false, message: 'No credentials found' }))
    }
  } else {
    console.error('Usage: node config.js <status|save|get|delete>')
    console.error('  status                           - Check if credentials are configured')
    console.error('  save --email <e> --password <p>   - Save credentials (encrypted)')
    console.error('  get                              - Verify credentials exist')
    console.error('  delete                           - Remove stored credentials')
    process.exit(1)
  }
}

module.exports = { loadConfig, saveConfig, getCredentials }
