import sgMail from '@sendgrid/mail'
import fetch from 'node-fetch'

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || ''
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || ''
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || ''

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY)

let lastAlerts: Record<string, number> = {}
const ALERT_COOLDOWN_SECONDS = parseInt(process.env.ALERT_COOLDOWN_SECONDS || '600', 10) // default 10 minutes

function shouldSendAlert(key: string) {
  const now = Date.now() / 1000
  const last = lastAlerts[key] || 0
  if (now - last < ALERT_COOLDOWN_SECONDS) return false
  lastAlerts[key] = now
  return true
}

export async function sendAlertIfNeeded(kind: string, payload: any) {
  // Debounce alerts to avoid spamming
  if (!shouldSendAlert(kind)) return

  const subject = kind === 'auth_rejections' ? `Alert: repeated sign-in rejections (${payload.count} in ${payload.windowMin}m)` : `Alert: repeated revalidation failures (${payload.count} in ${payload.windowMin}m)`
  const text = JSON.stringify(payload, null, 2)

  // Send email if configured
  if (SENDGRID_API_KEY && ALERT_EMAIL_TO && ALERT_EMAIL_FROM) {
    try {
      await sgMail.send({
        to: ALERT_EMAIL_TO,
        from: ALERT_EMAIL_FROM,
        subject,
        text,
      })
    } catch (err) {
      console.warn('Failed to send alert email', (err as any)?.message)
    }
  }

  // Send Slack message if configured
  if (SLACK_WEBHOOK_URL) {
    try {
      await fetch(SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `*${subject}*\n\n${text}` }) })
    } catch (err) {
      console.warn('Failed to send slack alert', (err as any)?.message)
    }
  }
}
