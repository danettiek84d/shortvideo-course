# 短影音實戰營報名頁 + 綠界 ECPay 金流

仿照 airuru.com.tw 的「活動售票型」單頁結構重做（原創文案／版型，未使用原站圖片或文字），並加上線上付款（綠界 ECPay 全方位金流 AllInOne）。

## 頁面結構（對應原站）
- **Header**：Logo + 立即報名 CTA
- **Hero**：標題、副標、CTA、單價
- **痛點區 / 課程亮點 / 當天流程**：原站以圖片承載的銷售段落，這裡改用排版區塊
- **選擇場次**：場次卡片（標題、時間、12:30 開放入場、地點、單價、剩餘名額、立即報名）
- **常見問題（FAQ）**
- **Footer**：主辦單位、統編、地址、隱私權政策
- **報名 Modal**：姓名／手機／Email／人數，計算金額後前往綠界付款

## 結構
```
short-video-course/
├─ public/
│  ├─ index.html     # 頁面
│  ├─ styles.css     # 樣式
│  └─ app.js         # 場次渲染、Modal、送出表單
├─ server.js         # Express + ECPay 建單、付款結果處理
├─ ecpay.js          # CheckMacValue 產生／驗證（SHA256）
├─ test.js           # 用綠界官方範例驗證 CheckMacValue（KAT）
└─ package.json
```

## 本機執行
```bash
npm install
npm test      # 驗證檢查碼演算法（對得上綠界官方文件範例）
npm start     # http://localhost:3000
```
預設使用綠界**測試帳號**（MerchantID 2000132）與**測試環境**端點。

## 付款流程
1. 使用者填報名資料 → 前端 `POST /api/checkout`
2. 後端用**伺服器端價格**重新計算金額、產生 `MerchantTradeNo` 與 `CheckMacValue`，回傳一個自動送出的表單
3. 瀏覽器自動 POST 到綠界付款頁
4. 付款後：
   - `ReturnURL`（`/api/ecpay/notify`）：伺服器對伺服器通知，驗章後更新訂單，回應 `1|OK`
   - `OrderResultURL`（`/api/ecpay/result`）：使用者瀏覽器導回，顯示報名成功／失敗頁

## 切換到正式環境
設定環境變數（勿寫死在程式碼、勿提交到版控）：
```bash
export ECPAY_MERCHANT_ID=你的MerchantID
export ECPAY_HASH_KEY=你的HashKey
export ECPAY_HASH_IV=你的HashIV
export ECPAY_AIO_URL=https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5
export BASE_URL=https://你的網域        # 需可被綠界連到的公開網址
```

## 資料庫（Neon / Vercel Postgres）
訂單已改存 Postgres（`store.js`，使用 `@neondatabase/serverless`）。
未設定連線字串時自動退回記憶體模式，方便本機開發與測試。

在 Vercel 設定：
1. 專案 → **Storage** → **Create Database** → 選 **Neon (Postgres)** → 建立並連結到本專案。
2. Vercel 會自動注入 `POSTGRES_URL` / `DATABASE_URL` 環境變數。
3. 資料表會在第一次有訂單時自動建立（`CREATE TABLE IF NOT EXISTS orders ...`），無需手動 migration。

訂單狀態流程：建立 = `PENDING` → 綠界 `notify` 驗章成功且 `RtnCode=1` → `PAID`（此時寄出確認信，且只寄一次）；失敗 = `FAILED`。

## 確認信（Resend）
付款成功後由 `mailer.js` 透過 Resend 寄出報名確認信。未設 `RESEND_API_KEY` 時只在 log 印出、不實際寄送。

在 Vercel 設定環境變數：
```
RESEND_API_KEY = re_xxxxxxxx          # Resend 後台取得
MAIL_FROM      = 報名通知 <noreply@你的網域>   # 寄件人需用 Resend 已驗證的網域
```
測試階段可先用 Resend 的測試寄件人 `onboarding@resend.dev`（只能寄到你註冊 Resend 的信箱）。

## 切換到正式金流環境
在 Vercel → Settings → Environment Variables 設定（**勿寫進程式碼、勿 commit**）：
```
ECPAY_MERCHANT_ID = 你的 MerchantID
ECPAY_HASH_KEY    = 你的 HashKey
ECPAY_HASH_IV     = 你的 HashIV
ECPAY_AIO_URL     = https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5
ADMIN_TOKEN       = 一組長隨機字串   # 查詢 GET /api/orders/:id 時需帶 x-admin-token 標頭
```
設定後重新部署即生效。`BASE_URL` 可不設，系統會自動用請求網域組出綠界回呼網址。

## 仍建議的後續
- 名額（庫存）改為在資料庫實際扣減並處理併發
- 串接電子發票開立
- 後台訂單列表頁（目前提供單筆查詢 API）

> 測試信用卡（綠界測試環境）：卡號 4311-9522-2222-2222，到期日任一未過期月年，安全碼 222。
