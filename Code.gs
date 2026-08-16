/**
 * @OnlyCurrentDoc
 */
/**
 * EM NON VIABLE — Google Apps Script backend
 * PT. Rama Emerald Multi Sukses — QA
 *
 * Tempel seluruh isi file ini ke Apps Script (Extensions > Apps Script) yang
 * menempel pada Google Sheet "EM Non Viable - Database".
 *
 * Setelah ditempel: Deploy > Manage deployments > edit (pensil) > pilih
 * "New version" > Deploy. (Deployment pertama: Deploy > New deployment >
 * Web app, Execute as: Me, Who has access: Anyone.) Salin URL yang
 * dihasilkan (diakhiri /exec) untuk dipakai di public/config.js website
 * (domain rencana: emnv.vercel.app).
 *
 * TAB YANG DIBUTUHKAN (sudah ada di spreadsheet Anda):
 *   User_Roles         : Nama | Role | Departemen | Username | PasswordBaru | PasswordHash | Salt
 *   Sessions           : Token | Username | Nama | Role | Departemen | LoginAt | ExpiresAt
 *   Audit_Log          : Waktu | Username | Nama | Role | Departemen | Aksi | Fasilitas | Bulan | Detail
 *   Limit_Persyaratan  : PersyaratanKey | Suhu(SyaratL/U,AlertL/U,ActionL/U) | RH(...) | DPG(...)  (19 kolom)
 *   Report_FormQA      : Bulan | Gedung | Nama Ruang | Kriteria Penerimaan | (+ kolom approval, lihat §REPORT_FORMQA)
 *   Laporan_Narasi     : Fasilitas | Bulan | Pendahuluan | PerParameterJSON | KesimpulanUmum |
 *                        DinilaiNama | DinilaiJabatan | DinilaiTanggal |
 *                        DiperiksaNama | DiperiksaJabatan | DiperiksaTanggal | UpdatedAt
 *   {Facility}         : Nomor Ruangan | Nama Ruangan | Persyaratan Key   (tab master, 1 per fasilitas)
 *   {Facility}_Data    : Bulan | Tanggal | Jam (08:00/13:00) | Nama Ruangan | PersyaratanKey |
 *                        Suhu | RH | DPG | OPR | SPV                      (tab data, 1 per fasilitas)
 *
 * PENTING — Tab Master & merged cells: kolom "Persyaratan Key" di tab master
 * biasanya diisi pakai merged cell (cuma terisi di baris paling atas suatu
 * blok ruangan sejenis, baris-baris di bawahnya kosong). getMaster_() di
 * bawah SENGAJA melakukan forward-fill: baris kosong mewarisi Persyaratan
 * Key dari baris terakhir yang terisi di atasnya. Kalau ada ruangan yang
 * MEMANG tidak match kategori mana pun (bukan lanjutan blok di atasnya),
 * pastikan ada baris "pemisah" atau isi manual supaya tidak ikut ke-inherit
 * kategori yang salah.
 *
 * DEPARTEMEN & PENANGGUNG JAWAB PER FASILITAS (lihat FACILITIES di bawah):
 * Tiap fasilitas dipetakan ke satu Departemen utama (yang mengisi & approve
 * Formulir harian). Sebagian fasilitas (GBJ, GBK, ketiga GBB) juga bisa
 * di-approve oleh Departemen "PPIC" (Manager PPIC), selain oleh SPV/Manager
 * departemen fasilitas itu sendiri.
 *
 * ALUR KERJA & PENGUNCIAN DATA:
 * 1. Formulir harian (FM.QA.024, tab Report_FormQA) diisi oleh Staff/Operator
 *    departemen fasilitas itu sendiri, dan di-APPROVE oleh SPV/Manager
 *    departemen itu (atau Manager PPIC untuk GBJ/GBK/GBB). Cukup SATU tanda
 *    tangan (Kepala Bagian) — TIDAK ada tanda tangan Manager QA di level
 *    formulir harian ini (beda dari form fisik FM.QA.024/R11 yang px punya
 *    2 slot; disederhanakan atas persetujuan user 2026-08).
 * 2. QA (Supervisor/Manager QA) menyusun Pengkajian bulanan (Laporan_Narasi)
 *    PER FASILITAS, dan baru boleh mulai untuk suatu fasilitas+bulan setelah
 *    SEMUA ruangan fasilitas itu yang punya data bulan itu sudah final
 *    di-approve Kepala Bagian di Report_FormQA.
 * 3. Begitu Formulir suatu ruangan+bulan sudah di-approve Kepala Bagian,
 *    data mentah ruangan itu (bulan tsb) TERKUNCI dari edit/hapus untuk
 *    SIAPA PUN kecuali Administrator — kecuali Kepala Bagian yang sama
 *    "membuka kembali" (unapprove) dulu.
 * 4. Begitu Pengkajian EM Non Viable suatu fasilitas+bulan sudah di-approve
 *    FINAL ("Mengetahui" oleh Manager QA), data mentah & Formulir fasilitas
 *    itu bulan itu terkunci total (termasuk dari unapprove) kecuali oleh
 *    Administrator. Narasi Pengkajian sendiri juga ikut terkunci.
 */

// ---------------------------------------------------------------------------
// KONFIGURASI: 13 fasilitas
// ---------------------------------------------------------------------------
const FACILITIES = {
  nbl: { label: "NBL", masterSheet: "NBL", dataSheet: "NBL_Data", department: "Produksi" },
  bl: { label: "BL", masterSheet: "BL", dataSheet: "BL_Data", department: "Produksi" },
  sefaNonSteril: { label: "Sefa Non Steril", masterSheet: "Sefa Non Steril", dataSheet: "Sefa Non Steril_Data", department: "Produksi" },
  sefaSteril: { label: "Sefa Steril", masterSheet: "Sefa Steril", dataSheet: "Sefa Steril_Data", department: "Produksi" },
  qc: { label: "QC", masterSheet: "QC", dataSheet: "QC_Data", department: "QC" },
  rnd: { label: "RND", masterSheet: "RND", dataSheet: "RND_Data", department: "RND" },
  gbbNbl: { label: "GBB NBL", masterSheet: "GBB NBL", dataSheet: "GBB NBL_Data", department: "GBB", altDepartment: "PPIC" },
  gbbBl: { label: "GBB BL", masterSheet: "GBB BL", dataSheet: "GBB BL_Data", department: "GBB", altDepartment: "PPIC" },
  gbbSefa: { label: "GBB SEFA", masterSheet: "GBB SEFA", dataSheet: "GBB SEFA_Data", department: "GBB", altDepartment: "PPIC" },
  gbj: { label: "GBJ", masterSheet: "GBJ", dataSheet: "GBJ_Data", department: "GBJ", altDepartment: "PPIC" },
  gbk: { label: "GBK", masterSheet: "GBK", dataSheet: "GBK_Data", department: "GBK", altDepartment: "PPIC" },
  pkrt: { label: "PKRT", masterSheet: "PKRT", dataSheet: "PKRT_Data", department: "PKRT" },
  alkes: { label: "Alkes", masterSheet: "Alkes", dataSheet: "Alkes_Data", department: "PKRT" },
};

const NARRATIVE_SHEET = "Laporan_Narasi";
const LIMIT_SHEET = "Limit_Persyaratan";
const PARAMS = ["suhu", "rh", "dpg"];

// ---------------------------------------------------------------------------
// KONFIGURASI: AUTH / ROLE / AUDIT  (identik EM Viable)
// ---------------------------------------------------------------------------
const USER_ROLES_SHEET = "User_Roles";
const SESSIONS_SHEET = "Sessions";
const AUDIT_LOG_SHEET = "Audit_Log";
const REPORT_FORMQA_SHEET = "Report_FormQA";
const FORM_QA_NO = "FM.QA.024/R11";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 jam
// Sengaja TIDAK ada role level 0 (Tamu mulai dari 1) — lihat catatan sama di
// EM Viable: menghindari bug `!ROLE_LEVEL[role]` salah anggap role valid
// level-0 sebagai "tidak dikenal". Selalu cek `=== undefined` di kode ini.
const ROLE_LEVEL = { Tamu: 1, Staff: 2, Supervisor: 3, Manager: 4, "Assistant Manager": 4, Administrator: 5 };

// ---------------------------------------------------------------------------
// ENTRY POINTS
// ---------------------------------------------------------------------------
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case "master":
        result = getMaster_(e.parameter.facility);
        break;
      case "entries":
        result = getEntries_(e.parameter.facility, e.parameter.month);
        break;
      case "report":
        result = getReportForViewer_(e.parameter.facility, e.parameter.month, e.parameter.token);
        break;
      case "statusIndex":
        result = getStatusIndex_(e.parameter.month);
        break;
      case "whoami":
        result = whoami_(e.parameter.token);
        break;
      case "activityLog":
        result = getActivityLog_(e.parameter.token, e.parameter.month, e.parameter.facility);
        break;
      case "formQA":
        result = getFormQAForViewer_(e.parameter.facility, e.parameter.bulan, e.parameter.namaRuang, e.parameter.token);
        break;
      case "verify":
        // Halaman /verify (scan QR) tetap publik — cuma info tanda tangan.
        result = e.parameter.type === "formQA"
          ? getVerifySignoffFormQA_(e.parameter.facility, e.parameter.bulan, e.parameter.namaRuang)
          : getVerifySignoffPengkajian_(e.parameter.facility, e.parameter.month);
        break;
      default:
        result = { error: "Aksi tidak dikenal: " + action };
    }
    return jsonOut_(result);
  } catch (err) {
    return jsonOut_({ error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    let result;
    switch (body.action) {
      case "login":
        result = login_(body.username, body.password);
        break;
      case "logout":
        result = logout_(body.token);
        break;
      case "saveEntries":
        result = withAuth_(body.token, function (session) {
          return saveEntriesAuthed_(session, body.facility, body.month, body.entries || []);
        });
        break;
      case "saveReport":
        result = withAuth_(body.token, function (session) {
          return saveReportAuthed_(session, body.facility, body.month, body.narrative || {});
        });
        break;
      case "approveDikaji":
        result = withAuth_(body.token, function (session) {
          return approveDikajiAuthed_(session, body.facility, body.month);
        });
        break;
      case "approveMengetahui":
        result = withAuth_(body.token, function (session) {
          return approveMengetahuiAuthed_(session, body.facility, body.month);
        });
        break;
      case "approveFormQA":
        result = withAuth_(body.token, function (session) {
          return approveFormQAAuthed_(session, body.facility, body.bulan, body.namaRuang);
        });
        break;
      case "unapproveFormQA":
        result = withAuth_(body.token, function (session) {
          return unapproveFormQAAuthed_(session, body.facility, body.bulan, body.namaRuang);
        });
        break;
      case "changePassword":
        result = withAuth_(body.token, function (session) {
          return changePasswordAuthed_(session, body.oldPassword, body.newPassword);
        });
        break;
      default:
        result = { error: "Aksi tidak dikenal: " + body.action };
    }
    return jsonOut_(result);
  } catch (err) {
    return jsonOut_({ error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withAuth_(token, fn) {
  const session = validateSession_(token);
  if (!session) return { error: "Sesi tidak valid atau sudah habis, silakan login ulang." };
  try {
    return fn(session);
  } catch (err) {
    return { error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// AUTH: LOGIN / LOGOUT / SESSION  (identik EM Viable — username/password saja)
// ---------------------------------------------------------------------------
function randomHex_(numBytes) {
  const chars = [];
  for (let i = 0; i < numBytes; i++) chars.push(("0" + Math.floor(Math.random() * 256).toString(16)).slice(-2));
  return chars.join("");
}
function generateSalt_() { return randomHex_(16); }
function generateToken_() { return Utilities.getUuid().replace(/-/g, "") + randomHex_(8); }
function hashPassword_(password, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + "::" + String(salt));
  return digest.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

function getUserRolesSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USER_ROLES_SHEET);
  if (!sheet) throw new Error("Tab '" + USER_ROLES_SHEET + "' tidak ditemukan.");
  return sheet;
}

// Kolom User_Roles: A Nama | B Role | C Departemen | D Username | E PasswordBaru | F PasswordHash | G Salt
function migratePasswords_() {
  const sheet = getUserRolesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const range = sheet.getRange(2, 1, lastRow - 1, 7);
  const values = range.getValues();
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const passwordBaru = values[i][4];
    if (passwordBaru !== "" && passwordBaru !== null && passwordBaru !== undefined) {
      const salt = generateSalt_();
      values[i][5] = hashPassword_(String(passwordBaru), salt);
      values[i][6] = salt;
      values[i][4] = "";
      changed = true;
    }
  }
  if (changed) range.setValues(values);
}

function findUserByUsername_(username) {
  const sheet = getUserRolesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const target = String(username || "").trim().toLowerCase();
  if (!target) return null;
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const uname = String(row[3] || "").trim().toLowerCase();
    if (uname && uname === target) {
      return {
        rowIndex: i + 2,
        nama: row[0], role: String(row[1] || "").trim(), departemen: String(row[2] || "").trim(),
        username: row[3], passwordHash: row[5], salt: row[6],
      };
    }
  }
  return null;
}

function changePasswordAuthed_(session, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) return { error: "Password lama dan password baru wajib diisi." };
  if (String(newPassword).length < 6) return { error: "Password baru minimal 6 karakter." };
  const user = findUserByUsername_(session.username);
  if (!user || !user.passwordHash) return { error: "Akun tidak ditemukan." };
  if (hashPassword_(oldPassword, user.salt) !== user.passwordHash) return { error: "Password lama salah." };
  const newSalt = generateSalt_();
  const newHash = hashPassword_(newPassword, newSalt);
  getUserRolesSheet_().getRange(user.rowIndex, 5, 1, 3).setValues([["", newHash, newSalt]]);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Ganti Password", fasilitas: "", bulan: "", detail: "" });
  return { ok: true };
}

function login_(username, password) {
  if (!username || !password) return { error: "Username dan password wajib diisi." };
  migratePasswords_();
  const user = findUserByUsername_(username);
  if (!user || !user.passwordHash) return { error: "Username atau password salah." };
  if (hashPassword_(password, user.salt) !== user.passwordHash) return { error: "Username atau password salah." };
  if (ROLE_LEVEL[user.role] === undefined) return { error: "Role akun ini belum diatur dengan benar. Hubungi Administrator." };

  const token = generateToken_();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  const sessSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SESSIONS_SHEET);
  if (!sessSheet) return { error: "Tab '" + SESSIONS_SHEET + "' tidak ditemukan." };
  sessSheet.appendRow([token, user.username, user.nama, user.role, user.departemen, now, expiresAt]);
  writeAuditLog_({ username: user.username, nama: user.nama, role: user.role, departemen: user.departemen, aksi: "Login", fasilitas: "", bulan: "", detail: "" });
  return { ok: true, token: token, nama: user.nama, role: user.role, departemen: user.departemen, username: user.username };
}

function logout_(token) {
  if (!token) return { ok: true };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SESSIONS_SHEET);
  if (!sheet) return { ok: true };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true };
  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === String(token)) {
      const row = values[i];
      writeAuditLog_({ username: row[1], nama: row[2], role: row[3], departemen: row[4], aksi: "Logout", fasilitas: "", bulan: "", detail: "" });
      sheet.deleteRow(i + 2);
    }
  }
  return { ok: true };
}

// Sessions: A Token | B Username | C Nama | D Role | E Departemen | F LoginAt | G ExpiresAt
function validateSession_(token) {
  if (!token) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SESSIONS_SHEET);
  if (!sheet) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const now = new Date();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (String(row[0]) === String(token)) {
      const expiresAt = new Date(row[6]);
      if (isNaN(expiresAt.getTime()) || now.getTime() > expiresAt.getTime()) {
        sheet.deleteRow(i + 2);
        return null;
      }
      return { token: row[0], username: row[1], nama: row[2], role: String(row[3] || "").trim(), departemen: String(row[4] || "").trim() };
    }
  }
  return null;
}

function whoami_(token) {
  const session = validateSession_(token);
  if (!session) return { error: "invalid" };
  return { ok: true, nama: session.nama, role: session.role, departemen: session.departemen, username: session.username };
}

// Cek akses generik (role level minimal + departemen persis) — dipakai untuk
// hal yang TIDAK terikat fasilitas tertentu (mis. Pengkajian QA, Riwayat Aktivitas).
function requireRole_(session, minRole, departemen) {
  if (session.role === "Administrator") return true;
  const level = ROLE_LEVEL[session.role] || 0;
  const minLevel = ROLE_LEVEL[minRole] || 99;
  if (level < minLevel) return false;
  if (departemen && session.departemen !== departemen) return false;
  return true;
}

// Cek akses KHUSUS FASILITAS: departemen sesi harus cocok dengan departemen
// utama fasilitas ITU, ATAU departemen alternatifnya (mis. "PPIC" untuk
// GBJ/GBK/GBB) — untuk PPIC, level minimal SELALU Manager berapa pun
// minRole yang diminta (Manager PPIC tidak bisa jadi "Staff" pengganti).
function requireRoleForFacility_(session, minRole, cfg) {
  if (session.role === "Administrator") return true;
  const level = ROLE_LEVEL[session.role] || 0;
  if (session.departemen === cfg.department) {
    return level >= (ROLE_LEVEL[minRole] || 99);
  }
  if (cfg.altDepartment && session.departemen === cfg.altDepartment) {
    return level >= ROLE_LEVEL["Manager"];
  }
  return false;
}

// ---------------------------------------------------------------------------
// AUDIT LOG  (identik EM Viable)
// ---------------------------------------------------------------------------
function writeAuditLog_(entry) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AUDIT_LOG_SHEET);
  if (!sheet) return;
  sheet.appendRow([new Date(), entry.username || "", entry.nama || "", entry.role || "", entry.departemen || "", entry.aksi || "", entry.fasilitas || "", entry.bulan || "", entry.detail || ""]);
}

function getActivityLog_(token, month, facilityLabel) {
  const session = validateSession_(token);
  if (!session) return { error: "Sesi tidak valid atau sudah habis, silakan login ulang." };
  if (!requireRole_(session, "Supervisor")) return { error: "Hanya Supervisor/Manager yang boleh melihat Riwayat Aktivitas." };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AUDIT_LOG_SHEET);
  if (!sheet) return { logs: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { logs: [] };
  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  let logs = values.map(function (row) {
    return { waktu: row[0] instanceof Date ? row[0].toISOString() : String(row[0]), username: row[1], nama: row[2], role: row[3], departemen: row[4], aksi: row[5], fasilitas: row[6], bulan: row[7], detail: row[8] };
  });
  if (month) logs = logs.filter(function (l) { return l.bulan === month; });
  if (facilityLabel) logs = logs.filter(function (l) { return l.fasilitas === facilityLabel; });
  logs.sort(function (a, b) { return new Date(b.waktu) - new Date(a.waktu); });
  return { logs: logs.slice(0, 300) };
}

// ---------------------------------------------------------------------------
// LIMIT_PERSYARATAN  — lookup dua sisi (Syarat/Alert/Action, Lower/Upper)
// ---------------------------------------------------------------------------
// Kolom (1-indexed setelah header): 1 PersyaratanKey,
// 2-7 Suhu(SyaratL,SyaratU,AlertL,AlertU,ActionL,ActionU),
// 8-13 RH(...), 14-19 DPG(...)
function normalizeKey_(key) {
  return String(key || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function loadLimitMap_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LIMIT_SHEET);
  if (!sheet) throw new Error("Tab '" + LIMIT_SHEET + "' tidak ditemukan.");
  const lastRow = sheet.getLastRow();
  const map = {};
  if (lastRow < 2) return map;
  const values = sheet.getRange(2, 1, lastRow - 1, 19).getValues();
  values.forEach(function (row) {
    const key = row[0];
    if (!key) return;
    const nk = normalizeKey_(key);
    const toNum = function (v) { return v === "" || v === null || v === undefined ? null : Number(v); };
    map[nk] = {
      suhu: { syaratL: toNum(row[1]), syaratU: toNum(row[2]), alertL: toNum(row[3]), alertU: toNum(row[4]), actionL: toNum(row[5]), actionU: toNum(row[6]) },
      rh: { syaratL: toNum(row[7]), syaratU: toNum(row[8]), alertL: toNum(row[9]), alertU: toNum(row[10]), actionL: toNum(row[11]), actionU: toNum(row[12]) },
      dpg: { syaratL: toNum(row[13]), syaratU: toNum(row[14]), alertL: toNum(row[15]), alertU: toNum(row[16]), actionL: toNum(row[17]), actionU: toNum(row[18]) },
    };
  });
  return map;
}

function getLimitFor_(limitMap, persyaratanKey, parameter) {
  const nk = normalizeKey_(persyaratanKey);
  const row = limitMap[nk];
  if (!row) return null;
  return row[parameter] || null;
}

function inRange_(v, lower, upper) {
  if (lower !== null && v < lower) return false;
  if (upper !== null && v > upper) return false;
  return true;
}

// Level: null = parameter ini tidak dipersyaratkan untuk ruangan ini (NA di
// Limit_Persyaratan). 0 = dipersyaratkan tapi belum ada data. 1 = Baik
// (dalam Alert). 2 = di luar Alert, masih dalam Action. 3 = di luar Action,
// masih dalam Syarat. 4 = di luar Syarat (deviasi).
function levelForTwoSided_(rawValue, limit) {
  if (!limit) return null;
  const allNull = [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU].every(function (x) { return x === null; });
  if (allNull) return null;
  if (rawValue === null || rawValue === undefined || rawValue === "") return 0;
  const v = Number(rawValue);
  if (isNaN(v)) return 0;
  if (inRange_(v, limit.alertL, limit.alertU)) return 1;
  if (inRange_(v, limit.actionL, limit.actionU)) return 2;
  if (inRange_(v, limit.syaratL, limit.syaratU)) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// MASTER ROOM LIST  (tab "{Facility}": Nomor Ruangan | Nama Ruangan | Persyaratan Key)
// Forward-fill Persyaratan Key untuk baris yang kosong (lanjutan merged cell).
// ---------------------------------------------------------------------------
function getMaster_(facilityKey) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.masterSheet);
  if (!sheet) return { error: "Tab master tidak ditemukan: " + cfg.masterSheet };

  const values = sheet.getDataRange().getValues();
  const rooms = [];
  let lastKey = "";
  for (let i = 1; i < values.length; i++) { // baris 1 = header
    const row = values[i];
    const code = row[0];
    const name = row[1];
    let persyaratanKey = row[2];
    if (!code && !name) continue;
    if (persyaratanKey) {
      lastKey = String(persyaratanKey).trim();
    } else {
      persyaratanKey = lastKey;
    }
    if (!persyaratanKey) continue; // tidak ada kategori sama sekali -> dikecualikan
    rooms.push({ code: String(code || "").trim(), name: String(name || "").trim(), persyaratanKey: persyaratanKey });
  }
  return { facility: facilityKey, rooms: rooms };
}

// ---------------------------------------------------------------------------
// MONTHLY ENTRIES  (tab "{Facility}_Data": Bulan | Tanggal | Jam | Nama Ruangan
// | PersyaratanKey | Suhu | RH | DPG | OPR | SPV)
// ---------------------------------------------------------------------------
function getEntries_(facilityKey, month) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.dataSheet);
  if (!sheet) return { error: "Tab data tidak ditemukan: " + cfg.dataSheet };

  const limitMap = loadLimitMap_();
  const values = sheet.getDataRange().getValues();
  const entries = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const bulan = formatMonth_(row[0]);
    if (bulan !== month) continue;
    const persyaratanKey = row[4];
    const suhu = emptyToNull_(row[5]);
    const rh = emptyToNull_(row[6]);
    const dpg = emptyToNull_(row[7]);
    entries.push({
      id: "row-" + i,
      tanggal: formatDate_(row[1]),
      jam: row[2],
      roomName: row[3],
      persyaratanKey: persyaratanKey,
      suhu: suhu, rh: rh, dpg: dpg,
      opr: row[8] || "", spv: row[9] || "",
      level: {
        suhu: levelForTwoSided_(suhu, getLimitFor_(limitMap, persyaratanKey, "suhu")),
        rh: levelForTwoSided_(rh, getLimitFor_(limitMap, persyaratanKey, "rh")),
        dpg: levelForTwoSided_(dpg, getLimitFor_(limitMap, persyaratanKey, "dpg")),
      },
    });
  }
  return { facility: facilityKey, month: month, entries: entries };
}

function saveEntries_(facilityKey, month, entries) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.dataSheet);
  if (!sheet) return { error: "Tab data tidak ditemukan: " + cfg.dataSheet };

  const values = sheet.getDataRange().getValues();
  const kept = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (formatMonth_(row[0]) !== month) kept.push(row);
  }
  const newRows = entries.map((e) => [
    month, e.tanggal || "", e.jam || "", e.roomName || "", e.persyaratanKey || "",
    e.suhu === null || e.suhu === undefined ? "" : e.suhu,
    e.rh === null || e.rh === undefined ? "" : e.rh,
    e.dpg === null || e.dpg === undefined ? "" : e.dpg,
    e.opr || "", e.spv || "",
  ]);
  const finalRows = kept.concat(newRows);
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 10).clearContent();
  if (finalRows.length > 0) sheet.getRange(2, 1, finalRows.length, 10).setValues(finalRows);
  return { ok: true, saved: newRows.length };
}

function saveEntriesAuthed_(session, facilityKey, month, entries) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Staff", cfg)) {
    return { error: "Hanya Staff/Operator, Supervisor, atau Manager departemen " + cfg.department + " (atau PPIC untuk fasilitas gudang terkait) yang boleh mengisi data pengujian fasilitas ini." };
  }

  const before = getEntries_(facilityKey, month).entries || [];
  const submittedIds = {};
  entries.forEach(function (e) { submittedIds[e.id] = true; });
  const deletedRows = before.filter(function (e) { return !submittedIds[e.id]; });
  const canDelete = requireRoleForFacility_(session, "Supervisor", cfg);
  if (deletedRows.length > 0 && !canDelete) {
    return { error: "Staff tidak bisa menghapus data yang sudah tersimpan. Hubungi Supervisor/Manager." };
  }

  if (session.role !== "Administrator") {
    // Kunci total kalau Pengkajian fasilitas+bulan ini sudah final.
    if (isPengkajianFinalApproved_(facilityKey, month)) {
      return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah di-approve final oleh Manager QA — data mentah terkunci. Hubungi Administrator kalau perlu perubahan." };
    }
    // Kunci per-ruangan: kalau Formulir ruangan itu bulan ini sudah di-approve
    // Kepala Bagian, tidak bisa lagi diubah/dihapus siapa pun kecuali Admin
    // (harus di-"unapprove" dulu oleh Kepala Bagian).
    const roomsTouched = Array.from(new Set(entries.concat(before).map(function (e) { return e.roomName; }).filter(Boolean)));
    for (let i = 0; i < roomsTouched.length; i++) {
      if (isFormQAApproved_(cfg.label, month, roomsTouched[i])) {
        return { error: "Formulir ruangan '" + roomsTouched[i] + "' bulan ini sudah di-approve Kepala Bagian — data terkunci. Minta Kepala Bagian buka kembali (unapprove) dulu kalau perlu koreksi." };
      }
    }
  }

  const result = saveEntries_(facilityKey, month, entries);
  writeAuditLog_({
    username: session.username, nama: session.nama, role: session.role, departemen: session.departemen,
    aksi: deletedRows.length > 0 ? "Hapus/Ubah Data" : "Simpan Data", fasilitas: cfg.label, bulan: month,
    detail: entries.length + " baris tersimpan" + (deletedRows.length > 0 ? ", " + deletedRows.length + " baris dihapus" : ""),
  });
  return result;
}

// ---------------------------------------------------------------------------
// REPORT_FORMQA  (digitalisasi FM.QA.024 — per Fasilitas + Bulan + Nama Ruang)
// Kolom: A Bulan | B Gedung | C Nama Ruang | D Kriteria Penerimaan |
//        E KepalaBagianNama | F KepalaBagianUsername | G KepalaBagianTanggal | H UpdatedAt
// CATATAN: kalau header E-H belum ada di sheet Anda, tambahkan judul kolom
// itu secara manual di baris 1 (Apps Script tetap bisa menulis datanya
// walau header belum ada, tapi enak dibaca kalau headernya lengkap).
// ---------------------------------------------------------------------------
function getFormQASheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORT_FORMQA_SHEET);
  if (!sheet) throw new Error("Tab '" + REPORT_FORMQA_SHEET + "' tidak ditemukan.");
  return sheet;
}

function findFormQARow_(facilityLabel, bulan, namaRuang) {
  const sheet = getFormQASheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, rowIndex: -1, row: null };
  const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][1] === facilityLabel && formatMonth_(values[i][0]) === bulan && String(values[i][2] || "").trim() === String(namaRuang || "").trim()) {
      return { sheet: sheet, rowIndex: i + 2, row: values[i] };
    }
  }
  return { sheet: sheet, rowIndex: -1, row: null };
}

function getFormQA_(facilityKey, bulan, namaRuang) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const found = findFormQARow_(cfg.label, bulan, namaRuang);
  if (found.rowIndex === -1) return { found: false, formNo: FORM_QA_NO };
  const row = found.row;
  return {
    found: true, formNo: FORM_QA_NO, kriteriaPenerimaan: row[3] || "",
    kepalaBagian: { nama: row[4] || "", username: row[5] || "", tanggal: formatDate_(row[6]) },
    updatedAt: row[7],
  };
}

function isFormQAApproved_(facilityLabel, bulan, namaRuang) {
  const found = findFormQARow_(facilityLabel, bulan, namaRuang);
  return !!(found.rowIndex !== -1 && found.row[4]); // kolom E KepalaBagianNama
}

function upsertFormQARow_(cfg, bulan, namaRuang, kriteriaPenerimaan, kepalaBagian) {
  const found = findFormQARow_(cfg.label, bulan, namaRuang);
  const now = new Date();
  const rowValues = [
    bulan, cfg.label, namaRuang,
    kriteriaPenerimaan !== undefined ? kriteriaPenerimaan : (found.row ? found.row[3] : ""),
    kepalaBagian ? kepalaBagian.nama : (found.row ? found.row[4] : ""),
    kepalaBagian ? kepalaBagian.username : (found.row ? found.row[5] : ""),
    kepalaBagian ? kepalaBagian.tanggal : (found.row ? found.row[6] : ""),
    now,
  ];
  if (found.rowIndex === -1) {
    found.sheet.appendRow(rowValues);
  } else {
    found.sheet.getRange(found.rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  }
}

function approveFormQAAuthed_(session, facilityKey, bulan, namaRuang) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " (atau Manager PPIC untuk fasilitas gudang terkait) yang boleh approve Formulir ini." };
  }
  if (session.role !== "Administrator" && isPengkajianFinalApproved_(facilityKey, bulan)) {
    return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah final — Formulir terkunci." };
  }
  upsertFormQARow_(cfg, bulan, namaRuang, undefined, { nama: session.nama, username: session.username, tanggal: formatDate_(new Date()) });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Formulir QA", fasilitas: cfg.label, bulan: bulan, detail: "Ruang: " + namaRuang });
  return getFormQA_(facilityKey, bulan, namaRuang);
}

function unapproveFormQAAuthed_(session, facilityKey, bulan, namaRuang) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " yang boleh membuka kembali (unapprove) Formulir ini." };
  }
  if (session.role !== "Administrator" && isPengkajianFinalApproved_(facilityKey, bulan)) {
    return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah final — Formulir tidak bisa dibuka kembali. Hubungi Administrator." };
  }
  upsertFormQARow_(cfg, bulan, namaRuang, undefined, { nama: "", username: "", tanggal: "" });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Unapprove Formulir QA", fasilitas: cfg.label, bulan: bulan, detail: "Ruang: " + namaRuang });
  return getFormQA_(facilityKey, bulan, namaRuang);
}

// Hanya akun departemen fasilitas itu (atau PPIC/QA/Administrator) yang
// login yang boleh melihat Formulir — publik & Tamu tidak bisa.
function getFormQAForViewer_(facilityKey, bulan, namaRuang, token) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const session = token ? validateSession_(token) : null;
  const canView = session && (session.role === "Administrator" || session.departemen === cfg.department || session.departemen === cfg.altDepartment || session.departemen === "QA");
  if (!canView) return { error: "Formulir QA hanya bisa dilihat oleh akun departemen terkait atau QA yang sudah login." };
  return getFormQA_(facilityKey, bulan, namaRuang);
}

function getVerifySignoffFormQA_(facilityKey, bulan, namaRuang) {
  const full = getFormQA_(facilityKey, bulan, namaRuang);
  if (full.error) return full;
  if (!full.found) return { found: false };
  return { found: true, kepalaBagian: full.kepalaBagian, updatedAt: full.updatedAt };
}

// Formulir suatu fasilitas+bulan dianggap "selesai" kalau SETIAP ruangan yang
// punya data pengujian bulan itu sudah punya baris Report_FormQA yang
// KepalaBagian-nya terisi. Kalau belum ada data sama sekali, dianggap
// belum selesai.
function isFormulirFacilityCompleteForMonth_(facilityKey, month) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return false;
  const entriesRes = getEntries_(facilityKey, month);
  const rooms = Array.from(new Set((entriesRes.entries || []).map(function (e) { return e.roomName; }).filter(Boolean)));
  if (rooms.length === 0) return false;
  return rooms.every(function (r) { return isFormQAApproved_(cfg.label, month, r); });
}

// ---------------------------------------------------------------------------
// PENGKAJIAN EM NON VIABLE  (tab "Laporan_Narasi") — disusun & di-approve QA
// saja, per Fasilitas + Bulan. Kolom (12): Fasilitas | Bulan | Pendahuluan |
// PerParameterJSON | KesimpulanUmum | DinilaiNama | DinilaiJabatan |
// DinilaiTanggal | DiperiksaNama | DiperiksaJabatan | DiperiksaTanggal | UpdatedAt
// ---------------------------------------------------------------------------
function getReport_(facilityKey, month) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NARRATIVE_SHEET);
  if (!sheet) return { error: "Tab tidak ditemukan: " + NARRATIVE_SHEET };
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[0] === cfg.label && formatMonth_(row[1]) === month) {
      return {
        found: true,
        narrative: { pendahuluan: row[2], perParameter: safeParseJSON_(row[3]) || {}, kesimpulanUmum: row[4] },
        signoff: {
          dinilai: { nama: row[5], jabatan: row[6], tanggal: formatDate_(row[7]) },
          diperiksa: { nama: row[8], jabatan: row[9], tanggal: formatDate_(row[10]) },
        },
        updatedAt: row[11],
      };
    }
  }
  return { found: false };
}

function getReportForViewer_(facilityKey, month, token) {
  const full = getReport_(facilityKey, month);
  if (full.error) return full;
  const session = token ? validateSession_(token) : null;
  if (session) return full;
  return { found: full.found, updatedAt: full.updatedAt, restricted: true };
}

function getVerifySignoffPengkajian_(facilityKey, month) {
  const full = getReport_(facilityKey, month);
  if (full.error) return full;
  if (!full.found) return { found: false };
  return { found: true, signoff: full.signoff, updatedAt: full.updatedAt };
}

function isPengkajianFinalApproved_(facilityKey, month) {
  const rep = getReport_(facilityKey, month);
  return !!(rep.found && rep.signoff && rep.signoff.diperiksa && rep.signoff.diperiksa.nama);
}

function emptySignoffServer_() {
  return { dinilai: { nama: "", jabatan: "", tanggal: "" }, diperiksa: { nama: "", jabatan: "", tanggal: "" } };
}

function saveReport_(facilityKey, month, narrative, signoff) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NARRATIVE_SHEET);
  if (!sheet) return { error: "Tab tidak ditemukan: " + NARRATIVE_SHEET };
  const values = sheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === cfg.label && formatMonth_(values[i][1]) === month) { targetRow = i + 1; break; }
  }
  const dinilai = signoff.dinilai || {};
  const diperiksa = signoff.diperiksa || {};
  const rowValues = [
    cfg.label, month, narrative.pendahuluan || "", JSON.stringify(narrative.perParameter || {}), narrative.kesimpulanUmum || "",
    dinilai.nama || "", dinilai.jabatan || "", dinilai.tanggal || "",
    diperiksa.nama || "", diperiksa.jabatan || "", diperiksa.tanggal || "", new Date(),
  ];
  if (targetRow === -1) sheet.appendRow(rowValues);
  else sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  return { ok: true };
}

function saveReportAuthed_(session, facilityKey, month, narrative) {
  if (!requireRole_(session, "Supervisor", "QA")) return { error: "Hanya Supervisor/Manager QA yang boleh menyusun Pengkajian EM Non Viable." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const existing = getReport_(facilityKey, month);
  if (session.role !== "Administrator") {
    if (existing.found && existing.signoff && existing.signoff.diperiksa && existing.signoff.diperiksa.nama) {
      return { error: "Pengkajian fasilitas ini bulan ini sudah di-approve final (Mengetahui) oleh Manager QA — narasi terkunci." };
    }
    if (!existing.found && !isFormulirFacilityCompleteForMonth_(facilityKey, month)) {
      return { error: "Formulir QA (FM.QA.024) fasilitas ini bulan ini belum lengkap/final di-approve Kepala Bagian. Pengkajian baru bisa dibuat setelah semua Formulir ruangan selesai." };
    }
  }
  const signoff = (existing && existing.signoff) || emptySignoffServer_();
  const result = saveReport_(facilityKey, month, narrative, signoff);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Susun Pengkajian EM Non Viable", fasilitas: cfg.label, bulan: month, detail: "" });
  return result;
}

function approveDikajiAuthed_(session, facilityKey, month) {
  if (!requireRole_(session, "Supervisor", "QA")) return { error: "Hanya Supervisor/Manager QA yang boleh menyetujui 'Dikaji Oleh'." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const existing = getReport_(facilityKey, month);
  if (!existing.found) return { error: "Belum ada draf Pengkajian untuk fasilitas & bulan ini." };
  const signoff = existing.signoff || emptySignoffServer_();
  signoff.dinilai = { nama: session.nama, jabatan: session.role + " QA", tanggal: formatDate_(new Date()) };
  const result = saveReport_(facilityKey, month, existing.narrative, signoff);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Dikaji Oleh", fasilitas: cfg.label, bulan: month, detail: "" });
  return result;
}

function approveMengetahuiAuthed_(session, facilityKey, month) {
  if (!requireRole_(session, "Manager", "QA")) return { error: "Hanya Manager QA (atau yang mewakili) yang boleh menyetujui final 'Mengetahui'." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const existing = getReport_(facilityKey, month);
  if (!existing.found) return { error: "Belum ada draf Pengkajian untuk fasilitas & bulan ini." };
  if (!existing.signoff || !existing.signoff.dinilai || !existing.signoff.dinilai.nama) {
    return { error: "Pengkajian ini belum di-approve 'Dikaji Oleh', tidak bisa langsung final." };
  }
  const signoff = existing.signoff;
  signoff.diperiksa = { nama: session.nama, jabatan: "Manager QA", tanggal: formatDate_(new Date()) };
  const result = saveReport_(facilityKey, month, existing.narrative, signoff);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Final (Mengetahui)", fasilitas: cfg.label, bulan: month, detail: "" });
  return result;
}

// ---------------------------------------------------------------------------
// STATUS INDEX  (dashboard rekap 13 fasilitas) — level tertinggi di antara
// Suhu/RH/DPG dari seluruh entri bulan itu, per fasilitas.
// ---------------------------------------------------------------------------
function getStatusIndex_(month) {
  const out = {};
  Object.keys(FACILITIES).forEach((key) => {
    const res = getEntries_(key, month);
    const entries = res.entries || [];
    let maxLevel = 0;
    entries.forEach((e) => {
      PARAMS.forEach((p) => {
        const lvl = e.level[p];
        if (lvl !== null && lvl > maxLevel) maxLevel = lvl;
      });
    });
    out[key] = { level: maxLevel, hasData: entries.length > 0 };
  });
  return { month: month, status: out };
}

// ---------------------------------------------------------------------------
// UTIL  (identik EM Viable)
// ---------------------------------------------------------------------------
function formatMonth_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM");
  return String(value || "").trim();
}
function formatDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(value || "").trim();
}
function emptyToNull_(value) {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}
function safeParseJSON_(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}
