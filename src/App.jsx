import { useState, useEffect, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import {
  LogIn, LogOut, User, Loader2, Building2, LayoutGrid, ChevronLeft, ChevronRight,
  Lock, CheckCircle2, XOctagon, History, Save, FileCheck2, ClipboardList,
  Printer, Sparkles, AlertTriangle, Calendar, FileQuestion, CheckCheck,
} from "lucide-react";
import {
  fetchMaster, fetchEntries, saveEntries as apiSaveEntries,
  fetchReport, saveReport as apiSaveReport, fetchStatusIndex,
  approveDikaji as apiApproveDikaji, approveMengetahui as apiApproveMengetahui,
  fetchActivityLog, changePassword as apiChangePassword,
  fetchVerify, generateNarrative,
  fetchFormulirBulanan, approveKepalaBagian as apiApproveKepalaBagian,
  approveManagerQAFormulir as apiApproveManagerQAFormulir,
} from "./api.js";
import { useAuth, hasAccess, hasFacilityAccess } from "./auth.js";
import { buildFacilityStats, generateLocalNarrative, fullDateID, monthLabelID } from "./narrativeGenerator.js";

/* ========================================================================= KONFIGURASI ========================================================================= */
const FACILITIES = [
  { key: "nbl", label: "NBL", department: "Produksi" },
  { key: "bl", label: "BL", department: "Produksi" },
  { key: "sefaNonSteril", label: "Sefa Non Steril", department: "Produksi" },
  { key: "sefaSteril", label: "Sefa Steril", department: "Produksi" },
  { key: "qc", label: "QC", department: "QC" },
  { key: "rnd", label: "RND", department: "RND" },
  { key: "gbbNbl", label: "GBB NBL", department: "GBB", altDepartment: "PPIC" },
  { key: "gbbBl", label: "GBB BL", department: "GBB", altDepartment: "PPIC" },
  { key: "gbbSefa", label: "GBB SEFA", department: "GBB", altDepartment: "PPIC" },
  { key: "gbj", label: "GBJ", department: "GBJ", altDepartment: "PPIC" },
  { key: "gbk", label: "GBK", department: "GBK", altDepartment: "PPIC" },
  { key: "pkrt", label: "PKRT", department: "PKRT" },
  { key: "alkes", label: "Alkes", department: "PKRT" },
];

const PARAM_DEFS = [
  { key: "suhu", label: "Suhu", unit: "°C" },
  { key: "rh", label: "RH", unit: "%" },
  { key: "dpg", label: "DPG", unit: "Pa" },
];

const SESI = ["08:00", "13:00"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(monthStr) {
  if (!monthStr) return 31;
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function toNumberSafe(v) {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function inRange(v, lower, upper) {
  if (lower !== null && lower !== undefined && v < lower) return false;
  if (upper !== null && upper !== undefined && v > upper) return false;
  return true;
}

function liveLevelFor(rawValue, limit) {
  if (!limit) return null;
  const allNull = [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU].every((x) => x === null || x === undefined);
  if (allNull) return null;
  if (rawValue === "-") return 1;
  const v = toNumberSafe(rawValue);
  if (v === null) return 0;
  if (inRange(v, limit.alertL, limit.alertU)) return 1;
  if (inRange(v, limit.actionL, limit.actionU)) return 2;
  if (inRange(v, limit.syaratL, limit.syaratU)) return 3;
  return 4;
}

const LEVEL_STYLE = {
  0: { label: "Belum diisi", color: "#64748b", bg: "#f1f5f9" },
  1: { label: "Terkendali", color: "#15803d", bg: "#dcfce7" },
  2: { label: "Alert", color: "#b45309", bg: "#fef3c7" },
  3: { label: "Action", color: "#c2410c", bg: "#ffedd5" },
  4: { label: "Melebihi Syarat", color: "#b91c1c", bg: "#fee2e2" },
};

function levelStyle(level) {
  if (level === null || level === undefined) return { label: "N/A", color: "#94a3b8", bg: "#f8fafc" };
  return LEVEL_STYLE[level] || LEVEL_STYLE[0];
}

function facilityOverallLevel(entries) {
  let max = 0;
  (entries || []).forEach((e) => {
    PARAM_DEFS.forEach((p) => {
      const lvl = e.level?.[p.key];
      if (lvl !== null && lvl !== undefined && lvl > max) max = lvl;
    });
  });
  return max;
}

/* ========================================================================= QR & VERIFIKASI TTD ========================================================================= */
function buildVerifyUrl(params) {
  const qs = new URLSearchParams(params).toString();
  return `${window.location.origin}/verify?${qs}`;
}

function VerifyQR({ type, facility, period, roomName, size = 26, hideLabel = true }) {
  const params = { type, facility };
  if (type === "pengkajian") { params.month = period; if (roomName) params.roomName = roomName; }
  else if (type === "formulir") { params.bulan = period; params.roomName = roomName; }
  else { params.type = "harian"; params.tanggal = period; }
  const url = buildVerifyUrl(params);

  return (
    <a href={url} target="_blank" rel="noreferrer" title="Klik untuk verifikasi tanda tangan" className="inline-flex flex-col items-center gap-0.5 hover:opacity-80">
      <QRCodeSVG value={url} size={size} level="M" bgColor="#ffffff" fgColor="#0f172a" />
      {!hideLabel && <span className="text-[9px] text-slate-400">Scan</span>}
    </a>
  );
}

/* ========================================================================= GRAFIK PERBANDINGAN HARIAN (CROSS-SECTIONAL) ========================================================================= */
function DayParamChart({ entriesForDay, rooms, paramKey, paramLabel, unit }) {
  const data = useMemo(() => {
    return rooms.map((r) => {
      const rowAm = entriesForDay.find((e) => e.roomName === r.name && e.jam === "08:00");
      const rowPm = entriesForDay.find((e) => e.roomName === r.name && e.jam === "13:00");
      const vAm = toNumberSafe(rowAm?.[paramKey]);
      const vPm = toNumberSafe(rowPm?.[paramKey]);
      const lim = r.limits?.[paramKey];
      return {
        roomName: r.name,
        code: r.code,
        valAm: vAm,
        valPm: vPm,
        syaratL: lim?.syaratL ?? null,
        syaratU: lim?.syaratU ?? null,
      };
    }).filter((d) => d.valAm !== null || d.valPm !== null);
  }, [entriesForDay, rooms, paramKey]);

  if (data.length === 0) {
    return (
      <div className="p-4 bg-slate-50 rounded-xl border border-dashed text-center text-xs text-slate-400">
        Belum ada data {paramLabel} yang tersimpan pada tanggal ini.
      </div>
    );
  }

  const refLim = data[0] || {};
  const allVals = data.flatMap((d) => [d.valAm, d.valPm, d.syaratL, d.syaratU]).filter((v) => v !== null && v !== undefined);
  const minVal = Math.min(...allVals, 0);
  const maxVal = Math.max(...allVals, 10);
  const yMin = minVal - (maxVal - minVal) * 0.1;
  const yMax = maxVal + (maxVal - minVal) * 0.1;

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm space-y-2">
      <div className="flex flex-wrap items-center justify-between text-xs border-b pb-2">
        <span className="font-bold text-slate-700">{paramLabel} — Perbandingan Ruangan (Tanggal Terpilih)</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600"/> 08:00</span>
          <span className="flex items-center gap-1 text-[11px] text-rose-800 font-medium"><span className="w-2.5 h-2.5 rounded-full bg-rose-800"/> 13:00</span>
          <span className="flex items-center gap-1 text-[11px] text-red-600 font-semibold">--- Syarat</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          {refLim.syaratL !== null && <ReferenceLine y={refLim.syaratL} stroke="#dc2626" strokeWidth={1.2} strokeDasharray="3 3" />}
          {refLim.syaratU !== null && <ReferenceLine y={refLim.syaratU} stroke="#dc2626" strokeWidth={1.2} strokeDasharray="3 3" />}
          <XAxis dataKey="roomName" tick={{ fontSize: 10, fill: "#64748b" }} angle={-25} textAnchor="end" interval={0} height={40} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: "#64748b" }} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <div className="bg-white p-2.5 border rounded-lg shadow-md text-xs space-y-1">
                <p className="font-bold text-slate-700">{p.roomName}</p>
                <p className="text-emerald-700 font-medium">08:00 : {p.valAm !== null ? `${p.valAm} ${unit}` : "-"}</p>
                <p className="text-rose-800 font-medium">13:00 : {p.valPm !== null ? `${p.valPm} ${unit}` : "-"}</p>
              </div>
            );
          }} />
          <Line type="monotone" dataKey="valAm" stroke="#059669" strokeWidth={2} dot={{ r: 4, fill: "#059669" }} />
          <Line type="monotone" dataKey="valPm" stroke="#9f1239" strokeWidth={2} dot={{ r: 4, fill: "#9f1239" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================================================================= TOPBAR & LOGIN ========================================================================= */
function TopBar({ session, onLoginClick, onLogout, view, setView }) {
  return (
    <div className="no-print border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <button onClick={() => setView({ page: "dashboard" })} className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <img src="/logo-rama.png" alt="Logo" className="h-8 w-8 object-contain" />
          EM Non Viable — PT. Rama Emerald Multi Sukses
        </button>
        <div className="flex items-center gap-2">
          {session && hasAccess(session, "Supervisor") && (
            <button onClick={() => setView({ page: "activity" })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view.page === "activity" ? "bg-rose-900 text-white" : "border border-slate-300 text-slate-600 hover:bg-rose-50"}`}>
              <History size={14} /> Riwayat Aktivitas
            </button>
          )}
          {session ? (
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
                <User size={13} /> {session.nama} · {session.role}
              </span>
              <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <LogOut size={14} /> Keluar
              </button>
            </div>
          ) : (
            <button onClick={onLoginClick} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-900 shadow-sm">
              <LogIn size={14} /> Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginModal({ onClose, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (ev) => {
    ev.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onLogin(username.trim(), password);
      onClose();
    } catch (err) {
      setError(err.message || "Login gagal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border">
        <div className="mb-4 flex items-center gap-2">
          <Lock size={18} className="text-rose-700" />
          <h3 className="text-base font-bold text-slate-800">Login EM Non Viable</h3>
        </div>
        <form onSubmit={submit}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Username</label>
          <input autoFocus type="text" value={username} onChange={(ev) => setUsername(ev.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-700 focus:outline-none" />
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
          <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-700 focus:outline-none" />
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600">Batal</button>
            <button type="submit" disabled={submitting || !username || !password}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-900 disabled:opacity-60">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null} Masuk
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ========================================================================= DASHBOARD REKAP ========================================================================= */
function Dashboard({ month, setMonth, setView, session, onNeedLogin }) {
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatusError("");
    fetchStatusIndex(month)
      .then((d) => { if (!cancelled) setStatus(d); })
      .catch((err) => { if (!cancelled) setStatusError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const perluCount = FACILITIES.filter((f) => (status[f.key]?.level || 0) === 3).length;
  const tmsCount = FACILITIES.filter((f) => (status[f.key]?.level || 0) >= 4).length;
  const terkendaliCount = FACILITIES.filter((f) => status[f.key]?.hasData && (status[f.key]?.level || 0) < 3).length;
  const belumAdaCount = FACILITIES.filter((f) => !status[f.key]?.hasData).length;

  return (
    <div>
      <div className="relative overflow-hidden bg-gradient-to-br from-black via-zinc-950 to-rose-950 border-b border-rose-900/40">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-rose-600/20 blur-3xl" />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">PT. Rama Emerald Multi Sukses — QA</p>
            <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard EM Non Viable</h1>
            <p className="mt-1 text-sm text-rose-100/90">Pemantauan Suhu, Kelembaban (RH), dan Perbedaan Tekanan (DPG)</p>
          </div>
          <label className="no-print inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm">
            <Calendar size={15} className="text-rose-300" />
            <input type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} onClick={(ev) => ev.currentTarget.showPicker?.()}
              className="border-none bg-transparent text-sm text-white outline-none [color-scheme:dark]" />
          </label>
        </div>
      </div>
      <div className="mx-auto max-w-6xl p-6">
        {statusError && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{statusError}</p>}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border p-4 bg-rose-50/50 border-rose-200">
            <p className="text-2xl font-bold text-rose-950">{FACILITIES.length}</p>
            <p className="text-xs font-medium text-slate-600">Total Fasilitas</p>
          </div>
          <div className="rounded-xl border p-4 bg-emerald-50 border-emerald-200">
            <p className="text-2xl font-bold text-emerald-800">{terkendaliCount}</p>
            <p className="text-xs font-medium text-slate-600">Terkendali</p>
          </div>
          <div className="rounded-xl border p-4 bg-amber-50 border-amber-200">
            <p className="text-2xl font-bold text-amber-800">{perluCount}</p>
            <p className="text-xs font-medium text-slate-600">Perlu Perhatian</p>
          </div>
          <div className="rounded-xl border p-4 bg-red-50 border-red-200">
            <p className="text-2xl font-bold text-red-800">{tmsCount}</p>
            <p className="text-xs font-medium text-slate-600">Melebihi Syarat</p>
          </div>
          <div className="rounded-xl border p-4 bg-slate-50 border-slate-200">
            <p className="text-2xl font-bold text-slate-700">{belumAdaCount}</p>
            <p className="text-xs font-medium text-slate-600">Belum Ada Data</p>
          </div>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Pilih Fasilitas — {monthLabelID(month)}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FACILITIES.map((f) => {
            const st = status[f.key];
            const level = st?.hasData ? (st?.level || 0) : 0;
            const lvlStyle = levelStyle(level);
            return (
              <button key={f.key} onClick={() => { if (!session) onNeedLogin(); else setView({ page: "facility", facility: f.key }); }}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-rose-700 hover:shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-900 font-bold text-sm">
                    <Building2 size={20} />
                  </span>
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: lvlStyle.bg, color: lvlStyle.color }}>
                    {st?.hasData ? lvlStyle.label : "Belum Ada Data"}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-base">{f.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Departemen: {f.department}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= HALAMAN INPUT HARIAN + GRAFIK + APPROVAL (ALL-IN-ONE) ========================================================================= */
function FacilityIntegratedPage({ session, facilityKey, month, setMonth, setView }) {
  const cfg = FACILITIES.find((f) => f.key === facilityKey);
  const canInput = hasFacilityAccess(session, "Staff", cfg);
  const canApproveSPV = hasFacilityAccess(session, "Supervisor", cfg);
  const isOperator = session.role === "Staff" || session.role === "Administrator";
  const canDraftQA = hasAccess(session, "Supervisor", "QA");
  const canFinalQA = hasAccess(session, "Manager", "QA");

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [rooms, setRooms] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // State nilai input untuk seluruh ruangan pada selectedDate: { [roomName]: { "08:00": {suhu,rh,dpg,opr,spv}, "13:00": {...} } }
  const [gridValues, setGridValues] = useState({});

  // State Narasi
  const [pendahuluan, setPendahuluan] = useState("");
  const [kesimpulanUmum, setKesimpulanUmum] = useState("");
  const [perParameter, setPerParameter] = useState({ suhu: "", rh: "", dpg: "" });
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [roomList, entryList, reportRes] = await Promise.all([
        fetchMaster(facilityKey),
        fetchEntries(facilityKey, month),
        fetchReport(facilityKey, month, session.token),
      ]);
      setRooms(roomList);
      setMonthEntries(entryList);
      setReport(reportRes);
      setPendahuluan(reportRes.narrative?.pendahuluan || "");
      setKesimpulanUmum(reportRes.narrative?.kesimpulanUmum || "");
      setPerParameter(reportRes.narrative?.perParameter || { suhu: "", rh: "", dpg: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey, month, session.token]);

  useEffect(() => { loadData(); }, [loadData]);

  // Siapkan grid nilai input tiap kali selectedDate atau monthEntries berubah
  useEffect(() => {
    if (rooms.length === 0) return;
    const initialGrid = {};
    rooms.forEach((r) => {
      initialGrid[r.name] = {
        "08:00": { suhu: "", rh: "", dpg: "", opr: "", spv: "" },
        "13:00": { suhu: "", rh: "", dpg: "", opr: "", spv: "" },
      };
      // Terapkan default "-" bila parameter memang tidak dipersyaratkan
      SESI.forEach((jam) => {
        PARAM_DEFS.forEach((p) => {
          if (!r.required?.[p.key]) initialGrid[r.name][jam][p.key] = "-";
        });
      });
    });

    // Masukkan data tersimpan jika sudah ada
    monthEntries.filter((e) => e.tanggal === selectedDate).forEach((e) => {
      if (initialGrid[e.roomName] && initialGrid[e.roomName][e.jam]) {
        initialGrid[e.roomName][e.jam] = {
          suhu: e.suhu ?? (rooms.find((r) => r.name === e.roomName)?.required?.suhu ? "" : "-"),
          rh: e.rh ?? (rooms.find((r) => r.name === e.roomName)?.required?.rh ? "" : "-"),
          dpg: e.dpg ?? (rooms.find((r) => r.name === e.roomName)?.required?.dpg ? "" : "-"),
          opr: e.opr || "",
          spv: e.spv || "",
        };
      }
    });

    setGridValues(initialGrid);
  }, [selectedDate, monthEntries, rooms]);

  function handleCellChange(roomName, jam, field, val) {
    const normalized = (field === "suhu" || field === "rh" || field === "dpg") ? val.replace(/\./g, ",") : val;
    setGridValues((prev) => ({
      ...prev,
      [roomName]: {
        ...prev[roomName],
        [jam]: {
          ...prev[roomName][jam],
          [field]: normalized,
        },
      },
    }));
  }

  // Simpan data (tanpa mengubah status approval)
  async function handleSaveDataOnly() {
    setSaving(true);
    setError("");
    try {
      const todayRows = [];
      rooms.forEach((r) => {
        SESI.forEach((jam) => {
          const v = gridValues[r.name]?.[jam] || {};
          const anyFilled = PARAM_DEFS.some((p) => v[p.key] && v[p.key] !== "-");
          if (anyFilled) {
            todayRows.push({
              id: `${r.name}|${selectedDate}|${jam}`,
              tanggal: selectedDate,
              jam,
              roomName: r.name,
              persyaratanKey: r.persyaratanKey,
              suhu: v.suhu === "" || v.suhu === "-" ? null : v.suhu,
              rh: v.rh === "" || v.rh === "-" ? null : v.rh,
              dpg: v.dpg === "" || v.dpg === "-" ? null : v.dpg,
              opr: v.opr || "",
              spv: v.spv || "",
            });
          }
        });
      });

      const otherRows = monthEntries
        .filter((e) => e.tanggal !== selectedDate)
        .map((e) => ({ ...e, id: `${e.roomName}|${e.tanggal}|${e.jam}` }));

      const merged = otherRows.concat(todayRows);
      await apiSaveEntries(facilityKey, month, merged, session.token);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // APPROVE SEMUA RUANGAN OLEH OPR (SEKALIGUS)
  async function handleApproveOprBatch() {
    setSaving(true);
    setError("");
    try {
      const todayRows = [];
      rooms.forEach((r) => {
        SESI.forEach((jam) => {
          const v = gridValues[r.name]?.[jam] || {};
          const anyFilled = PARAM_DEFS.some((p) => v[p.key] && v[p.key] !== "-");
          if (anyFilled) {
            todayRows.push({
              id: `${r.name}|${selectedDate}|${jam}`,
              tanggal: selectedDate,
              jam,
              roomName: r.name,
              persyaratanKey: r.persyaratanKey,
              suhu: v.suhu === "" || v.suhu === "-" ? null : v.suhu,
              rh: v.rh === "" || v.rh === "-" ? null : v.rh,
              dpg: v.dpg === "" || v.dpg === "-" ? null : v.dpg,
              opr: session.nama, // Auto set TTD Operator
              spv: v.spv || "",
            });
          }
        });
      });

      if (todayRows.length === 0) {
        throw new Error("Belum ada nilai yang diinput untuk di-approve pada tanggal ini.");
      }

      const otherRows = monthEntries.filter((e) => e.tanggal !== selectedDate);
      await apiSaveEntries(facilityKey, month, otherRows.concat(todayRows), session.token);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // APPROVE SEMUA RUANGAN OLEH SPV (SEKALIGUS & KUNCI)
  async function handleApproveSpvBatch() {
    setSaving(true);
    setError("");
    try {
      const todayRows = [];
      rooms.forEach((r) => {
        SESI.forEach((jam) => {
          const v = gridValues[r.name]?.[jam] || {};
          const anyFilled = PARAM_DEFS.some((p) => v[p.key] && v[p.key] !== "-");
          if (anyFilled) {
            todayRows.push({
              id: `${r.name}|${selectedDate}|${jam}`,
              tanggal: selectedDate,
              jam,
              roomName: r.name,
              persyaratanKey: r.persyaratanKey,
              suhu: v.suhu === "" || v.suhu === "-" ? null : v.suhu,
              rh: v.rh === "" || v.rh === "-" ? null : v.rh,
              dpg: v.dpg === "" || v.dpg === "-" ? null : v.dpg,
              opr: v.opr || session.nama,
              spv: session.nama, // Auto set TTD SPV (Lock)
            });
          }
        });
      });

      if (todayRows.length === 0) {
        throw new Error("Tidak ada data ruangan untuk di-approve SPV pada tanggal ini.");
      }

      const otherRows = monthEntries.filter((e) => e.tanggal !== selectedDate);
      await apiSaveEntries(facilityKey, month, otherRows.concat(todayRows), session.token);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Narasi QA Handler
  async function handleSaveReport() {
    setError("");
    try {
      await apiSaveReport(facilityKey, month, { pendahuluan, kesimpulanUmum, perParameter }, session.token);
      await loadData();
    } catch (err) { setError(err.message); }
  }

  async function handleGenerateAI() {
    setGenerating(true);
    setError("");
    try {
      const facilityStats = buildFacilityStats({ facilityLabel: cfg.label, monthLabel: monthLabelID(month), entries: monthEntries, rooms });
      let narrative;
      try {
        narrative = await generateNarrative({ facilityLabel: cfg.label, monthLabel: monthLabelID(month), stats: facilityStats.stats });
      } catch (aiErr) {
        narrative = generateLocalNarrative({ facilityLabel: cfg.label, monthLabel: monthLabelID(month), entries: monthEntries, rooms });
        setError("Narasi AI gagal (" + aiErr.message + ") — digunakan draf lokal.");
      }
      setPendahuluan(narrative.pendahuluan || "");
      setPerParameter(narrative.perParameter || {});
      setKesimpulanUmum(narrative.kesimpulanUmum || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDikaji() {
    try { await apiApproveDikaji(facilityKey, month, session.token); await loadData(); } catch (err) { setError(err.message); }
  }
  async function handleMengetahui() {
    try { await apiApproveMengetahui(facilityKey, month, session.token); await loadData(); } catch (err) { setError(err.message); }
  }

  const entriesForChart = useMemo(() => {
    return monthEntries.filter((e) => e.tanggal === selectedDate);
  }, [monthEntries, selectedDate]);

  const currentLevel = facilityOverallLevel(monthEntries);
  const isFinalApproved = !!report?.signoff?.diperiksa?.nama;

  // Status kunci SPV pada tanggal ini (jika semua baris sudah ada SPV)
  const isDaySpvApproved = entriesForChart.length > 0 && entriesForChart.every((e) => !!e.spv);
  const isDayOprApproved = entriesForChart.length > 0 && entriesForChart.every((e) => !!e.opr);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 print:max-w-none print:p-0">
      {/* Header bar navigasi */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft size={16} /> Kembali ke Dashboard
        </button>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700">
            <Calendar size={13} className="text-rose-800" />
            <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setSelectedDate(`${e.target.value}-01`); }} className="outline-none" />
          </label>
          {rooms.length > 0 && (
            <button onClick={() => setView({ page: "formulir", facility: facilityKey, room: rooms[0]?.name, bulan: month })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <FileCheck2 size={13} /> Formulir Bulanan (FM.QA.024/R11)
            </button>
          )}
        </div>
      </div>

      {/* HEADER BANNER KOP */}
      <div className="overflow-hidden rounded-xl border border-slate-200 print-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-r from-black via-zinc-950 to-rose-950 px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-rose-600/20 blur-3xl" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-start gap-3">
              <img src="/logo-rama.png" alt="Logo" className="h-11 w-11 object-contain brightness-0 invert" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-300">PT. Rama Emerald Multi Sukses — QA</p>
                <h1 className="text-lg font-bold text-white tracking-tight">Pengkajian Trend Data Environment Monitoring (EM) Non Viable</h1>
                <p className="text-xs text-rose-100/90">Fasilitas: <span className="font-semibold text-white">{cfg?.label}</span> · Periode: <span className="font-semibold text-white">{monthLabelID(month)}</span></p>
              </div>
            </div>
            <p className="text-right text-[11px] text-rose-200">No. Formulir: FM.QA.024/R11</p>
          </div>
        </div>
        <div className="flex items-center justify-between bg-white px-5 py-2.5 border-t border-slate-100 text-xs">
          <span className="text-slate-400">Status keseluruhan fasilitas periode ini:</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold" style={{ background: levelStyle(currentLevel).bg, color: levelStyle(currentLevel).color }}>
            {levelStyle(currentLevel).label}
          </span>
        </div>
      </div>

      {error && <p className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200 whitespace-pre-line">{error}</p>}

      {/* SECTION 1: TABEL INPUT HARIAN SELURUH RUANGAN */}
      <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700">Tanggal Pengukuran:</label>
            <input type="date" value={selectedDate} max={todayStr()} onChange={(e) => setSelectedDate(e.target.value)}
              className="border rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none focus:border-rose-700" />
            <button onClick={() => setSelectedDate(todayStr())} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-600">
              Hari Ini
            </button>
            {isDaySpvApproved && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-rose-50 text-rose-800 font-semibold px-2 py-0.5 rounded border border-rose-200">
                <Lock size={11} /> Terkunci (Disetujui SPV)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canInput && !isDaySpvApproved && (
              <>
                <button onClick={handleSaveDataOnly} disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Simpan Draf
                </button>
                {isOperator && (
                  <button onClick={handleApproveOprBatch} disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50">
                    <CheckCheck size={14} /> Approve OPR (Semua Ruang)
                  </button>
                )}
              </>
            )}
            {canApproveSPV && !isDaySpvApproved && (
              <button onClick={handleApproveSpvBatch} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-900 hover:bg-rose-950 text-white shadow-sm disabled:opacity-50">
                <FileCheck2 size={14} /> Approve SPV &amp; Kunci (Semua Ruang)
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b">
                <th className="px-3 py-2 text-left w-56">RUANGAN</th>
                <th className="px-2 py-2 text-center w-16">JAM</th>
                <th className="px-2 py-2 text-center w-24">SUHU (°C)</th>
                <th className="px-2 py-2 text-center w-24">RH (%)</th>
                <th className="px-2 py-2 text-center w-24">DPG (Pa)</th>
                <th className="px-2 py-2 text-center w-36">OPR (TTD)</th>
                <th className="px-2 py-2 text-center w-36">SPV (TTD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rooms.map((r) => {
                return SESI.map((jam, jamIdx) => {
                  const v = gridValues[r.name]?.[jam] || {};
                  const sLvl = liveLevelFor(v.suhu, r.limits?.suhu);
                  const rLvl = liveLevelFor(v.rh, r.limits?.rh);
                  const dLvl = liveLevelFor(v.dpg, r.limits?.dpg);
                  const isLocked = isDaySpvApproved || !!v.spv;

                  return (
                    <tr key={r.code + jam} className={jamIdx === 0 ? "border-t border-slate-200" : "bg-slate-50/30"}>
                      {jamIdx === 0 ? (
                        <td rowSpan={2} className="px-3 py-2 align-middle font-semibold text-slate-800 border-r border-slate-100">
                          {r.name}
                          <span className="block text-[10px] text-slate-400 font-normal">{r.code}</span>
                        </td>
                      ) : null}
                      <td className="px-2 py-1.5 text-center font-medium text-slate-500">{jam}</td>
                      <td className="px-2 py-1.5 text-center">
                        <input value={v.suhu ?? ""} onChange={(e) => handleCellChange(r.name, jam, "suhu", e.target.value)}
                          placeholder={r.required?.suhu ? "" : "N/A"} disabled={isLocked || !r.required?.suhu || !canInput}
                          className="w-16 text-center border rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-rose-700 disabled:bg-slate-50"
                          style={{ background: v.suhu && v.suhu !== "-" ? levelStyle(sLvl).bg : undefined, color: v.suhu && v.suhu !== "-" ? levelStyle(sLvl).color : undefined }} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input value={v.rh ?? ""} onChange={(e) => handleCellChange(r.name, jam, "rh", e.target.value)}
                          placeholder={r.required?.rh ? "" : "N/A"} disabled={isLocked || !r.required?.rh || !canInput}
                          className="w-16 text-center border rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-rose-700 disabled:bg-slate-50"
                          style={{ background: v.rh && v.rh !== "-" ? levelStyle(rLvl).bg : undefined, color: v.rh && v.rh !== "-" ? levelStyle(rLvl).color : undefined }} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input value={v.dpg ?? ""} onChange={(e) => handleCellChange(r.name, jam, "dpg", e.target.value)}
                          placeholder={r.required?.dpg ? "" : "N/A"} disabled={isLocked || !r.required?.dpg || !canInput}
                          className="w-16 text-center border rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-rose-700 disabled:bg-slate-50"
                          style={{ background: v.dpg && v.dpg !== "-" ? levelStyle(dLvl).bg : undefined, color: v.dpg && v.dpg !== "-" ? levelStyle(dLvl).color : undefined }} />
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-600">
                        {v.opr ? (
                          <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                            <span className="font-medium text-[11px] truncate max-w-[80px]">{v.opr}</span>
                            <VerifyQR type="harian" facility={facilityKey} period={selectedDate} />
                          </div>
                        ) : <span className="text-slate-300 italic text-[11px]">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-600">
                        {v.spv ? (
                          <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-900 px-2 py-0.5 rounded border border-rose-200">
                            <span className="font-medium text-[11px] truncate max-w-[80px]">{v.spv}</span>
                            <VerifyQR type="harian" facility={facilityKey} period={selectedDate} />
                          </div>
                        ) : <span className="text-slate-300 italic text-[11px]">—</span>}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: GRAFIK CROSS-SECTIONAL (1 HARI SELURUH RUANGAN) */}
      <div className="bg-white rounded-xl border p-4 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Grafik Perbandingan Seluruh Ruangan ({selectedDate})</h2>
          <p className="text-xs text-slate-400">Grafik otomatis terbentuk dari data seluruh ruangan pada tanggal yang sedang dibuka</p>
        </div>
        <div className="space-y-4">
          <DayParamChart entriesForDay={entriesForChart} rooms={rooms} paramKey="suhu" paramLabel="Suhu" unit="°C" />
          <DayParamChart entriesForDay={entriesForChart} rooms={rooms} paramKey="rh" paramLabel="Kelembaban Relatif (RH)" unit="%" />
          <DayParamChart entriesForDay={entriesForChart} rooms={rooms} paramKey="dpg" paramLabel="Perbedaan Tekanan (DPG)" unit="Pa" />
        </div>
      </div>

      {/* SECTION 3: PEMBAHASAN & NARASI BULANAN QA */}
      <div className="bg-white rounded-xl border p-5 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">Pembahasan &amp; Narasi Pengkajian</h2>
            <p className="text-xs text-slate-400">Disusun oleh QA mengacu pada Protap POS.QA.025</p>
          </div>
          {canDraftQA && !isFinalApproved && (
            <div className="flex items-center gap-2 no-print">
              <button onClick={handleGenerateAI} disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-800 hover:bg-rose-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60">
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate Narasi AI
              </button>
              <button onClick={handleSaveReport} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white">
                <Save size={13} /> Simpan Draf
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Pendahuluan</label>
          <textarea value={pendahuluan} onChange={(e) => setPendahuluan(e.target.value)} disabled={!canDraftQA || isFinalApproved} rows={2}
            className="w-full border rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-rose-700 disabled:bg-slate-50" />
        </div>

        {PARAM_DEFS.map((p) => (
          <div key={p.key} className="space-y-1.5 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700">Hasil, Tren &amp; Kesimpulan — {p.label} ({p.unit})</label>
            <textarea value={perParameter[p.key] || ""} onChange={(e) => setPerParameter({ ...perParameter, [p.key]: e.target.value })}
              disabled={!canDraftQA || isFinalApproved} rows={3}
              placeholder={`Tulis ulasan hasil, tren, dan kesimpulan untuk parameter ${p.label}...`}
              className="w-full border rounded-lg p-2.5 text-xs text-slate-800 bg-white outline-none focus:border-rose-700 disabled:bg-slate-50" />
          </div>
        ))}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Kesimpulan Umum</label>
          <textarea value={kesimpulanUmum} onChange={(e) => setKesimpulanUmum(e.target.value)} disabled={!canDraftQA || isFinalApproved} rows={3}
            className="w-full border rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-rose-700 disabled:bg-slate-50" />
        </div>

        {/* SECTION 4: TANDA TANGAN (SIGN-OFF QA) */}
        <div className="pt-4 border-t space-y-3">
          <p className="text-xs font-bold text-slate-700">Tanda Tangan Pengkajian Bulanan</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border rounded-xl p-4 bg-slate-50/50 text-center flex flex-col justify-between min-h-[140px]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dikaji Oleh (Supervisor QA)</p>
              {report?.signoff?.dinilai?.nama ? (
                <div className="space-y-1 my-auto">
                  <div className="flex justify-center"><VerifyQR type="pengkajian" facility={facilityKey} period={month} size={54} /></div>
                  <p className="text-xs font-bold text-slate-800">{report.signoff.dinilai.nama}</p>
                  <p className="text-[10px] text-slate-400">{report.signoff.dinilai.tanggal}</p>
                </div>
              ) : (
                <div className="my-auto space-y-2">
                  <p className="text-xs italic text-slate-400">Belum disetujui</p>
                  {canDraftQA && (
                    <button onClick={handleDikaji} className="px-3 py-1 bg-rose-800 hover:bg-rose-900 text-white rounded text-xs font-semibold">
                      Approve "Dikaji Oleh"
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="border rounded-xl p-4 bg-slate-50/50 text-center flex flex-col justify-between min-h-[140px]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Mengetahui (Manager QA)</p>
              {report?.signoff?.diperiksa?.nama ? (
                <div className="space-y-1 my-auto">
                  <div className="flex justify-center"><VerifyQR type="pengkajian" facility={facilityKey} period={month} size={54} /></div>
                  <p className="text-xs font-bold text-slate-800">{report.signoff.diperiksa.nama}</p>
                  <p className="text-[10px] text-slate-400">{report.signoff.diperiksa.tanggal}</p>
                </div>
              ) : (
                <div className="my-auto space-y-2">
                  <p className="text-xs italic text-slate-400">{report?.signoff?.dinilai?.nama ? "Menunggu approval Manager QA" : "Menunggu approval 'Dikaji Oleh' terlebih dahulu"}</p>
                  {canFinalQA && report?.signoff?.dinilai?.nama && (
                    <button onClick={handleMengetahui} className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold">
                      Approve Final "Mengetahui"
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= FORMULIR BULANAN CETAK (FM.QA.024/R11) ========================================================================= */
function FormulirBulananPrint({ session, facilityKey, roomName, bulan, setView }) {
  const cfg = FACILITIES.find((f) => f.key === facilityKey);
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(roomName || "");
  const [entries, setEntries] = useState([]);
  const [formulir, setFormulir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const canKepalaBagian = cfg ? hasFacilityAccess(session, "Supervisor", cfg) : false;
  const canManagerQA = hasAccess(session, "Manager", "QA");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [master, entriesRes, formulirRes] = await Promise.all([
        fetchMaster(facilityKey),
        fetchEntries(facilityKey, bulan),
        fetchFormulirBulanan(facilityKey, bulan, selectedRoom, session.token),
      ]);
      const roomList = Array.isArray(master) ? master : (master.rooms || []);
      setRooms(roomList);
      const targetRoom = selectedRoom || roomList[0]?.name || "";
      setSelectedRoom(targetRoom);
      const list = Array.isArray(entriesRes) ? entriesRes : (entriesRes.entries || []);
      setEntries(list.filter((e) => String(e.roomName).trim() === String(targetRoom).trim()));
      setFormulir(formulirRes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [facilityKey, bulan, selectedRoom, session.token]);

  useEffect(() => { load(); }, [load]);

  const n = daysInMonth(bulan);
  const byDay = {};
  entries.forEach((e) => { byDay[e.tanggal + "|" + e.jam] = e; });
  const roomObj = rooms.find((r) => r.name === selectedRoom) || rooms[0];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 print:max-w-none print:p-0 space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setView({ page: "facility", facility: facilityKey })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft size={16} /> Kembali ke {cfg?.label}
        </button>
        <div className="flex items-center gap-2">
          <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold outline-none">
            {rooms.map((r) => <option key={r.code} value={r.name}>{r.name} ({r.code})</option>)}
          </select>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Printer size={14} /> Cetak
          </button>
        </div>
      </div>

      <div className="print-card avoid-break rounded-xl border-2 border-slate-800 bg-white p-5 text-xs">
        <div className="mb-4 flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <img src="/logo-rama.png" alt="Logo" className="h-12 w-12 object-contain" />
            <div>
              <p className="text-[11px] font-bold text-slate-700">PT. Rama Emerald</p>
              <p className="text-[11px] font-bold text-slate-700">Multi Sukses</p>
            </div>
          </div>
          <div className="flex-1 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-800">Check List Pemantauan Suhu, Kelembaban dan Perbedaan Tekanan</p>
          </div>
          <div className="whitespace-nowrap text-right text-[11px] text-slate-600">
            <p>No. : <span className="font-semibold">FM.QA.024/R11</span></p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <p><span className="font-semibold text-slate-600">Bulan - Tahun</span> : {monthLabelID(bulan)}</p>
            <p><span className="font-semibold text-slate-600">Gedung</span> : {cfg?.label}</p>
            <p><span className="font-semibold text-slate-600">Nama Ruang / No. Ruang</span> : {roomObj?.name} ({roomObj?.code})</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <th rowSpan={2} className="border border-slate-400 bg-slate-100 px-1 py-1">Tanggal</th>
                <th colSpan={5} className="border border-slate-400 bg-slate-100 px-1 py-1">Jam 08.00</th>
                <th colSpan={5} className="border border-slate-400 bg-slate-100 px-1 py-1">Jam 13.00</th>
              </tr>
              <tr>
                {["Suhu (°C)", "RH (%)", "DPG (Pa)", "OPR", "SPV", "Suhu (°C)", "RH (%)", "DPG (Pa)", "OPR", "SPV"].map((h, i) => (
                  <th key={i} className="border border-slate-400 bg-slate-50 px-1 py-1 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
                const tanggal = `${bulan}-${String(d).padStart(2, "0")}`;
                const am = byDay[tanggal + "|08:00"];
                const pm = byDay[tanggal + "|13:00"];
                return (
                  <tr key={d}>
                    <td className="border border-slate-300 px-1 py-0.5 text-center font-medium">{d}</td>
                    {[am, pm].flatMap((e, idx) => [
                      <td key={idx + "s"} className="border border-slate-300 px-1 py-0.5 text-center">{e?.suhu ?? ""}</td>,
                      <td key={idx + "r"} className="border border-slate-300 px-1 py-0.5 text-center">{e?.rh ?? ""}</td>,
                      <td key={idx + "d"} className="border border-slate-300 px-1 py-0.5 text-center">{e?.dpg ?? ""}</td>,
                      <td key={idx + "o"} className="border border-slate-300 px-1 py-0.5 text-center">{e?.opr || ""}</td>,
                      <td key={idx + "p"} className="border border-slate-300 px-1 py-0.5 text-center">{e?.spv || ""}</td>,
                    ])}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 text-center">
          <div>
            <p className="mb-2 text-[11px] text-slate-500">(Kepala Bagian)</p>
            {formulir?.kepalaBagian?.nama ? (
              <>
                <div className="mb-1 flex justify-center"><VerifyQR type="formulir" facility={facilityKey} period={bulan} roomName={selectedRoom} size={50} /></div>
                <p className="text-xs font-semibold text-slate-800">{formulir.kepalaBagian.nama}</p>
                <p className="text-[10px] text-slate-400">{formulir.kepalaBagian.tanggal}</p>
              </>
            ) : canKepalaBagian ? (
              <button onClick={async () => { setBusy(true); await apiApproveKepalaBagian(facilityKey, bulan, selectedRoom, session.token); await load(); setBusy(false); }} disabled={busy} className="no-print bg-emerald-600 px-3 py-1 text-white rounded text-xs">Approve (Kepala Bagian)</button>
            ) : <p className="italic text-slate-400">Belum di-ACC</p>}
          </div>
          <div>
            <p className="mb-2 text-[11px] text-slate-500">(Manager QA)</p>
            {formulir?.managerQA?.nama ? (
              <>
                <div className="mb-1 flex justify-center"><VerifyQR type="formulir" facility={facilityKey} period={bulan} roomName={selectedRoom} size={50} /></div>
                <p className="text-xs font-semibold text-slate-800">{formulir.managerQA.nama}</p>
                <p className="text-[10px] text-slate-400">{formulir.managerQA.tanggal}</p>
              </>
            ) : canManagerQA ? (
              <button onClick={async () => { setBusy(true); await apiApproveManagerQAFormulir(facilityKey, bulan, session.token); await load(); setBusy(false); }} disabled={busy} className="no-print bg-rose-900 px-3 py-1 text-white rounded text-xs">Approve (Manager QA)</button>
            ) : <p className="italic text-slate-400">Belum di-ACC</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= RIWAYAT AKTIVITAS ========================================================================= */
function ActivityPage({ session, month, setView }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivityLog(session.token, { month })
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [session.token, month]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ChevronLeft size={16} /> Kembali ke Dashboard
      </button>
      <h2 className="text-lg font-bold text-slate-800">Riwayat Aktivitas ({monthLabelID(month)})</h2>
      {loading ? <Loader2 size={16} className="animate-spin" /> : (
        <div className="bg-white rounded-xl border divide-y text-xs">
          {logs.map((l, i) => (
            <div key={i} className="p-3 flex justify-between">
              <div>
                <span className="font-semibold text-slate-700">{l.nama}</span> ({l.role}) — <span className="text-slate-600">{l.aksi}</span>
                {l.detail && <p className="text-slate-400 text-[11px] mt-0.5">{l.detail}</p>}
              </div>
              <span className="text-slate-400 text-[10px]">{new Date(l.waktu).toLocaleString("id-ID")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================================================= VERIFIKASI QR PUBLIK (/verify) ========================================================================= */
function VerifyPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const type = params.get("type");
  const facilityKey = params.get("facility");
  const roomName = params.get("roomName") || "";
  const period = type === "pengkajian" ? params.get("month") : type === "formulir" ? params.get("bulan") : params.get("tanggal");
  const facility = FACILITIES.find((f) => f.key === facilityKey);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVerify(type, facilityKey, period, roomName).then(setData).finally(() => setLoading(false));
  }, [type, facilityKey, period, roomName]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-xl border bg-white p-5 text-center space-y-3 shadow-sm">
        <CheckCircle2 size={32} className="text-emerald-600 mx-auto" />
        <h2 className="font-bold text-slate-800">Verifikasi Dokumen Sah</h2>
        <p className="text-xs text-slate-500">PT. Rama Emerald Multi Sukses — EM Non Viable</p>
        <div className="bg-slate-50 p-3 rounded-lg text-left text-xs space-y-1">
          <p><span className="text-slate-400">Fasilitas:</span> {facility?.label}</p>
          <p><span className="text-slate-400">Periode / Tanggal:</span> {period}</p>
          {roomName && <p><span className="text-slate-400">Ruangan:</span> {roomName}</p>}
          {data?.approvedBy && <p><span className="text-slate-400">Disetujui Oleh:</span> {data.approvedBy.nama}</p>}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= ROOT APP ========================================================================= */
export default function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/verify") {
    return <VerifyPage />;
  }
  const { session, checking, login, logout } = useAuth();
  const [view, setView] = useState({ page: "dashboard" });
  const [month, setMonth] = useState(currentMonth());
  const [showLogin, setShowLogin] = useState(false);

  if (checking) return <div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar session={session} onLoginClick={() => setShowLogin(true)} onLogout={logout} view={view} setView={setView} />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={login} />}
      {view.page === "dashboard" && <Dashboard month={month} setMonth={setMonth} setView={setView} session={session} onNeedLogin={() => setShowLogin(true)} />}
      {view.page === "facility" && session && <FacilityIntegratedPage session={session} facilityKey={view.facility} month={month} setMonth={setMonth} setView={setView} />}
      {view.page === "formulir" && session && <FormulirBulananPrint session={session} facilityKey={view.facility} roomName={view.room} bulan={view.bulan || month} setView={setView} />}
      {view.page === "activity" && session && <ActivityPage session={session} month={month} setView={setView} />}
    </div>
  );
}