// Verify CheckMacValue against ECPay's OFFICIAL documented example.
// Source: https://developers.ecpay.com.tw/?p=2902
const assert = require("assert");
const { genCheckMacValue, verifyCheckMacValue } = require("./ecpay");

const HashKey = "pwFHCqoQZGmho4w6";
const HashIV = "EkRm7iFT261dpevs";

const params = {
  TradeDesc: "促銷方案",
  PaymentType: "aio",
  MerchantTradeDate: "2023/03/12 15:30:23",
  MerchantTradeNo: "ecpay20230312153023",
  MerchantID: "3002607",
  ReturnURL: "https://www.ecpay.com.tw/receive.php",
  ItemName: "Apple iphone 15",
  TotalAmount: "30000",
  ChoosePayment: "ALL",
  EncryptType: "1",
};

const EXPECTED = "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840";

const got = genCheckMacValue(params, HashKey, HashIV);
console.log("expected:", EXPECTED);
console.log("got     :", got);
assert.strictEqual(got, EXPECTED, "❌ CheckMacValue mismatch vs ECPay official KAT");
console.log("✅ KAT passed — matches ECPay official documented value");

// Round-trip: a payload carrying its own CheckMacValue should verify true.
const signed = { ...params, CheckMacValue: got };
assert.strictEqual(verifyCheckMacValue(signed, HashKey, HashIV), true, "❌ verify failed");
assert.strictEqual(
  verifyCheckMacValue({ ...signed, TotalAmount: "1" }, HashKey, HashIV),
  false,
  "❌ tampered payload should fail"
);
console.log("✅ verifyCheckMacValue accepts valid & rejects tampered payloads");
console.log("\nAll tests passed.");
