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

export function fetchReport(facility, month, token, roomName) {
  const params = { action: "report", facility, month };
  if (token) params.token = token;
  if (roomName) params.roomName = roomName;
  return apiGet(params);
}

export function saveReport(facility, month, narrative, token, roomName) {
  return apiPost({ action: "saveReport", facility, month, narrative, token, roomName });
}

export function approveDikaji(facility, month, token, roomName) {
  return apiPost({ action: "approveDikaji", facility, month, token, roomName });
}

export function approveMengetahui(facility, month, token, roomName) {
  return apiPost({ action: "approveMengetahui", facility, month, token, roomName });
}

// --- FORMULIR BULANAN (FM.QA.024/R11, cetak per ruangan, approval Kepala Bagian -> Manager QA) ---
export function fetchFormulirBulanan(facility, bulan, roomName, token) {
  return apiGet({ action: "formulirBulanan", facility, bulan, roomName, token });
}

// Ringkasan approval formulir untuk SATU fasilitas + bulan (berapa ruangan
// sudah/belum di-ACC Kepala Bagian & Manager QA).
export function fetchFormulirStatus(facility, bulan, token) {
  return apiGet({ action: "formulirStatus", facility, bulan, token });
}

export function approveKepalaBagian(facility, bulan, roomName, token) {
  return apiPost({ action: "approveKepalaBagian", facility, bulan, roomName, token });
}

// ACC massal seluruh ruangan yang belum disetujui Kepala Bagian.
export function approveKepalaBagianAll(facility, bulan, token) {
  return apiPost({ action: "approveKepalaBagianAll", facility, bulan, token });
}

export function unapproveKepalaBagian(facility, bulan, roomName, token) {
  return apiPost({ action: "unapproveKepalaBagian", facility, bulan, roomName, token });
}

export function approveManagerQAFormulir(facility, bulan, token) {
  return apiPost({ action: "approveManagerQAFormulir", facility, bulan, token });
}

export function unapproveManagerQAFormulir(facility, bulan, token) {
  return apiPost({ action: "unapproveManagerQAFormulir", facility, bulan, token });
}

export function fetchStatusIndex(month) {
  return apiGet({ action: "statusIndex", month }).then((d) => d.status || {});
}

// Dipakai untuk tampilan layar — mengembalikan objek lengkap (logs, total,
// truncated, canExport) supaya halaman tahu apakah datanya dipotong.
export function fetchActivityLog(token, { month, facility, limit } = {}) {
  const params = { action: "activityLog", token };
  if (month) params.month = month;
  if (facility) params.facility = facility;
  if (limit) params.limit = limit;
  return apiGet(params);
}

// Menarik SELURUH audit trail (sesuai filter) untuk diunduh. Hanya berhasil
// bagi QA & Administrator; selain itu server tetap memotong di batas tampilan.
export function exportActivityLog(token, { month, facility } = {}) {
  return fetchActivityLog(token, { month, facility, limit: 20000 });
}

// --- APPROVAL HARIAN (per Fasilitas + Tanggal) ---
export function fetchDayStatus(facility, tanggal, token) {
  return apiGet({ action: "dayStatus", facility, tanggal, token });
}

export function fetchOpenInputDates(facility, token) {
  return apiGet({ action: "openInputDates", facility, token });
}

export function approveDay(facility, tanggal, token) {
  return apiPost({ action: "approveDay", facility, tanggal, token });
}

export function approveOpr(facility, tanggal, roomName, token) {
  return apiPost({ action: "approveOpr", facility, tanggal, roomName, token });
}

export function approveSpv(facility, tanggal, roomName, token) {
  return apiPost({ action: "approveSpv", facility, tanggal, roomName, token });
}

export function unapproveDay(facility, tanggal, token) {
  return apiPost({ action: "unapproveDay", facility, tanggal, token });
}

export function openBackfill(facility, tanggal, alasan, token) {
  return apiPost({ action: "openBackfill", facility, tanggal, alasan, token });
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
export function fetchVerify(type, facility, period, roomName, jam) {
  let params;
  if (type === "pengkajian") params = { action: "verify", type, facility, month: period, roomName };
  else if (type === "formulir") params = { action: "verify", type, facility, bulan: period, roomName };
  else {
    // Untuk harian, roomName & jam ikut dikirim supaya server bisa
    // mengembalikan nama penanda tangan OPR/SPV yang sebenarnya.
    params = { action: "verify", type: "harian", facility, tanggal: period };
    if (roomName) params.roomName = roomName;
    if (jam) params.jam = jam;
  }
  return apiGet(params);
}

// --- NARASI AI (Gemini, lewat serverless function Vercel — bukan Apps Script) ---
export async function generateNarrative({ facilityLabel, monthLabel, stats, prevSummary }) {
  const res = await fetch("/api/generate-narrative", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facilityLabel, monthLabel, stats, prevSummary }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Gagal generate narasi (HTTP ${res.status})`);
  return data;
}
