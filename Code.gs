/**
 * @OnlyCurrentDoc
 */
/**
 * EM NON VIABLE — Google Apps Script backend
 * PT. Rama Emerald Multi Sukses — QA
 */

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

const USER_ROLES_SHEET = "User_Roles";
const SESSIONS_SHEET = "Sessions";
const AUDIT_LOG_SHEET = "Audit_Log";
const APPROVAL_HARIAN_SHEET = "Approval_Harian";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const ROLE_LEVEL = { Tamu: 1, Staff: 2, Supervisor: 3, Manager: 4, "Assistant Manager": 4, Administrator: 5 };

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
  if (session.departemen === cfg.department) {
    return level >= (ROLE_LEVEL[minRole] || 99);
  }
  if (cfg.altDepartment && session.departemen === cfg.altDepartment) {
    return level >= ROLE_LEVEL["Manager"];
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
    return { waktu: row[0] instanceof Date ? row[0].toISOString() : String(row[0]), username: row[1], nama: row[2], role: row[3], departemen: row[4], aksi: row[5], fasilitas: row[6], bulan: row[7], detail: row[8] };
  });
  if (month) logs = logs.filter(function (l) { return l.bulan === month; });
  if (facilityLabel) logs = logs.filter(function (l) { return l.fasilitas === facilityLabel; });
  logs.sort(function (a, b) { return new Date(b.waktu) - new Date(a.waktu); });
  return { logs: logs.slice(0, 300) };
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

function isParamRequired_(limit) {
  if (!limit) return false;
  return [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU].some(function (x) { return x !== null; });
}

function toNumberSafe_(v) {
  if (v === null || v === undefined || v === "") return NaN;
  return Number(String(v).trim().replace(",", "."));
}

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
      required[p] = isParamRequired_(lim);
      limits[p] = lim;
    });
    rooms.push({ code: String(code || "").trim(), name: String(name || "").trim(), persyaratanKey: persyaratanKey, required: required, limits: limits });
  }
  return { facility: facilityKey, rooms: rooms };
}

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

function isRoomSpvLocked_(entries, tanggal, roomName) {
  return entries.some(function (e) { return e.tanggal === tanggal && e.roomName === roomName && !!e.spv; });
}

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

  const beforeById = {};
  before.forEach(function (e) { beforeById[e.id] = e; });
  const limitMap = loadLimitMap_();

  function checkComplete(e) {
    const anyFilled = (e.suhu !== null && e.suhu !== undefined && e.suhu !== "") ||
      (e.rh !== null && e.rh !== undefined && e.rh !== "") ||
      (e.dpg !== null && e.dpg !== undefined && e.dpg !== "");
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

  if (session.role !== "Administrator") {
    const touchedByDateRoom = {};
    entries.forEach(function (e) {
      const prev = beforeById[e.id];
      const isNewOrChanged = !prev || prev.suhu !== e.suhu || prev.rh !== e.rh || prev.dpg !== e.dpg;
      if (isNewOrChanged && e.tanggal) {
        touchedByDateRoom[e.tanggal + "|" + e.roomName] = true;
      }
    });

    // Tanggal lampau tetap bisa diisi selama ruangan+tanggal tersebut belum di-approve SPV
    Object.keys(touchedByDateRoom).forEach(function (key) {
      const idx = key.lastIndexOf("|");
      const tgl = key.slice(0, idx);
      const roomName = key.slice(idx + 1);
      if (isRoomSpvLocked_(before, tgl, roomName)) {
        throw new Error("Ruangan '" + roomName + "' tanggal " + tgl + " sudah di-approve SPV/Manager — terkunci. Hubungi SPV/Manager bila perlu pembukaan kembali.");
      }
    });

    if (isPengkajianFinalApproved_(facilityKey, month)) {
      return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah di-approve final oleh Manager QA — data mentah terkunci. Hubungi Administrator kalau perlu perubahan." };
    }
  }

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
  const session = token ? validateSession_(token) : null;
  if (!session) return { error: "Sesi tidak valid atau sudah habis, silakan login ulang." };
  return getDayStatus_(facilityKey, tanggal);
}

function isDayApproved_(facilityLabel, tanggal) {
  const found = findApprovalHarianRow_(facilityLabel, tanggal);
  return !!(found.rowIndex !== -1 && found.row[3]);
}

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

  const allApproved = roomsThatDay.every(function (r) { return roomsToApprove.indexOf(r) !== -1; });
  if (allApproved) {
    // Waktu approve tercatat real-time (today)
    const nowStr = formatDate_(new Date());
    upsertApprovalHarianRow_(cfg, tanggal, { approvedNama: session.nama, approvedUsername: session.username, approvedAt: nowStr });
  }
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve Data Harian (Semua Ruangan)", fasilitas: cfg.label, bulan: month, detail: "Tanggal Data: " + tanggal + " (Approved pada: " + todayStr_() + ") — " + roomsToApprove.length + " ruangan di-approve" });
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
  stampFieldOnDataRows_(cfg, month, tanggal, null, 9, "");
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Unapprove Data Harian", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal });
  return getDayStatus_(facilityKey, tanggal);
}

function approveOprAuthed_(session, facilityKey, tanggal, roomName) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Staff", cfg)) {
    return { error: "Hanya Staff/Operator, Supervisor, atau Manager departemen " + cfg.department + " yang boleh approve (OPR) data ini." };
  }
  const month = tanggal.slice(0, 7);
  const entries = getEntries_(facilityKey, month).entries || [];
  if (isRoomSpvLocked_(entries, tanggal, roomName)) {
    return { error: "Ruangan ini sudah di-approve SPV/Manager — tidak perlu/tidak bisa approve OPR lagi." };
  }
  const limitMap = loadLimitMap_();
  if (!isRoomComplete_(entries, tanggal, roomName, limitMap)) {
    return { error: "Data ruangan ini belum lengkap (kedua sesi 08:00 & 13:00, semua parameter wajib) — lengkapi & simpan dulu sebelum approve." };
  }
  const changed = stampFieldOnDataRows_(cfg, month, tanggal, roomName, 8, session.nama);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve OPR", fasilitas: cfg.label, bulan: month, detail: "Tanggal Data: " + tanggal + " (Approved pada: " + todayStr_() + ") — Ruang: " + roomName });
  return { ok: true, changed: changed };
}

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
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: "Approve SPV", fasilitas: cfg.label, bulan: month, detail: "Tanggal Data: " + tanggal + " (Approved pada: " + todayStr_() + ") — Ruang: " + roomName });
  return { ok: true, changed: changed };
}

function openBackfillAuthed_(session, facilityKey, tanggal, alasan) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  if (!requireRoleForFacility_(session, "Supervisor", cfg)) {
    return { error: "Hanya Supervisor/Manager departemen " + cfg.department + " (atau Manager PPIC) yang boleh membuka kembali data." };
  }
  if (!alasan || !String(alasan).trim()) return { error: "Alasan pembukaan kembali wajib diisi." };
  if (tanggal > todayStr_()) return { error: "Tidak bisa untuk tanggal yang belum terjadi." };
  const month = tanggal.slice(0, 7);
  if (session.role !== "Administrator" && isPengkajianFinalApproved_(facilityKey, month)) {
    return { error: "Pengkajian EM Non Viable fasilitas ini bulan ini sudah final — data terkunci permanen." };
  }
  const wasApproved = isDayApproved_(cfg.label, tanggal);
  const patch = { backfillReason: String(alasan).trim(), backfillByNama: session.nama, backfillByUsername: session.username, backfillAt: formatDate_(new Date()) };
  if (wasApproved) {
    patch.approvedNama = "";
    patch.approvedUsername = "";
    patch.approvedAt = "";
    stampFieldOnDataRows_(cfg, month, tanggal, null, 9, "");
  }
  upsertApprovalHarianRow_(cfg, tanggal, patch);
  writeAuditLog_({ username: session.username, nama: session.nama, role: session.role, departemen: session.departemen, aksi: wasApproved ? "Buka Kembali Data Terkunci" : "Catatan Tambahan Tanggal", fasilitas: cfg.label, bulan: month, detail: "Tanggal: " + tanggal + " — Alasan: " + alasan });
  return getDayStatus_(facilityKey, tanggal);
}

function getOpenInputDates_(facilityKey, token) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return { error: "Fasilitas tidak dikenal: " + facilityKey };
  const session = token ? validateSession_(token) : null;
  if (!session) return { error: "Sesi tidak valid atau sudah habis, silakan login ulang." };
  return { today: todayStr_() };
}

function getVerifySignoffHarian_(facilityKey, tanggal) {
  const status = getDayStatus_(facilityKey, tanggal);
  if (status.error) return status;
  if (!status.approved) return { found: false };
  return { found: true, approvedBy: status.approvedBy, backfill: status.backfill || null };
}

function isFacilityMonthFullyApproved_(facilityKey, month) {
  const cfg = FACILITIES[facilityKey];
  if (!cfg) return false;
  const entries = getEntries_(facilityKey, month).entries || [];
  if (entries.length === 0) return false;
  return entries.every(function (e) { return !!e.spv; });
}

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
        return { error: room ? "Data ruangan ini bulan ini belum semua di-approve SPV/Manager." : "Belum semua data harian fasilitas ini bulan ini di-approve SPV/Manager." };
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
