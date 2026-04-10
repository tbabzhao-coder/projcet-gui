const Imap = require('imap')
const { simpleParser } = require('mailparser')
const { getCredentials } = require('./config')
const path = require('path')
const fs = require('fs')

function createClient() {
  const creds = getCredentials()
  if (!creds) {
    console.error(JSON.stringify({ error: 'NOT_CONFIGURED', message: 'Email credentials not configured. Please run config.js save first.' }))
    process.exit(2)
  }
  return new Imap({
    user: creds.email,
    password: creds.password,
    host: creds.imap.host,
    port: creds.imap.port,
    tls: creds.imap.tls,
    tlsOptions: { rejectUnauthorized: false }
  })
}

function openBox(imap, boxName = 'INBOX', readOnly = true) {
  return new Promise((resolve, reject) => {
    imap.openBox(boxName, readOnly, (err, box) => {
      if (err) reject(err)
      else resolve(box)
    })
  })
}

function search(imap, criteria) {
  return new Promise((resolve, reject) => {
    imap.search(criteria, (err, uids) => {
      if (err) reject(err)
      else resolve(uids)
    })
  })
}

function fetchMessage(imap, uid, opts = {}) {
  return new Promise((resolve, reject) => {
    const fetch = imap.fetch(uid, {
      bodies: opts.headersOnly ? 'HEADER.FIELDS (FROM TO SUBJECT DATE CC)' : '',
      struct: true
    })
    let result = { uid, headers: {}, body: '', attachments: [] }
    fetch.on('message', (msg) => {
      let rawData = Buffer.alloc(0)
      msg.on('body', (stream) => {
        const chunks = []
        stream.on('data', (chunk) => chunks.push(chunk))
        stream.on('end', () => { rawData = Buffer.concat(chunks) })
      })
      msg.once('attributes', (attrs) => {
        result.flags = attrs.flags
        result.date = attrs.date
      })
      msg.once('end', () => {
        if (opts.headersOnly) {
          const headerStr = rawData.toString('utf-8')
          const lines = headerStr.split(/\r?\n/)
          for (const line of lines) {
            const match = line.match(/^(From|To|Subject|Date|Cc):\s*(.+)/i)
            if (match) result.headers[match[1].toLowerCase()] = match[2].trim()
          }
          resolve(result)
        } else {
          resolve({ ...result, rawData })
        }
      })
    })
    fetch.once('error', reject)
    fetch.once('end', () => {})
  })
}

function parseFull(imap, uid) {
  return new Promise((resolve, reject) => {
    const fetch = imap.fetch(uid, { bodies: '' })
    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        simpleParser(stream, (err, parsed) => {
          if (err) reject(err)
          else resolve(parsed)
        })
      })
    })
    fetch.once('error', reject)
  })
}

function setFlags(imap, uids, flags) {
  return new Promise((resolve, reject) => {
    imap.setFlags(uids, flags, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function connect(imap) {
  return new Promise((resolve, reject) => {
    imap.once('ready', resolve)
    imap.once('error', reject)
    imap.connect()
  })
}

async function run() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (!cmd) {
    console.error('Usage: node imap.js <check|fetch|search|download|mark-read|list-folders>')
    process.exit(1)
  }

  const imap = createClient()

  function getArg(name) {
    const idx = args.indexOf('--' + name)
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
  }

  try {
    await connect(imap)

    if (cmd === 'list-folders') {
      const boxes = await new Promise((resolve, reject) => {
        imap.getBoxes((err, boxes) => {
          if (err) reject(err)
          else resolve(boxes)
        })
      })
      const folders = []
      function walk(obj, prefix = '') {
        for (const [name, box] of Object.entries(obj)) {
          const fullName = prefix ? prefix + box.delimiter + name : name
          folders.push(fullName)
          if (box.children) walk(box.children, fullName)
        }
      }
      walk(boxes)
      console.log(JSON.stringify({ folders }))
    }

    else if (cmd === 'check') {
      const folder = getArg('folder') || 'INBOX'
      const sinceStr = getArg('since')
      const limit = parseInt(getArg('limit') || '20', 10)

      const box = await openBox(imap, folder)
      let criteria = ['ALL']

      if (sinceStr) {
        const sinceDate = sinceStr === 'today'
          ? new Date(new Date().setHours(0, 0, 0, 0))
          : new Date(sinceStr)
        criteria = [['SINCE', sinceDate]]
      } else {
        criteria = ['UNSEEN']
      }

      const uids = await search(imap, criteria)
      const recent = uids.slice(-limit)

      if (recent.length === 0) {
        console.log(JSON.stringify({ total: 0, messages: [] }))
      } else {
        const messages = []
        for (const uid of recent) {
          const msg = await fetchMessage(imap, uid, { headersOnly: true })
          messages.push({
            uid: msg.uid,
            from: msg.headers.from || '',
            to: msg.headers.to || '',
            subject: msg.headers.subject || '',
            date: msg.headers.date || '',
            flags: msg.flags
          })
        }
        console.log(JSON.stringify({ total: uids.length, showing: messages.length, messages }))
      }
    }

    else if (cmd === 'fetch') {
      const uid = getArg('uid')
      const folder = getArg('folder') || 'INBOX'
      if (!uid) {
        console.error('Usage: node imap.js fetch --uid <uid> [--folder <folder>]')
        process.exit(1)
      }
      await openBox(imap, folder)
      const parsed = await parseFull(imap, uid)
      const result = {
        uid,
        from: parsed.from ? parsed.from.text : '',
        to: parsed.to ? parsed.to.text : '',
        cc: parsed.cc ? parsed.cc.text : '',
        subject: parsed.subject || '',
        date: parsed.date ? parsed.date.toISOString() : '',
        text: parsed.text || '',
        html: parsed.html ? '[HTML content available]' : '',
        attachments: (parsed.attachments || []).map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size
        }))
      }
      console.log(JSON.stringify(result))
    }

    else if (cmd === 'search') {
      const keyword = getArg('keyword')
      const from = getArg('from')
      const since = getArg('since')
      const folder = getArg('folder') || 'INBOX'
      const limit = parseInt(getArg('limit') || '20', 10)

      await openBox(imap, folder)
      const criteria = []
      if (keyword) criteria.push(['TEXT', keyword])
      if (from) criteria.push(['FROM', from])
      if (since) {
        const sinceDate = since === 'today'
          ? new Date(new Date().setHours(0, 0, 0, 0))
          : new Date(since)
        criteria.push(['SINCE', sinceDate])
      }
      if (criteria.length === 0) criteria.push('ALL')

      const uids = await search(imap, criteria)
      const recent = uids.slice(-limit)

      if (recent.length === 0) {
        console.log(JSON.stringify({ total: 0, messages: [] }))
      } else {
        const messages = []
        for (const uid of recent) {
          const msg = await fetchMessage(imap, uid, { headersOnly: true })
          messages.push({
            uid: msg.uid,
            from: msg.headers.from || '',
            subject: msg.headers.subject || '',
            date: msg.headers.date || ''
          })
        }
        console.log(JSON.stringify({ total: uids.length, showing: messages.length, messages }))
      }
    }

    else if (cmd === 'download') {
      const uid = getArg('uid')
      const folder = getArg('folder') || 'INBOX'
      const outputDir = getArg('output') || '.'
      if (!uid) {
        console.error('Usage: node imap.js download --uid <uid> [--folder <folder>] [--output <dir>]')
        process.exit(1)
      }
      await openBox(imap, folder)
      const parsed = await parseFull(imap, uid)
      if (!parsed.attachments || parsed.attachments.length === 0) {
        console.log(JSON.stringify({ message: 'No attachments found', uid }))
      } else {
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
        const saved = []
        for (const att of parsed.attachments) {
          const safeName = (att.filename || 'attachment').replace(/[<>:"/\\|?*]/g, '_')
          const filePath = path.join(outputDir, safeName)
          fs.writeFileSync(filePath, att.content)
          saved.push({ filename: safeName, size: att.size, path: filePath })
        }
        console.log(JSON.stringify({ uid, attachments: saved }))
      }
    }

    else if (cmd === 'mark-read') {
      const uid = getArg('uid')
      const folder = getArg('folder') || 'INBOX'
      if (!uid) {
        console.error('Usage: node imap.js mark-read --uid <uid> [--folder <folder>]')
        process.exit(1)
      }
      await openBox(imap, folder, false)
      await setFlags(imap, uid, ['\\Seen'])
      console.log(JSON.stringify({ success: true, uid, markedAs: 'read' }))
    }

    else {
      console.error(`Unknown command: ${cmd}`)
      process.exit(1)
    }

    imap.end()
  } catch (err) {
    console.error(JSON.stringify({ error: err.message || String(err) }))
    try { imap.end() } catch (_) {}
    process.exit(1)
  }
}

run()
