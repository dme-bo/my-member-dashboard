import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import nodemailer from 'nodemailer'

function allocationEmailDevApi() {
  return {
    name: 'allocation-email-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/send-allocation-email') {
          return next()
        }

        let rawBody = ''
        req.on('data', (chunk) => { rawBody += chunk })

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
            const gmailUser = env.GMAIL_USER
            const gmailAppPassword = env.GMAIL_APP_PASSWORD

            res.setHeader('Content-Type', 'application/json')

            if (!gmailUser || !gmailAppPassword) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable.' }))
              return
            }

            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: gmailUser, pass: gmailAppPassword },
            })

            await transporter.sendMail({
              from: `Brisk Olive <${gmailUser}>`,
              to,
              subject,
              text: body,
              html: `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${String(body)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')}</pre>`,
            })

            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
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

function verifyLoginDevApi() {
  return {
    name: 'verify-login-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' || !req.url.startsWith('/api/verify-login')) {
          return next()
        }

        const url = new URL(req.url, 'http://localhost')
        const email = (url.searchParams.get('email') || '').trim().toLowerCase()

        res.setHeader('Content-Type', 'application/json')

        if (!email) {
          res.statusCode = 400
          res.end(JSON.stringify({ ok: false, error: 'Missing email.' }))
          return
        }

        try {
          const response = await fetch('http://hr.briskolive.com:5000/api/onboarding')
          if (!response.ok) {
            res.statusCode = 502
            res.end(JSON.stringify({ ok: false, error: 'Onboarding API unavailable.' }))
            return
          }

          const payload = await response.json()
          const records = Array.isArray(payload) ? payload : payload.data || []
          const normalize = (value) => String(value || '').trim().toLowerCase()

          const match = records.find(
            (record) => normalize(record.officialEmail) === email || normalize(record.persEmail) === email
          )

          if (!match) {
            res.end(JSON.stringify({ ok: false }))
            return
          }

          res.end(JSON.stringify({ ok: true, email, name: match.name || '' }))
        } catch (error) {
          res.statusCode = 500
          res.end(JSON.stringify({ ok: false, error: error?.message || 'Failed to verify login.' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), allocationEmailDevApi(), verifyLoginDevApi()],
  optimizeDeps: {
    include: ['react-window'],
  },
  build: {
    // Raise warning threshold — our vendor chunks are intentionally large
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // PDF generation libraries (only loaded by NewsLetterPage)
          if (
            id.includes('@react-pdf') ||
            id.includes('pdfmake') ||
            id.includes('html2pdf') ||
            id.includes('html-to-pdfmake') ||
            id.includes('jspdf')
          ) {
            return 'vendor-pdf'
          }

          // Chart libraries (only loaded by Dashboard)
          if (
            id.includes('chart.js') ||
            id.includes('chartjs') ||
            id.includes('recharts') ||
            id.includes('react-google-charts') ||
            id.includes('react-chartjs')
          ) {
            return 'vendor-charts'
          }

          // Firebase SDK (shared, loaded early — keep together)
          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase'
          }

          // XLSX spreadsheet library (used for exports)
          if (id.includes('node_modules/xlsx')) {
            return 'vendor-xlsx'
          }

          // MUI component library
          if (
            id.includes('@mui/material') ||
            id.includes('@mui/icons-material') ||
            id.includes('@emotion/react') ||
            id.includes('@emotion/styled') ||
            id.includes('floating-ui')
          ) {
            return 'vendor-mui'
          }

          // React icons — separate chunk, large but tree-shakeable per page
          if (id.includes('node_modules/react-icons')) {
            return 'vendor-icons'
          }

          // React Router — navigation only, separate from React core
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router'
          }

          // react-window — only used by MemberListPage
          if (id.includes('node_modules/react-window')) {
            return 'vendor-window'
          }

          // React core (must come AFTER react-icons/react-router/react-window checks
          // to avoid their paths matching this broader pattern)
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/') ||
            id.includes('/node_modules/react-is/')
          ) {
            return 'vendor-react'
          }
        },
      },
    },
  },
})
