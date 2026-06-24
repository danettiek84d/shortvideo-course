// ===== Confirmation email via Resend =====
// Sends when RESEND_API_KEY is set; otherwise logs and no-ops (local dev).
const FROM = process.env.MAIL_FROM || "onboarding@resend.dev"; // verify your own domain for production
const KEY = process.env.RESEND_API_KEY;

let resend = null;
let initError = null;
if (KEY) {
  try {
    const { Resend } = require("resend");
    resend = new Resend(KEY);
  } catch (e) {
    initError = "resend init failed: " + e.message;
    console.error(initError);
  }
}

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const ntd = (n) => "NT$ " + Number(n).toLocaleString("en-US");

// order: { tradeNo, qty, amount, name, email }, sessionTitle: string
async function sendConfirmation(order, sessionTitle) {
  const subject = `報名成功確認｜${sessionTitle}`;
  const html = `
  <div style="font-family:'Noto Sans TC',Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
    <h2 style="color:#ff2e63">報名成功 🎉</h2>
    <p>${esc(order.name)} 您好，我們已收到您的報名與付款，以下是訂單資訊：</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:8px 0;color:#888">課程</td><td style="text-align:right">${esc(sessionTitle)}</td></tr>
      <tr><td style="padding:8px 0;color:#888">訂單編號</td><td style="text-align:right">${esc(order.tradeNo)}</td></tr>
      <tr><td style="padding:8px 0;color:#888">人數</td><td style="text-align:right">${esc(order.qty)} 人</td></tr>
      <tr><td style="padding:8px 0;color:#888">金額</td><td style="text-align:right">${ntd(order.amount)}</td></tr>
    </table>
    <p style="font-size:14px;color:#555">當天請於 12:30 後入場，憑此信報到即可。期待與您相見！</p>
    <p style="font-size:12px;color:#aaaa;margin-top:24px">此信由系統自動發送，請勿直接回覆。</p>
  </div>`;

  if (!resend) {
    console.log(`[mail skipped — no RESEND_API_KEY] to=${order.email} subject="${subject}"`);
    return { skipped: true };
  }
  try {
    const r = await resend.emails.send({ from: FROM, to: order.email, subject, html });
    console.log(`[mail sent] to=${order.email} id=${r?.data?.id || "?"}`);
    return { sent: true };
  } catch (e) {
    console.error(`[mail error] ${e.message}`);
    return { error: e.message };
  }
}

function mailerStatus() {
  return { enabled: !!resend, from: FROM, initError };
}

module.exports = { sendConfirmation, mailerStatus };
