const API_URL = window.EM_NON_VIABLE_CONFIG?.API_URL || "";

if (!API_URL) {
  console.warn("EM_NON_VIABLE_CONFIG.API_URL belum diisi — cek file public/config.js");
}

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}?${qs}`);
  if (!res.ok) throw new Error(`Gagal memuat data (HTTP ${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(body) {
  // PENTING: jangan set header "Content-Type: application/json" (lihat
  // catatan yang sama di EM Viable) — supaya tidak kena CORS preflight yang
  // tidak dijawab Apps Script.
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gagal menyimpan data (HTTP ${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export function fetchMaster(facility) {
  return apiGet({ action: "master", facility }).then((d) => d.rooms || []);
}

export function fetchEntries(facility, month) {
  return apiGet({ action: "entries", facility, month }).then((d) => d.entries || []);
}

export function saveEntries(facility, month, entries, token) {
  return apiPost({ action: "saveEntries", facility, month, entries, token });
}

export function fetchReport(facility, month, token) {
  const params = { action: "report", facility, month };
  if (token) params.token = token;
  return apiGet(params);
}

export function saveReport(facility, month, narrative, token) {
  return apiPost({ action: "saveReport", facility, month, narrative, token });
}

export function approveDikaji(facility, month, token) {
  return apiPost({ action: "approveDikaji", facility, month, token });
}

export function approveMengetahui(facility, month, token) {
  return apiPost({ action: "approveMengetahui", facility, month, token });
}

export function fetchStatusIndex(month) {
  return apiGet({ action: "statusIndex", month }).then((d) => d.status || {});
}

export function fetchActivityLog(token, { month, facility } = {}) {
  const params = { action: "activityLog", token };
  if (month) params.month = month;
  if (facility) params.facility = facility;
  return apiGet(params).then((d) => d.logs || []);
}

// --- FORMULIR QA (FM.QA.024) ---
export function fetchFormQA(facility, bulan, namaRuang, token) {
  const params = { action: "formQA", facility, bulan, namaRuang };
  if (token) params.token = token;
  return apiGet(params);
}

export function approveFormQA(facility, bulan, namaRuang, token) {
  return apiPost({ action: "approveFormQA", facility, bulan, namaRuang, token });
}

export function unapproveFormQA(facility, bulan, namaRuang, token) {
  return apiPost({ action: "unapproveFormQA", facility, bulan, namaRuang, token });
}

// --- AUTH ---
export function login(username, password) {
  return apiPost({ action: "login", username, password });
}

export function logout(token) {
  return apiPost({ action: "logout", token }).catch(() => {});
}

export function whoami(token) {
  return apiGet({ action: "whoami", token });
}

export function changePassword(token, oldPassword, newPassword) {
  return apiPost({ action: "changePassword", token, oldPassword, newPassword });
}

// Dipakai khusus halaman publik /verify (scan QR) — tetap bisa diakses tanpa
// login, tapi cuma mengembalikan info tanda tangan.
export function fetchVerify(type, facility, period, namaRuang) {
  const params = type === "formQA"
    ? { action: "verify", type, facility, bulan: period, namaRuang }
    : { action: "verify", type, facility, month: period };
  return apiGet(params);
}
