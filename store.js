// ===== Order storage =====
// Uses Neon Postgres (@neondatabase/serverless, the current Vercel Postgres
// driver) when a connection string is configured; otherwise falls back to an
// in-memory Map (handy for local dev / tests).
const CONN =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";
const usePg = !!CONN;

let sql = null;
const mem = new Map();

if (usePg) {
  const { neon } = require("@neondatabase/serverless");
  sql = neon(CONN); // tagged-template queries return a rows array directly
}

let schemaReady = false;
async function ensureSchema() {
  if (!usePg || schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS orders (
    trade_no       text PRIMARY KEY,
    session_id     text NOT NULL,
    qty            int  NOT NULL,
    amount         int  NOT NULL,
    name           text NOT NULL,
    phone          text NOT NULL,
    email          text NOT NULL,
    status         text NOT NULL DEFAULT 'PENDING',
    ecpay_trade_no text,
    fail_reason    text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    paid_at        timestamptz
  )`;
  schemaReady = true;
}

// Normalize a row so callers can always read .tradeNo/.sessionId/.amount/.name/.email
function norm(r) {
  if (!r) return null;
  return {
    tradeNo: r.tradeNo ?? r.trade_no,
    sessionId: r.sessionId ?? r.session_id,
    qty: r.qty,
    amount: r.amount,
    name: r.name,
    phone: r.phone,
    email: r.email,
    status: r.status,
    ecpayTradeNo: r.ecpayTradeNo ?? r.ecpay_trade_no ?? null,
    failReason: r.failReason ?? r.fail_reason ?? null,
    createdAt: r.createdAt ?? r.created_at ?? null,
    paidAt: r.paidAt ?? r.paid_at ?? null,
  };
}

async function createOrder(o) {
  await ensureSchema();
  if (usePg) {
    await sql`INSERT INTO orders (trade_no, session_id, qty, amount, name, phone, email)
      VALUES (${o.tradeNo}, ${o.sessionId}, ${o.qty}, ${o.amount}, ${o.name}, ${o.phone}, ${o.email})`;
  } else {
    mem.set(o.tradeNo, {
      ...o, status: "PENDING", createdAt: new Date().toISOString(),
    });
  }
}

async function getOrder(tradeNo) {
  await ensureSchema();
  if (usePg) {
    const rows = await sql`SELECT * FROM orders WHERE trade_no = ${tradeNo}`;
    return norm(rows[0]);
  }
  return norm(mem.get(tradeNo));
}

// Transition PENDING -> PAID exactly once. Returns the order if THIS call made
// the transition (so the caller sends the confirmation email only once);
// returns null if it was already paid or not found.
async function markPaidIfPending(tradeNo, ecpayTradeNo) {
  await ensureSchema();
  if (usePg) {
    const rows = await sql`UPDATE orders
      SET status = 'PAID', ecpay_trade_no = ${ecpayTradeNo}, paid_at = now()
      WHERE trade_no = ${tradeNo} AND status = 'PENDING'
      RETURNING *`;
    return norm(rows[0]);
  }
  const o = mem.get(tradeNo);
  if (o && o.status === "PENDING") {
    o.status = "PAID";
    o.ecpayTradeNo = ecpayTradeNo;
    o.paidAt = new Date().toISOString();
    return norm(o);
  }
  return null;
}

async function markFailed(tradeNo, reason) {
  await ensureSchema();
  if (usePg) {
    await sql`UPDATE orders SET status = 'FAILED', fail_reason = ${reason}
      WHERE trade_no = ${tradeNo} AND status = 'PENDING'`;
    return;
  }
  const o = mem.get(tradeNo);
  if (o && o.status === "PENDING") { o.status = "FAILED"; o.failReason = reason; }
}

module.exports = { usePg, createOrder, getOrder, markPaidIfPending, markFailed };
