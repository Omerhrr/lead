// One-off verification of the email-provider hook code paths.
process.env.RESEND_API_KEY = "re_invalid_test_key"

const m = await import("../src/lib/email-provider")
const p = m.getEmailProvider()
console.log("resolved provider:", p?.name)
const r = await m.deliverOutreach({
  to: "sink@example.com",
  fromName: "Jidout",
  fromEmail: "jidout@example.com",
  subject: "provider test",
  text: "hello",
})
console.log("resend path ->", JSON.stringify(r))
m.resetProviderCache()

// Now the SMTP path against a local sink server.
process.env.RESEND_API_KEY = ""
process.env.SMTP_HOST = "127.0.0.1"
process.env.SMTP_PORT = "1025"
process.env.SMTP_FROM = "jidout@example.com"
const p2 = m.getEmailProvider()
console.log("resolved provider 2:", p2?.name)
const r2 = await m.deliverOutreach({
  to: "sink@example.com",
  fromName: "Jidout",
  fromEmail: "jidout@example.com",
  subject: "smtp test",
  text: "hello via smtp",
})
console.log("smtp path ->", JSON.stringify(r2))
process.exit(0)
