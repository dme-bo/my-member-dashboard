import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function allocationEmailDevApi() {
  return {
    name: 'allocation-email-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/send-allocation-email') {
          return next()
        }

        let rawBody = ''
        req.on('data', (chunk) => {
          rawBody += chunk
        })

        req.on('end', async () => {
          try {
            const { to, subject, body } = rawBody ? JSON.parse(rawBody) : {}
            if (!to || !subject || !body) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Missing to, subject, or body.' }))
              return
            }

            const env = loadEnv(server.config.mode, process.cwd(), '')
            const apiKey = env.RESEND_API_KEY
            const from = env.ALLOCATION_EMAIL_FROM || 'Brisk Olive <onboarding@resend.dev>'

            if (!apiKey) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Missing RESEND_API_KEY environment variable.' }))
              return
            }

            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from,
                to,
                subject,
                text: body,
                html: `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${String(body)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;')}</pre>`,
              }),
            })

            const responseText = await emailResponse.text()
            res.statusCode = emailResponse.status
            res.setHeader('Content-Type', 'application/json')

            if (!emailResponse.ok) {
              res.end(responseText || JSON.stringify({ error: 'Failed to send email.' }))
              return
            }

            res.end(responseText || JSON.stringify({ ok: true }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error?.message || 'Failed to send allocation email.' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), allocationEmailDevApi()],
})
