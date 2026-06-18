// ===== ECPay (綠界) AllInOne helper =====
// Implements CheckMacValue generation per ECPay's documented algorithm:
//   1. Sort parameters by key (case-insensitive, A→Z)
//   2. Build:  HashKey=<key>&k1=v1&k2=v2&...&HashIV=<iv>
//   3. URL-encode the whole string, then lowercase it (.NET HttpUtility.UrlEncode style)
//   4. Replace specific encoded chars back to .NET's literal form
//   5. SHA256, then uppercase
const crypto = require("crypto");

// Emulate .NET HttpUtility.UrlEncode: space -> '+', and leave the .NET "safe"
// punctuation (-_.!*()) as literals. encodeURIComponent already leaves
// -_.!~*'() literal, so we additionally turn %20 into '+'.
function dotNetUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, "+")
    .replace(/'/g, "%27")
    .replace(/~/g, "%7e")
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2a")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function genCheckMacValue(params, hashKey, hashIV) {
  const keys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  let raw = `HashKey=${hashKey}`;
  for (const k of keys) raw += `&${k}=${params[k]}`;
  raw += `&HashIV=${hashIV}`;

  // Encode whole string the .NET way, then lowercase, then restore .NET literals.
  let encoded = dotNetUrlEncode(raw).toLowerCase();
  encoded = encoded
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".");

  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

function verifyCheckMacValue(params, hashKey, hashIV) {
  const received = params.CheckMacValue;
  if (!received) return false;
  const expected = genCheckMacValue(params, hashKey, hashIV);
  return received.toUpperCase() === expected;
}

// yyyy/MM/dd HH:mm:ss in local (server) time
function ecpayDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

// Unique MerchantTradeNo: alphanumeric, <= 20 chars
function genTradeNo(prefix = "SV") {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return (prefix + ts + rnd).slice(0, 20);
}

module.exports = { genCheckMacValue, verifyCheckMacValue, ecpayDate, genTradeNo, dotNetUrlEncode };
