import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleFirestoreRequest } from './api/_lib/firestoreHandler.js'

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
          res.setHeader('Content-Type', 'application/json')
          try {
            // Delegates to the real handler so dev testing exercises the same
            // template/formatting logic as production.
            const env = loadEnv(server.config.mode, process.cwd(), '')
            Object.assign(process.env, env)

            req.body = rawBody ? JSON.parse(rawBody) : {}
            const { default: handler } = await import('./api/send-allocation-email.js')
            const shimRes = {
              statusCode: 200,
              setHeader: (...args) => res.setHeader(...args),
              status(code) {
                this.statusCode = code
                return this
              },
              json(payload) {
                res.statusCode = this.statusCode
                res.end(JSON.stringify(payload))
              },
            }
            await handler(req, shimRes)
          } catch (error) {
            console.error('send-allocation-email (dev) error:', error)
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to send allocation email.' }))
          }
        })
      })
    },
  }
}

function whatsappDevApi() {
  const DEFAULT_API_URL = 'https://wa.viralmarketingtools.in/api/send'

  const toWhatsAppNumber = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.length === 10) return `91${digits}`
    return digits
  }

  return {
    name: 'whatsapp-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/send-whatsapp') {
          return next()
        }

        let rawBody = ''
        req.on('data', (chunk) => { rawBody += chunk })

        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const { to, message } = rawBody ? JSON.parse(rawBody) : {}
            if (!to || !message) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing to or message.' }))
              return
            }

            const env = loadEnv(server.config.mode, process.cwd(), '')
            const accessToken = env.WHATSAPP_ACCESS_TOKEN
            const instanceId = env.WHATSAPP_INSTANCE_ID
            const apiUrl = env.WHATSAPP_API_URL || DEFAULT_API_URL

            if (!accessToken || !instanceId) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_INSTANCE_ID environment variable.' }))
              return
            }

            const number = toWhatsAppNumber(to)
            if (!number) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid phone number.' }))
              return
            }

            const params = new URLSearchParams({
              number,
              type: 'text',
              message,
              instance_id: instanceId,
              access_token: accessToken,
            })

            const response = await fetch(`${apiUrl}?${params.toString()}`, { method: 'GET' })
            const responseText = await response.text()

            if (!response.ok) {
              console.error('WhatsApp API error (dev):', response.status, responseText)
              res.statusCode = 502
              res.end(JSON.stringify({ error: 'WhatsApp API request failed.' }))
              return
            }

            res.statusCode = 200
            res.end(JSON.stringify({ ok: true, providerResponse: responseText }))
          } catch (error) {
            console.error('send-whatsapp (dev) error:', error)
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to send WhatsApp message.' }))
          }
        })
      })
    },
  }
}

function hrEmployeesDevApi() {
  const HR_EMPLOYEES_API_URL = 'https://hr.briskolive.com/api/external/employees'

  return {
    name: 'hr-employees-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' || req.url !== '/api/hr-employees') {
          return next()
        }

        res.setHeader('Content-Type', 'application/json')
        try {
          const env = loadEnv(server.config.mode, process.cwd(), '')
          const apiKey = env.HR_EMPLOYEES_API_KEY

          if (!apiKey) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Missing HR_EMPLOYEES_API_KEY environment variable.' }))
            return
          }

          const response = await fetch(HR_EMPLOYEES_API_URL, {
            method: 'GET',
            headers: { 'x-api-key': apiKey },
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error('HR employees API error (dev):', response.status, errorText)
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'Failed to fetch employees from HR API.' }))
            return
          }

          const data = await response.json()
          const rawEmployees = Array.isArray(data) ? data : data?.employees || data?.data || []
          const employees = rawEmployees
            .filter((employee) => employee.is_current === true)
            .map((employee) => ({
              name: employee.name || employee.full_name || employee.employee_name || '',
              email: employee.email || employee.email_id || employee.work_email || '',
            }))
            .filter((employee) => employee.name || employee.email)
            .sort((a, b) => a.name.localeCompare(b.name))

          res.statusCode = 200
          res.end(JSON.stringify({ employees }))
        } catch (error) {
          console.error('hr-employees (dev) error:', error)
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Failed to fetch employees.' }))
        }
      })
    },
  }
}

function sendFollowupRemindersDevApi() {
  return {
    name: 'send-followup-reminders-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/send-followup-reminders') {
          return next()
        }

        try {
          // Reuses the real production handler so dev testing exercises the same
          // logic; it only needs the loaded env vars visible on process.env since
          // firebase-admin/nodemailer there read from process.env directly.
          const env = loadEnv(server.config.mode, process.cwd(), '')
          Object.assign(process.env, env)

          const { default: handler } = await import('./api/send-followup-reminders.js')
          const shimRes = {
            statusCode: 200,
            setHeader: (...args) => res.setHeader(...args),
            status(code) {
              this.statusCode = code
              return this
            },
            json(payload) {
              res.statusCode = this.statusCode
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(payload))
            },
          }
          await handler(req, shimRes)
        } catch (error) {
          console.error('send-followup-reminders (dev) error:', error)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Failed to run send-followup-reminders.' }))
        }
      })
    },
  }
}

function parseCommunityJobPhotosDevApi() {
  return {
    name: 'parse-community-job-photos-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/parse-community-job-photos') {
          return next()
        }

        let rawBody = ''
        req.on('data', (chunk) => { rawBody += chunk })

        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const env = loadEnv(server.config.mode, process.cwd(), '')
            Object.assign(process.env, env)

            req.body = rawBody ? JSON.parse(rawBody) : {}
            const { default: handler } = await import('./api/parse-community-job-photos.js')
            const shimRes = {
              statusCode: 200,
              setHeader: (...args) => res.setHeader(...args),
              status(code) {
                this.statusCode = code
                return this
              },
              json(payload) {
                res.statusCode = this.statusCode
                res.end(JSON.stringify(payload))
              },
            }
            await handler(req, shimRes)
          } catch (error) {
            console.error('parse-community-job-photos (dev) error:', error)
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to parse job photos.' }))
          }
        })
      })
    },
  }
}

function firestoreDevApi() {
  return {
    name: 'firestore-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/firestore') {
          return next()
        }

        let rawBody = ''
        req.on('data', (chunk) => { rawBody += chunk })

        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const body = rawBody ? JSON.parse(rawBody) : {}
            const env = loadEnv(server.config.mode, process.cwd(), '')
            const result = await handleFirestoreRequest(body, env)
            res.statusCode = 200
            res.end(JSON.stringify(result))
          } catch (error) {
            console.error('firestore (dev) error:', error)
            res.statusCode = error.statusCode || 500
            res.end(JSON.stringify({ error: error.message || 'Firestore request failed.' }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    allocationEmailDevApi(),
    whatsappDevApi(),
    hrEmployeesDevApi(),
    firestoreDevApi(),
    sendFollowupRemindersDevApi(),
    parseCommunityJobPhotosDevApi(),
  ],
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
