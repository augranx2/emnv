import { useState, useEffect, useCallback, useMemo, Component } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  LogIn, LogOut, User, Loader2, Building2, ChevronLeft,
  Lock, History, Save, FileCheck2, ClipboardList,
  Printer, Sparkles, Calendar, Trash2, CheckCheck, CheckCircle2,
  ChevronRight, ChevronDown, AlertTriangle, KeyRound, LayoutDashboard,
  Menu, X, ShieldCheck, Activity, Layers, ArrowLeft, Boxes,
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
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-rose-100 shadow-xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Terjadi Kesalahan Tampilan</h2>
            <p className="text-xs text-slate-500 leading-relaxed">{String(this.state.error?.message || this.state.error)}</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.href = "/"; }}
              className="px-5 py-2.5 bg-rose-900 text-white rounded-xl text-xs font-semibold hover:bg-rose-950 transition shadow-sm"
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

/* ========================================================================= 17 FASILITAS & GRUP PEMETAAN ========================================================================= */
const FACILITIES = [
  { key: "nblProduksi", label: "NBL Produksi", department: "Produksi", group: "nbl" },
  { key: "nblKemasan", label: "NBL Kemasan", department: "Kemasan", altDepartment: "Produksi", group: "nbl" },
  { key: "gbbNbl", label: "GBB NBL", department: "GBB", altDepartment: "PPIC", group: "gbb" },

  { key: "blProduksi", label: "BL Produksi", department: "Produksi", group: "bl" },
  { key: "blKemasan", label: "BL Kemasan", department: "Kemasan", altDepartment: "Produksi", group: "bl" },
  { key: "gbbBl", label: "GBB BL", department: "GBB", altDepartment: "PPIC", group: "gbb" },

  { key: "sefaNonSterilProduksi", label: "Sefa Non Steril Produksi", department: "Produksi", group: "sefaNonSteril" },
  { key: "sefaNonSterilKemasan", label: "Sefa Non Steril Kemasan", department: "Kemasan", altDepartment: "Produksi", group: "sefaNonSteril" },
  { key: "gbbSefa", label: "GBB SEFA", department: "GBB", altDepartment: "PPIC", group: "gbb" },

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
  { key: "nbl", title: "Nonbetalaktam (NBL)", items: ["nblProduksi", "nblKemasan"] },
  { key: "bl", title: "Betalaktam (BL)", items: ["blProduksi", "blKemasan"] },
  { key: "sefaNonSteril", title: "Sefalosporin Non Steril", items: ["sefaNonSterilProduksi", "sefaNonSterilKemasan"] },
  { key: "sefaSteril", title: "Sefalosporin Steril", items: ["sefaSterilProduksi", "sefaSterilKemasan"] },
  { key: "gbb", title: "Gudang Bahan Baku (GBB)", items: ["gbbNbl", "gbbBl", "gbbSefa"] },
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
  0: { label: "Belum diisi", color: "#64748b", bg: "#f1f5f9", dot: "#94a3b8" },
  1: { label: "Terkendali", color: "#15803d", bg: "#dcfce7", dot: "#22c55e" },
  2: { label: "Alert", color: "#b45309", bg: "#fef3c7", dot: "#f59e0b" },
  3: { label: "Action", color: "#c2410c", bg: "#ffedd5", dot: "#f97316" },
  4: { label: "Melebihi Syarat", color: "#b91c1c", bg: "#fee2e2", dot: "#ef4444" },
};

function levelStyle(level) {
  if (level === null || level === undefined) return { label: "N/A", color: "#94a3b8", bg: "#f8fafc", dot: "#cbd5e1" };
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
    <a href={url} target="_blank" rel="noreferrer" title="Klik verifikasi TTD" className="inline-flex flex-col items-center gap-0.5 hover:opacity-80 transition">
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

/* ========================================================================= GRAFIK CROSS SECTION & BULANAN ========================================================================= */
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
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md px-3.5 py-2.5 text-xs shadow-xl space-y-1">
      <p className="font-semibold text-slate-800">{p.label}</p>
      <p className="text-sm font-extrabold" style={{ color: style.color }}>{p.value} {unit}</p>
      <p className="font-medium text-[11px]" style={{ color: style.color }}>{style.label}</p>
    </div>
  );
}

function LegendChip({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200 shadow-2xs">
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
      <div className="p-8 bg-slate-50/80 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
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
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs print-card avoid-break w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 bg-slate-50/60">
        <div>
          <p className="text-xs font-bold text-slate-800">{paramLabel}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Nilai Tertinggi: <span className="font-semibold text-slate-800">{peak.value} {unit}</span> ({peak.roomName})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LegendChip color="#15803d" label="Terkendali" />
          {alertVal !== null && <LegendChip color="#b45309" label={`Alert ${isDpg ? '≥ ' : ''}${alertVal}`} />}
          {actionVal !== null && <LegendChip color="#c2410c" label={`Action ${isDpg ? '≥ ' : ''}${actionVal}`} />}
          {syaratVal !== null && <LegendChip color="#b91c1c" label={`Syarat ${isDpg ? '≥ ' : ''}${syaratVal}`} />}
        </div>
      </div>
      <div className="p-4">
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

/* ========================================================================= SIDEBAR (TEMA HITAM PEKAT) ========================================================================= */
function Sidebar({ session, view, setView, status, onNeedLogin, isOpen, onClose }) {
  const [expandedGroups, setExpandedGroups] = useState({ nbl: true, gbb: true });

  const toggleGroup = (k) => {
    setExpandedGroups((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const navigateTo = (newView) => {
    if (newView.page === "facility" && !session) {
      onNeedLogin();
      return;
    }
    setView(newView);
    if (window.innerWidth < 1024) onClose();
  };

  return (
    <>
      {isOpen && (
        <div onClick={onClose} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity" />
      )}

      {/* Sidebar background zinc-950 / black */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-zinc-950 text-zinc-300 border-r border-zinc-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-zinc-800/80 bg-black/70">
          <button onClick={() => navigateTo({ page: "dashboard" })} className="flex items-center gap-3 text-left">
            <img src="/logo-rama.png" alt="Logo" className="h-9 w-9 object-contain brightness-0 invert" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white tracking-tight leading-tight truncate">EM Non Viable</p>
              <p className="text-[10px] font-medium text-rose-400 truncate">PT. Rama Emerald Multi Sukses</p>
            </div>
          </button>
          <button onClick={onClose} className="text-zinc-400 hover:text-white lg:hidden p-1">
            <X size={18} />
          </button>
        </div>

        {/* Menu Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Menu Utama</p>
            <button
              onClick={() => navigateTo({ page: "dashboard" })}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${view.page === "dashboard" ? "bg-rose-900 text-white shadow-lg shadow-rose-950/50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard Global</span>
            </button>
            {session && hasAccess(session, "Supervisor", "QA") && (
              <button
                onClick={() => navigateTo({ page: "pengkajian", facility: view.facility || "nblProduksi", room: "" })}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${view.page === "pengkajian" && !view.room ? "bg-rose-900 text-white shadow-lg shadow-rose-950/50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
              >
                <ClipboardList size={16} />
                <span>Pengkajian QA Global</span>
              </button>
            )}
            {session && hasAccess(session, "Supervisor") && (
              <button
                onClick={() => navigateTo({ page: "activity" })}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${view.page === "activity" ? "bg-rose-900 text-white shadow-lg shadow-rose-950/50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
              >
                <History size={16} />
                <span>Riwayat Aktivitas</span>
              </button>
            )}
          </div>

          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Area &amp; Fasilitas</p>
            {GROUPS.map((g) => {
              if (g.singleKey) {
                const fac = FACILITIES.find((f) => f.key === g.singleKey);
                const st = status[g.singleKey];
                const active = view.page === "facility" && view.facility === g.singleKey;
                const dotColor = st?.hasData ? (levelStyle(st.level).dot) : "#52525b";

                return (
                  <button
                    key={g.key}
                    onClick={() => navigateTo({ page: "facility", facility: g.singleKey })}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${active ? "bg-rose-900/70 text-white border border-rose-700/50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
                  >
                    <span className="truncate">{fac?.label || g.title}</span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                  </button>
                );
              }

              const isOpenGroup = !!expandedGroups[g.key];
              const isGroupActive = view.page === "facility" && g.items.includes(view.facility);
              const GroupIcon = g.key === "gbb" ? Boxes : Building2;

              return (
                <div key={g.key} className="space-y-0.5">
                  <button
                    onClick={() => toggleGroup(g.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${isGroupActive ? "text-rose-300" : "text-zinc-300 hover:bg-zinc-900"}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <GroupIcon size={14} className="text-zinc-400" />
                      <span className="truncate">{g.title}</span>
                    </div>
                    <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${isOpenGroup ? "rotate-180" : ""}`} />
                  </button>

                  {isOpenGroup && (
                    <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-zinc-800 ml-4">
                      {g.items.map((facKey) => {
                        const fac = FACILITIES.find((f) => f.key === facKey);
                        const st = status[facKey];
                        const active = view.page === "facility" && view.facility === facKey;
                        const dotColor = st?.hasData ? (levelStyle(st.level).dot) : "#52525b";

                        return (
                          <button
                            key={facKey}
                            onClick={() => navigateTo({ page: "facility", facility: facKey })}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition ${active ? "bg-rose-900 text-white font-semibold" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
                          >
                            <span className="truncate">{fac?.label}</span>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 border-t border-zinc-800/80 bg-black/40 text-[10px] text-zinc-500 flex justify-between items-center">
          <span>SOP POS.QA.025</span>
          <span className="text-emerald-500 font-semibold">Online Sync</span>
        </div>
      </aside>
    </>
  );
}

function HeaderBar({ session, onLoginClick, onLogout, onProfileClick, month, setMonth, onToggleSidebar }) {
  return (
    <header className="no-print sticky top-0 z-30 h-16 border-b border-slate-200 bg-white/90 backdrop-blur-md px-4 lg:px-8">
      <div className="h-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onToggleSidebar} className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Menu size={18} />
          </button>
          <div className="hidden sm:block">
            <p className="text-xs font-bold text-slate-800">PT. Rama Emerald Multi Sukses</p>
            <p className="text-[10px] text-slate-400">Quality Assurance Department</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 shadow-2xs">
            <Calendar size={13} className="text-rose-800" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-transparent border-none outline-none font-semibold text-xs text-slate-800 [color-scheme:light]"
            />
          </label>

          {session ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onProfileClick}
                className="flex items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition"
              >
                <div className="w-6 h-6 rounded-lg bg-rose-900 text-white flex items-center justify-center text-[10px] font-bold">
                  {session.nama.charAt(0)}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <p className="truncate max-w-[120px]">{session.nama}</p>
                  <p className="text-[9px] text-slate-400 font-normal">{session.role}</p>
                </div>
              </button>
              <button
                onClick={onLogout}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition"
                title="Keluar"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-900 hover:bg-rose-950 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition"
            >
              <LogIn size={14} /> Masuk
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* ========================================================================= DASHBOARD VIEW UTAMA ========================================================================= */
function DashboardOverview({ month, status, setView, session, onNeedLogin }) {
  const perluCount = FACILITIES.filter((f) => (status[f.key]?.level || 0) === 3).length;
  const tmsCount = FACILITIES.filter((f) => (status[f.key]?.level || 0) >= 4).length;
  const terkendaliCount = FACILITIES.filter((f) => status[f.key]?.hasData && (status[f.key]?.level || 0) < 3).length;
  const belumAdaCount = FACILITIES.filter((f) => !status[f.key]?.hasData).length;

  function handleOpenFacility(facKey) {
    if (!session) { onNeedLogin(); return; }
    setView({ page: "facility", facility: facKey });
  }

  return (
    <div className="space-y-6">
      {/* Banner Ringkasan */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-black via-zinc-950 to-rose-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-rose-600/20 blur-3xl" />
        <div className="relative space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 border border-rose-500/30 px-3 py-0.5 text-[11px] font-semibold text-rose-200">
            <ShieldCheck size={13} /> Sistem Pemantauan CPOB Non Viable
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Status Fasilitas EM Non Viable</h1>
          <p className="text-xs sm:text-sm text-rose-100/80 max-w-2xl leading-relaxed">
            Pemantauan berkala parameter Suhu, Kelembaban Relatif (RH), dan Perbedaan Tekanan Ruang (DPG) seluruh gedung produksi periode <b>{monthLabelID(month)}</b>.
          </p>
        </div>
      </div>

      {/* KPI Cards Ringkasan */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-400">Total Fasilitas</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{FACILITIES.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <p className="text-xs font-semibold text-emerald-700">Terkendali</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{terkendaliCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <p className="text-xs font-semibold text-amber-700">Perlu Perhatian</p>
          <p className="text-2xl font-bold text-amber-800 mt-1">{perluCount}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-xs">
          <p className="text-xs font-semibold text-red-700">Melebihi Syarat</p>
          <p className="text-2xl font-bold text-red-800 mt-1">{tmsCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-400">Belum Ada Data</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{belumAdaCount}</p>
        </div>
      </div>

      {/* Matriks Fasilitas */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Matriks 17 Fasilitas — {monthLabelID(month)}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GROUPS.map((g) => {
            if (g.singleKey) {
              const fac = FACILITIES.find((f) => f.key === g.singleKey);
              const st = status[g.singleKey];
              const lvl = levelStyle(st?.hasData ? st.level : null);

              return (
                <div
                  key={g.key}
                  onClick={() => handleOpenFacility(g.singleKey)}
                  className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs hover:border-rose-400 hover:shadow-md transition group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-rose-50 group-hover:text-rose-900 transition">
                        <Building2 size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">{fac?.label || g.title}</h3>
                        <p className="text-xs text-slate-400">Departemen {fac?.department}</p>
                      </div>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold shrink-0" style={{ background: lvl.bg, color: lvl.color }}>
                      {st?.hasData ? lvl.label : "Belum Ada Data"}
                    </span>
                  </div>
                </div>
              );
            }

            const GroupIcon = g.key === "gbb" ? Boxes : Building2;

            return (
              <div key={g.key} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b pb-2.5">
                  <div className="flex items-center gap-2">
                    <GroupIcon size={16} className="text-rose-800" />
                    <h3 className="text-sm font-bold text-slate-800">{g.title}</h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">{g.items.length} Sub-Area</span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {g.items.map((facKey) => {
                    const fac = FACILITIES.find((f) => f.key === facKey);
                    const st = status[facKey];
                    const lvl = levelStyle(st?.hasData ? st.level : null);

                    return (
                      <button
                        key={facKey}
                        onClick={() => handleOpenFacility(facKey)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-rose-300 hover:bg-rose-50/40 transition text-left"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-800">{fac?.label}</p>
                          <p className="text-[10px] text-slate-400">Dept: {fac?.department}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: lvl.bg, color: lvl.color }}>
                            {st?.hasData ? lvl.label : "Belum Ada Data"}
                          </span>
                          <ChevronRight size={14} className="text-slate-300" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
  const [status, setStatus] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStatusIndex(month)
      .then((d) => { if (!cancelled) setStatus(d?.status || d || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [month]);

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
      <div className="min-h-screen bg-slate-50 text-slate-800 flex">
        <style>{`
          .only-print { display: none; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @media print {
            .no-print, aside, header { display: none !important; }
            .only-print { display: block !important; }
            .print-card { box-shadow: none !important; page-break-inside: avoid !important; break-inside: avoid !important; border: 1px solid #cbd5e1 !important; margin-bottom: 1.5rem !important; }
            .avoid-break { page-break-inside: avoid !important; break-inside: avoid !important; }
            table { width: 100% !important; max-width: 100% !important; table-layout: auto !important; }
            body, html, #root { background: white !important; height: auto !important; }
            main { padding: 0 !important; margin: 0 !important; }
          }
          @page {
            margin: 1.2cm 1cm 1.5cm 1cm;
            size: portrait;
          }
        `}</style>

        {/* Sidebar Kiri Tema Hitam */}
        <Sidebar
          session={session}
          view={view}
          setView={setView}
          status={status}
          onNeedLogin={() => setShowLogin(true)}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Konten Utama Kanan */}
        <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
          <HeaderBar
            session={session}
            onLoginClick={() => setShowLogin(true)}
            onLogout={handleLogout}
            onProfileClick={() => setShowProfile(true)}
            month={month}
            setMonth={setMonth}
            onToggleSidebar={() => setSidebarOpen(true)}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {view.page === "dashboard" && (
              <DashboardOverview
                month={month}
                status={status}
                setView={setView}
                session={session}
                onNeedLogin={() => setShowLogin(true)}
              />
            )}
            {view.page === "facility" && session && (
              <FacilityIntegratedPage
                session={session}
                facilityKey={view.facility}
                month={month}
                setMonth={setMonth}
                setView={setView}
              />
            )}
            {view.page === "pengkajian" && session && (
              <PengkajianPage
                session={session}
                month={month}
                setView={setView}
                initialFacility={view.facility}
                initialRoom={view.room}
              />
            )}
            {view.page === "formulir" && session && (
              <FormulirBulananPrint
                session={session}
                facilityKey={view.facility}
                roomName={view.room}
                bulan={view.bulan || month}
                setView={setView}
              />
            )}
            {view.page === "activity" && session && (
              <ActivityPage
                session={session}
                month={month}
                setView={setView}
              />
            )}
          </main>
        </div>

        {/* Modals */}
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
      </div>
    </ErrorBoundary>
  );
}