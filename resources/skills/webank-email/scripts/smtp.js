const nodemailer = require('nodemailer')
const { getCredentials } = require('./config')
const path = require('path')
const fs = require('fs')

function createTransporter() {
  const creds = getCredentials()
  if (!creds) {
    console.error(JSON.stringify({ error: 'NOT_CONFIGURED', message: 'Email credentials not configured. Please run config.js save first.' }))
    process.exit(2)
  }
  return {
    transporter: nodemailer.createTransport({
      host: creds.smtp.host,
      port: creds.smtp.port,
      secure: creds.smtp.secure,
      auth: {
        user: creds.email,
        pass: creds.password
      },
      tls: { rejectUnauthorized: false }
    }),
    email: creds.email
  }
}

async function run() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (cmd !== 'send') {
    console.error('Usage: node smtp.js send --to <recipients> --subject <subject> --body <body> [--cc <cc>] [--attachments <file1,file2>] [--html]')
    process.exit(1)
  }

  function getArg(name) {
    const idx = args.indexOf('--' + name)
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
  }
  function hasFlag(name) {
    return args.includes('--' + name)
  }

  const to = getArg('to')
  const subject = getArg('subject')
  const body = getArg('body')
  const cc = getArg('cc')
  const attachmentPaths = getArg('attachments')
  const isHtml = hasFlag('html')

  if (!to || !subject || !body) {
    console.error('Missing required arguments: --to, --subject, --body')
    process.exit(1)
  }

  const { transporter, email } = createTransporter()

  const mailOptions = {
    from: email,
    to,
    subject,
    [isHtml ? 'html' : 'text']: body
  }

  if (cc) mailOptions.cc = cc

  if (attachmentPaths) {
    mailOptions.attachments = attachmentPaths.split(',').map(filePath => {
      const resolved = path.resolve(filePath.trim())
      if (!fs.existsSync(resolved)) {
        console.error(JSON.stringify({ error: `Attachment not found: ${resolved}` }))
        process.exit(1)
      }
      return { filename: path.basename(resolved), path: resolved }
    })
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log(JSON.stringify({
      success: true,
      messageId: info.messageId,
      to,
      subject,
      cc: cc || undefined
    }))
  } catch (err) {
    console.error(JSON.stringify({ error: err.message || String(err) }))
    process.exit(1)
  }
}

run()
