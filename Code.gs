/**
 * @OnlyCurrentDoc
 */
/**
 * EM NON VIABLE — Google Apps Script backend
 * PT. Rama Emerald Multi Sukses — QA
 */

// ---------------------------------------------------------------------------
// KONFIGURASI: 17 Fasilitas Baru
// ---------------------------------------------------------------------------
const FACILITIES = {
  nblProduksi: { label: "NBL Produksi", masterSheet: "NBL Produksi", dataSheet: "NBL Produksi_Data", department: "Produksi", group: "nbl" },
  nblKemasan: { label: "NBL Kemasan", masterSheet: "NBL Kemasan", dataSheet: "NBL Kemasan_Data", department: "Kemasan", altDepartment: "Produksi", group: "nbl" },
  gbbNbl: { label: "GBB NBL", masterSheet: "GBB NBL", dataSheet: "GBB NBL_Data", department: "GBB", altDepartment: "PPIC", group: "nbl" },

  blProduksi: { label: "BL Produksi", masterSheet: "BL Produksi", dataSheet: "BL Produksi_Data", department: "Produksi", group: "bl" },
  blKemasan: { label: "BL Kemasan", masterSheet: "BL Kemasan", dataSheet: "BL Kemasan_Data", department: "Kemasan", altDepartment: "Produksi", group: "bl" },
  gbbBl: { label: "GBB BL", masterSheet: "GBB BL", dataSheet: "GBB BL_Data", department: "GBB", altDepartment: "PPIC", group: "bl" },

  sefaNonSterilProduksi: { label: "Sefa Non Steril Produksi", masterSheet: "Sefa Non Steril Produksi", dataSheet: "Sefa Non Steril Produksi_Data", department: "Produksi", group: "sefaNonSteril" },
  sefaNonSterilKemasan: { label: "Sefa Non Steril Kemasan", masterSheet: "Sefa Non Steril Kemasan", dataSheet: "Sefa Non Steril Kemasa_Data", department: "Kemasan", altDepartment: "Produksi", group: "sefaNonSteril" },
  gbbSefa: { label: "GBB SEFA", masterSheet: "GBB SEFA", dataSheet: "GBB SEFA_Data", department: "GBB", altDepartment: "PPIC", group: "sefaNonSteril" },

  sefaSterilProduksi: { label: "Sefa Steril Produksi", masterSheet: "Sefa Steril Produksi", dataSheet: "Sefa Steril Produksi_Data", department: "Produksi", group: "sefaSteril" },
  sefaSterilKemasan: { label: "Sefa Steril Kemasan", masterSheet: "Sefa Steril Kemasan", dataSheet: "Sefa Steril Kemasan_Data", department: "Kemasan", altDepartment: "Produksi", group: "sefaSteril" },

  qc: { label: "QC", masterSheet: "QC", dataSheet: "QC_Data", department: "QC", group: "qc" },
  rnd: { label: "RND", masterSheet: "RND", dataSheet: "RND_Data", department: "RND", group: "rnd" },
  pkrt: { label: "PKRT", masterSheet: "PKRT", dataSheet: "PKRT_Data", department: "PKRT", altDepartment: "Produksi", group: "pkrt" },
  alkes: { label: "Alkes", masterSheet: "Alkes", dataSheet: "Alkes_Data", department: "PKRT", altDepartment: "Produksi", group: "alkes" },
  gbj: { label: "GBJ", masterSheet: "GBJ", dataSheet: "GBJ_Data", department: "GBJ", altDepartment: "PPIC", group: "gbj" },
  gbk: { label: "GBK", masterSheet: "GBK", dataSheet: "GBK_Data", department: "GBK", altDepartment: "PPIC", group: "gbk" },
};

const NARRATIVE_SHEET = "Laporan_Narasi";
const LIMIT_SHEET = "Limit_Persyaratan";
const PARAMS = ["suhu", "rh", "dpg"];
const SESI_SERVER = ["08:00", "13:00"];

const USER_ROLES_SHEET = "User_Roles";
const SESSIONS_SHEET = "Sessions";
const AUDIT_LOG_SHEET = "Audit_Log";
const APPROVAL_HARIAN_SHEET = "Approval_Harian";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const ROLE_LEVEL = { Tamu: 1, Staff: 2, Operator: 2, Admin: 2, Supervisor: 3, Manager: 4, "Assistant Manager": 4, Administrator: 5 };

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case "master": result = getMaster_(e.parameter.facility); break;
      case "entries": result = getEntries_(e.parameter.facility, e.parameter.month); break;
      case "report": result = getReportForViewer_(e.parameter.facility, e.parameter.month, e.parameter.token, e.parameter.roomName); break;
      case "statusIndex": result = getStatusIndex_(e.parameter.month); break;
      case "whoami": result = whoami_(e.parameter.token); break;
      case "activityLog": result = getActivityLog_(e.parameter.token, e.parameter.month, e.parameter.facility); break;
      case "dayStatus": result = getDayStatusForViewer_(e.parameter.facility, e.parameter.tanggal, e.parameter.token); break;
      case "openInputDates": result = getOpenInputDates_(e.parameter.facility, e.parameter.token); break;
      case "formulirBulanan": result = getFormulirBulananForViewer_(e.parameter.facility, e.parameter.bulan, e.parameter.roomName, e.parameter.token); break;
      case "verify":
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
      case "login": result = login_(body.username, body.password); break;
      case "logout": result = logout_(body.token); break;
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

function requireRole_(session, minRole, departemen) {
  if (session.role === "Administrator") return true;
  const level = ROLE_LEVEL[session.role] || 0;
  const minLevel = ROLE_LEVEL[minRole] || 99;
  if (level < minLevel) return false;
  if (departemen && session.departemen !== departemen) return false;
  return true;
}

function requireRoleForFacility_(session, minRole, cfg) {
  if (session.role === "Administrator") return true;
  const level = ROLE_LEVEL[session.role] || 0;
  const userDepts = (session.departemen || "").split(",").map(function(s) { return s.trim().toLowerCase(); });
  const targetDept = (cfg.department || "").toLowerCase();
  const altDept = (cfg.altDepartment || "").toLowerCase();

  if (userDepts.indexOf(targetDept) !== -1) {
    return level >= (ROLE_LEVEL[minRole] || 99);
  }
  if (altDept && userDepts.indexOf(altDept) !== -1) {
    return level >= (ROLE_LEVEL[minRole] || 99);
  }
  return false;
}

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
    const rawBulan = row[7] instanceof Date ? formatMonth_(row[7]) : String(row[7] || "").trim();
    return { waktu: row[0] instanceof Date ? row[0].toISOString() : String(row[0]), username: row[1], nama: row[2], role: row[3], departemen: row[4], aksi: row[5], fasilitas: row[6], bulan: rawBulan, detail: row[8] };
  });
  if (month) logs = logs.filter(function (l) { return !l.bulan || l.bulan === month; });
  if (facilityLabel) logs = logs.filter(function (l) { return !l.fasilitas || l.fasilitas === facilityLabel; });
  logs.sort(function (a, b) { return new Date(b.waktu) - new Date(a.waktu); });
  return { logs: logs.slice(0, 300) };
}

// ---------------------------------------------------------------------------
// LIMIT_PERSYARATAN & NUMERIC PARSING (Membersihkan simbol ≤, ≥, -)
// ---------------------------------------------------------------------------
function cleanLimitNum_(v) {
  if (v === "" || v === null || v === undefined || v === "-") return null;
  const s = String(v).replace(/[≤≥]/g, "").replace(",", ".").trim();
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function normalizeKey_(key) {
  return String(key || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function loadLimitMap_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LIMIT_SHEET);
  if (!sheet) throw new Error("Tab '" + LIMIT_SHEET + "' tidak ditemukan.");
  const lastRow = sheet.getLastRow();
  const map = {};
  if (lastRow < 2) return map;
  const values = sheet.getRange(2, 1, lastRow - 1, 20).getValues();
  values.forEach(function (row) {
    const key = row[1]; // Kolom B = PersyaratanKey
    if (!key) return;
    const nk = normalizeKey_(key);
    map[nk] = {
      kode: String(row[0] || "").trim(),
      suhu: { syaratL: cleanLimitNum_(row[2]), syaratU: cleanLimitNum_(row[3]), alertL: cleanLimitNum_(row[4]), alertU: cleanLimitNum_(row[5]), actionL: cleanLimitNum_(row[6]), actionU: cleanLimitNum_(row[7]) },
      rh: { syaratL: cleanLimitNum_(row[8]), syaratU: cleanLimitNum_(row[9]), alertL: cleanLimitNum_(row[10]), alertU: cleanLimitNum_(row[11]), actionL: cleanLimitNum_(row[12]), actionU: cleanLimitNum_(row[13]) },
      dpg: { syaratL: cleanLimitNum_(row[14]), syaratU: cleanLimitNum_(row[15]), alertL: cleanLimitNum_(row[16]), alertU: cleanLimitNum_(row[17]), actionL: cleanLimitNum_(row[18]), actionU: cleanLimitNum_(row[19]) },
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

function isParamRequired_(limit, parameter) {
  if (parameter === "suhu") return true; // Suhu selalu aktif dipantau
  if (!limit) return false;
  return [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU].some(function (x) { return x !== null; });
}

function toNumberSafe_(v) {
  if (v === null || v === undefined || v === "" || v === "-") return NaN;
  return Number(String(v).trim().replace(",", "."));
}

function levelForTwoSided_(rawValue, limit, parameter) {
  if (rawValue === "-") return 1;
  if (rawValue === null || rawValue === undefined || rawValue === "") return 0;
  const v = toNumberSafe_(rawValue);
  if (isNaN(v)) return 0;
  if (!limit || [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU].every(function (x) { return x === null; })) {
    return parameter === "suhu" ? 1 : null;
  }
  if (inRange_(v, limit.alertL, limit.alertU)) return 1;
  if (inRange_(v, limit.actionL, limit.actionU)) return 2;
  if (inRange_(v, limit.syaratL, limit.syaratU)) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// MASTER ROOM LIST
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
  for (let i = 1; i < values.length; i++) {
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
    if (!persyaratanKey) continue;

    const required = {};
    const limits = {};
    PARAMS.forEach(function (p) {
      const lim = getLimitFor_(limitMap, persyaratanKey, p);
      required[p] = isParamRequired_(lim, p);
      limits[p] = lim;
    });
    rooms.push({ code: String(code || "").trim(), name: String(name || "").trim(), persyaratanKey: persyaratanKey, required: required, limits: limits });
  }
  return { facility: facilityKey, rooms: rooms };
}

// ---------------------------------------------------------------------------
// MONTHLY ENTRIES
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
      id: roomName + "|" + tanggal + "|" + jam,
      tanggal: tanggal,
      jam: jam,
      roomName: roomName,
      persyaratanKey: persyaratanKey,
      suhu: suhu, rh: rh, dpg: dpg,
      opr: row[8] || "", spv: row[9] || "",
      level: {
        suhu: levelForTwoSided_(suhu, getLimitFor_(limitMap, persyaratanKey, "suhu"), "suhu"),
        rh: levelForTwoSided_(rh, getLimitFor_(limitMap, persyaratanKey, "rh"), "rh"),
        dpg: levelForTwoSided_(dpg, getLimitFor_(limitMap, persyaratanKey, "dpg"), "dpg"),
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
  const newRows = entries.map(function (e) {
    return [
      month, e.tanggal || "", e.jam || "", e.roomName || "", e.persyaratanKey || "",
      e.suhu === null || e.suhu === undefined ? "" : e.suhu,
      e.rh === null || e.rh === undefined ? "" : e.rh,
      e.dpg === null || e.dpg === undefined ? "" : e.dpg,
      e.opr || "", e.spv || "",
    ];
  });
  const finalRows = kept.concat(newRows);
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
    return { error: "Hanya Operator/Staff/SPV/Manager yang boleh mengisi data fasilitas ini." };
  }

  const before = getEntries_(facilityKey, month).entries || [];
  const beforeById = {};
  before.forEach(function (e) { beforeById[e.id] = e; });

  const finalEntries = entries.map(function (e) {
    const prev = beforeById[e.id];
    const isNewOrChanged = !prev || prev.suhu !== e.suhu || prev.rh !== e.rh || prev.dpg !== e.dpg;
    return Object.assign({}, e, { opr: isNewOrChanged ? "" : (prev ? prev.opr : ""), spv: prev ? prev.spv : "" });
  });

  const result = saveEntries_(facilityKey, month, finalEntries);
  writeAuditLog_({
    username: session.username, nama: session.nama, role: session.role, departemen: session.departemen,
    aksi: "Simpan Data", fasilitas: cfg.label, bulan: month,
    detail: entries.length + " baris tersimpan",
  });
  return result;
}

function getApprovalHarianSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPROVAL_HARIAN_SHEET);
  if (!sheet) throw new Error("Tab '" + APPROVAL_HARIAN_SHEET + "' tidak ditemukan.");
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
  const row = found.rowIndex === -1 ? null : found.row;
  const backfill = row && row[6] ? { alasan: row[6], byNama: row[7], byUsername: row[8], at: row[9] } : null;

  if (row && row[3]) {
    return { tanggal: tanggal, approved: true, approvedBy: { nama: row[3], username: row[4], at: row[5] }, backfill: backfill };
  }

  const month = tanggal.slice(0, 7);
  const entriesThatDay = (getEntries_(facilityKey, month).entries || []).filter(function (e) { return e.tanggal === tanggal; });
  const approvedEntry = entriesThatDay.find(function (e) { return !!e.spv; });
  if (approvedEntry) {
    return { tanggal: tanggal, approved: true, approvedBy: { nama: approvedEntry.spv, username: "", at: "" }, backfill: backfill };
  }
  return { tanggal: tanggal, approved: false, backfill: backfill };
}

function getDayStatusForViewer_(facilityKey, tanggal, token) {
  const session = token ? validateSession_(token) : null;
  if (!session) return { error: "Sesi tidak valid atau sudah habis, silakan login ulang." };
  return getDayStatus_(facilityKey, tanggal);
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
    return { error: "Hanya Supervisor/Manager yang boleh approve data harian ini." };
  }
  const month = tanggal.slice(0, 7);
  const changed = stampFieldOnDataRows_(cfg, month, tanggal, null, 9, session.nama);
  const nowStr = formatDate_(new Date());
  upsertApprovalHarianRow_(cfg, tanggal, { approvedNama: session.nama, approvedUsername: session.username, approvedAt: nowStr });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Data Harian (Semua)", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " (" + changed + " baris)" });
  return getDayStatus_(facilityKey, tanggal);
}

function unapproveDayAuthed_(session, facilityKey, tanggal) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager yang boleh membuka kembali data harian ini." };
  }
  const month = tanggal.slice(0, 7);
  upsertApprovalHarianRow_(cfg, tanggal, { approvedNama: "", approvedUsername: "", approvedAt: "" });
  stampFieldOnDataRows_(cfg, month, tanggal, null, 9, "");
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Unapprove Data Harian", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal });
  return getDayStatus_(facilityKey, tanggal);
}

function approveOprAuthed_(session, facilityKey, tanggal, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const month = tanggal.slice(0, 7);
  const changed = stampFieldOnDataRows_(cfg, month, tanggal, roomName, 8, session.nama);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve OPR", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " — Ruang: " + roomName });
  return { ok: true, changed: changed };
}

function approveSpvAuthed_(session, facilityKey, tanggal, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager yang boleh approve (SPV) data ini." };
  }
  const month = tanggal.slice(0, 7);
  const changed = stampFieldOnDataRows_(cfg, month, tanggal, roomName, 9, session.nama);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve SPV", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " — Ruang: " + roomName });
  return { ok: true, changed: changed };
}

function openBackfillAuthed_(session, facilityKey, tanggal, alasan) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager yang boleh membuka akses backfill." };
  }
  const month = tanggal.slice(0, 7);
  const patch = { backfillReason: String(alasan).trim(), backfillByNama: session.nama, backfillByUsername: session.username, backfillAt: formatDate_(new Date()) };
  upsertApprovalHarianRow_(cfg, tanggal, patch);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Buka Akses Backfill", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " — Alasan: " + alasan });
  return getDayStatus_(facilityKey, tanggal);
}

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

// ---------------------------------------------------------------------------
// PENGKAJIAN (Laporan_Narasi)
// ---------------------------------------------------------------------------
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

function saveReportAuthed_(session, facilityKey, month, narrative, roomName) {
  if (!requireRole_(session, "Supervisor", "QA")) return { error: "Hanya Supervisor/Manager QA yang boleh menyusun Pengkajian EM Non Viable." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const room = roomName || "";
  const existing = getReport_(facilityKey, month, room);
  const signoff = (existing && existing.signoff) || { dinilai: { nama: "", jabatan: "", tanggal: "" }, diperiksa: { nama: "", jabatan: "", tanggal: "" } };
  const result = saveReport_(facilityKey, month, narrative, signoff, room);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Susun Pengkajian EM Non Viable", fasilitas: cfg.label, bulan: month, detail: room });
  return result;
}

function approveDikajiAuthed_(session, facilityKey, month, roomName) {
  if (!requireRole_(session, "Supervisor", "QA")) return { error: "Hanya Supervisor/Manager QA yang boleh menyetujui 'Dikaji Oleh'." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const room = roomName || "";
  const existing = getReport_(facilityKey, month, room);
  if (!existing.found) return { error: "Belum ada draf Pengkajian untuk fasilitas & bulan ini." };
  const signoff = existing.signoff || { dinilai: {}, diperiksa: {} };
  signoff.dinilai = { nama: session.nama, jabatan: session.role + " QA", tanggal: formatDate_(new Date()) };
  const result = saveReport_(facilityKey, month, existing.narrative, signoff, room);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Dikaji Oleh", fasilitas: cfg.label, bulan: month, detail: room });
  return result;
}

function approveMengetahuiAuthed_(session, facilityKey, month, roomName) {
  if (!requireRole_(session, "Manager", "QA")) return { error: "Hanya Manager QA yang boleh menyetujui final 'Mengetahui'." };
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const room = roomName || "";
  const existing = getReport_(facilityKey, month, room);
  if (!existing.found) return { error: "Belum ada draf Pengkajian untuk fasilitas & bulan ini." };
  const signoff = existing.signoff;
  signoff.diperiksa = { nama: session.nama, jabatan: "Manager QA", tanggal: formatDate_(new Date()) };
  const result = saveReport_(facilityKey, month, existing.narrative, signoff, room);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Final (Mengetahui)", fasilitas: cfg.label, bulan: month, detail: room });
  return result;
}

// ---------------------------------------------------------------------------
// FORMULIR BULANAN (FM.QA.024/R11)
// ---------------------------------------------------------------------------
const FORMULIR_BULANAN_SHEET = "Formulir_Bulanan";
const FORMULIR_NO = "FM.QA.024/R11";

function getFormulirBulananSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FORMULIR_BULANAN_SHEET);
  if (!sheet) throw new Error("Tab '" + FORMULIR_BULANAN_SHEET + "' tidak ditemukan.");
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
    return { error: "Hanya Supervisor/Manager departemen terkait yang boleh approve sebagai Kepala Bagian." };
  }
  upsertFormulirBulananRow_(cfg, bulan, roomName, { kepalaBagianNama: session.nama, kepalaBagianUsername: session.username, kepalaBagianTanggal: formatDate_(new Date()) });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Formulir (Kepala Bagian)", fasilitas: cfg.label, bulan: bulan, detail: "Ruang: " + roomName });
  return getFormulirBulanan_(facilityKey, bulan, roomName);
}

function unapproveKepalaBagianAuthed_(session, facilityKey, bulan, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager yang boleh membuka kembali approval Kepala Bagian." };
  }
  upsertFormulirBulananRow_(cfg, bulan, roomName, { kepalaBagianNama: "", kepalaBagianUsername: "", kepalaBagianTanggal: "" });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Unapprove Formulir (Kepala Bagian)", fasilitas: cfg.label, bulan: bulan, detail: "Ruang: " + roomName });
  return getFormulirBulanan_(facilityKey, bulan, roomName);
}

function approveManagerQAFormulirAuthed_(session, facilityKey, bulan) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRole_(session, "Manager", "QA")) return { error: "Hanya Manager QA yang boleh approve Formulir tahap ini." };
  const entries = getEntries_(facilityKey, bulan).entries || [];
  const rooms = Array.from(new Set(entries.map(function (e) { return e.roomName; }).filter(Boolean)));
  const nowStr = formatDate_(new Date());
  rooms.forEach(function (r) {
    upsertFormulirBulananRow_(cfg, bulan, r, { managerQANama: session.nama, managerQAUsername: session.username, managerQATanggal: nowStr });
  });
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Formulir (Manager QA)", fasilitas: cfg.label, bulan: bulan, detail: rooms.length + " ruangan" });
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

function getStatusIndex_(month) {
  const out = {};
  Object.keys(FACILITIES).forEach(function (key) {
    const res = getEntries_(key, month);
    const entries = res.entries || [];
    let maxLevel = 0;
    entries.forEach(function (e) {
      PARAMS.forEach(function (p) {
        const lvl = e.level[p];
        if (lvl !== null && lvl > maxLevel) maxLevel = lvl;
      });
    });
    out[key] = { level: maxLevel, hasData: entries.length > 0 };
  });
  return { month: month, status: out };
}

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