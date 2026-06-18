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

## 上線前待辦
- 訂單改存資料庫（目前為記憶體 `Map`，重啟即清空）
- `notify` 成功後寄送確認信 / 開立電子發票
- 名額（庫存）改為實際扣減並處理併發
- 測試卡號請見綠界「測試介接資訊」頁

> 測試信用卡（綠界測試環境）：卡號 4311-9522-2222-2222，到期日任一未過期月年，安全碼 222。
