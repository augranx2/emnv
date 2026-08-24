import { useState, useEffect, useCallback, useMemo, Component } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  LogIn, LogOut, User, Loader2, Building2, ChevronLeft,
  Lock, History, Save, FileCheck2, ClipboardList,
  Printer, Sparkles, Calendar, Trash2, CheckCheck, CheckCircle2, ChevronRight, AlertTriangle, KeyRound,
} from "lucide-react";
import {
  fetchMaster, fetchEntries, saveEntries as apiSaveEntries,
  fetchReport, saveReport as apiSaveReport, fetchStatusIndex,
  approveDikaji as apiApproveDikaji, approveMengetahui as apiApproveMengetahui,
  fetchActivityLog, fetchVerify, generateNarrative,
  fetchFormulirBulanan, approveKepalaBagian as apiApproveKepalaBagian,
  approveManagerQAFormulir as apiApproveManagerQAFormulir,
  approveOpr as apiApproveOpr, approveSpv as apiApproveSpv,
  approveDay as apiApproveDay, changePassword as apiChangePassword,
} from "./api.js";
import { useAuth, hasAccess, hasFacilityAccess } from "./auth.js";
import { buildFacilityStats, generateLocalNarrative, fullDateID, monthLabelID } from "./narrativeGenerator.js";

/* ========================================================================= ERROR BOUNDARY ========================================================================= */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("UI Error Caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="max-w-md w-full bg-white rounded-2xl p-6 border shadow-sm text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto" />
            <h2 className="text-base font-bold text-slate-800">Terjadi Kesalahan Tampilan</h2>
            <p className="text-xs text-slate-500">{String(this.state.error?.message || this.state.error)}</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.href = "/"; }}
              className="px-4 py-2 bg-rose-900 text-white rounded-lg text-xs font-semibold hover:bg-rose-950 transition"
            >
              Kembali ke Dashboard Utama
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ========================================================================= 17 FASILITAS & 8 GRUP ========================================================================= */
const FACILITIES = [
  { key: "nblProduksi", label: "NBL Produksi", department: "Produksi", group: "nbl" },
  { key: "nblKemasan", label: "NBL Kemasan", department: "Kemasan", altDepartment: "Produksi", group: "nbl" },
  { key: "gbbNbl", label: "GBB NBL", department: "GBB", altDepartment: "PPIC", group: "nbl" },

  { key: "blProduksi", label: "BL Produksi", department: "Produksi", group: "bl" },
  { key: "blKemasan", label: "BL Kemasan", department: "Kemasan", altDepartment: "Produksi", group: "bl" },
  { key: "gbbBl", label: "GBB BL", department: "GBB", altDepartment: "PPIC", group: "bl" },

  { key: "sefaNonSterilProduksi", label: "Sefa Non Steril Produksi", department: "Produksi", group: "sefaNonSteril" },
  { key: "sefaNonSterilKemasan", label: "Sefa Non Steril Kemasan", department: "Kemasan", altDepartment: "Produksi", group: "sefaNonSteril" },
  { key: "gbbSefa", label: "GBB SEFA", department: "GBB", altDepartment: "PPIC", group: "sefaNonSteril" },

  { key: "sefaSterilProduksi", label: "Sefa Steril Produksi", department: "Produksi", group: "sefaSteril" },
  { key: "sefaSterilKemasan", label: "Sefa Steril Kemasan", department: "Kemasan", altDepartment: "Produksi", group: "sefaSteril" },

  { key: "qc", label: "Laboratorium QC", department: "QC", group: "qc" },
  { key: "rnd", label: "Research and Development (RND)", department: "RND", group: "rnd" },
  { key: "pkrt", label: "Perbekalan Kesehatan Rumah Tangga (PKRT)", department: "PKRT", altDepartment: "Produksi", group: "pkrt" },
  { key: "alkes", label: "Alat Kesehatan (Alkes)", department: "PKRT", altDepartment: "Produksi", group: "alkes" },
  { key: "gbj", label: "Gudang Barang Jadi (GBJ)", department: "GBJ", altDepartment: "PPIC", group: "gbj" },
  { key: "gbk", label: "Gudang Bahan Kemas (GBK)", department: "GBK", altDepartment: "PPIC", group: "gbk" },
];

const GROUPS = [
  { key: "nbl", title: "Nonbetalaktam (NBL)", items: ["nblProduksi", "nblKemasan", "gbbNbl"] },
  { key: "bl", title: "Betalaktam (BL)", items: ["blProduksi", "blKemasan", "gbbBl"] },
  { key: "sefaNonSteril", title: "Sefalosporin Non Steril", items: ["sefaNonSterilProduksi", "sefaNonSterilKemasan", "gbbSefa"] },
  { key: "sefaSteril", title: "Sefalosporin Steril", items: ["sefaSterilProduksi", "sefaSterilKemasan"] },
  { key: "qc", title: "Laboratorium QC", singleKey: "qc" },
  { key: "rnd", title: "Research & Development (RND)", singleKey: "rnd" },
  { key: "pkrt", title: "PKRT", singleKey: "pkrt" },
  { key: "alkes", title: "Alat Kesehatan (Alkes)", singleKey: "alkes" },
  { key: "gbj", title: "Gudang Barang Jadi (GBJ)", singleKey: "gbj" },
  { key: "gbk", title: "Gudang Bahan Kemas (GBK)", singleKey: "gbk" },
];

const PARAM_DEFS = [
  { key: "suhu", label: "Suhu", unit: "°C" },
  { key: "rh", label: "Kelembaban Relatif (RH)", unit: "%" },
  { key: "dpg", label: "Perbedaan Tekanan (DPG)", unit: "Pa" },
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
  const clean = String(v).replace(/[≤≥]/g, "").replace(",", ".").trim();
  const n = Number(clean);
  return Number.isNaN(n) ? null : n;
}

function inRange(v, lower, upper) {
  const lo = toNumberSafe(lower);
  const hi = toNumberSafe(upper);
  if (lo !== null && v < lo) return false;
  if (hi !== null && v > hi) return false;
  return true;
}

function liveLevelFor(rawValue, limit, paramKey) {
  if (rawValue === "-") return 1;
  const v = toNumberSafe(rawValue);
  if (v === null) return 0;
  if (!limit) return paramKey === "suhu" ? 1 : null;
  
  const allNull = [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU].every((x) => toNumberSafe(x) === null);
  if (allNull) return paramKey === "suhu" ? 1 : null;

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

function formatRange(lower, upper, unit, isDpg = false) {
  const lo = toNumberSafe(lower);
  const hi = toNumberSafe(upper);
  if (lo === null && hi === null) return "—";
  if (isDpg) {
    const val = lo !== null ? lo : hi;
    return `≥ ${String(val).replace(".", ",")} ${unit}`;
  }
  if (lo === null) return `≤ ${String(hi).replace(".", ",")} ${unit}`;
  if (hi === null) return `≥ ${String(lo).replace(".", ",")} ${unit}`;
  return `${String(lo).replace(".", ",")} – ${String(hi).replace(".", ",")} ${unit}`;
}

function facilityOverallLevel(entries) {
  let max = 0;
  (entries || []).forEach((e) => {
    PARAM_DEFS.forEach((p) => {
      const lvl = e?.level?.[p.key];
      if (lvl !== null && lvl !== undefined && lvl > max) max = lvl;
    });
  });
  return max;
}

/* ========================================================================= QR VERIFIKASI ========================================================================= */
function buildVerifyUrl(params) {
  const qs = new URLSearchParams(params).toString();
  const base = typeof window !== "undefined" && window.location.origin ? window.location.origin : "https://emnv.myrama.id";
  return `${base}/verify?${qs}`;
}

function VerifyQR({ type, facility, period, roomName, jam, signerRole, signerName, size = 36, hideLabel = true }) {
  const params = { type, facility };
  if (type === "pengkajian") {
    params.month = period;
    if (roomName) params.roomName = roomName;
    if (signerRole) params.role = signerRole;
  } else if (type === "formulir") {
    params.bulan = period;
    params.roomName = roomName;
    if (signerRole) params.role = signerRole;
  } else {
    params.type = "harian";
    params.tanggal = period;
    if (roomName) params.roomName = roomName;
    if (jam) params.jam = jam;
    if (signerRole) params.role = signerRole;
  }
  if (signerName) params.name = signerName;

  const url = buildVerifyUrl(params);

  return (
    <a href={url} target="_blank" rel="noreferrer" title="Klik verifikasi TTD" className="inline-flex flex-col items-center gap-0.5 hover:opacity-80">
      <QRCodeSVG
        value={url}
        size={size}
        level="L"
        includeMargin={true}
        bgColor="#ffffff"
        fgColor="#0f172a"
      />
      {!hideLabel && <span className="text-[9px] text-slate-400">Scan</span>}
    </a>
  );
}

/* ========================================================================= KOMPONEN GRAFIK FULL-WIDTH ========================================================================= */
function ChartDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const style = levelStyle(payload?.level);
  return <circle cx={cx} cy={cy} r={4} fill={style.color} stroke="#fff" strokeWidth={1.5} />;
}

function ChartTooltip({ active, payload, unit }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const style = levelStyle(p?.level);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg space-y-0.5">
      <p className="font-semibold text-slate-700">{p.label}</p>
      <p className="text-sm font-bold" style={{ color: style.color }}>{p.value} {unit}</p>
      <p className="font-medium text-[11px]" style={{ color: style.color }}>{style.label}</p>
    </div>
  );
}

function LegendChip({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200 shadow-2xs">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function DayParamChart({ activeRoomNames = [], rooms = [], currentDayEntries = [], paramKey, paramLabel, unit }) {
  const data = useMemo(() => {
    return (activeRoomNames || []).map((name) => {
      const rObj = (rooms || []).find((r) => r?.name === name);
      const rowAm = (currentDayEntries || []).find((e) => e?.roomName === name && e?.jam === "08:00");
      const rowPm = (currentDayEntries || []).find((e) => e?.roomName === name && e?.jam === "13:00");
      const vAm = toNumberSafe(rowAm?.[paramKey]);
      const vPm = toNumberSafe(rowPm?.[paramKey]);
      const lim = rObj?.limits?.[paramKey];

      const points = [];
      if (vAm !== null) points.push({ label: `${name} (08:00)`, roomName: name, jam: "08:00", value: vAm, level: liveLevelFor(vAm, lim, paramKey), lim });
      if (vPm !== null) points.push({ label: `${name} (13:00)`, roomName: name, jam: "13:00", value: vPm, level: liveLevelFor(vPm, lim, paramKey), lim });
      return points;
    }).flat();
  }, [activeRoomNames, rooms, currentDayEntries, paramKey]);

  if (!data || data.length === 0) {
    return (
      <div className="p-6 bg-slate-50 rounded-xl border border-dashed text-center text-xs text-slate-400">
        Belum ada data {paramLabel} yang tersimpan untuk ruangan pada tanggal ini.
      </div>
    );
  }

  const peak = data.reduce((a, b) => (b.level > a.level ? b : a), data[0]);
  const refLim = peak?.lim || rooms[0]?.limits?.[paramKey] || {};
  const isDpg = paramKey === "dpg";

  const alertVal = toNumberSafe(refLim.alertU ?? refLim.alertL);
  const actionVal = toNumberSafe(refLim.actionU ?? refLim.actionL);
  const syaratVal = toNumberSafe(refLim.syaratU ?? refLim.syaratL);

  const allVals = data.map((d) => d.value).concat([alertVal, actionVal, syaratVal]).filter((v) => v !== null && !isNaN(v));
  const minVal = Math.min(...allVals, 0);
  const maxVal = Math.max(...allVals, 10);
  const yMin = minVal - (maxVal - minVal) * 0.1;
  const yMax = maxVal + (maxVal - minVal) * 0.1;
  const gradId = `dayGrad-${paramKey}`;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs print-card avoid-break w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/60">
        <div>
          <p className="text-xs font-bold text-slate-800">{paramLabel}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tertinggi: <span className="font-semibold text-slate-800">{peak.value} {unit}</span> ({peak.roomName})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LegendChip color="#15803d" label="Terkendali" />
          {alertVal !== null && <LegendChip color="#b45309" label={`Alert ${isDpg ? '≥ ' : ''}${alertVal}`} />}
          {actionVal !== null && <LegendChip color="#c2410c" label={`Action ${isDpg ? '≥ ' : ''}${actionVal}`} />}
          {syaratVal !== null && <LegendChip color="#b91c1c" label={`Syarat ${isDpg ? '≥ ' : ''}${syaratVal}`} />}
        </div>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 15, right: 20, left: 0, bottom: 40 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            {alertVal !== null && <ReferenceLine y={alertVal} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="4 3" />}
            {actionVal !== null && <ReferenceLine y={actionVal} stroke="#ea580c" strokeWidth={1.2} strokeDasharray="4 3" />}
            {syaratVal !== null && <ReferenceLine y={syaratVal} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" />}
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} angle={-25} textAnchor="end" interval={0} height={45} />
            <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: "#64748b" }} width={35} />
            <Tooltip content={<ChartTooltip unit={unit} />} />
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gradId})`} isAnimationActive={false} />
            <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={<ChartDot />} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RoomMonthlyTrendChart({ entriesData = [], paramKey, paramLabel, unit, limit, isGlobal = false }) {
  const data = useMemo(() => {
    return (entriesData || []).map((e) => {
      const v = toNumberSafe(e?.[paramKey]);
      if (v === null) return null;
      return {
        label: isGlobal ? `${String(e?.tanggal || "").slice(-2)} (${e?.roomName || ""})` : `${String(e?.tanggal || "").slice(-2)}/${e?.jam || ""}`,
        value: v,
        level: e?.level?.[paramKey] ?? 0,
        roomName: e?.roomName || "",
      };
    }).filter(Boolean);
  }, [entriesData, paramKey, isGlobal]);

  if (!data || data.length === 0) return null;

  const peak = data.reduce((a, b) => (b.level > a.level ? b : a), data[0]);
  const isDpg = paramKey === "dpg";

  const alertVal = toNumberSafe(limit?.alertU ?? limit?.alertL);
  const actionVal = toNumberSafe(limit?.actionU ?? limit?.actionL);
  const syaratVal = toNumberSafe(limit?.syaratU ?? limit?.syaratL);

  const allVals = data.map((d) => d.value).concat([alertVal, actionVal, syaratVal]).filter((v) => v !== null && !isNaN(v));
  const minVal = Math.min(...allVals, 0);
  const maxVal = Math.max(...allVals, 10);
  const yMin = minVal - (maxVal - minVal) * 0.1;
  const yMax = maxVal + (maxVal - minVal) * 0.1;
  const gradId = `monthGrad-${paramKey}-${isGlobal ? "global" : "room"}`;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs print-card avoid-break w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/60">
        <div>
          <p className="text-xs font-bold text-slate-800">{paramLabel} — {isGlobal ? "Tren Global Fasilitas" : "Tren 1 Bulan"}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tertinggi: <span className="font-semibold text-slate-800">{peak.value} {unit}</span> ({peak.roomName})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LegendChip color="#15803d" label="Terkendali" />
          {alertVal !== null && <LegendChip color="#b45309" label={`Alert ${isDpg ? '≥ ' : ''}${alertVal}`} />}
          {actionVal !== null && <LegendChip color="#c2410c" label={`Action ${isDpg ? '≥ ' : ''}${actionVal}`} />}
          {syaratVal !== null && <LegendChip color="#b91c1c" label={`Syarat ${isDpg ? '≥ ' : ''}${syaratVal}`} />}
        </div>
      </div>
      <div className="p-3">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 15, right: 20, left: 0, bottom: 40 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            {alertVal !== null && <ReferenceLine y={alertVal} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="4 3" />}
            {actionVal !== null && <ReferenceLine y={actionVal} stroke="#ea580c" strokeWidth={1.2} strokeDasharray="4 3" />}
            {syaratVal !== null && <ReferenceLine y={syaratVal} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" />}
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} angle={-35} textAnchor="end" interval="preserveStartEnd" height={45} />
            <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: "#64748b" }} width={35} />
            <Tooltip content={<ChartTooltip unit={unit} />} />
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gradId})`} isAnimationActive={false} />
            <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={<ChartDot />} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ========================================================================= TOPBAR & PROFIL MODAL ========================================================================= */
function TopBar({ session, onLoginClick, onLogout, onProfileClick, view, setView }) {
  return (
    <div className="no-print border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <button onClick={() => setView({ page: "dashboard" })} className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <img src="/logo-rama.png" alt="Logo" className="h-8 w-8 object-contain" />
          EM Non Viable — PT. Rama Emerald Multi Sukses
        </button>
        <div className="flex items-center gap-2">
          {session && hasAccess(session, "Supervisor", "QA") && (
            <button onClick={() => setView({ page: "pengkajian", facility: view.facility || "nblProduksi", room: "" })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view.page === "pengkajian" && !view.room ? "bg-rose-900 text-white" : "border border-slate-300 text-slate-600 hover:bg-rose-50"}`}>
              <ClipboardList size={14} /> Pengkajian QA (Global)
            </button>
          )}
          {session && hasAccess(session, "Supervisor") && (
            <button onClick={() => setView({ page: "activity" })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view.page === "activity" ? "bg-rose-900 text-white" : "border border-slate-300 text-slate-600 hover:bg-rose-50"}`}>
              <History size={14} /> Riwayat Aktivitas
            </button>
          )}
          {session ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onProfileClick}
                className="hidden items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:inline-flex transition"
                title="Buka Profil & Ganti Password"
              >
                <User size={13} className="text-rose-800" /> {session.nama} · {session.role}
              </button>
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

function ProfileModal({ session, onClose, onChangePasswordClick }) {
  if (!session) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <User size={18} className="text-rose-800" />
          <h3 className="text-base font-bold text-slate-800">Profil Saya</h3>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-400">Username</span>
            <span className="font-bold text-slate-800">{session.username}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-400">Nama Lengkap</span>
            <span className="font-bold text-slate-800">{session.nama}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-400">Jabatan / Role</span>
            <span className="font-bold text-slate-800">{session.role}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-400">Departemen</span>
            <span className="font-bold text-slate-800">{session.departemen || "—"}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Tutup
          </button>
          <button
            type="button"
            onClick={onChangePasswordClick}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-900 hover:bg-rose-950 px-3 py-1.5 text-xs font-semibold text-white shadow-xs"
          >
            <KeyRound size={13} /> Ganti Password
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ session, onClose }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak cocok.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password baru minimal 6 karakter.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await apiChangePassword(session.token, oldPassword, newPassword);
      if (res && res.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err) {
      setError(err.message || "Gagal mengganti password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <KeyRound size={18} className="text-rose-800" />
          <h3 className="text-base font-bold text-slate-800">Ganti Password</h3>
        </div>

        {success ? (
          <div className="p-4 bg-emerald-50 text-emerald-700 text-xs rounded-xl font-semibold text-center border border-emerald-200">
            ✓ Password berhasil diperbarui!
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">Password Lama</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-rose-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">Password Baru</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-rose-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">Konfirmasi Password Baru</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-rose-700 focus:outline-none"
              />
            </div>

            {error && <p className="p-2 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting || !oldPassword || !newPassword || !confirmPassword}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-900 hover:bg-rose-950 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : null} Simpan Password
              </button>
            </div>
          </form>
        )}
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

/* ========================================================================= DASHBOARD REKAP GRUP ========================================================================= */
function Dashboard({ month, setMonth, setView, session, onNeedLogin }) {
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [selectedGroupModal, setSelectedGroupModal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatusError("");
    fetchStatusIndex(month)
      .then((d) => { if (!cancelled) setStatus(d?.status || d || {}); })
      .catch((err) => { if (!cancelled) setStatusError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const perluCount = FACILITIES.filter((f) => (status[f.key]?.level || 0) === 3).length;
  const tmsCount = FACILITIES.filter((f) => (status[f.key]?.level || 0) >= 4).length;
  const terkendaliCount = FACILITIES.filter((f) => status[f.key]?.hasData && (status[f.key]?.level || 0) < 3).length;
  const belumAdaCount = FACILITIES.filter((f) => !status[f.key]?.hasData).length;

  function handleCardClick(g) {
    if (!session) { onNeedLogin(); return; }
    if (g.singleKey) {
      setView({ page: "facility", facility: g.singleKey });
    } else {
      setSelectedGroupModal(g);
    }
  }

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

        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Pilih Gedung / Fasilitas — {monthLabelID(month)}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GROUPS.map((g) => {
            let maxGroupLevel = 0;
            let groupHasData = false;
            if (g.singleKey) {
              const st = status[g.singleKey];
              maxGroupLevel = st?.level || 0;
              groupHasData = !!st?.hasData;
            } else {
              g.items.forEach((k) => {
                const st = status[k];
                if (st?.hasData) {
                  groupHasData = true;
                  if (st.level > maxGroupLevel) maxGroupLevel = st.level;
                }
              });
            }
            const lvlStyle = levelStyle(groupHasData ? maxGroupLevel : null);

            return (
              <button key={g.key} onClick={() => handleCardClick(g)}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-rose-700 hover:shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-900 font-bold text-sm">
                    <Building2 size={20} />
                  </span>
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: lvlStyle.bg, color: lvlStyle.color }}>
                    {groupHasData ? lvlStyle.label : "Belum Ada Data"}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-base">{g.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {g.singleKey ? "Area Tunggal" : `${g.items.length} Sub-Area (Produksi, Kemasan, GBB)`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">{selectedGroupModal.title}</h3>
                <p className="text-xs text-slate-400">Pilih area spesifik yang ingin dipantau</p>
              </div>
              <button onClick={() => setSelectedGroupModal(null)} className="text-slate-400 hover:text-slate-600 text-xs font-semibold">Tutup</button>
            </div>

            <div className="space-y-2">
              {selectedGroupModal.items.map((facKey) => {
                const fac = FACILITIES.find((f) => f.key === facKey);
                const st = status[facKey];
                const lvlStyle = levelStyle(st?.hasData ? st.level : null);

                return (
                  <button
                    key={facKey}
                    onClick={() => { setSelectedGroupModal(null); setView({ page: "facility", facility: facKey }); }}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-100 hover:border-rose-300 hover:bg-rose-50/40 transition text-left"
                  >
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{fac?.label}</p>
                      <p className="text-xs text-slate-400">Departemen: {fac?.department}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: lvlStyle.bg, color: lvlStyle.color }}>
                        {st?.hasData ? lvlStyle.label : "Belum Ada Data"}
                      </span>
                      <ChevronRight size={14} className="text-slate-300" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================= HALAMAN EVALUASI & INPUT HARIAN ========================================================================= */
function FacilityIntegratedPage({ session, facilityKey, month, setMonth, setView }) {
  const cfg = FACILITIES.find((f) => f.key === facilityKey) || FACILITIES[0];
  const canInput = hasFacilityAccess(session, "Staff", cfg);
  const canApproveSPV = hasFacilityAccess(session, "Supervisor", cfg);
  const isOperator = session.role === "Staff" || session.role === "Operator" || session.role === "Admin" || session.role === "Administrator";
  const canDraftQA = hasAccess(session, "Supervisor", "QA");
  const canFinalQA = hasAccess(session, "Manager", "QA");

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [rooms, setRooms] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyRow, setBusyRow] = useState(null);
  const [error, setError] = useState("");

  const [activeRoomNames, setActiveRoomNames] = useState([]);
  const [gridValues, setGridValues] = useState({});

  const [pendahuluan, setPendahuluan] = useState("");
  const [kesimpulanUmum, setKesimpulanUmum] = useState("");
  const [perParameter, setPerParameter] = useState({ suhu: "", rh: "", dpg: "" });
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [roomRes, entryRes, reportRes] = await Promise.all([
        fetchMaster(facilityKey),
        fetchEntries(facilityKey, month),
        fetchReport(facilityKey, month, session.token),
      ]);
      const roomList = Array.isArray(roomRes) ? roomRes : (roomRes?.rooms || []);
      const entryList = Array.isArray(entryRes) ? entryRes : (entryRes?.entries || []);

      setRooms(roomList);
      setMonthEntries(entryList);
      setReport(reportRes);
      setPendahuluan(reportRes?.narrative?.pendahuluan || "");
      setKesimpulanUmum(reportRes?.narrative?.kesimpulanUmum || "");
      setPerParameter(reportRes?.narrative?.perParameter || { suhu: "", rh: "", dpg: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey, month, session.token]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!rooms || rooms.length === 0) return;

    const existingRoomsToday = Array.from(
      new Set((monthEntries || []).filter((e) => e?.tanggal === selectedDate).map((e) => e?.roomName))
    ).filter(Boolean);

    setActiveRoomNames(existingRoomsToday);

    const initialGrid = {};
    rooms.forEach((r) => {
      if (!r?.name) return;
      initialGrid[r.name] = {
        "08:00": { suhu: "", rh: "", dpg: "", opr: "", spv: "" },
        "13:00": { suhu: "", rh: "", dpg: "", opr: "", spv: "" },
      };
      SESI.forEach((jam) => {
        PARAM_DEFS.forEach((p) => {
          if (!r.required?.[p.key]) initialGrid[r.name][jam][p.key] = "-";
        });
      });
    });

    (monthEntries || []).filter((e) => e?.tanggal === selectedDate).forEach((e) => {
      if (initialGrid[e.roomName] && initialGrid[e.roomName][e.jam]) {
        const rObj = rooms.find((r) => r.name === e.roomName);
        initialGrid[e.roomName][e.jam] = {
          suhu: e.suhu ?? (rObj?.required?.suhu ? "" : "-"),
          rh: e.rh ?? (rObj?.required?.rh ? "" : "-"),
          dpg: e.dpg ?? (rObj?.required?.dpg ? "" : "-"),
          opr: e.opr || "",
          spv: e.spv || "",
        };
      }
    });

    setGridValues(initialGrid);
  }, [selectedDate, monthEntries, rooms]);

  function handleAddRoom(roomName) {
    if (!roomName || activeRoomNames.includes(roomName)) return;
    setActiveRoomNames((prev) => [...prev, roomName]);
  }

  function handleRemoveActiveRoom(roomName) {
    setActiveRoomNames((prev) => prev.filter((name) => name !== roomName));
  }

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

  function buildTodayPayload() {
    const todayRows = [];
    activeRoomNames.forEach((rName) => {
      const rObj = (rooms || []).find((r) => r?.name === rName);
      SESI.forEach((jam) => {
        const v = gridValues[rName]?.[jam] || {};
        const anyFilled = PARAM_DEFS.some((p) => v[p.key] && v[p.key] !== "-");
        if (anyFilled) {
          const sVal = !rObj?.required?.suhu ? (v.suhu || "-") : v.suhu;
          const rVal = !rObj?.required?.rh ? (v.rh || "-") : v.rh;
          const dVal = !rObj?.required?.dpg ? (v.dpg || "-") : v.dpg;

          todayRows.push({
            id: `${rName}|${selectedDate}|${jam}`,
            tanggal: selectedDate,
            jam,
            roomName: rName,
            persyaratanKey: rObj?.persyaratanKey || "",
            suhu: sVal === "" ? null : sVal,
            rh: rVal === "" ? null : rVal,
            dpg: dVal === "" ? null : dVal,
            opr: v.opr || "",
            spv: v.spv || "",
          });
        }
      });
    });
    return todayRows;
  }

  async function handleSaveDataOnly() {
    setSaving(true);
    setError("");
    try {
      const todayRows = buildTodayPayload();
      const otherRows = (monthEntries || []).filter((e) => e?.tanggal !== selectedDate);
      await apiSaveEntries(facilityKey, month, otherRows.concat(todayRows), session.token);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveOprBatch() {
    setSaving(true);
    setError("");
    try {
      const todayRows = buildTodayPayload();
      if (todayRows.length === 0) throw new Error("Belum ada nilai yang diisi pada tanggal ini.");

      const otherRows = (monthEntries || []).filter((e) => e?.tanggal !== selectedDate);
      await apiSaveEntries(facilityKey, month, otherRows.concat(todayRows), session.token);

      const uniqueRooms = Array.from(new Set(todayRows.map((r) => r.roomName)));
      for (const rName of uniqueRooms) {
        await apiApproveOpr(facilityKey, selectedDate, rName, session.token);
      }
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveSpvBatch() {
    setSaving(true);
    setError("");
    try {
      const todayRows = buildTodayPayload();
      if (todayRows.length === 0) throw new Error("Tidak ada data ruangan untuk di-approve SPV.");

      const otherRows = (monthEntries || []).filter((e) => e?.tanggal !== selectedDate);
      await apiSaveEntries(facilityKey, month, otherRows.concat(todayRows), session.token);

      await apiApproveDay(facilityKey, selectedDate, session.token);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveOprSingle(roomName) {
    setBusyRow(roomName + "|opr");
    setError("");
    try {
      const todayRows = buildTodayPayload();
      const otherRows = (monthEntries || []).filter((e) => e?.tanggal !== selectedDate);
      await apiSaveEntries(facilityKey, month, otherRows.concat(todayRows), session.token);
      await apiApproveOpr(facilityKey, selectedDate, roomName, session.token);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRow(null);
    }
  }

  async function handleApproveSpvSingle(roomName) {
    setBusyRow(roomName + "|spv");
    setError("");
    try {
      const todayRows = buildTodayPayload();
      const otherRows = (monthEntries || []).filter((e) => e?.tanggal !== selectedDate);
      await apiSaveEntries(facilityKey, month, otherRows.concat(todayRows), session.token);
      await apiApproveSpv(facilityKey, selectedDate, roomName, session.token);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRow(null);
    }
  }

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

  const currentDayEntries = useMemo(() => {
    return (monthEntries || []).filter((e) => e?.tanggal === selectedDate);
  }, [monthEntries, selectedDate]);

  const currentLevel = facilityOverallLevel(monthEntries);
  const isFinalApproved = !!report?.signoff?.diperiksa?.nama;

  const roomStatusToday = useMemo(() => {
    const map = {};
    (rooms || []).forEach((r) => {
      const rows = currentDayEntries.filter((e) => e?.roomName === r?.name);
      if (rows.length === 0) {
        map[r.name] = "empty";
      } else if (rows.every((e) => !!e.spv)) {
        map[r.name] = "spv";
      } else if (rows.some((e) => !!e.opr)) {
        map[r.name] = "opr";
      } else {
        map[r.name] = "filled";
      }
    });
    return map;
  }, [rooms, currentDayEntries]);

  const isFacilityFullySpvApproved = useMemo(() => {
    if (!rooms || rooms.length === 0) return false;
    return rooms.every((r) => roomStatusToday[r.name] === "spv");
  }, [rooms, roomStatusToday]);

  const hasUnapprovedRoomsInActive = useMemo(() => {
    return (activeRoomNames || []).some((rName) => roomStatusToday[rName] !== "spv");
  }, [activeRoomNames, roomStatusToday]);

  const unselectedRooms = (rooms || []).filter((r) => !activeRoomNames.includes(r.name));

  const activeDistinctLimits = useMemo(() => {
    const map = {};
    (activeRoomNames || []).forEach((rName) => {
      const rObj = (rooms || []).find((r) => r?.name === rName);
      if (rObj && rObj.persyaratanKey) {
        map[rObj.persyaratanKey] = rObj.limits;
      }
    });
    return map;
  }, [activeRoomNames, rooms]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 print:max-w-none print:p-0">
      {/* Header Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft size={16} /> Kembali ke Dashboard
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700">
            <Calendar size={13} className="text-rose-800" />
            <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setSelectedDate(`${e.target.value}-01`); }} className="outline-none" />
          </label>
          {canDraftQA && (
            <button onClick={() => setView({ page: "pengkajian", facility: facilityKey, room: "" })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-900 hover:bg-rose-950 text-white px-3 py-1.5 text-xs font-semibold shadow-xs">
              <ClipboardList size={13} /> Pengkajian QA (Global 1 Bulan)
            </button>
          )}
          {rooms && rooms.length > 0 && (
            <button onClick={() => setView({ page: "formulir", facility: facilityKey, room: rooms[0]?.name, bulan: month })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <FileCheck2 size={13} /> Formulir Bulanan (FM.QA.024/R11)
            </button>
          )}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Printer size={13} /> Cetak Harian
          </button>
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
                <h1 className="text-lg font-bold text-white tracking-tight">Data Pemantauan &amp; Evaluasi Harian EM Non Viable</h1>
                <p className="text-xs text-rose-100/90">Fasilitas: <span className="font-semibold text-white">{cfg?.label}</span> · Periode: <span className="font-semibold text-white">{monthLabelID(month)}</span></p>
              </div>
            </div>
            <p className="text-right text-[11px] text-rose-200">FM.QA.024/R11</p>
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

      {/* SECTION 1: TABEL INPUT PEMILIHAN RUANGAN */}
      <div className="bg-white rounded-xl border p-4 shadow-sm space-y-4 print-card avoid-break">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-700">Tanggal:</label>
              <input type="date" value={selectedDate} max={todayStr()} onChange={(e) => setSelectedDate(e.target.value)}
                className="border rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none focus:border-rose-700" />
              <button onClick={() => setSelectedDate(todayStr())} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-600 no-print">
                Hari Ini
              </button>
            </div>

            {canInput && unselectedRooms.length > 0 && (
              <div className="flex items-center gap-2 no-print">
                <select
                  value=""
                  onChange={(e) => handleAddRoom(e.target.value)}
                  className="border border-rose-300 bg-rose-50/50 hover:bg-rose-50 rounded-lg px-3 py-1 text-xs text-rose-950 font-semibold outline-none transition"
                >
                  <option value="">+ Tambah Ruangan Lain...</option>
                  {unselectedRooms.map((r) => {
                    const st = roomStatusToday[r.name];
                    const labelSuffix = st === "spv" ? " ✓ disetujui" : st === "opr" ? " • diapprove OPR" : st === "filled" ? " • terisi" : "";
                    return (
                      <option key={r.code + r.name} value={r.name}>
                        {r.code} — {r.name} ({r.persyaratanKey || "—"}){labelSuffix}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {isFacilityFullySpvApproved && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-rose-50 text-rose-800 font-semibold px-2 py-0.5 rounded border border-rose-200">
                <Lock size={11} /> Seluruh Ruangan Terkunci (Disetujui SPV)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            {canInput && hasUnapprovedRoomsInActive && (
              <>
                <button onClick={handleSaveDataOnly} disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Simpan Draf
                </button>
                {isOperator && (
                  <button onClick={handleApproveOprBatch} disabled={saving || activeRoomNames.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50">
                    <CheckCheck size={14} /> Approve OPR (Semua Ruang Terpilih)
                  </button>
                )}
              </>
            )}
            {canApproveSPV && hasUnapprovedRoomsInActive && (
              <button onClick={handleApproveSpvBatch} disabled={saving || activeRoomNames.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-900 hover:bg-rose-950 text-white shadow-sm disabled:opacity-50">
                <FileCheck2 size={14} /> Approve SPV &amp; Kunci (Semua)
              </button>
            )}
          </div>
        </div>

        {/* Tabel Data */}
        {activeRoomNames.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed text-slate-500 text-xs space-y-1">
            <p className="font-semibold text-slate-700">Belum ada ruangan yang diinput pada tanggal {selectedDate}.</p>
            <p className="text-slate-400">Silakan klik dropdown <b>"+ Tambah Ruangan Lain..."</b> di atas untuk mulai mengisi data ruangan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-xs print:table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b">
                  <th className="px-3 py-2 text-left min-w-[170px] print:w-40">RUANGAN</th>
                  <th className="px-2 py-2 text-center w-28">PERSYARATAN</th>
                  <th className="px-2 py-2 text-center w-14">JAM</th>
                  <th className="px-2 py-2 text-center w-20">SUHU (°C)</th>
                  <th className="px-2 py-2 text-center w-20">RH (%)</th>
                  <th className="px-2 py-2 text-center w-20">DPG (Pa)</th>
                  <th className="px-2 py-2 text-center w-28">OPR (TTD)</th>
                  <th className="px-2 py-2 text-center w-28">SPV (TTD)</th>
                  <th className="px-2 py-2 text-center w-10 no-print">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRoomNames.map((rName) => {
                  const rObj = (rooms || []).find((r) => r?.name === rName);
                  if (!rObj) return null;
                  const st = roomStatusToday[rName];
                  const labelSuffix = st === "spv" ? "✓ Disetujui SPV" : st === "opr" ? "• Diapprove OPR" : st === "filled" ? "• Terisi" : "";

                  const hasOprApproved = SESI.every((jam) => !!gridValues[rName]?.[jam]?.opr);
                  const isLocked = st === "spv";

                  return SESI.map((jam, jamIdx) => {
                    const v = gridValues[rName]?.[jam] || {};
                    const sLvl = liveLevelFor(v.suhu, rObj.limits?.suhu, "suhu");
                    const rLvl = liveLevelFor(v.rh, rObj.limits?.rh, "rh");
                    const dLvl = liveLevelFor(v.dpg, rObj.limits?.dpg, "dpg");

                    return (
                      <tr key={rObj.code + jam} className={jamIdx === 0 ? "border-t border-slate-200" : "bg-slate-50/30"}>
                        {jamIdx === 0 ? (
                          <>
                            <td rowSpan={2} className="px-3 py-2 align-middle border-r border-slate-100">
                              <div className="font-bold text-slate-800 text-xs">{rObj.code} — {rObj.name}</div>
                              {labelSuffix && (
                                <span className={`inline-block mt-0.5 text-[9px] font-medium px-1.5 py-0.2 rounded ${st === "spv" ? "bg-rose-50 text-rose-800" : st === "opr" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                                  {labelSuffix}
                                </span>
                              )}
                            </td>
                            <td rowSpan={2} className="px-2 py-2 text-center align-middle border-r border-slate-100">
                              <span className="inline-block bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] border border-slate-200">
                                {rObj.persyaratanKey || "—"}
                              </span>
                            </td>
                          </>
                        ) : null}
                        <td className="px-2 py-1.5 text-center font-medium text-slate-500">{jam}</td>
                        <td className="px-2 py-1.5 text-center">
                          <input value={v.suhu ?? ""} onChange={(e) => handleCellChange(rName, jam, "suhu", e.target.value)}
                            placeholder="" disabled={isLocked || !canInput}
                            className="w-14 text-center border rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-rose-700 disabled:bg-slate-50 font-medium text-xs"
                            style={{ background: v.suhu && v.suhu !== "-" ? levelStyle(sLvl).bg : undefined, color: v.suhu && v.suhu !== "-" ? levelStyle(sLvl).color : undefined }} />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input value={v.rh ?? ""} onChange={(e) => handleCellChange(rName, jam, "rh", e.target.value)}
                            placeholder={rObj.required?.rh ? "" : "N/A"} disabled={isLocked || !rObj.required?.rh || !canInput}
                            className="w-14 text-center border rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-rose-700 disabled:bg-slate-50 font-medium text-xs"
                            style={{ background: v.rh && v.rh !== "-" ? levelStyle(rLvl).bg : undefined, color: v.rh && v.rh !== "-" ? levelStyle(rLvl).color : undefined }} />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input value={v.dpg ?? ""} onChange={(e) => handleCellChange(rName, jam, "dpg", e.target.value)}
                            placeholder={rObj.required?.dpg ? "" : "N/A"} disabled={isLocked || !rObj.required?.dpg || !canInput}
                            className="w-14 text-center border rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-rose-700 disabled:bg-slate-50 font-medium text-xs"
                            style={{ background: v.dpg && v.dpg !== "-" ? levelStyle(dLvl).bg : undefined, color: v.dpg && v.dpg !== "-" ? levelStyle(dLvl).color : undefined }} />
                        </td>

                        {/* KOLOM OPR */}
                        <td className="px-2 py-1.5 text-center text-slate-600">
                          {v.opr ? (
                            <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                              <span className="font-medium text-[10px] truncate max-w-[65px]">{v.opr}</span>
                              <VerifyQR type="harian" facility={facilityKey} period={selectedDate} roomName={rName} jam={jam} signerRole="OPR" signerName={v.opr} />
                            </div>
                          ) : isOperator && !isLocked ? (
                            <button
                              onClick={() => handleApproveOprSingle(rName)}
                              disabled={busyRow === rName + "|opr"}
                              className="no-print inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-50"
                            >
                              {busyRow === rName + "|opr" ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />} Approve
                            </button>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* KOLOM SPV */}
                        <td className="px-2 py-1.5 text-center text-slate-600">
                          {v.spv ? (
                            <div className="inline-flex items-center gap-1 bg-rose-50 text-rose-900 px-1.5 py-0.5 rounded border border-rose-200">
                              <span className="font-medium text-[10px] truncate max-w-[65px]">{v.spv}</span>
                              <VerifyQR type="harian" facility={facilityKey} period={selectedDate} roomName={rName} jam={jam} signerRole="SPV" signerName={v.spv} />
                            </div>
                          ) : canApproveSPV && !isLocked && hasOprApproved ? (
                            <button
                              onClick={() => handleApproveSpvSingle(rName)}
                              disabled={busyRow === rName + "|spv"}
                              className="no-print inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-rose-800 hover:bg-rose-900 text-white shadow-xs disabled:opacity-50"
                            >
                              {busyRow === rName + "|spv" ? <Loader2 size={10} className="animate-spin" /> : <FileCheck2 size={10} />} Approve
                            </button>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">—</span>
                          )}
                        </td>

                        {jamIdx === 0 ? (
                          <td rowSpan={2} className="px-2 py-1.5 text-center align-middle no-print">
                            {!isLocked && (
                              <button onClick={() => handleRemoveActiveRoom(rName)} className="text-slate-400 hover:text-red-600 p-1" title="Hapus baris ini">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: CARD PERSYARATAN & LIMIT */}
      {Object.keys(activeDistinctLimits).length > 0 && (
        <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3 print-card avoid-break">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Persyaratan &amp; Batas Limit (Jenis Limit Terpakai)</h3>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b">
                  <th className="px-3 py-1.5">KODE / PERSYARATAN</th>
                  <th className="px-3 py-1.5">PARAMETER</th>
                  <th className="px-3 py-1.5">SYARAT</th>
                  <th className="px-3 py-1.5">ALERT LIMIT</th>
                  <th className="px-3 py-1.5">ACTION LIMIT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(activeDistinctLimits).map(([pKey, limits]) => {
                  return PARAM_DEFS.map((p) => {
                    const lim = limits?.[p.key];
                    if (!lim) return null;
                    const allNull = [lim.syaratL, lim.syaratU, lim.alertL, lim.alertU, lim.actionL, lim.actionU].every((x) => toNumberSafe(x) === null);
                    if (allNull) return null;
                    const isDpg = p.key === "dpg";

                    return (
                      <tr key={pKey + p.key}>
                        <td className="px-3 py-1.5 font-bold text-slate-800">{pKey}</td>
                        <td className="px-3 py-1.5 font-semibold text-slate-700">{p.label}</td>
                        <td className="px-3 py-1.5 text-slate-800">{formatRange(lim.syaratL, lim.syaratU, p.unit, isDpg)}</td>
                        <td className="px-3 py-1.5 text-amber-700">{formatRange(lim.alertL, lim.alertU, p.unit, isDpg)}</td>
                        <td className="px-3 py-1.5 text-orange-700">{formatRange(lim.actionL, lim.actionU, p.unit, isDpg)}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/> Terkendali</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/> Alert</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"/> Action</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/> Melebihi Syarat</span>
          </div>
        </div>
      )}

      {/* SECTION 3: GRAFIK CROSS-SECTIONAL */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">Grafik Perbandingan Ruangan Terisi ({selectedDate})</h2>
        <div className="space-y-4">
          <DayParamChart activeRoomNames={activeRoomNames} rooms={rooms} currentDayEntries={currentDayEntries} paramKey="suhu" paramLabel="Suhu" unit="°C" />
          <DayParamChart activeRoomNames={activeRoomNames} rooms={rooms} currentDayEntries={currentDayEntries} paramKey="rh" paramLabel="Kelembaban Relatif (RH)" unit="%" />
          <DayParamChart activeRoomNames={activeRoomNames} rooms={rooms} currentDayEntries={currentDayEntries} paramKey="dpg" paramLabel="Perbedaan Tekanan (DPG)" unit="Pa" />
        </div>
      </div>

      {/* SECTION 4: PEMBAHASAN & NARASI HARIAN */}
      <div className="bg-white rounded-xl border p-5 shadow-sm space-y-5 print-card avoid-break">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">Pembahasan &amp; Narasi Evaluasi Harian</h2>
            <p className="text-xs text-slate-400">Catatan pemantauan operasional mengacu pada Protap POS.QA.025</p>
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
          <label className="no-print block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Pendahuluan</label>
          <p className="only-print text-xs font-bold text-slate-700 uppercase mb-1">Pendahuluan</p>
          <textarea value={pendahuluan} onChange={(e) => setPendahuluan(e.target.value)} disabled={!canDraftQA || isFinalApproved} rows={2}
            className="no-print w-full border rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-rose-700 disabled:bg-slate-50" />
          <p className="only-print text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{pendahuluan || "-"}</p>
        </div>

        {PARAM_DEFS.map((p) => (
          <div key={p.key} className="space-y-1.5 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700">Hasil, Tren &amp; Kesimpulan — {p.label} ({p.unit})</label>
            <textarea value={perParameter[p.key] || ""} onChange={(e) => setPerParameter({ ...perParameter, [p.key]: e.target.value })}
              disabled={!canDraftQA || isFinalApproved} rows={3}
              placeholder={`Tulis ulasan hasil, tren, dan kesimpulan untuk parameter ${p.label}...`}
              className="no-print w-full border rounded-lg p-2.5 text-xs text-slate-800 bg-white outline-none focus:border-rose-700 disabled:bg-slate-50" />
            <p className="only-print text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{perParameter[p.key] || "-"}</p>
          </div>
        ))}

        <div>
          <label className="no-print block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Kesimpulan Umum</label>
          <p className="only-print text-xs font-bold text-slate-700 uppercase mb-1">Kesimpulan Umum</p>
          <textarea value={kesimpulanUmum} onChange={(e) => setKesimpulanUmum(e.target.value)} disabled={!canDraftQA || isFinalApproved} rows={3}
            className="no-print w-full border rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-rose-700 disabled:bg-slate-50" />
          <p className="only-print text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{kesimpulanUmum || "-"}</p>
        </div>

        {/* SECTION 5: TANDA TANGAN */}
        <div className="pt-4 border-t grid grid-cols-1 sm:grid-cols-2 gap-4 avoid-break">
          <div className="border rounded-xl p-4 bg-slate-50/50 text-center flex flex-col justify-between min-h-[140px]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dikaji Oleh (Supervisor QA)</p>
            {report?.signoff?.dinilai?.nama ? (
              <div className="space-y-1 my-auto">
                <div className="flex justify-center"><VerifyQR type="pengkajian" facility={facilityKey} period={month} signerRole="Dikaji Oleh" signerName={report.signoff.dinilai.nama} size={54} /></div>
                <p className="text-xs font-bold text-slate-800">{report.signoff.dinilai.nama}</p>
                <p className="text-[10px] text-slate-400">{report.signoff.dinilai.tanggal}</p>
              </div>
            ) : (
              <div className="my-auto space-y-2">
                <p className="text-xs italic text-slate-400">Belum disetujui</p>
                {canDraftQA && (
                  <button onClick={handleDikaji} className="no-print px-3 py-1 bg-rose-800 hover:bg-rose-900 text-white rounded text-xs font-semibold">
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
                <div className="flex justify-center"><VerifyQR type="pengkajian" facility={facilityKey} period={month} signerRole="Mengetahui" signerName={report.signoff.diperiksa.nama} size={54} /></div>
                <p className="text-xs font-bold text-slate-800">{report.signoff.diperiksa.nama}</p>
                <p className="text-[10px] text-slate-400">{report.signoff.diperiksa.tanggal}</p>
              </div>
            ) : (
              <div className="my-auto space-y-2">
                <p className="text-xs italic text-slate-400">{report?.signoff?.dinilai?.nama ? "Menunggu approval Manager QA" : "Menunggu approval 'Dikaji Oleh' terlebih dahulu"}</p>
                {canFinalQA && report?.signoff?.dinilai?.nama && (
                  <button onClick={handleMengetahui} className="no-print px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold">
                    Approve Final "Mengetahui"
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= HALAMAN PENGKAJIAN QA RESMI ========================================================================= */
function PengkajianPage({ session, month, setView, initialFacility, initialRoom }) {
  const [facilityKey, setFacilityKey] = useState(initialFacility || FACILITIES[0].key);
  const [selectedRoomName, setSelectedRoomName] = useState(initialRoom || "");
  const [report, setReport] = useState(null);
  const [pendahuluan, setPendahuluan] = useState("");
  const [kesimpulanUmum, setKesimpulanUmum] = useState("");
  const [perParameter, setPerParameter] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);

  const cfg = FACILITIES.find((f) => f.key === facilityKey) || FACILITIES[0];
  const canDraftQA = hasAccess(session, "Supervisor", "QA");
  const canFinalQA = hasAccess(session, "Manager", "QA");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, roomRes, entryRes] = await Promise.all([
        fetchReport(facilityKey, month, session.token, selectedRoomName),
        fetchMaster(facilityKey),
        fetchEntries(facilityKey, month),
      ]);
      const roomList = Array.isArray(roomRes) ? roomRes : (roomRes?.rooms || []);
      const allEntries = Array.isArray(entryRes) ? entryRes : (entryRes?.entries || []);

      setReport(r);
      setPendahuluan(r?.narrative?.pendahuluan || "");
      setKesimpulanUmum(r?.narrative?.kesimpulanUmum || "");
      setPerParameter(r?.narrative?.perParameter || {});
      setRooms(roomList);
      setMonthEntries(selectedRoomName ? (allEntries || []).filter((e) => e?.roomName === selectedRoomName) : (allEntries || []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey, month, session.token, selectedRoomName]);

  useEffect(() => { load(); }, [load]);

  const isFinal = !!report?.signoff?.diperiksa?.nama;

  async function handleSave() {
    setError("");
    try {
      await apiSaveReport(facilityKey, month, { pendahuluan, kesimpulanUmum, perParameter }, session.token, selectedRoomName);
      await load();
    } catch (err) { setError(err.message); }
  }

  async function handleDikaji() {
    setError("");
    try { await apiApproveDikaji(facilityKey, month, session.token, selectedRoomName); await load(); } catch (err) { setError(err.message); }
  }

  async function handleMengetahui() {
    setError("");
    try { await apiApproveMengetahui(facilityKey, month, session.token, selectedRoomName); await load(); } catch (err) { setError(err.message); }
  }

  async function handleGenerateAI() {
    setGenerating(true);
    setError("");
    try {
      const targetLabel = cfg.label + (selectedRoomName ? ` — ${selectedRoomName}` : "");
      const facilityStats = buildFacilityStats({ facilityLabel: targetLabel, monthLabel: monthLabelID(month), entries: monthEntries, rooms });
      let narrative;
      try {
        narrative = await generateNarrative({ facilityLabel: targetLabel, monthLabel: monthLabelID(month), stats: facilityStats.stats });
      } catch (aiErr) {
        narrative = generateLocalNarrative({ facilityLabel: targetLabel, monthLabel: monthLabelID(month), entries: monthEntries, rooms });
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

  const distinctReportLimits = useMemo(() => {
    const map = {};
    const relevantRooms = selectedRoomName ? (rooms || []).filter((r) => r?.name === selectedRoomName) : (rooms || []);
    relevantRooms.forEach((rObj) => {
      if (rObj && rObj.persyaratanKey) {
        map[rObj.persyaratanKey] = rObj.limits;
      }
    });
    return map;
  }, [rooms, selectedRoomName]);

  const roomsMap = useMemo(() => {
    const map = {};
    (rooms || []).forEach((r) => {
      if (r?.name) map[r.name] = r.persyaratanKey || "—";
    });
    return map;
  }, [rooms]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 print:max-w-none print:p-0">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setView({ page: "facility", facility: facilityKey })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft size={16} /> Kembali ke {cfg?.label}
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Printer size={14} /> Cetak Pengkajian
        </button>
      </div>

      {/* HEADER KOP PENGKAJIAN QA */}
      <div className="overflow-hidden rounded-xl border border-slate-200 print-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-r from-black via-zinc-950 to-rose-950 px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-rose-600/20 blur-3xl" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-start gap-3">
              <img src="/logo-rama.png" alt="Logo" className="h-12 w-12 object-contain brightness-0 invert" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">PT. Rama Emerald Multi Sukses — QA</p>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {selectedRoomName ? `Pengkajian Tren Ruangan — ${selectedRoomName}` : `Pengkajian Trend Data EM Non Viable (Global)`}
                </h1>
                <p className="text-xs text-rose-100/90 mt-0.5">
                  Fasilitas: <span className="font-semibold text-white">{cfg?.label}</span> · Periode: <span className="font-semibold text-white">{monthLabelID(month)}</span>
                  {selectedRoomName && <span> · Ruangan: <span className="font-semibold text-white">{selectedRoomName}</span></span>}
                </p>
              </div>
            </div>
            <p className="text-right text-xs text-rose-200">POS.QA.025</p>
          </div>
        </div>
      </div>

      {/* FILTER FASILITAS & CAKUPAN */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-700 mr-1">Fasilitas:</span>
          {FACILITIES.map((f) => (
            <button
              key={f.key}
              onClick={() => { setFacilityKey(f.key); setSelectedRoomName(""); }}
              className={`text-xs rounded-full px-3 py-1 font-medium transition ${facilityKey === f.key ? "bg-rose-900 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-700">Cakupan Pengkajian:</label>
          <select
            value={selectedRoomName}
            onChange={(e) => setSelectedRoomName(e.target.value)}
            className="border rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none bg-slate-50"
          >
            <option value="">Semua Ruangan (Global 1 Fasilitas)</option>
            {(rooms || []).map((r) => (
              <option key={r.code + r.name} value={r.name}>
                Khusus Ruang: {r.code} — {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">{error}</p>}

      {/* 1. TABEL REKAP NILAI DATA DENGAN KOLOM PERSYARATAN */}
      <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3 print-card avoid-break">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
            {selectedRoomName ? `Rekap Data Pengukuran Bulanan — ${selectedRoomName}` : `Rekap Data Pengukuran Seluruh Ruangan — Fasilitas ${cfg?.label}`}
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">{(monthEntries || []).length} Baris Data Tersedia</span>
        </div>

        {(monthEntries || []).length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed text-xs text-slate-400">
            Belum ada data pengukuran yang tercatat pada periode ini.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100 print:max-h-none print:overflow-visible">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-50 text-slate-600 border-b print:static">
                <tr>
                  <th className="px-3 py-2">TANGGAL</th>
                  <th className="px-2 py-2 text-center">JAM</th>
                  <th className="px-3 py-2">RUANGAN</th>
                  <th className="px-2 py-2 text-center">PERSYARATAN</th>
                  <th className="px-2 py-2 text-center">SUHU (°C)</th>
                  <th className="px-2 py-2 text-center">RH (%)</th>
                  <th className="px-2 py-2 text-center">DPG (Pa)</th>
                  <th className="px-2 py-2 text-center">OPR</th>
                  <th className="px-2 py-2 text-center">SPV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(monthEntries || []).map((e) => {
                  const reqKey = roomsMap[e.roomName] || e.persyaratanKey || "—";
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-1.5 font-medium text-slate-700">{e.tanggal}</td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{e.jam}</td>
                      <td className="px-3 py-1.5 text-slate-700 font-medium">{e.roomName}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-block bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] border border-slate-200">
                          {reqKey}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: levelStyle(e?.level?.suhu).bg, color: levelStyle(e?.level?.suhu).color }}>
                          {e.suhu ?? "-"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: levelStyle(e?.level?.rh).bg, color: levelStyle(e?.level?.rh).color }}>
                          {e.rh ?? "-"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: levelStyle(e?.level?.dpg).bg, color: levelStyle(e?.level?.dpg).color }}>
                          {e.dpg ?? "-"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-500 font-medium text-[11px]">{e.opr || "—"}</td>
                      <td className="px-2 py-1.5 text-center text-slate-500 font-medium text-[11px]">{e.spv || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. CARD PERSYARATAN & LIMIT */}
      {Object.keys(distinctReportLimits).length > 0 && (
        <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3 print-card avoid-break">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Persyaratan &amp; Batas Limit (Jenis Limit Terpakai)</h3>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b">
                  <th className="px-3 py-1.5">KODE / PERSYARATAN</th>
                  <th className="px-3 py-1.5">PARAMETER</th>
                  <th className="px-3 py-1.5">SYARAT</th>
                  <th className="px-3 py-1.5">ALERT LIMIT</th>
                  <th className="px-3 py-1.5">ACTION LIMIT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(distinctReportLimits).map(([pKey, limits]) => {
                  return PARAM_DEFS.map((p) => {
                    const lim = limits?.[p.key];
                    if (!lim) return null;
                    const allNull = [lim.syaratL, lim.syaratU, lim.alertL, lim.alertU, lim.actionL, lim.actionU].every((x) => toNumberSafe(x) === null);
                    if (allNull) return null;
                    const isDpg = p.key === "dpg";

                    return (
                      <tr key={pKey + p.key}>
                        <td className="px-3 py-1.5 font-bold text-slate-800">{pKey}</td>
                        <td className="px-3 py-1.5 font-semibold text-slate-700">{p.label}</td>
                        <td className="px-3 py-1.5 text-slate-800">{formatRange(lim.syaratL, lim.syaratU, p.unit, isDpg)}</td>
                        <td className="px-3 py-1.5 text-amber-700">{formatRange(lim.alertL, lim.alertU, p.unit, isDpg)}</td>
                        <td className="px-3 py-1.5 text-orange-700">{formatRange(lim.actionL, lim.actionU, p.unit, isDpg)}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/> Terkendali</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/> Alert</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"/> Action</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/> Melebihi Syarat</span>
          </div>
        </div>
      )}

      {/* 3. GRAFIK TREN BULANAN */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">Grafik Tren Pengukuran Periode {monthLabelID(month)}</h2>
        <div className="space-y-4">
          {PARAM_DEFS.map((p) => {
            const rObj = selectedRoomName ? (rooms || []).find((r) => r?.name === selectedRoomName) : null;
            return (
              <RoomMonthlyTrendChart
                key={p.key}
                entriesData={monthEntries}
                paramKey={p.key}
                paramLabel={p.label}
                unit={p.unit}
                limit={rObj?.limits?.[p.key]}
                isGlobal={!selectedRoomName}
              />
            );
          })}
        </div>
      </div>

      {/* 4. FORM NARASI & APPROVAL QA */}
      <div className="bg-white rounded-xl border p-5 shadow-sm space-y-4 print-card avoid-break">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-sm font-bold text-slate-800">
            {selectedRoomName ? `Pembahasan & Narasi Pengkajian — ${selectedRoomName}` : `Pembahasan & Narasi Pengkajian Fasilitas ${cfg?.label} (Global)`}
          </h2>
          {canDraftQA && !isFinal && (
            <div className="flex items-center gap-2 no-print">
              <button onClick={handleGenerateAI} disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-800 hover:bg-rose-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60">
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate Narasi AI
              </button>
              <button onClick={handleSave} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white">
                <Save size={13} /> Simpan Draf
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="no-print block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Pendahuluan</label>
          <p className="only-print text-xs font-bold text-slate-700 uppercase mb-1">Pendahuluan</p>
          <textarea value={pendahuluan} onChange={(e) => setPendahuluan(e.target.value)} disabled={!canDraftQA || isFinal} rows={2}
            className="no-print w-full border rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-rose-700 disabled:bg-slate-50" />
          <p className="only-print text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{pendahuluan || "-"}</p>
        </div>

        {PARAM_DEFS.map((p) => (
          <div key={p.key} className="space-y-1.5 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700">Hasil, Tren &amp; Kesimpulan — {p.label} ({p.unit})</label>
            <textarea value={perParameter[p.key] || ""} onChange={(e) => setPerParameter({ ...perParameter, [p.key]: e.target.value })}
              disabled={!canDraftQA || isFinal} rows={3}
              placeholder={`Tulis ulasan hasil, tren, dan kesimpulan untuk parameter ${p.label}...`}
              className="no-print w-full border rounded-lg p-2.5 text-xs text-slate-800 bg-white outline-none focus:border-rose-700 disabled:bg-slate-50" />
            <p className="only-print text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{perParameter[p.key] || "-"}</p>
          </div>
        ))}

        <div>
          <label className="no-print block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Kesimpulan Umum</label>
          <p className="only-print text-xs font-bold text-slate-700 uppercase mb-1">Kesimpulan Umum</p>
          <textarea value={kesimpulanUmum} onChange={(e) => setKesimpulanUmum(e.target.value)} disabled={!canDraftQA || isFinal} rows={3}
            className="no-print w-full border rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-rose-700 disabled:bg-slate-50" />
          <p className="only-print text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{kesimpulanUmum || "-"}</p>
        </div>

        {/* SECTION 5: TANDA TANGAN */}
        <div className="pt-4 border-t grid grid-cols-1 sm:grid-cols-2 gap-4 avoid-break">
          <div className="border rounded-xl p-4 bg-slate-50/50 text-center flex flex-col justify-between min-h-[140px]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dikaji Oleh (Supervisor QA)</p>
            {report?.signoff?.dinilai?.nama ? (
              <div className="space-y-1 my-auto">
                <div className="flex justify-center"><VerifyQR type="pengkajian" facility={facilityKey} period={month} roomName={selectedRoomName} signerRole="Dikaji Oleh" signerName={report.signoff.dinilai.nama} size={54} /></div>
                <p className="text-xs font-bold text-slate-800">{report.signoff.dinilai.nama}</p>
                <p className="text-[10px] text-slate-400">{report.signoff.dinilai.tanggal}</p>
              </div>
            ) : (
              <div className="my-auto space-y-2">
                <p className="text-xs italic text-slate-400">Belum disetujui</p>
                {canDraftQA && (
                  <button onClick={handleDikaji} className="no-print px-3 py-1 bg-rose-800 hover:bg-rose-900 text-white rounded text-xs font-semibold">
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
                <div className="flex justify-center"><VerifyQR type="pengkajian" facility={facilityKey} period={month} roomName={selectedRoomName} signerRole="Mengetahui" signerName={report.signoff.diperiksa.nama} size={54} /></div>
                <p className="text-xs font-bold text-slate-800">{report.signoff.diperiksa.nama}</p>
                <p className="text-[10px] text-slate-400">{report.signoff.diperiksa.tanggal}</p>
              </div>
            ) : (
              <div className="my-auto space-y-2">
                <p className="text-xs italic text-slate-400">{report?.signoff?.dinilai?.nama ? "Menunggu approval Manager QA" : "Menunggu approval 'Dikaji Oleh' terlebih dahulu"}</p>
                {canFinalQA && report?.signoff?.dinilai?.nama && (
                  <button onClick={handleMengetahui} className="no-print px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold">
                    Approve Final "Mengetahui"
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= FORMULIR BULANAN CETAK (FM.QA.024/R11) ========================================================================= */
function FormulirBulananPrint({ session, facilityKey, roomName, bulan, setView }) {
  const cfg = FACILITIES.find((f) => f.key === facilityKey) || FACILITIES[0];
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(roomName || "");
  const [entries, setEntries] = useState([]);
  const [formulir, setFormulir] = useState(null);
  const [busy, setBusy] = useState(false);

  const canKepalaBagian = cfg ? hasFacilityAccess(session, "Supervisor", cfg) : false;
  const canManagerQA = hasAccess(session, "Manager", "QA");

  const load = useCallback(async () => {
    try {
      const [master, entriesRes, formulirRes] = await Promise.all([
        fetchMaster(facilityKey),
        fetchEntries(facilityKey, bulan),
        fetchFormulirBulanan(facilityKey, bulan, selectedRoom, session.token),
      ]);
      const roomList = Array.isArray(master) ? master : (master?.rooms || []);
      setRooms(roomList);
      const targetRoom = selectedRoom || roomList[0]?.name || "";
      setSelectedRoom(targetRoom);
      const list = Array.isArray(entriesRes) ? entriesRes : (entriesRes?.entries || []);
      setEntries(list.filter((e) => String(e?.roomName || "").trim() === String(targetRoom).trim()));
      setFormulir(formulirRes);
    } catch {
      // ignore
    }
  }, [facilityKey, bulan, selectedRoom, session.token]);

  useEffect(() => { load(); }, [load]);

  const n = daysInMonth(bulan);
  const byDay = {};
  (entries || []).forEach((e) => { byDay[e.tanggal + "|" + e.jam] = e; });
  const roomObj = (rooms || []).find((r) => r?.name === selectedRoom) || rooms[0];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 print:max-w-none print:p-0 space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setView({ page: "facility", facility: facilityKey })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft size={16} /> Kembali ke {cfg?.label}
        </button>
        <div className="flex items-center gap-2">
          <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-semibold outline-none">
            {(rooms || []).map((r) => <option key={r.code} value={r.name}>{r.name} ({r.code})</option>)}
          </select>
          {hasAccess(session, "Supervisor", "QA") && (
            <button onClick={() => setView({ page: "pengkajian", facility: facilityKey, room: selectedRoom })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <ClipboardList size={13} /> Pengkajian Ruangan Ini (Opsional)
            </button>
          )}
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

        <div className="overflow-x-auto print:overflow-visible">
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

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 text-center avoid-break">
          <div>
            <p className="mb-2 text-[11px] text-slate-500">(Kepala Bagian)</p>
            {formulir?.kepalaBagian?.nama ? (
              <>
                <div className="mb-1 flex justify-center"><VerifyQR type="formulir" facility={facilityKey} period={bulan} roomName={selectedRoom} signerRole="Kepala Bagian" signerName={formulir.kepalaBagian.nama} size={50} /></div>
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
                <div className="mb-1 flex justify-center"><VerifyQR type="formulir" facility={facilityKey} period={bulan} roomName={selectedRoom} signerRole="Manager QA" signerName={formulir.managerQA.nama} size={50} /></div>
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
  const [selectedMonth, setSelectedMonth] = useState(month || currentMonth());
  const [allMonths, setAllMonths] = useState(true);
  const [filterFacility, setFilterFacility] = useState("");

  const loadLogs = useCallback(() => {
    setLoading(true);
    fetchActivityLog(session.token, { month: allMonths ? undefined : selectedMonth, facility: filterFacility || undefined })
      .then((data) => {
        const logList = Array.isArray(data) ? data : (data?.logs || []);
        setLogs(logList);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [session.token, allMonths, selectedMonth, filterFacility]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft size={16} /> Kembali ke Dashboard
        </button>
        <button onClick={loadLogs} className="text-xs text-rose-800 hover:underline font-semibold">
          Refresh Log
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-800">Riwayat Aktivitas &amp; Audit Trail</h2>
          <p className="text-xs text-slate-400">Rekam jejak seluruh aksi login, input, ubah data, dan approval</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} className="rounded" />
            Tampilkan Semua Periode
          </label>

          {!allMonths && (
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="border rounded-lg px-2.5 py-1 text-xs text-slate-700 outline-none" />
          )}

          <select value={filterFacility} onChange={(e) => setFilterFacility(e.target.value)} className="border rounded-lg px-2.5 py-1 text-xs text-slate-700 outline-none font-medium">
            <option value="">Semua Fasilitas</option>
            {FACILITIES.map((f) => <option key={f.key} value={f.label}>{f.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
      ) : (logs || []).length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed text-slate-400 text-xs">
          Belum ada riwayat aktivitas yang tercatat untuk filter ini.
        </div>
      ) : (
        <div className="bg-white rounded-xl border divide-y text-xs shadow-xs">
          {(logs || []).map((l, i) => (
            <div key={i} className="p-3.5 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50/60">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{l.nama}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">{l.role}{l.departemen ? ` · ${l.departemen}` : ""}</span>
                  <span className="font-semibold text-rose-900 bg-rose-50 px-2 py-0.2 rounded text-[11px]">{l.aksi}</span>
                  {l.fasilitas && <span className="text-[11px] font-bold text-slate-700 bg-amber-50 border border-amber-200 px-1.5 rounded">{l.fasilitas}</span>}
                </div>
                {l.detail && <p className="text-slate-500 text-[11px]">{l.detail}</p>}
              </div>
              <span className="text-slate-400 text-[10px] whitespace-nowrap">{new Date(l.waktu).toLocaleString("id-ID")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================================================= VERIFIKASI QR (/verify) ========================================================================= */
function VerifyPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const type = params.get("type");
  const facilityKey = params.get("facility");
  const roomName = params.get("roomName") || "";
  const jam = params.get("jam") || "";
  const role = params.get("role") || "";
  const nameOverride = params.get("name") || "";
  const period = type === "pengkajian" ? params.get("month") : type === "formulir" ? params.get("bulan") : params.get("tanggal");
  const facility = FACILITIES.find((f) => f.key === facilityKey);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVerify(type, facilityKey, period, roomName).then(setData).finally(() => setLoading(false));
  }, [type, facilityKey, period, roomName]);

  const docTitle = type === "pengkajian"
    ? `Pengkajian Trend Data EM Non Viable (POS.QA.025)${roomName ? ` — Ruangan: ${roomName}` : " (Global)"}`
    : type === "formulir"
    ? `Formulir Pemantauan Bulanan (FM.QA.024/R11)${roomName ? ` — ${roomName}` : ""}`
    : `Data Pemantauan Harian (FM.QA.024/R11)${roomName ? ` — ${roomName}` : ""}${jam ? ` (${jam})` : ""}`;

  const signerDisplay = nameOverride || (
    role === "OPR"
      ? (data?.approvedBy?.opr || "Operator Terdaftar")
      : (data?.approvedBy?.nama || data?.approvedBy?.spv || "Supervisor / Manager")
  );

  const roleLabel = role === "OPR" ? "Diinput & Disetujui Oleh (OPR)" : (role || "Disetujui Oleh");

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm flex flex-col items-center space-y-4">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <img src="/logo-rama.png" alt="PT. Rama Emerald Multi Sukses" className="h-16 w-16 object-contain" />
          <h1 className="text-base font-bold text-slate-800">Verifikasi Dokumen EM Non Viable</h1>
          <p className="text-xs text-slate-500">PT. Rama Emerald Multi Sukses</p>
        </div>

        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center space-y-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mx-auto">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-sm font-bold text-emerald-800">Dokumen tercatat sah dalam sistem</h2>

          {loading ? (
            <div className="flex justify-center p-4"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
          ) : (
            <div className="bg-slate-50/80 rounded-xl p-4 text-left text-xs space-y-2 border border-slate-100">
              <p><span className="text-slate-400">Dokumen:</span> <span className="font-semibold text-slate-800">{docTitle}</span></p>
              <p><span className="text-slate-400">Fasilitas:</span> <span className="font-semibold text-slate-800">{facility?.label || facilityKey}</span></p>
              <p><span className="text-slate-400">Periode / Tanggal:</span> <span className="font-semibold text-slate-800">{period}</span></p>
              <p><span className="text-slate-400">{roleLabel}:</span> <span className="font-bold text-slate-900">{signerDisplay}</span></p>
              <p><span className="text-slate-400">Status Keabsahan:</span> <span className="font-semibold text-emerald-700">Terverifikasi Digital</span></p>
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-400 text-center max-w-xs leading-relaxed">
          Halaman ini menampilkan data langsung dari sistem database EM Non Viable secara real-time.
        </p>
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
  const [showProfile, setShowProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handleLogout = useCallback(() => {
    logout();
    setView({ page: "dashboard" });
    setShowProfile(false);
    setShowChangePassword(false);
  }, [logout]);

  useEffect(() => {
    const needsAuthPages = ["facility", "pengkajian", "formulir", "activity"];
    if (needsAuthPages.includes(view.page) && !session) {
      setView({ page: "dashboard" });
    }
  }, [session, view.page]);

  if (checking) return <div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50">
        <style>{`
          .only-print { display: none; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @media print {
            .no-print { display: none !important; }
            .only-print { display: block !important; }
            .print-card { box-shadow: none !important; page-break-inside: avoid !important; break-inside: avoid !important; border: 1px solid #cbd5e1 !important; margin-bottom: 1.5rem !important; }
            .avoid-break { page-break-inside: avoid !important; break-inside: avoid !important; }
            table { width: 100% !important; max-width: 100% !important; table-layout: auto !important; }
            body, html, #root { background: white !important; height: auto !important; }
          }
          @page {
            margin: 1.2cm 1cm 1.5cm 1cm;
            size: portrait;
          }
        `}</style>
        <TopBar
          session={session}
          onLoginClick={() => setShowLogin(true)}
          onLogout={handleLogout}
          onProfileClick={() => setShowProfile(true)}
          view={view}
          setView={setView}
        />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={login} />}
        {showProfile && session && (
          <ProfileModal
            session={session}
            onClose={() => setShowProfile(false)}
            onChangePasswordClick={() => {
              setShowProfile(false);
              setShowChangePassword(true);
            }}
          />
        )}
        {showChangePassword && session && (
          <ChangePasswordModal
            session={session}
            onClose={() => setShowChangePassword(false)}
          />
        )}
        {view.page === "dashboard" && <Dashboard month={month} setMonth={setMonth} setView={setView} session={session} onNeedLogin={() => setShowLogin(true)} />}
        {view.page === "facility" && session && <FacilityIntegratedPage session={session} facilityKey={view.facility} month={month} setMonth={setMonth} setView={setView} />}
        {view.page === "pengkajian" && session && <PengkajianPage session={session} month={month} setView={setView} initialFacility={view.facility} initialRoom={view.room} />}
        {view.page === "formulir" && session && <FormulirBulananPrint session={session} facilityKey={view.facility} roomName={view.room} bulan={view.bulan || month} setView={setView} />}
        {view.page === "activity" && session && <ActivityPage session={session} month={month} setView={setView} />}
      </div>
    </ErrorBoundary>
  );
}