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
 * TAB YANG DIBUTUHKAN (sudah ada di spreadsheet Anda, DITAMBAH 2 tab baru):
 *   User_Roles         : Nama | Role | Departemen | Username | PasswordBaru | PasswordHash | Salt
 *   Sessions           : Token | Username | Nama | Role | Departemen | LoginAt | ExpiresAt
 *   Audit_Log          : Waktu | Username | Nama | Role | Departemen | Aksi | Fasilitas | Bulan | Detail
 *   Limit_Persyaratan  : PersyaratanKey | Suhu(SyaratL/U,AlertL/U,ActionL/U) | RH(...) | DPG(...)  (19 kolom)
 *   Approval_Harian    : Bulan | Tanggal | Fasilitas |
 *                        ApprovedNama | ApprovedUsername | ApprovedAt |
 *                        BackfillReason | BackfillByNama | BackfillByUsername | BackfillAt | UpdatedAt
 *   Formulir_Bulanan   : *** TAB BARU, buat manual dulu *** — Bulan | Fasilitas | NamaRuang |
 *                        KepalaBagianNama | KepalaBagianUsername | KepalaBagianTanggal |
 *                        ManagerQANama | ManagerQAUsername | ManagerQATanggal | UpdatedAt
 *                        (approval 2 tingkat untuk cetak FM.QA.024/R11 per ruangan — lihat
 *                        §FORMULIR BULANAN di bawah)
 *   Laporan_Narasi     : Fasilitas | Bulan | Pendahuluan | PerParameterJSON | KesimpulanUmum |
 *                        DinilaiNama | DinilaiJabatan | DinilaiTanggal |
 *                        DiperiksaNama | DiperiksaJabatan | DiperiksaTanggal | UpdatedAt | NamaRuang
 *                        *** TAMBAHKAN KOLOM M "NamaRuang" kalau belum ada *** — kosong berarti
 *                        Pengkajian FASILITAS (semua ruangan, seperti sebelumnya); diisi nama
 *                        ruangan berarti Pengkajian RUANGAN (opsional, lihat §FORMULIR BULANAN)
 *   {Facility}         : Nomor Ruangan | Nama Ruangan | Persyaratan Key   (tab master, 1 per fasilitas)
 *   {Facility}_Data    : Bulan | Tanggal | Jam (08:00/13:00) | Nama Ruangan | PersyaratanKey |
 *                        Suhu | RH | DPG | OPR | SPV                      (tab data, 1 per fasilitas)
 *
 * (Tab lama "Report_FormQA" — approve per ruangan per bulan — TIDAK dipakai lagi
 * di versi ini, digantikan "Approval_Harian" di bawah. Boleh dibiarkan saja di
 * spreadsheet, tidak akan diganggu kode ini.)
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
 * data harian). Sebagian fasilitas (GBJ, GBK, ketiga GBB) juga bisa
 * di-approve oleh Departemen "PPIC" (Manager PPIC), selain oleh SPV/Manager
 * departemen fasilitas itu sendiri.
 *
 * ALUR KERJA & PENGUNCIAN DATA (approval HARIAN, bukan per ruangan/bulan):
 * 1. Operator/Staff HANYA bisa input data untuk tanggal HARI INI (server-side
 *    enforced), boleh banyak ruangan sekaligus dalam satu hari itu. Kolom OPR
 *    diisi OTOMATIS dari nama akun yang login — tidak diketik manual.
 * 2. SPV/Manager departemen fasilitas itu (atau Manager PPIC untuk fasilitas
 *    gudang terkait) meng-approve SEMUA entri hari itu sekaligus (1 aksi =
 *    1 tanggal, seluruh ruangan). Kolom SPV di SEMUA baris tanggal itu otomatis
 *    terisi nama SPV yang approve. Begitu di-approve, tanggal itu (fasilitas
 *    itu) TERKUNCI dari edit/hapus untuk siapa pun kecuali Administrator,
 *    kecuali SPV yang sama membuka kembali (unapprove).
 * 3. QR verifikasi otomatis "muncul" (bisa dihasilkan) begitu suatu tanggal
 *    sudah ke-ACC — link ke halaman /verify yang membaca live dari sistem.
 * 4. BACKFILL (lupa isi hari sebelumnya): operator TIDAK bisa langsung isi
 *    tanggal yang sudah lewat. SPV/Manager harus "buka akses" dulu untuk
 *    tanggal itu (dengan alasan tertulis, dicatat di Audit_Log) — baru
 *    operator bisa mengisi tanggal tsb, sampai SPV meng-approve-nya (yang
 *    otomatis menutup lagi jendela backfill itu).
 * 5. QA (Supervisor/Manager QA) menyusun Pengkajian bulanan (Laporan_Narasi)
 *    PER FASILITAS, dan baru boleh MULAI untuk suatu fasilitas+bulan setelah
 *    SEMUA tanggal yang punya data bulan itu sudah di-approve SPV/Manager.
 * 6. Begitu Pengkajian suatu fasilitas+bulan sudah di-approve FINAL
 *    ("Mengetahui" oleh Manager QA), seluruh data & approval harian fasilitas
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
const SESI_SERVER = ["08:00", "13:00"];

// ---------------------------------------------------------------------------
// KONFIGURASI: AUTH / ROLE / AUDIT  (identik EM Viable)
// ---------------------------------------------------------------------------
const USER_ROLES_SHEET = "User_Roles";
const SESSIONS_SHEET = "Sessions";
const AUDIT_LOG_SHEET = "Audit_Log";
const APPROVAL_HARIAN_SHEET = "Approval_Harian";
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
        result = getReportForViewer_(e.parameter.facility, e.parameter.month, e.parameter.token, e.parameter.roomName);
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
      case "dayStatus":
        result = getDayStatusForViewer_(e.parameter.facility, e.parameter.tanggal, e.parameter.token);
        break;
      case "openInputDates":
        result = getOpenInputDates_(e.parameter.facility, e.parameter.token);
        break;
      case "formulirBulanan":
        result = getFormulirBulananForViewer_(e.parameter.facility, e.parameter.bulan, e.parameter.roomName, e.parameter.token);
        break;
      case "verify":
        // Halaman /verify (scan QR) tetap publik — cuma info tanda tangan.
        if (e.parameter.type === "pengkajian") {
          result = getVerifySignoffPengkajian_(e.parameter.facility, e.parameter.month, e.parameter.roomName);
        } else if (e.parameter.type === "formulir") {
          result = getVerifySignoffFormulir_(e.parameter.facility, e.parameter.bulan, e.parameter.roomName);
        } else {
          result = getVerifySignoffHarian_(e.parameter.facility, e.parameter.tanggal);
        }
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
          return saveReportAuthed_(session, body.facility, body.month, body.narrative || {}, body.roomName);
        });
        break;
      case "approveDikaji":
        result = withAuth_(body.token, function (session) {
          return approveDikajiAuthed_(session, body.facility, body.month, body.roomName);
        });
        break;
      case "approveMengetahui":
        result = withAuth_(body.token, function (session) {
          return approveMengetahuiAuthed_(session, body.facility, body.month, body.roomName);
        });
        break;
      case "approveKepalaBagian":
        result = withAuth_(body.token, function (session) {
          return approveKepalaBagianAuthed_(session, body.facility, body.bulan, body.roomName);
        });
        break;
      case "unapproveKepalaBagian":
        result = withAuth_(body.token, function (session) {
          return unapproveKepalaBagianAuthed_(session, body.facility, body.bulan, body.roomName);
        });
        break;
      case "approveManagerQAFormulir":
        result = withAuth_(body.token, function (session) {
          return approveManagerQAFormulirAuthed_(session, body.facility, body.bulan);
        });
        break;
      case "unapproveManagerQAFormulir":
        result = withAuth_(body.token, function (session) {
          return unapproveManagerQAFormulirAuthed_(session, body.facility, body.bulan);
        });
        break;
      case "approveDay":
        result = withAuth_(body.token, function (session) {
          return approveDayAuthed_(session, body.facility, body.tanggal);
        });
        break;
      case "unapproveDay":
        result = withAuth_(body.token, function (session) {
          return unapproveDayAuthed_(session, body.facility, body.tanggal);
        });
        break;
      case "approveOpr":
        result = withAuth_(body.token, function (session) {
          return approveOprAuthed_(session, body.facility, body.tanggal, body.roomName);
        });
        break;
      case "approveSpv":
        result = withAuth_(body.token, function (session) {
          return approveSpvAuthed_(session, body.facility, body.tanggal, body.roomName);
        });
        break;
      case "openBackfill":
        result = withAuth_(body.token, function (session) {
          return openBackfillAuthed_(session, body.facility, body.tanggal, body.alasan);
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

// Parameter dianggap "wajib diisi" untuk suatu ruangan kalau Limit_Persyaratan
// punya minimal satu batas (Syarat/Alert/Action) terisi untuk parameter itu.
// Kalau semuanya NA/kosong, parameter itu tidak dipersyaratkan sama sekali.
function isParamRequired_(limit) {
  if (!limit) return false;
  return [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU].some(function (x) { return x !== null; });
}

// Menerima angka yang diketik pakai koma ATAU titik sebagai desimal (mis.
// "25,5" atau "25.5") — dipakai di semua tempat yang mem-parsing nilai Suhu/
// RH/DPG hasil input, supaya konsisten dengan konvensi angka Indonesia.
function toNumberSafe_(v) {
  if (v === null || v === undefined || v === "") return NaN;
  return Number(String(v).trim().replace(",", "."));
}

// Level: null = parameter ini tidak dipersyaratkan untuk ruangan ini (NA di
// Limit_Persyaratan). 0 = dipersyaratkan tapi belum ada data. 1 = Baik
// (dalam Alert). 2 = di luar Alert, masih dalam Action. 3 = di luar Action,
// masih dalam Syarat. 4 = di luar Syarat (deviasi).
function levelForTwoSided_(rawValue, limit) {
  if (!isParamRequired_(limit)) return null;
  if (rawValue === null || rawValue === undefined || rawValue === "") return 0;
  const v = toNumberSafe_(rawValue);
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

  const limitMap = loadLimitMap_();
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
    // "required" & "limits" dihitung dari Limit_Persyaratan LANGSUNG (bukan
    // dari data entri yang sudah tersimpan) — supaya frontend tahu sejak
    // ruangan dipilih (sebelum ada data tersimpan) parameter mana yang wajib
    // diisi DAN berapa syarat/alert/action-nya, untuk ditampilkan ke operator.
    const required = {};
    const limits = {};
    PARAMS.forEach(function (p) {
      const lim = getLimitFor_(limitMap, persyaratanKey, p);
      required[p] = isParamRequired_(lim);
      limits[p] = lim;
    });
    rooms.push({ code: String(code || "").trim(), name: String(name || "").trim(), persyaratanKey: persyaratanKey, required: required, limits: limits });
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
    const tanggal = formatDate_(row[1]);
    const jam = formatTime_(row[2]);
    const roomName = row[3];
    entries.push({
      // ID STABIL berbasis konten (bukan posisi baris) — WAJIB, karena
      // saveEntries_ menulis ulang SELURUH baris (clear+rewrite) setiap kali
      // simpan, jadi urutan/posisi baris di sheet bisa berubah. Kalau id
      // masih berbasis index baris ("row-N"), id lama yang dipegang
      // frontend akan salah sasaran setelah rewrite berikutnya — bisa bikin
      // baris lain kesalahan-deteksi "terhapus" padahal cuma pindah posisi.
      id: roomName + "|" + tanggal + "|" + jam,
      tanggal: tanggal,
      jam: jam,
      roomName: roomName,
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
  // Kolom C (Jam) dipaksa format teks biasa DULU, sebelum ditulis — kalau
  // tidak, Google Sheets otomatis mengubah string "08:00"/"13:00" jadi nilai
  // waktu internal (lalu terbaca aneh seperti "1899-12-30T...") begitu
  // dibaca lagi lewat getValues(). Ini juga otomatis merapikan baris LAMA
  // yang sudah kadung ke-convert, karena seluruh kolom ditulis ulang di sini.
  sheet.getRange(2, 3, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 10).clearContent();
  if (finalRows.length > 0) sheet.getRange(2, 1, finalRows.length, 10).setValues(finalRows);
  return { ok: true, saved: newRows.length };
}

function formatTime_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  return String(value || "").trim();
}

function todayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// Ruangan+tanggal dianggap TERKUNCI kalau ADA baris untuk ruangan+tanggal itu
// yang kolom SPV-nya sudah terisi (approve SPV = kunci). Ini dicek dari data
// yang SUDAH TERSIMPAN ("before"), bukan dari flag hari terpisah — SPV/Manager
// bisa approve per-ruangan sekarang, jadi status kunci itu properti tiap
// baris, bukan properti satu tanggal secara keseluruhan.
function isRoomSpvLocked_(entries, tanggal, roomName) {
  return entries.some(function (e) { return e.tanggal === tanggal && e.roomName === roomName && !!e.spv; });
}

// Ruangan+tanggal dianggap "lengkap" (boleh di-approve OPR/SPV) HANYA kalau
// KEDUA sesi (08:00 & 13:00) sudah ada barisnya DAN semua parameter wajib di
// tiap sesi itu terisi (nilai "-" dihitung terisi — dipakai kalau alat
// pemantau untuk parameter itu memang tidak tersedia di ruangan itu).
function isRoomComplete_(entries, tanggal, roomName, limitMap) {
  const rows = entries.filter(function (e) { return e.tanggal === tanggal && e.roomName === roomName; });
  if (rows.length === 0) return false;
  return SESI_SERVER.every(function (jam) {
    const e = rows.find(function (r) { return r.jam === jam; });
    if (!e) return false;
    return PARAMS.every(function (p) {
      const required = isParamRequired_(getLimitFor_(limitMap, e.persyaratanKey, p));
      if (!required) return true;
      return e[p] !== null && e[p] !== undefined && e[p] !== "";
    });
  });
}

// Menulis (atau mengosongkan) satu kolom di {Facility}_Data untuk baris yang
// cocok Bulan+Tanggal (dan Ruangan kalau roomName diisi — null berarti
// SEMUA ruangan tanggal itu). colIndex 0-based (OPR=8, SPV=9).
function stampFieldOnDataRows_(cfg, month, tanggal, roomName, colIndex, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.dataSheet);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  let changed = 0;
  for (let i = 0; i < values.length; i++) {
    const matchesDate = formatMonth_(values[i][0]) === month && formatDate_(values[i][1]) === tanggal;
    const matchesRoom = !roomName || String(values[i][3]).trim() === String(roomName).trim();
    if (matchesDate && matchesRoom) {
      values[i][colIndex] = value;
      changed++;
    }
  }
  if (changed > 0) sheet.getRange(2, 1, values.length, 10).setValues(values);
  return changed;
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

  // Baris BARU/BERUBAH (id belum ada di "before", atau isinya beda dari
  // "before") wajib tanggalnya = hari ini, ATAU tanggal itu sedang dibuka
  // backfill oleh SPV/Manager (dan belum di-approve). Baris yang TIDAK
  // berubah dari "before" dibiarkan lolos apa adanya (supaya save dari
  // ruangan lain tidak ikut kena validasi tanggal ruangan yang tidak diedit).
  const beforeById = {};
  before.forEach(function (e) { beforeById[e.id] = e; });
  const today = todayStr_();
  const limitMap = loadLimitMap_();

  // Kelengkapan per sesi: kalau SATU parameter di sesi itu terisi, SEMUA
  // parameter yang wajib (required, per Limit_Persyaratan ruangan itu) juga
  // harus terisi — tidak boleh simpan sebagian (mis. Suhu+RH tanpa DPG kalau
  // DPG memang dipersyaratkan untuk ruangan itu).
  function checkComplete(e) {
    const anyFilled = e.suhu !== null && e.suhu !== undefined && e.suhu !== "" ||
      e.rh !== null && e.rh !== undefined && e.rh !== "" ||
      e.dpg !== null && e.dpg !== undefined && e.dpg !== "";
    if (!anyFilled) return null;
    const missing = [];
    PARAMS.forEach(function (p) {
      const required = isParamRequired_(getLimitFor_(limitMap, e.persyaratanKey, p));
      const val = e[p];
      if (required && (val === null || val === undefined || val === "")) missing.push(p.toUpperCase());
    });
    return missing.length > 0 ? missing : null;
  }
  entries.forEach(function (e) {
    const missing = checkComplete(e);
    if (missing) {
      throw new Error("Ruangan '" + e.roomName + "' tanggal " + e.tanggal + " jam " + e.jam + ": data belum lengkap, masih kosong: " + missing.join(", ") + ".");
    }
  });

  // Baris BARU/BERUBAH (id belum ada di "before", atau isinya beda dari
  // "before") wajib tanggalnya = hari ini, ATAU tanggal itu sedang dibuka
  // backfill oleh SPV/Manager (dan belum di-approve). Baris yang TIDAK
  // berubah dari "before" dibiarkan lolos apa adanya (supaya save dari
  // ruangan lain tidak ikut kena validasi tanggal ruangan yang tidak diedit).
  if (session.role !== "Administrator") {
    const touchedByDateRoom = {}; // "tanggal|room" -> true, untuk baris baru/berubah
    entries.forEach(function (e) {
      const prev = beforeById[e.id];
      const isNewOrChanged = !prev || prev.suhu !== e.suhu || prev.rh !== e.rh || prev.dpg !== e.dpg;
      if (isNewOrChanged && e.tanggal) {
        touchedByDateRoom[e.tanggal + "|" + e.roomName] = true;
        const allowedByBackfill = isBackfillOpen_(cfg.label, e.tanggal);
        if (e.tanggal !== today && !allowedByBackfill) {
          throw new Error("Tanggal " + e.tanggal + " bukan hari ini dan belum dibuka untuk backfill oleh SPV/Manager. Minta SPV/Manager membuka akses backfill dulu kalau perlu mengisi tanggal ini.");
        }
      }
    });
    // Kunci per RUANGAN: kalau ruangan+tanggal ini SUDAH di-approve SPV
    // (kolom SPV sudah terisi di data tersimpan), tidak boleh diedit lagi —
    // apa pun status kelengkapannya. Approve SPV = kunci; approve OPR TIDAK
    // mengunci (operator masih boleh mengubah nilai & approve ulang selama
    // SPV belum approve).
    Object.keys(touchedByDateRoom).forEach(function (key) {
      const idx = key.lastIndexOf("|");
      const tgl = key.slice(0, idx);
      const roomName = key.slice(idx + 1);
      if (isRoomSpvLocked_(before, tgl, roomName)) {
        throw new Error("Ruangan '" + roomName + "' tanggal " + tgl + " sudah di-approve SPV/Manager — terkunci. Minta SPV/Manager membuka kembali (backfill) dulu kalau perlu koreksi.");
      }
    });
    // Kunci total kalau Pengkajian fasilitas+bulan ini sudah final.
    if (isPengkajianFinalApproved_(facilityKey, month)) {
      return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah di-approve final oleh Manager QA — data mentah terkunci. Hubungi Administrator kalau perlu perubahan." };
    }
  }

  // "Simpan" HANYA menyimpan nilai — TIDAK approve apa pun. OPR/SPV cuma
  // terisi lewat tombol Approve (OPR)/Approve (SPV) terpisah (lihat
  // approveOprAuthed_/approveSpvAuthed_ di bawah). Baris yang berubah
  // nilainya otomatis kembali "belum di-ACC operator" (OPR dikosongkan lagi)
  // supaya operator wajib approve ulang setelah mengubah data.
  const finalEntries = entries.map(function (e) {
    const prev = beforeById[e.id];
    const isNewOrChanged = !prev || prev.suhu !== e.suhu || prev.rh !== e.rh || prev.dpg !== e.dpg;
    return Object.assign({}, e, { opr: isNewOrChanged ? "" : (prev ? prev.opr : ""), spv: prev ? prev.spv : "" });
  });

  const result = saveEntries_(facilityKey, month, finalEntries);
  writeAuditLog_({
    username: session.username, nama: session.nama, role: session.role, departemen: session.departemen,
    aksi: deletedRows.length > 0 ? "Hapus/Ubah Data" : "Simpan Data", fasilitas: cfg.label, bulan: month,
    detail: entries.length + " baris tersimpan" + (deletedRows.length > 0 ? ", " + deletedRows.length + " baris dihapus" : ""),
  });
  return result;
}

// ---------------------------------------------------------------------------
// APPROVAL_HARIAN  (approve SEKALIGUS semua entri satu Fasilitas + Tanggal,
// bukan per ruangan/bulan) — tab "Approval_Harian". Kolom:
// A Bulan | B Tanggal | C Fasilitas | D ApprovedNama | E ApprovedUsername |
// F ApprovedAt | G BackfillReason | H BackfillByNama | I BackfillByUsername |
// J BackfillAt | K UpdatedAt
// ---------------------------------------------------------------------------
function getApprovalHarianSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPROVAL_HARIAN_SHEET);
  if (!sheet) throw new Error("Tab '" + APPROVAL_HARIAN_SHEET + "' tidak ditemukan. Buat dulu tab ini (lihat komentar di atas file).");
  return sheet;
}

function findApprovalHarianRow_(facilityLabel, tanggal) {
  const sheet = getApprovalHarianSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, rowIndex: -1, row: null };
  const values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][2] === facilityLabel && formatDate_(values[i][1]) === tanggal) {
      return { sheet: sheet, rowIndex: i + 2, row: values[i] };
    }
  }
  return { sheet: sheet, rowIndex: -1, row: null };
}

function getDayStatus_(facilityKey, tanggal) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const found = findApprovalHarianRow_(cfg.label, tanggal);
  if (found.rowIndex === -1) {
    return { tanggal: tanggal, approved: false, backfill: null };
  }
  const row = found.row;
  return {
    tanggal: tanggal,
    approved: !!row[3],
    approvedBy: row[3] ? { nama: row[3], username: row[4], at: row[5] } : null,
    backfill: row[6] ? { alasan: row[6], byNama: row[7], byUsername: row[8], at: row[9] } : null,
  };
}

function getDayStatusForViewer_(facilityKey, tanggal, token) {
  // Status hari (approved/backfill) tidak sensitif — boleh dilihat siapa saja
  // yang sedang memakai app (tetap butuh login supaya bukan endpoint publik
  // liar, tapi tidak perlu departemen yang cocok).
  const session = token ? validateSession_(token) : null;
  if (!session) return { error: "Sesi tidak valid atau sudah habis, silakan login ulang." };
  return getDayStatus_(facilityKey, tanggal);
}

function isDayApproved_(facilityLabel, tanggal) {
  const found = findApprovalHarianRow_(facilityLabel, tanggal);
  return !!(found.rowIndex !== -1 && found.row[3]);
}

// Backfill dianggap "terbuka" kalau ada baris dengan BackfillReason terisi
// DAN belum di-approve (approve otomatis "menutup" jendela backfill itu).
function isBackfillOpen_(facilityLabel, tanggal) {
  const found = findApprovalHarianRow_(facilityLabel, tanggal);
  if (found.rowIndex === -1) return false;
  return !!(found.row[6] && !found.row[3]);
}

function upsertApprovalHarianRow_(cfg, tanggal, patch) {
  const found = findApprovalHarianRow_(cfg.label, tanggal);
  const bulan = tanggal.slice(0, 7);
  const prev = found.row || ["", tanggal, cfg.label, "", "", "", "", "", "", "", ""];
  const rowValues = [
    bulan, tanggal, cfg.label,
    "approvedNama" in patch ? patch.approvedNama : prev[3],
    "approvedUsername" in patch ? patch.approvedUsername : prev[4],
    "approvedAt" in patch ? patch.approvedAt : prev[5],
    "backfillReason" in patch ? patch.backfillReason : prev[6],
    "backfillByNama" in patch ? patch.backfillByNama : prev[7],
    "backfillByUsername" in patch ? patch.backfillByUsername : prev[8],
    "backfillAt" in patch ? patch.backfillAt : prev[9],
    new Date(),
  ];
  if (found.rowIndex === -1) found.sheet.appendRow(rowValues);
  else found.sheet.getRange(found.rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
}

function approveDayAuthed_(session, facilityKey, tanggal) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " (atau Manager PPIC untuk fasilitas gudang terkait) yang boleh approve data harian ini." };
  }
  const month = tanggal.slice(0, 7);
  if (session.role !== "Administrator" && isPengkajianFinalApproved_(facilityKey, month)) {
    return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah final — tidak bisa approve/ubah data lagi." };
  }
  const entries = getEntries_(facilityKey, month).entries || [];
  const entriesThatDay = entries.filter(function (e) { return e.tanggal === tanggal; });
  if (entriesThatDay.length === 0) return { error: "Belum ada data yang diisi operator untuk tanggal ini." };

  // "Approve Semua" HANYA meng-approve ruangan yang datanya SUDAH LENGKAP
  // (kedua sesi, semua parameter wajib terisi) dan BELUM di-approve SPV.
  // Ruangan yang belum lengkap/belum diisi dilewati saja — TIDAK ikut
  // ter-lock, operator tetap bisa melanjutkan mengisi ruangan itu.
  const limitMap = loadLimitMap_();
  const roomsThatDay = Array.from(new Set(entriesThatDay.map(function (e) { return e.roomName; })));
  const roomsToApprove = roomsThatDay.filter(function (r) {
    return !isRoomSpvLocked_(entries, tanggal, r) && isRoomComplete_(entries, tanggal, r, limitMap);
  });
  if (roomsToApprove.length === 0) {
    return { error: "Tidak ada ruangan yang datanya lengkap & siap di-approve untuk tanggal ini." };
  }
  let totalRowsChanged = 0;
  roomsToApprove.forEach(function (r) { totalRowsChanged += stampFieldOnDataRows_(cfg, month, tanggal, r, 9, session.nama); });

  // Flag ringkasan Approval_Harian cuma ditandai "approved" kalau SEMUA
  // ruangan hari itu ikut ter-approve (tidak ada yang dilewati karena belum
  // lengkap) — supaya badge di panel atas tidak menyesatkan.
  const allApproved = roomsThatDay.every(function (r) { return roomsToApprove.indexOf(r) !== -1; });
  if (allApproved) {
    const nowStr = formatDate_(new Date());
    upsertApprovalHarianRow_(cfg, tanggal, { approvedNama: session.nama, approvedUsername: session.username, approvedAt: nowStr });
  }
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Data Harian (Semua Ruangan)", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " — " + roomsToApprove.length + " ruangan di-approve (" + totalRowsChanged + " baris), " + (roomsThatDay.length - roomsToApprove.length) + " ruangan dilewati (belum lengkap)" });
  const status = getDayStatus_(facilityKey, tanggal);
  status.approvedRooms = roomsToApprove.length;
  status.skippedRooms = roomsThatDay.length - roomsToApprove.length;
  return status;
}

function unapproveDayAuthed_(session, facilityKey, tanggal) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " yang boleh membuka kembali (unapprove) data harian ini." };
  }
  const month = tanggal.slice(0, 7);
  if (session.role !== "Administrator" && isPengkajianFinalApproved_(facilityKey, month)) {
    return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah final — tidak bisa dibuka kembali. Hubungi Administrator." };
  }
  upsertApprovalHarianRow_(cfg, tanggal, { approvedNama: "", approvedUsername: "", approvedAt: "" });
  stampFieldOnDataRows_(cfg, month, tanggal, null, 9, ""); // kosongkan SPV semua ruangan tanggal ini -> benar2 kebuka lagi
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Unapprove Data Harian", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal });
  return getDayStatus_(facilityKey, tanggal);
}

// Approve OLEH OPERATOR untuk SATU ruangan+tanggal — TIDAK mengunci (operator
// masih bisa mengubah nilai & approve ulang selama SPV belum approve).
function approveOprAuthed_(session, facilityKey, tanggal, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Staff", cfg)) {
    return { error: "Hanya Staff/Operator, Supervisor, atau Manager departemen " + cfg.department + " yang boleh approve (OPR) data ini." };
  }
  const month = tanggal.slice(0, 7);
  const today = todayStr_();
  if (session.role !== "Administrator" && tanggal !== today && !isBackfillOpen_(cfg.label, tanggal)) {
    return { error: "Tanggal " + tanggal + " bukan hari ini dan belum dibuka backfill." };
  }
  const entries = getEntries_(facilityKey, month).entries || [];
  if (isRoomSpvLocked_(entries, tanggal, roomName)) {
    return { error: "Ruangan ini sudah di-approve SPV/Manager — tidak perlu/tidak bisa approve OPR lagi." };
  }
  const limitMap = loadLimitMap_();
  if (!isRoomComplete_(entries, tanggal, roomName, limitMap)) {
    return { error: "Data ruangan ini belum lengkap (kedua sesi 08:00 & 13:00, semua parameter wajib) — lengkapi & simpan dulu sebelum approve." };
  }
  const changed = stampFieldOnDataRows_(cfg, month, tanggal, roomName, 8, session.nama);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve OPR", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " — Ruang: " + roomName + " (" + changed + " baris)" });
  return { ok: true, changed: changed };
}

// Approve OLEH SPV/MANAGER untuk SATU ruangan+tanggal — INI yang mengunci
// ruangan itu dari edit lebih lanjut (kecuali dibuka lagi lewat backfill).
function approveSpvAuthed_(session, facilityKey, tanggal, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " (atau Manager PPIC untuk fasilitas gudang terkait) yang boleh approve (SPV) data ini." };
  }
  const month = tanggal.slice(0, 7);
  if (session.role !== "Administrator" && isPengkajianFinalApproved_(facilityKey, month)) {
    return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah final — tidak bisa approve/ubah data lagi." };
  }
  const entries = getEntries_(facilityKey, month).entries || [];
  const rows = entries.filter(function (e) { return e.tanggal === tanggal && e.roomName === roomName; });
  if (rows.length === 0) return { error: "Belum ada data ruangan ini untuk tanggal tersebut." };
  const limitMap = loadLimitMap_();
  if (!isRoomComplete_(entries, tanggal, roomName, limitMap)) {
    return { error: "Data ruangan ini belum lengkap (kedua sesi 08:00 & 13:00, semua parameter wajib) — belum bisa di-approve." };
  }
  if (!rows.every(function (r) { return !!r.opr; })) {
    return { error: "Operator belum approve (OPR) data ini — minta operator approve dulu sebelum di-ACC SPV/Manager." };
  }
  const changed = stampFieldOnDataRows_(cfg, month, tanggal, roomName, 9, session.nama);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve SPV", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " — Ruang: " + roomName + " (" + changed + " baris)" });
  return { ok: true, changed: changed };
}

function openBackfillAuthed_(session, facilityKey, tanggal, alasan) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " (atau Manager PPIC) yang boleh membuka akses backfill." };
  }
  if (!alasan || !String(alasan).trim()) return { error: "Alasan backfill wajib diisi." };
  if (tanggal > todayStr_()) return { error: "Backfill tidak bisa untuk tanggal yang belum terjadi." };
  const month = tanggal.slice(0, 7);
  if (session.role !== "Administrator" && isPengkajianFinalApproved_(facilityKey, month)) {
    return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah final — tidak bisa membuka backfill lagi." };
  }
  const wasApproved = isDayApproved_(cfg.label, tanggal);
  const patch = { backfillReason: String(alasan).trim(), backfillByNama: session.nama, backfillByUsername: session.username, backfillAt: formatDate_(new Date()) };
  if (wasApproved) {
    // Tanggal ini (termasuk hari ini) sudah di-ACC sebelumnya — backfill di
    // sini SEKALIGUS membuka kembali (unapprove) supaya operator bisa
    // menambah/koreksi data, dengan alasan tercatat di Audit_Log. Kolom SPV
    // di SEMUA baris tanggal itu ikut dikosongkan supaya benar-benar kebuka
    // (bukan cuma flag ringkasannya saja).
    patch.approvedNama = "";
    patch.approvedUsername = "";
    patch.approvedAt = "";
    stampFieldOnDataRows_(cfg, month, tanggal, null, 9, "");
  }
  upsertApprovalHarianRow_(cfg, tanggal, patch);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: wasApproved ? "Buka Kembali via Backfill" : "Buka Akses Backfill", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " — Alasan: " + alasan });
  return getDayStatus_(facilityKey, tanggal);
}

// Untuk halaman input operator: tanggal hari ini + semua tanggal backfill
// yang masih terbuka (belum di-approve) untuk fasilitas ini.
function getOpenInputDates_(facilityKey, token) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const session = token ? validateSession_(token) : null;
  if (!session) return { error: "Sesi tidak valid atau sudah habis, silakan login ulang." };
  const today = todayStr_();
  const sheet = getApprovalHarianSheet_();
  const lastRow = sheet.getLastRow();
  const backfillDates = [];
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    values.forEach(function (row) {
      const tglRow = formatDate_(row[1]);
      if (row[2] === cfg.label && row[6] && !row[3] && tglRow !== today) {
        backfillDates.push({ tanggal: tglRow, alasan: row[6], byNama: row[7] });
      }
    });
  }
  return { today: today, backfillDates: backfillDates };
}

function getVerifySignoffHarian_(facilityKey, tanggal) {
  const status = getDayStatus_(facilityKey, tanggal);
  if (status.error) return status;
  if (!status.approved) return { found: false };
  return { found: true, approvedBy: status.approvedBy, backfill: status.backfill || null };
}

// Fasilitas+bulan dianggap "selesai" untuk keperluan Pengkajian kalau SEMUA
// baris data bulan itu sudah punya SPV terisi (approved) — dicek per baris,
// bukan lewat flag Approval_Harian, karena sekarang approve SPV bisa terjadi
// per-ruangan (approveSpvAuthed_) maupun sekaligus per-hari (approveDayAuthed_).
function isFacilityMonthFullyApproved_(facilityKey, month) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return false;
  const entries = getEntries_(facilityKey, month).entries || [];
  if (entries.length === 0) return false;
  return entries.every(function (e) { return !!e.spv; });
}

// ---------------------------------------------------------------------------
// PENGKAJIAN EM NON VIABLE  (tab "Laporan_Narasi") — disusun & di-approve QA
// saja, per Fasilitas + Bulan. Kolom (12): Fasilitas | Bulan | Pendahuluan |
// PerParameterJSON | KesimpulanUmum | DinilaiNama | DinilaiJabatan |
// DinilaiTanggal | DiperiksaNama | DiperiksaJabatan | DiperiksaTanggal | UpdatedAt
// ---------------------------------------------------------------------------
// roomName kosong ("") = Pengkajian FASILITAS (semua ruangan, wajib, seperti
// sebelumnya). roomName diisi = Pengkajian RUANGAN (opsional, mis. buat
// keperluan audit) — disimpan di kolom M (NamaRuang), baris lama yang belum
// punya kolom ini otomatis dianggap "" (Pengkajian fasilitas).
function getReport_(facilityKey, month, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NARRATIVE_SHEET);
  if (!sheet) return { error: "Tab tidak ditemukan: " + NARRATIVE_SHEET };
  const room = roomName || "";
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[0] === cfg.label && formatMonth_(row[1]) === month && String(row[12] || "") === room) {
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

function getReportForViewer_(facilityKey, month, token, roomName) {
  const full = getReport_(facilityKey, month, roomName);
  if (full.error) return full;
  const session = token ? validateSession_(token) : null;
  if (session) return full;
  return { found: full.found, updatedAt: full.updatedAt, restricted: true };
}

function getVerifySignoffPengkajian_(facilityKey, month, roomName) {
  const full = getReport_(facilityKey, month, roomName);
  if (full.error) return full;
  if (!full.found) return { found: false };
  return { found: true, signoff: full.signoff, updatedAt: full.updatedAt };
}

function isPengkajianFinalApproved_(facilityKey, month, roomName) {
  const rep = getReport_(facilityKey, month, roomName);
  return !!(rep.found && rep.signoff && rep.signoff.diperiksa && rep.signoff.diperiksa.nama);
}

function emptySignoffServer_() {
  return { dinilai: { nama: "", jabatan: "", tanggal: "" }, diperiksa: { nama: "", jabatan: "", tanggal: "" } };
}

function saveReport_(facilityKey, month, narrative, signoff, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NARRATIVE_SHEET);
  if (!sheet) return { error: "Tab tidak ditemukan: " + NARRATIVE_SHEET };
  const room = roomName || "";
  const values = sheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === cfg.label && formatMonth_(values[i][1]) === month && String(values[i][12] || "") === room) { targetRow = i + 1; break; }
  }
  const dinilai = signoff.dinilai || {};
  const diperiksa = signoff.diperiksa || {};
  const rowValues = [
    cfg.label, month, narrative.pendahuluan || "", JSON.stringify(narrative.perParameter || {}), narrative.kesimpulanUmum || "",
    dinilai.nama || "", dinilai.jabatan || "", dinilai.tanggal || "",
    diperiksa.nama || "", diperiksa.jabatan || "", diperiksa.tanggal || "", new Date(), room,
  ];
  if (targetRow === -1) sheet.appendRow(rowValues);
  else sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  return { ok: true };
}

function isRoomMonthFullyApproved_(facilityKey, month, roomName) {
  const entries = (getEntries_(facilityKey, month).entries || []).filter(function (e) { return e.roomName === roomName; });
  if (entries.length === 0) return false;
  return entries.every(function (e) { return !!e.spv; });
}

function saveReportAuthed_(session, facilityKey, month, narrative, roomName) {
  if (!requireRole_(session, "Supervisor", "QA")) return { error: "Hanya Supervisor/Manager QA yang boleh menyusun Pengkajian EM Non Viable." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const room = roomName || "";
  const existing = getReport_(facilityKey, month, room);
  if (session.role !== "Administrator") {
    if (existing.found && existing.signoff && existing.signoff.diperiksa && existing.signoff.diperiksa.nama) {
      return { error: "Pengkajian ini sudah di-approve final (Mengetahui) oleh Manager QA — narasi terkunci." };
    }
    if (!existing.found) {
      const gateOk = room ? isRoomMonthFullyApproved_(facilityKey, month, room) : isFacilityMonthFullyApproved_(facilityKey, month);
      if (!gateOk) {
        return { error: room ? "Data ruangan ini bulan ini belum semua di-approve SPV/Manager." : "Belum semua tanggal fasilitas ini bulan ini di-approve SPV/Manager. Pengkajian baru bisa dibuat setelah semua data harian selesai di-approve." };
      }
    }
  }
  const signoff = (existing && existing.signoff) || emptySignoffServer_();
  const result = saveReport_(facilityKey, month, narrative, signoff, room);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Susun Pengkajian EM Non Viable" + (room ? " (Ruangan)" : ""), fasilitas: cfg.label, bulan: month, detail: room });
  return result;
}

function approveDikajiAuthed_(session, facilityKey, month, roomName) {
  if (!requireRole_(session, "Supervisor", "QA")) return { error: "Hanya Supervisor/Manager QA yang boleh menyetujui 'Dikaji Oleh'." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const room = roomName || "";
  const existing = getReport_(facilityKey, month, room);
  if (!existing.found) return { error: "Belum ada draf Pengkajian untuk fasilitas & bulan ini." };
  const signoff = existing.signoff || emptySignoffServer_();
  signoff.dinilai = { nama: session.nama, jabatan: session.role + " QA", tanggal: formatDate_(new Date()) };
  const result = saveReport_(facilityKey, month, existing.narrative, signoff, room);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Dikaji Oleh", fasilitas: cfg.label, bulan: month, detail: room });
  return result;
}

function approveMengetahuiAuthed_(session, facilityKey, month, roomName) {
  if (!requireRole_(session, "Manager", "QA")) return { error: "Hanya Manager QA (atau yang mewakili) yang boleh menyetujui final 'Mengetahui'." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const room = roomName || "";
  const existing = getReport_(facilityKey, month, room);
  if (!existing.found) return { error: "Belum ada draf Pengkajian untuk fasilitas & bulan ini." };
  if (!existing.signoff || !existing.signoff.dinilai || !existing.signoff.dinilai.nama) {
    return { error: "Pengkajian ini belum di-approve 'Dikaji Oleh', tidak bisa langsung final." };
  }
  const signoff = existing.signoff;
  signoff.diperiksa = { nama: session.nama, jabatan: "Manager QA", tanggal: formatDate_(new Date()) };
  const result = saveReport_(facilityKey, month, existing.narrative, signoff, room);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Final (Mengetahui)", fasilitas: cfg.label, bulan: month, detail: room });
  return result;
}

// ---------------------------------------------------------------------------
// FORMULIR BULANAN (FM.QA.024/R11) — cetak per Fasilitas+Bulan+Ruangan,
// menggantikan konsep lama "Report_FormQA". Approval 2 tingkat:
// 1. Kepala Bagian (SPV/Manager departemen fasilitas itu, atau Manager PPIC)
//    approve PER RUANGAN, kapan saja setelah ada data bulan itu.
// 2. Manager QA approve SEKALIGUS untuk SEMUA ruangan fasilitas itu bulan
//    itu — TAPI baru bisa kalau SEMUA ruangan yang punya data bulan itu
//    sudah di-approve Kepala Bagian dulu (sesuai form fisik: "Mengetahui"
//    Kepala bagian & Manager QA di bagian bawah tiap lembar formulir).
// Tab "Formulir_Bulanan" (WAJIB dibuat manual): Bulan | Fasilitas |
// NamaRuang | KepalaBagianNama | KepalaBagianUsername | KepalaBagianTanggal |
// ManagerQANama | ManagerQAUsername | ManagerQATanggal | UpdatedAt
// ---------------------------------------------------------------------------
const FORMULIR_BULANAN_SHEET = "Formulir_Bulanan";
const FORMULIR_NO = "FM.QA.024/R11";

function getFormulirBulananSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FORMULIR_BULANAN_SHEET);
  if (!sheet) throw new Error("Tab '" + FORMULIR_BULANAN_SHEET + "' tidak ditemukan. Buat dulu tab ini (lihat komentar di atas file).");
  return sheet;
}

function findFormulirBulananRow_(facilityLabel, bulan, roomName) {
  const sheet = getFormulirBulananSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, rowIndex: -1, row: null };
  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][1] === facilityLabel && formatMonth_(values[i][0]) === bulan && String(values[i][2] || "").trim() === String(roomName || "").trim()) {
      return { sheet: sheet, rowIndex: i + 2, row: values[i] };
    }
  }
  return { sheet: sheet, rowIndex: -1, row: null };
}

function getFormulirBulanan_(facilityKey, bulan, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const found = findFormulirBulananRow_(cfg.label, bulan, roomName);
  if (found.rowIndex === -1) return { found: false, formNo: FORMULIR_NO };
  const row = found.row;
  return {
    found: true, formNo: FORMULIR_NO,
    kepalaBagian: { nama: row[3] || "", username: row[4] || "", tanggal: row[5] || "" },
    managerQA: { nama: row[6] || "", username: row[7] || "", tanggal: row[8] || "" },
    updatedAt: row[9],
  };
}

function upsertFormulirBulananRow_(cfg, bulan, roomName, patch) {
  const found = findFormulirBulananRow_(cfg.label, bulan, roomName);
  const prev = found.row || ["", cfg.label, roomName, "", "", "", "", "", "", ""];
  const rowValues = [
    bulan, cfg.label, roomName,
    "kepalaBagianNama" in patch ? patch.kepalaBagianNama : prev[3],
    "kepalaBagianUsername" in patch ? patch.kepalaBagianUsername : prev[4],
    "kepalaBagianTanggal" in patch ? patch.kepalaBagianTanggal : prev[5],
    "managerQANama" in patch ? patch.managerQANama : prev[6],
    "managerQAUsername" in patch ? patch.managerQAUsername : prev[7],
    "managerQATanggal" in patch ? patch.managerQATanggal : prev[8],
    new Date(),
  ];
  if (found.rowIndex === -1) found.sheet.appendRow(rowValues);
  else found.sheet.getRange(found.rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
}

function getFormulirBulananForViewer_(facilityKey, bulan, roomName, token) {
  const session = token ? validateSession_(token) : null;
  if (!session) return { error: "Sesi tidak valid atau sudah habis, silakan login ulang." };
  return getFormulirBulanan_(facilityKey, bulan, roomName);
}

function getVerifySignoffFormulir_(facilityKey, bulan, roomName) {
  const full = getFormulirBulanan_(facilityKey, bulan, roomName);
  if (full.error) return full;
  if (!full.found) return { found: false };
  return { found: true, kepalaBagian: full.kepalaBagian, managerQA: full.managerQA, updatedAt: full.updatedAt };
}

function approveKepalaBagianAuthed_(session, facilityKey, bulan, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " (atau Manager PPIC untuk fasilitas gudang terkait) yang boleh approve sebagai Kepala Bagian." };
  }
  const roomEntries = (getEntries_(facilityKey, bulan).entries || []).filter(function (e) { return e.roomName === roomName; });
  if (roomEntries.length === 0) return { error: "Belum ada data ruangan ini bulan ini — belum bisa di-approve." };
  const existing = getFormulirBulanan_(facilityKey, bulan, roomName);
  if (session.role !== "Administrator" && existing.managerQA && existing.managerQA.nama) {
    return { error: "Formulir fasilitas ini bulan ini sudah final (Manager QA sudah approve) — terkunci." };
  }
  upsertFormulirBulananRow_(cfg, bulan, roomName, { kepalaBagianNama: session.nama, kepalaBagianUsername: session.username, kepalaBagianTanggal: formatDate_(new Date()) });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Formulir (Kepala Bagian)", fasilitas: cfg.label, bulan: bulan, detail: "Ruang: " + roomName });
  return getFormulirBulanan_(facilityKey, bulan, roomName);
}

function unapproveKepalaBagianAuthed_(session, facilityKey, bulan, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " yang boleh membuka kembali approval Kepala Bagian." };
  }
  const existing = getFormulirBulanan_(facilityKey, bulan, roomName);
  if (session.role !== "Administrator" && existing.managerQA && existing.managerQA.nama) {
    return { error: "Formulir fasilitas ini bulan ini sudah final (Manager QA sudah approve) — hubungi Administrator untuk membuka kembali." };
  }
  upsertFormulirBulananRow_(cfg, bulan, roomName, { kepalaBagianNama: "", kepalaBagianUsername: "", kepalaBagianTanggal: "" });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Unapprove Formulir (Kepala Bagian)", fasilitas: cfg.label, bulan: bulan, detail: "Ruang: " + roomName });
  return getFormulirBulanan_(facilityKey, bulan, roomName);
}

// Fasilitas+bulan dianggap siap untuk approval Manager QA kalau SEMUA
// ruangan yang punya data bulan itu sudah di-approve Kepala Bagian.
function isFacilityMonthAllRoomsKepalaBagianApproved_(facilityKey, bulan) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return false;
  const entries = getEntries_(facilityKey, bulan).entries || [];
  const rooms = Array.from(new Set(entries.map(function (e) { return e.roomName; }).filter(Boolean)));
  if (rooms.length === 0) return false;
  return rooms.every(function (r) {
    const f = getFormulirBulanan_(facilityKey, bulan, r);
    return !!(f.found && f.kepalaBagian && f.kepalaBagian.nama);
  });
}

function approveManagerQAFormulirAuthed_(session, facilityKey, bulan) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRole_(session, "Manager", "QA")) return { error: "Hanya Manager QA yang boleh approve Formulir tahap ini." };
  if (session.role !== "Administrator" && !isFacilityMonthAllRoomsKepalaBagianApproved_(facilityKey, bulan)) {
    return { error: "Belum semua ruangan fasilitas ini bulan ini di-approve Kepala Bagian. Manager QA baru bisa approve setelah semua ruangan selesai." };
  }
  const entries = getEntries_(facilityKey, bulan).entries || [];
  const rooms = Array.from(new Set(entries.map(function (e) { return e.roomName; }).filter(Boolean)));
  const nowStr = formatDate_(new Date());
  rooms.forEach(function (r) {
    upsertFormulirBulananRow_(cfg, bulan, r, { managerQANama: session.nama, managerQAUsername: session.username, managerQATanggal: nowStr });
  });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Formulir (Manager QA, semua ruangan)", fasilitas: cfg.label, bulan: bulan, detail: rooms.length + " ruangan" });
  return { ok: true, rooms: rooms.length };
}

function unapproveManagerQAFormulirAuthed_(session, facilityKey, bulan) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (session.role !== "Administrator") return { error: "Hanya Administrator yang boleh membuka kembali approval Manager QA." };
  const entries = getEntries_(facilityKey, bulan).entries || [];
  const rooms = Array.from(new Set(entries.map(function (e) { return e.roomName; }).filter(Boolean)));
  rooms.forEach(function (r) {
    upsertFormulirBulananRow_(cfg, bulan, r, { managerQANama: "", managerQAUsername: "", managerQATanggal: "" });
  });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Unapprove Formulir (Manager QA)", fasilitas: cfg.label, bulan: bulan, detail: rooms.length + " ruangan" });
  return { ok: true };
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
