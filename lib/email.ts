import sendgrid from '@sendgrid/mail'

const apiKey = process.env.SENDGRID_API_KEY
const from = process.env.EMAIL_FROM

if (!apiKey) {
  console.warn('SENDGRID_API_KEY is not set — emails will not be sent')
} else {
  sendgrid.setApiKey(apiKey)
}

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  if (!apiKey || !from) {
    console.warn('Email not sent because SENDGRID_API_KEY or EMAIL_FROM is not configured')
    return
  }

  const msg: any = {
    to,
    from,
    subject,
    text,
  }
  if (html) msg.html = html

  return sendgrid.send(msg)
}
