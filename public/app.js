// ===== Session data (front-end render). Source of truth for price lives on the server. =====
const SESSIONS = [
  { id: "TC-0621", city: "台中", title: "2026 短影音爆發成長實戰營（台中場 6/21）", date: "6/21（日） 13:00–17:00", venue: "範例咖啡共享空間", addr: "台中市西屯區範例路 256 號 2 樓", price: 2980, seats: 12 },
  { id: "KH-0628", city: "高雄", title: "2026 短影音爆發成長實戰營（高雄場 6/28）", date: "6/28（日） 13:00–17:00", venue: "南區共創交誼廳 1 樓", addr: "高雄市前鎮區範例四路 12 號", price: 2980, seats: 8 },
  { id: "TP-0705", city: "台北", title: "2026 短影音爆發成長實戰營（台北場 7/5）", date: "7/5（日） 13:00–17:00", venue: "中山學習教室", addr: "台北市中山區範例北路二段 99 號 6 樓-1", price: 2980, seats: 0 },
  { id: "TC-0719", city: "台中", title: "2026 短影音爆發成長實戰營（台中場 7/19）", date: "7/19（日） 13:00–17:00", venue: "範例咖啡共享空間", addr: "台中市西屯區範例路 256 號 2 樓", price: 2980, seats: 15 },
  { id: "TP-0802", city: "台北", title: "2026 短影音爆發成長實戰營（台北場 8/2）", date: "8/2（日） 13:00–17:00", venue: "中山學習教室", addr: "台北市中山區範例北路二段 99 號 6 樓-1", price: 2980, seats: 20 },
  { id: "KH-0830", city: "高雄", title: "2026 短影音爆發成長實戰營（高雄場 8/30）", date: "8/30（日） 13:00–17:00", venue: "範例教室 B 棟 4 樓", addr: "高雄市前鎮區範例四路 2 號", price: 2980, seats: 18 },
];

const fmt = (n) => "NT$ " + n.toLocaleString("zh-TW");

// ===== Render session cards =====
const grid = document.getElementById("session-grid");
grid.innerHTML = SESSIONS.map((s) => {
  const soldOut = s.seats <= 0;
  return `
  <article class="session ${soldOut ? "soldout" : ""}">
    <span class="city-tag">${s.city}場</span>
    <h3>${s.title}</h3>
    <p class="meta"><strong>${s.date}</strong></p>
    <p class="meta">🚪 12:30 開放入場</p>
    <div class="venue">
      <div class="name">${s.venue}</div>
      <div class="addr">${s.addr}</div>
    </div>
    <div class="price-line">
      <span class="label">單價</span>
      <span class="price">${fmt(s.price)}</span>
    </div>
    <span class="badge-left">${soldOut ? "已額滿" : `剩餘 ${s.seats} 席`}</span>
    <button class="btn btn-pill signup" data-id="${s.id}" ${soldOut ? "disabled" : ""}>
      ${soldOut ? "已額滿" : "立即報名"}
    </button>
  </article>`;
}).join("");

// ===== Modal logic =====
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modal-close");
const modalSession = document.getElementById("modal-session");
const modalSessionId = document.getElementById("modal-session-id");
const qtyInput = document.getElementById("modal-qty");
const totalEl = document.getElementById("modal-total");
let current = null;

function updateTotal() {
  const qty = parseInt(qtyInput.value, 10) || 1;
  totalEl.textContent = fmt(current.price * qty);
}

function openModal(id) {
  current = SESSIONS.find((s) => s.id === id);
  if (!current) return;
  modalSession.textContent = current.title;
  modalSessionId.value = current.id;
  qtyInput.value = 1;
  qtyInput.max = Math.min(10, current.seats);
  updateTotal();
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}

grid.addEventListener("click", (e) => {
  const btn = e.target.closest("button.signup");
  if (btn && !btn.disabled) openModal(btn.dataset.id);
});
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

// Stepper
document.querySelectorAll(".stepper .step").forEach((b) => {
  b.addEventListener("click", () => {
    let v = parseInt(qtyInput.value, 10) || 1;
    v += parseInt(b.dataset.dir, 10);
    v = Math.max(1, Math.min(parseInt(qtyInput.max, 10) || 10, v));
    qtyInput.value = v;
    updateTotal();
  });
});

// ===== Submit -> create order -> auto-post to ECPay =====
document.getElementById("reg-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payBtn = document.getElementById("pay-btn");
  payBtn.disabled = true;
  payBtn.textContent = "處理中…";

  const form = e.target;
  const payload = {
    sessionId: form.sessionId.value,
    qty: parseInt(form.qty.value, 10),
    name: form.name.value.trim(),
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
  };

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "建立訂單失敗");
    const html = await res.text(); // server returns an auto-submitting ECPay form
    document.open();
    document.write(html);
    document.close();
  } catch (err) {
    alert("發生錯誤：" + err.message);
    payBtn.disabled = false;
    payBtn.textContent = "前往付款 →";
  }
});
