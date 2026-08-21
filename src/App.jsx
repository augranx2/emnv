import { useState, useEffect, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ComposedChart, Line, Area, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import {
  LogIn, LogOut, User, Loader2, Building2, LayoutGrid, ChevronLeft, ChevronRight,
  Lock, CheckCircle2, XOctagon, History, Save, FileCheck2, ClipboardList,
  Printer, Sparkles, AlertTriangle, TrendingUp, Calendar, FileQuestion,
} from "lucide-react";
import {
  fetchMaster, fetchEntries, saveEntries as apiSaveEntries,
  fetchReport, saveReport as apiSaveReport, fetchStatusIndex,
  approveDikaji as apiApproveDikaji, approveMengetahui as apiApproveMengetahui,
  fetchActivityLog, fetchDayStatus, fetchOpenInputDates,
  approveDay as apiApproveDay, unapproveDay as apiUnapproveDay,
  approveOpr as apiApproveOpr, approveSpv as apiApproveSpv,
  openBackfill as apiOpenBackfill, changePassword as apiChangePassword,
  fetchVerify, generateNarrative,
  fetchFormulirBulanan, approveKepalaBagian as apiApproveKepalaBagian,
  unapproveKepalaBagian as apiUnapproveKepalaBagian,
  approveManagerQAFormulir as apiApproveManagerQAFormulir,
  unapproveManagerQAFormulir as apiUnapproveManagerQAFormulir,
} from "./api.js";
import { useAuth, hasAccess, hasFacilityAccess } from "./auth.js";
import { buildFacilityStats, generateLocalNarrative, fullDateID, monthLabelID } from "./narrativeGenerator.js";

/* ========================================================================= */

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

/* ========================================================================= QR VERIFIKASI TANDA TANGAN
   Sama seperti EM Viable: tiap approval (Approve Harian, Dikaji Oleh,
   Mengetahui Pengkajian) bisa di-scan untuk membuka halaman /verify yang
   mengambil data LANGSUNG dari sistem (live) — bukan dari gambar PDF-nya —
   supaya PDF yang sudah dicetak tidak bisa dipalsukan datanya. */
function buildVerifyUrl(params) {
  const qs = new URLSearchParams(params).toString();
  return `${window.location.origin}/verify?${qs}`;
}

function VerifyQR({ type, facility, period, roomName, size = 84, hideLabel = false }) {
  const params = { type, facility };
  if (type === "pengkajian") { params.month = period; if (roomName) params.roomName = roomName; }
  else if (type === "formulir") { params.bulan = period; params.roomName = roomName; }
  else { params.type = "harian"; params.tanggal = period; }
  const url = buildVerifyUrl(params);
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <QRCodeSVG value={url} size={size} level="M" bgColor="#ffffff" fgColor="#0f172a" />
      {!hideLabel && <span className="text-center text-[9px] leading-tight text-slate-400">Scan untuk verifikasi</span>}
    </div>
  );
}

const SESI = ["08:00", "13:00"];

const LEVEL_STYLE = {
  0: { label: "Belum diisi", color: "#64748b", bg: "#f1f5f9" },
  1: { label: "Baik", color: "#15803d", bg: "#dcfce7" },
  2: { label: "Alert", color: "#b45309", bg: "#fef3c7" },
  3: { label: "Action", color: "#c2410c", bg: "#ffedd5" },
  4: { label: "Deviasi", color: "#b91c1c", bg: "#fee2e2" },
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

// Sama seperti levelForTwoSided_ di Code.gs — dihitung ulang di klien supaya
// badge status bisa langsung berubah SAAT MENGETIK (tidak perlu simpan dulu
// baru status ter-update).
function toNumberSafe(v) {
  if (v === null || v === undefined || v === "" || v === "-") return NaN;
  return Number(String(v).replace(",", "."));
}
function inRangeClient(v, lower, upper) {
  if (lower !== null && lower !== undefined && v < lower) return false;
  if (upper !== null && upper !== undefined && v > upper) return false;
  return true;
}
function liveLevelFor(rawValue, limit) {
  if (!limit) return null;
  const allNull = [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU].every((x) => x === null || x === undefined);
  if (allNull) return null;
  if (rawValue === "-" ) return 1; // dianggap "diperiksa, alat tidak tersedia" — netral/baik
  const v = toNumberSafe(rawValue);
  if (rawValue === "" || rawValue === null || rawValue === undefined || Number.isNaN(v)) return 0;
  if (inRangeClient(v, limit.alertL, limit.alertU)) return 1;
  if (inRangeClient(v, limit.actionL, limit.actionU)) return 2;
  if (inRangeClient(v, limit.syaratL, limit.syaratU)) return 3;
  return 4;
}
// Level tertinggi dari nilai yang SEDANG diketik untuk ruangan terpilih
// (belum tentu sudah disimpan) — dipakai supaya badge status di header
// langsung bereaksi begitu operator mengetik.
function liveRoomLevel(values, room) {
  if (!room) return 0;
  let max = 0;
  SESI.forEach((jam) => {
    PARAM_DEFS.forEach((p) => {
      const lvl = liveLevelFor(values[jam]?.[p.key], room.limits?.[p.key]);
      if (lvl !== null && lvl > max) max = lvl;
    });
  });
  return max;
}

// Kelompokkan ruangan berdasarkan kategori (teks sebelum " : " di
// Persyaratan Key, mis. "Nonbetalaktam Nonsteril") — dipakai untuk
// optgroup di dropdown pemilih ruangan, mirip pengelompokan "Kelas" di EM
// Viable.
function roomCategory(room) {
  const key = room.persyaratanKey || "";
  const idx = key.indexOf(" : ");
  return idx === -1 ? key || "Lainnya" : key.slice(0, idx);
}

function formatNum(n) {
  if (n === null || n === undefined) return null;
  return String(n).replace(".", ",");
}

function formatRange(lower, upper, unit) {
  const lo = formatNum(lower);
  const hi = formatNum(upper);
  if (lo === null && hi === null) return "N/A";
  if (lo === null) return `≤ ${hi} ${unit}`;
  if (hi === null) return `≥ ${lo} ${unit}`;
  return `${lo} – ${hi} ${unit}`;
}

function daysInMonth(monthStr) {
  if (!monthStr) return 31;
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/* ========================================================================= GRAFIK TREN (dua sisi — beda dari EM Viable yang cuma "makin tinggi makin
   buruk": nilai Suhu/RH/DPG bisa terlalu RENDAH atau terlalu TINGGI, jadi
   pita Alert/Action digambar di ATAS & BAWAH garis Syarat, bukan cuma satu
   ambang batas seperti EM Viable. */
function chartDotColor(level) {
  return levelStyle(level).color;
}

function ChartDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4} fill={chartDotColor(payload.level)} stroke="#fff" strokeWidth={1.5} />;
}

function ChartTooltip({ active, payload, unit }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const style = levelStyle(p.level);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 max-w-[160px] font-semibold text-slate-600">{p.label}</p>
      <p className="text-sm font-bold" style={{ color: style.color }}>{p.value} {unit}</p>
      <p className="font-medium" style={{ color: style.color }}>{style.label}</p>
    </div>
  );
}

function LegendChip({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function ParamTrendChart({ entries, paramKey, paramLabel, unit, limit }) {
  if (!limit) return null;
  const dateCounts = {};
  entries.forEach((e) => { dateCounts[e.jam] = (dateCounts[e.jam] || 0) + 1; });
  const data = entries
    .map((e) => {
      const raw = e[paramKey];
      if (raw === null || raw === undefined || raw === "" || raw === "-") return null;
      const v = Number(String(raw).replace(",", "."));
      if (Number.isNaN(v)) return null;
      return { label: `${e.tanggal.slice(-2)}/${e.jam}`, value: v, level: e.level?.[paramKey] ?? 0 };
    })
    .filter(Boolean);
  if (data.length === 0) return null;

  const allVals = data.map((d) => d.value);
  const boundsForRange = [limit.syaratL, limit.syaratU, limit.alertL, limit.alertU, limit.actionL, limit.actionU, ...allVals].filter((v) => v !== null && v !== undefined);
  const yMin = Math.min(...boundsForRange) - (Math.max(...boundsForRange) - Math.min(...boundsForRange)) * 0.1 || 0;
  const yMax = Math.max(...boundsForRange) + (Math.max(...boundsForRange) - Math.min(...boundsForRange)) * 0.1 || 1;
  const peak = data.reduce((a, b) => (b.level > a.level ? b : a), data[0]);
  const peakStyle = levelStyle(peak.level);
  const gradId = `nvGrad-${paramKey}`;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print-card avoid-break">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-slate-100 px-4 py-2.5">
        <div>
          <p className="text-xs font-semibold text-slate-600">{paramLabel} — Tren Bulan Ini</p>
          <p className="text-[11px] text-slate-400">
            Status terburuk: <span className="font-semibold" style={{ color: peakStyle.color }}>{peak.value} {unit}</span> ({peakStyle.label})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LegendChip color="#15803d" label="Baik" />
          <LegendChip color="#b45309" label="Alert" />
          <LegendChip color="#c2410c" label="Action" />
          <LegendChip color="#b91c1c" label="Deviasi" />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 10, right: 15, left: 10, bottom: 30 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          {limit.syaratL !== null && <ReferenceArea y1={yMin} y2={limit.syaratL} fill="#ef4444" fillOpacity={0.06} ifOverflow="hidden" />}
          {limit.syaratU !== null && <ReferenceArea y1={limit.syaratU} y2={yMax} fill="#ef4444" fillOpacity={0.06} ifOverflow="hidden" />}
          {limit.actionL !== null && limit.syaratL !== null && <ReferenceArea y1={limit.syaratL} y2={limit.actionL} fill="#f97316" fillOpacity={0.07} ifOverflow="hidden" />}
          {limit.actionU !== null && limit.syaratU !== null && <ReferenceArea y1={limit.actionU} y2={limit.syaratU} fill="#f97316" fillOpacity={0.07} ifOverflow="hidden" />}
          {limit.alertL !== null && limit.actionL !== null && <ReferenceArea y1={limit.actionL} y2={limit.alertL} fill="#f59e0b" fillOpacity={0.06} ifOverflow="hidden" />}
          {limit.alertU !== null && limit.actionU !== null && <ReferenceArea y1={limit.alertU} y2={limit.actionU} fill="#f59e0b" fillOpacity={0.06} ifOverflow="hidden" />}
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} angle={-35} textAnchor="end" interval={0} height={40} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11, fill: "#64748b" }} width={38} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip unit={unit} />} />
          {limit.syaratL !== null && <ReferenceLine y={limit.syaratL} stroke="#dc2626" strokeWidth={1.25} strokeDasharray="4 3" />}
          {limit.syaratU !== null && <ReferenceLine y={limit.syaratU} stroke="#dc2626" strokeWidth={1.25} strokeDasharray="4 3" />}
          <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gradId})`} isAnimationActive={false} />
          <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={<ChartDot />} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================================================================= GRAFIK PERBANDINGAN ANTAR-RUANGAN (1 HARI)
   Beda dari ParamTrendChart (tren 1 ruangan sepanjang bulan): chart ini
   membandingkan SEMUA ruangan pada SATU tanggal yang sama — dipakai di
   halaman input harian (EntryPage) supaya kelihatan sekilas ruangan mana
   yang bermasalah pada hari itu. Karena tiap ruangan bisa punya batas
   Syarat/Alert/Action yang berbeda-beda, warna tiap batang mengikuti level
   status ruangan itu sendiri (bukan satu pita acuan bersama). */
function DayCompareTooltip({ active, payload, label, unit }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-600">{label}</p>
      {payload.map((p) => {
        const level = p.dataKey === "pagi" ? p.payload.pagiLevel : p.payload.siangLevel;
        const style = levelStyle(level);
        return (
          <p key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="text-slate-400">{p.dataKey === "pagi" ? "08:00" : "13:00"}</span>
            <span className="font-semibold" style={{ color: style.color }}>
              {p.value === null || p.value === undefined ? "—" : `${p.value} ${unit}`}
            </span>
          </p>
        );
      })}
    </div>
  );
}

function DayCompareChart({ paramLabel, unit, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print-card avoid-break">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-slate-100 px-4 py-2.5">
        <p className="text-xs font-semibold text-slate-600">{paramLabel} — Perbandingan Seluruh Ruangan ({unit})</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LegendChip color="#15803d" label="Baik" />
          <LegendChip color="#b45309" label="Alert" />
          <LegendChip color="#c2410c" label="Action" />
          <LegendChip color="#b91c1c" label="Deviasi" />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34)}>
        <ComposedChart data={rows} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis type="category" dataKey="room" tick={{ fontSize: 10, fill: "#475569" }} width={130} axisLine={false} tickLine={false} />
          <Tooltip content={<DayCompareTooltip unit={unit} />} />
          <Bar dataKey="pagi" name="08:00" radius={[0, 3, 3, 0]} barSize={10} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={`p-${i}`} fill={chartDotColor(r.pagiLevel)} />)}
          </Bar>
          <Bar dataKey="siang" name="13:00" radius={[0, 3, 3, 0]} barSize={10} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={`s-${i}`} fill={chartDotColor(r.siangLevel)} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================================================================= TOPBAR, LOGIN, DASHBOARD */

function TopBar({ session, onLoginClick, onLogout, view, setView }) {
  const [showProfile, setShowProfile] = useState(false);
  return (
    <div className="no-print border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <button onClick={() => setView({ page: "dashboard" })} className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-8 w-8 object-contain" />
          EM Non Viable — PT. Rama Emerald Multi Sukses
        </button>
        <div className="flex items-center gap-2">
          {session && hasAccess(session, "Supervisor", "QA") && (
            <button onClick={() => setView({ page: "pengkajian" })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view.page === "pengkajian" ? "bg-gradient-to-r from-black to-maroon-800 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              <ClipboardList size={14} /> Pengkajian
            </button>
          )}
          {session && hasAccess(session, "Supervisor") && (
            <button onClick={() => setView({ page: "activity" })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view.page === "activity" ? "bg-gradient-to-r from-black to-maroon-800 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              <History size={14} /> Riwayat Aktivitas
            </button>
          )}
          {session ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowProfile(true)}
                className="hidden items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 sm:inline-flex">
                <User size={13} /> {session.nama} · {session.role}{session.departemen ? ` ${session.departemen}` : ""}
              </button>
              <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <LogOut size={14} /> Keluar
              </button>
            </div>
          ) : (
            <button onClick={onLoginClick} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-black to-maroon-700 px-3 py-1.5 text-xs font-semibold text-white hover:to-maroon-600">
              <LogIn size={14} /> Login
            </button>
          )}
        </div>
      </div>
      {showProfile && session && <ProfileModal session={session} onClose={() => setShowProfile(false)} />}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <Lock size={18} className="text-maroon-700" />
          <h3 className="text-base font-bold text-slate-800">Login EM Non Viable</h3>
        </div>
        <form onSubmit={submit}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Username</label>
          <input autoFocus type="text" value={username} onChange={(ev) => setUsername(ev.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-maroon-500 focus:outline-none" />
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
          <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-maroon-500 focus:outline-none" />
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Batal
            </button>
            <button type="submit" disabled={submitting || !username || !password}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-black to-maroon-700 px-3 py-1.5 text-sm font-semibold text-white hover:to-maroon-600 disabled:opacity-60">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null} Masuk
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileModal({ session, onClose }) {
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault();
    setError("");
    if (newPassword.length < 6) { setError("Password baru minimal 6 karakter."); return; }
    if (newPassword !== confirmPassword) { setError("Konfirmasi password baru tidak cocok."); return; }
    setSubmitting(true);
    try {
      const res = await apiChangePassword(session.token, oldPassword, newPassword);
      if (res.error) { setError(res.error); return; }
      setSuccess(true);
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Gagal mengubah password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <User size={18} className="text-maroon-700" />
          <h3 className="text-base font-bold text-slate-800">Profil Saya</h3>
        </div>

        <div className="mb-4 space-y-1.5 rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <p className="flex justify-between"><span className="text-slate-500">Username</span> <span className="font-medium text-slate-700">{session.username}</span></p>
          <p className="flex justify-between"><span className="text-slate-500">Nama Lengkap</span> <span className="font-medium text-slate-700">{session.nama}</span></p>
          <p className="flex justify-between"><span className="text-slate-500">Jabatan</span> <span className="font-medium text-slate-700">{session.role}</span></p>
          <p className="flex justify-between"><span className="text-slate-500">Departemen</span> <span className="font-medium text-slate-700">{session.departemen || "-"}</span></p>
        </div>

        {!showChangePw ? (
          <div className="flex justify-between gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Tutup
            </button>
            <button onClick={() => setShowChangePw(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-black to-maroon-700 px-3 py-1.5 text-sm font-semibold text-white hover:to-maroon-600">
              <Lock size={14} /> Ganti Password
            </button>
          </div>
        ) : success ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-600" size={28} />
            <p className="mb-4 text-sm text-slate-600">Password berhasil diubah.</p>
            <button onClick={onClose} className="rounded-lg bg-gradient-to-r from-black to-maroon-700 px-4 py-1.5 text-sm font-semibold text-white hover:to-maroon-600">Tutup</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password Lama</label>
            <input type="password" value={oldPassword} onChange={(ev) => setOldPassword(ev.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-maroon-500 focus:outline-none" />
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password Baru</label>
            <input type="password" value={newPassword} onChange={(ev) => setNewPassword(ev.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-maroon-500 focus:outline-none" />
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Konfirmasi Password Baru</label>
            <input type="password" value={confirmPassword} onChange={(ev) => setConfirmPassword(ev.target.value)}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-maroon-500 focus:outline-none" />
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowChangePw(false); setError(""); }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Kembali
              </button>
              <button type="submit" disabled={submitting || !oldPassword || !newPassword || !confirmPassword}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-black to-maroon-700 px-3 py-1.5 text-sm font-semibold text-white hover:to-maroon-600 disabled:opacity-60">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null} Simpan Password Baru
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ========================================================================= DASHBOARD */

function StatCard({ icon, iconColor, tint, border, value, label }) {
  return (
    <div
      className="rounded-xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: `linear-gradient(155deg, ${tint} 0%, #ffffff 72%)`, borderColor: border }}
    >
      <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm" style={{ color: iconColor }}>
        {icon}
      </span>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs font-medium text-slate-600">{label}</p>
    </div>
  );
}

function StatusPill({ level, hasData }) {
  if (!hasData) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-500">
        Belum ada data
      </span>
    );
  }
  if (level >= 4) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "#fee2e2", color: "#b91c1c" }}>
        <AlertTriangle size={13} /> Melebihi Syarat
      </span>
    );
  }
  if (level === 3) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "#ffedd5", color: "#c2410c" }}>
        <AlertTriangle size={13} /> Terkendali (Perlu Perhatian)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "#dcfce7", color: "#15803d" }}>
      <CheckCircle2 size={13} /> Terkendali
    </span>
  );
}

const STATUS_TINT = {
  0: { bg: "#f1f5f9", fg: "#64748b" },
  1: { bg: "#dcfce7", fg: "#15803d" },
  2: { bg: "#dcfce7", fg: "#15803d" },
  3: { bg: "#ffedd5", fg: "#c2410c" },
  4: { bg: "#fee2e2", fg: "#b91c1c" },
};

const STATUS_ACCENT = { 0: "#cbd5e1", 1: "#22c55e", 2: "#22c55e", 3: "#f97316", 4: "#ef4444" };

function monthLabel(monthKey) {
  return monthLabelID(monthKey);
}

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
      .catch((err) => { if (!cancelled) setStatusError("Gagal memuat status dari spreadsheet: " + err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const perluCount = FACILITIES.filter((f) => (status[f.key]?.level || 0) === 3).length;
  const tmsCount = FACILITIES.filter((f) => (status[f.key]?.level || 0) >= 4).length;
  const terkendaliCount = FACILITIES.filter((f) => status[f.key]?.hasData && (status[f.key]?.level || 0) < 3).length;
  const belumAdaCount = FACILITIES.filter((f) => !status[f.key]?.hasData).length;

  function openFacility(key) {
    if (!session) { onNeedLogin(); return; }
    setView({ page: "entry", facility: key });
  }

  return (
    <div>
      <div className="relative overflow-hidden bg-gradient-to-br from-black via-maroon-950 to-maroon-800">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-maroon-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="relative mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-6 py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-maroon-200">PT. Rama Emerald Multi Sukses — QA</p>
            <h1 className="text-2xl font-bold text-white">Dashboard EM Non Viable</h1>
            <p className="mt-1 text-sm text-maroon-50">Rekap pemantauan Suhu, Kelembaban (RH), dan Perbedaan Tekanan (DPG) per fasilitas</p>
          </div>
          <label className="no-print inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm">
            <Calendar size={15} className="text-maroon-100" />
            <input type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} onClick={(ev) => ev.currentTarget.showPicker?.()}
              className="border-none bg-transparent text-sm text-white outline-none [color-scheme:dark]" />
          </label>
        </div>
      </div>
      <div className="mx-auto max-w-5xl p-6">

        {statusError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{statusError}</p>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard icon={<LayoutGrid size={17} />} iconColor="#b45309" tint="#fef3c7" border="#fde68a" value={FACILITIES.length} label="Total Fasilitas" />
          <StatCard icon={<CheckCircle2 size={17} />} iconColor="#15803d" tint="#dcfce7" border="#bbf7d0" value={terkendaliCount} label="Terkendali" />
          <StatCard icon={<AlertTriangle size={17} />} iconColor="#c2410c" tint="#ffedd5" border="#fed7aa" value={perluCount} label="Perlu Perhatian" />
          <StatCard icon={<XOctagon size={17} />} iconColor="#b91c1c" tint="#fee2e2" border="#fecaca" value={tmsCount} label="Melebihi Syarat" />
          <StatCard icon={<FileQuestion size={17} />} iconColor="#475569" tint="#f1f5f9" border="#e2e8f0" value={belumAdaCount} label="Belum Ada Data" />
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Fasilitas — {monthLabel(month)}</p>
        <div className="space-y-2.5">
          {FACILITIES.map((f) => {
            const st = status[f.key];
            const level = st?.hasData ? (st?.level || 0) : 0;
            const accent = STATUS_ACCENT[level];
            const tint = STATUS_TINT[level];
            return (
              <button key={f.key} onClick={() => openFacility(f.key)}
                className="group flex w-full items-center justify-between overflow-hidden rounded-xl border border-slate-200 bg-white pr-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-maroon-400 hover:shadow-md">
                <span className="self-stretch w-1.5" style={{ background: accent }} />
                <div className="flex flex-1 items-center gap-3 py-3.5 pl-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: tint.bg, color: tint.fg }}><Building2 size={19} /></span>
                  <div>
                    <p className="font-semibold text-slate-800">{f.label}</p>
                    <p className="text-xs text-slate-400">{loading ? "Memuat..." : st?.hasData ? "Ada data bulan ini" : "Belum ada data bulan ini"}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {loading ? <Loader2 className="animate-spin text-slate-300" size={18} /> : <StatusPill level={st?.level || 0} hasData={!!st?.hasData} />}
                  <ChevronRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-maroon-500" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= ENTRY HARIAN (per fasilitas + tanggal) */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BackfillForm({ session, facilityKey, onOpened }) {
  const [tanggal, setTanggal] = useState("");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiOpenBackfill(facilityKey, tanggal, alasan, session.token);
      setTanggal("");
      setAlasan("");
      onOpened();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border p-4 space-y-2">
      <div className="text-sm font-medium text-slate-700">Buka Kembali Tanggal yang Sudah Di-ACC</div>
      <p className="text-xs text-slate-400 -mt-1">Tanggal yang belum di-ACC SPV/Manager tidak perlu ini — operator sudah bisa langsung isi/lanjutkan tanggal itu. Form ini khusus untuk membuka kembali tanggal yang SUDAH terkunci karena sudah di-approve.</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tanggal</label>
          <input type="date" value={tanggal} max={todayStr()} onChange={(e) => setTanggal(e.target.value)} required className="border rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500 mb-1">Alasan</label>
          <input value={alasan} onChange={(e) => setAlasan(e.target.value)} required className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="mis. operator lupa input, sistem down, dll." />
        </div>
        <button type="submit" disabled={busy} className="text-sm bg-slate-800 text-white rounded-lg px-4 py-1.5 disabled:opacity-60">Buka Akses</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function EntryPage({ session, facilityKey, setView }) {
  const cfg = FACILITIES.find((f) => f.key === facilityKey);
  const canInput = hasFacilityAccess(session, "Staff", cfg);
  const canApprove = hasFacilityAccess(session, "Supervisor", cfg);
  // Tombol "Approve (OPR)" HANYA untuk role Staff (operator) atau
  // Administrator — SPV/Manager tidak boleh approve sebagai OPR sendiri
  // (menjaga pemisahan tugas OPR vs SPV), meskipun secara hierarki role
  // mereka bisa saja input data (canInput tetap true untuk mereka).
  const isOperatorRole = session.role === "Staff" || session.role === "Administrator";

  const [openDates, setOpenDates] = useState({ today: todayStr(), backfillDates: [] });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [rooms, setRooms] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const [dayStatus, setDayStatus] = useState(null);
  // values sekarang menampung SEMUA ruangan sekaligus untuk tanggal
  // terpilih — { [roomName]: { "08:00": {suhu,rh,dpg,opr,spv}, "13:00": {...} } }
  // — beda dari versi lama yang cuma menyimpan 1 ruangan yang sedang dipilih.
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingRoom, setSavingRoom] = useState(null); // nama ruangan yang sedang disimpan/approve
  const [approvingDate, setApprovingDate] = useState(null);
  const [error, setError] = useState("");

  const month = selectedDate.slice(0, 7);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dates, roomList] = await Promise.all([fetchOpenInputDates(facilityKey, session.token), fetchMaster(facilityKey)]);
      setOpenDates(dates);
      setRooms(roomList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey, session.token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadDate = useCallback(async () => {
    setError("");
    try {
      const [entries, status] = await Promise.all([fetchEntries(facilityKey, month), fetchDayStatus(facilityKey, selectedDate, session.token)]);
      setMonthEntries(entries);
      setDayStatus(status);
    } catch (err) {
      setError(err.message);
    }
  }, [facilityKey, month, selectedDate, session.token]);

  useEffect(() => { loadDate(); }, [loadDate]);

  // Bangun ulang nilai form untuk SEMUA ruangan setiap kali tanggal/ruangan
  // master/data bulan berubah — supaya seluruh ruangan langsung terlihat
  // isiannya begitu tanggal dipilih, tanpa perlu memilih ruangan satu-satu.
  useEffect(() => {
    const initAll = {};
    rooms.forEach((r) => {
      const req = r.required || {};
      const byJam = { "08:00": null, "13:00": null };
      monthEntries.filter((e) => e.roomName === r.name && e.tanggal === selectedDate).forEach((e) => { byJam[e.jam] = e; });
      const init = {};
      SESI.forEach((jam) => {
        const e = byJam[jam];
        const dash = (key) => (e ? (e[key] ?? "") : (req[key] ? "" : "-"));
        init[jam] = { suhu: dash("suhu"), rh: dash("rh"), dpg: dash("dpg"), opr: e?.opr ?? "", spv: e?.spv ?? "" };
      });
      initAll[r.name] = init;
    });
    setValues(initAll);
  }, [rooms, monthEntries, selectedDate]);

  function updateField(roomName, jam, field, val) {
    // Angka Indonesia pakai koma sebagai desimal — kalau operator ngetik
    // titik, otomatis dijadikan koma juga (tetap konsisten tampilannya).
    // "-" tetap boleh diketik apa adanya — dipakai kalau parameter itu
    // wajib tapi alat pemantaunya memang tidak tersedia di ruangan itu.
    const normalized = (field === "suhu" || field === "rh" || field === "dpg") ? val.replace(/\./g, ",") : val;
    setValues((prev) => ({
      ...prev,
      [roomName]: { ...prev[roomName], [jam]: { ...prev[roomName]?.[jam], [field]: normalized } },
    }));
  }

  // Ruangan+tanggal ini terkunci HANYA kalau SPV sudah approve (kolom SPV
  // terisi di salah satu sesi) — approve OPR TIDAK mengunci, operator masih
  // boleh mengubah nilai & approve ulang selama SPV belum approve.
  function isRoomLocked(roomName) {
    if (session.role === "Administrator") return false;
    return SESI.some((jam) => !!values[roomName]?.[jam]?.spv);
  }

  // Validasi kelengkapan: parameter yang WAJIB (room.required, dari
  // Limit_Persyaratan — sudah diketahui sejak awal, TIDAK bergantung ada/
  // tidaknya data tersimpan) tidak boleh kosong kalau sesi itu sudah mulai
  // diisi. Nilai "-" dihitung SUDAH terisi (dipakai kalau alat pemantau
  // untuk parameter itu memang tidak tersedia).
  function validateRoom(room) {
    const missing = [];
    const req = room.required || {};
    const v = values[room.name] || {};
    SESI.forEach((jam) => {
      const jv = v[jam];
      if (!jv) return;
      const anyFilled = PARAM_DEFS.some((p) => req[p.key] && jv[p.key] !== "");
      if (!anyFilled) return;
      PARAM_DEFS.forEach((p) => {
        if (req[p.key] && jv[p.key] === "") missing.push(`${jam} — ${p.label}`);
      });
    });
    return missing;
  }

  // Menyimpan nilai 1 ruangan (dipanggil langsung oleh tombol "Simpan", TAPI
  // juga dipanggil otomatis oleh tombol Approve OPR/SPV — supaya operator
  // tidak perlu klik Simpan dulu sebelum bisa approve; klik Approve = simpan
  // + approve sekaligus). Ruangan lain yang tidak disentuh tetap aman karena
  // di-merge dari monthEntries apa adanya.
  async function saveRoomEntries(room) {
    const missing = validateRoom(room);
    if (missing.length > 0) {
      setError(`Data ${room.name} belum lengkap, mohon isi dulu: ` + missing.join(", "));
      return false;
    }
    setError("");
    try {
      const req = room.required || {};
      const v = values[room.name] || {};
      const editedRows = SESI.filter((jam) => PARAM_DEFS.some((p) => req[p.key] && v[jam][p.key] !== "")).map((jam) => ({
        // ID STABIL berbasis konten (ruangan|tanggal|jam) — bukan index baris
        // — supaya baris lain yang tidak disentuh tidak salah kedeteksi
        // "terhapus" gara-gara posisi baris di sheet berubah tiap simpan.
        id: `${room.name}|${selectedDate}|${jam}`,
        tanggal: selectedDate, jam, roomName: room.name, persyaratanKey: room.persyaratanKey,
        suhu: v[jam].suhu === "" ? null : v[jam].suhu,
        rh: v[jam].rh === "" ? null : v[jam].rh,
        dpg: v[jam].dpg === "" ? null : v[jam].dpg,
        opr: "", spv: "",
      }));
      const others = monthEntries
        .filter((e) => !(e.roomName === room.name && e.tanggal === selectedDate))
        .map((e) => ({ tanggal: e.tanggal, jam: e.jam, roomName: e.roomName, persyaratanKey: e.persyaratanKey, suhu: e.suhu, rh: e.rh, dpg: e.dpg, opr: e.opr, spv: e.spv, id: e.id }));
      const merged = others.concat(editedRows);
      await apiSaveEntries(facilityKey, month, merged, session.token);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function handleSaveRoom(room) {
    setSavingRoom(room.name);
    const ok = await saveRoomEntries(room);
    if (ok) await loadDate();
    setSavingRoom(null);
  }

  async function handleApproveOpr(room) {
    setSavingRoom(room.name);
    try {
      const ok = await saveRoomEntries(room);
      if (!ok) return;
      await apiApproveOpr(facilityKey, selectedDate, room.name, session.token);
      await loadDate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRoom(null);
    }
  }

  async function handleApproveSpv(room) {
    setSavingRoom(room.name);
    try {
      const ok = await saveRoomEntries(room);
      if (!ok) return;
      await apiApproveSpv(facilityKey, selectedDate, room.name, session.token);
      await loadDate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRoom(null);
    }
  }

  async function handleApproveDate(tanggal) {
    setApprovingDate(tanggal);
    setError("");
    try {
      await apiApproveDay(facilityKey, tanggal, session.token);
      await loadDate();
    } catch (err) {
      setError(err.message);
    } finally {
      setApprovingDate(null);
    }
  }

  async function handleUnapproveDate(tanggal) {
    setApprovingDate(tanggal);
    setError("");
    try {
      await apiUnapproveDay(facilityKey, tanggal, session.token);
      await loadDate();
    } catch (err) {
      setError(err.message);
    } finally {
      setApprovingDate(null);
    }
  }

  const todaysEntries = monthEntries.filter((e) => e.tanggal === selectedDate);
  const roomsFilledToday = new Set(todaysEntries.map((e) => e.roomName));
  // Ruangan yang SUDAH di-approve SPV hari ini (semua baris ruangan itu
  // punya SPV terisi) vs yang masih pending — dipakai untuk badge & tombol
  // "Approve Semua", supaya angkanya turun begitu satu ruangan di-approve,
  // bukan cuma menghitung total ruangan yang ada datanya.
  const pendingRoomsToday = Array.from(roomsFilledToday).filter((r) => {
    const rows = todaysEntries.filter((e) => e.roomName === r);
    return !rows.every((e) => !!e.spv);
  });
  // Status "sudah di-ACC" untuk tanggal terpilih — dihitung dari data (semua
  // baris tanggal itu sudah punya SPV), bukan dari flag terpisah, supaya
  // konsisten dengan approve per-ruangan yang tersedia.
  const isApproved = todaysEntries.length > 0 && todaysEntries.every((e) => !!e.spv);
  // Semua ruangan master fasilitas ini sudah ada datanya hari ini —
  // dipakai untuk menampilkan grafik perbandingan seluruh ruangan.
  const allRoomsFilled = rooms.length > 0 && rooms.every((r) => roomsFilledToday.has(r.name));

  // Ruangan dikelompokkan per kategori (sama seperti pengelompokan
  // "Kelas" di EM Viable) supaya tabel input tidak jadi satu daftar panjang
  // tanpa struktur.
  const groupedRooms = useMemo(() => {
    const cats = Array.from(new Set(rooms.map(roomCategory)));
    return cats.map((cat) => ({ cat, items: rooms.filter((r) => roomCategory(r) === cat) }));
  }, [rooms]);

  // Data grafik perbandingan antar-ruangan untuk tanggal terpilih — dibangun
  // dari data YANG SUDAH TERSIMPAN (todaysEntries, lengkap dengan level dari
  // server), bukan dari isian yang sedang diketik, supaya grafik tidak
  // "kedip-kedip" saat operator masih mengisi form.
  const compareData = useMemo(() => {
    const byRoomJam = {};
    todaysEntries.forEach((e) => {
      byRoomJam[e.roomName] = byRoomJam[e.roomName] || {};
      byRoomJam[e.roomName][e.jam] = e;
    });
    const numOf = (e, key) => {
      if (!e) return null;
      const raw = e[key];
      if (raw === null || raw === undefined || raw === "" || raw === "-") return null;
      const n = Number(String(raw).replace(",", "."));
      return Number.isNaN(n) ? null : n;
    };
    const out = {};
    PARAM_DEFS.forEach((p) => {
      out[p.key] = rooms.filter((r) => r.required?.[p.key]).map((r) => {
        const pagi = byRoomJam[r.name]?.["08:00"];
        const siang = byRoomJam[r.name]?.["13:00"];
        return {
          room: r.name,
          pagi: numOf(pagi, p.key),
          pagiLevel: pagi?.level?.[p.key] ?? null,
          siang: numOf(siang, p.key),
          siangLevel: siang?.level?.[p.key] ?? null,
        };
      });
    });
    return out;
  }, [todaysEntries, rooms]);

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>;

  // Status keseluruhan LIVE — dihitung dari isian semua ruangan saat ini
  // (bukan cuma data tersimpan), supaya badge status langsung berubah SAAT
  // MENGETIK di ruangan manapun, konsisten dengan filosofi liveLevelFor.
  const liveLevel = rooms.length > 0 ? rooms.reduce((max, r) => Math.max(max, liveRoomLevel(values[r.name] || {}, r)), 0) : facilityOverallLevel(todaysEntries);
  const liveHasData = rooms.some((r) => SESI.some((jam) => PARAM_DEFS.some((p) => values[r.name]?.[jam]?.[p.key] && values[r.name][jam][p.key] !== "-"))) || todaysEntries.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 print:max-w-none print:p-0">
      <div className="no-print flex items-center justify-between mb-4">
        <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Kembali ke Dashboard
        </button>
        <div className="flex items-center gap-2">
          {hasAccess(session, "Supervisor", "QA") && (
            <button onClick={() => setView({ page: "pengkajian", facility: facilityKey })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <ClipboardList className="w-4 h-4" /> Pengkajian QA
            </button>
          )}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Printer className="w-4 h-4" /> Cetak
          </button>
        </div>
      </div>

      <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 print-card">
        <div className="relative overflow-hidden bg-gradient-to-r from-black via-maroon-950 to-maroon-800 px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-maroon-500/25 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3">
              <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-12 w-12 shrink-0 object-contain brightness-0 invert" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-maroon-200">PT. Rama Emerald Multi Sukses — QA</p>
                <h2 className="text-xl font-bold text-white">Data Pemantauan Suhu, RH &amp; DPG — {cfg?.label}</h2>
                <p className="text-sm text-maroon-50">Tanggal: <span className="font-medium text-white">{selectedDate}</span> · Seluruh Ruangan ({rooms.length})</p>
              </div>
            </div>
            <div className="text-right text-xs text-maroon-100">
              <p>No. Formulir: FM.QA.024/R11</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between bg-white px-5 py-3">
          <span className="text-xs text-slate-400">Status keseluruhan tanggal ini ({roomsFilledToday.size}/{rooms.length} ruangan terisi)</span>
          <StatusPill level={liveLevel} hasData={liveHasData} />
        </div>
      </div>

      {error && <p className="no-print text-sm text-red-600 mb-3 whitespace-pre-line">{error}</p>}

      <div className="no-print flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setSelectedDate(openDates.today)}
          className={`text-xs rounded-full px-3 py-1.5 border ${selectedDate === openDates.today ? "bg-gradient-to-r from-black to-maroon-800 text-white border-maroon-800" : "border-slate-300 text-slate-600"}`}>
          Hari ini
        </button>
        <input type="date" value={selectedDate} max={openDates.today}
          onChange={(ev) => { if (ev.target.value) setSelectedDate(ev.target.value); }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600" />
        <span className="text-xs text-slate-400">
          Tanggal hari ini maupun tanggal sebelumnya bebas diisi selama belum di-approve SPV/Manager. Tanggal setelah hari ini tidak bisa dipilih.
        </span>
      </div>

      <div className="print-card avoid-break flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl border p-4 mb-4">
        <div className="text-sm">
          <span className="text-slate-500">Tanggal terpilih: </span>
          <span className="font-medium text-slate-800">{selectedDate}</span>
          {isApproved ? (
            <span className="ml-2 text-xs inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Disetujui {todaysEntries.find((e) => e.spv)?.spv}
            </span>
          ) : (
            <span className="ml-2 text-xs inline-flex items-center gap-1 text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
              <XOctagon className="w-3.5 h-3.5" /> Belum di-ACC{todaysEntries.length > 0 ? ` — ${pendingRoomsToday.length} ruangan perlu di-approve (${roomsFilledToday.size} terisi)` : ""}
            </span>
          )}
        </div>
        {canApprove && (
          <div className="no-print">
            {!isApproved ? (
              <button onClick={() => handleApproveDate(selectedDate)} disabled={approvingDate === selectedDate || pendingRoomsToday.length === 0} className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 disabled:opacity-60">
                {approvingDate === selectedDate ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />} Approve Semua ({pendingRoomsToday.length} ruangan)
              </button>
            ) : (
              <button onClick={() => handleUnapproveDate(selectedDate)} disabled={approvingDate === selectedDate} className="text-sm bg-slate-200 text-slate-700 rounded-lg px-4 py-2">Buka Kembali</button>
            )}
          </div>
        )}
      </div>

      {/* ================= TABEL INPUT SEMUA RUANGAN, DIKELOMPOKKAN PER KATEGORI ================= */}
      {rooms.length === 0 ? (
        <p className="no-print text-sm text-slate-500 mb-6">Belum ada master ruangan untuk fasilitas ini.</p>
      ) : (
        <div className="space-y-4 mb-6">
          {groupedRooms.map(({ cat, items }) => (
            <div key={cat} className="print-card avoid-break bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-slate-50">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase">
                      <th rowSpan={2} className="px-2 py-1.5 text-left align-bottom min-w-[160px]">Ruangan</th>
                      <th colSpan={3} className="px-2 py-1 text-center border-l">08:00</th>
                      <th colSpan={3} className="px-2 py-1 text-center border-l">13:00</th>
                      <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom border-l">OPR</th>
                      <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom">SPV</th>
                      <th rowSpan={2} className="no-print px-2 py-1.5 text-center align-bottom">Aksi</th>
                    </tr>
                    <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase">
                      {SESI.map((jam) => PARAM_DEFS.map((p, i) => (
                        <th key={jam + p.key} className={`px-1 py-1 text-center font-normal ${i === 0 ? "border-l" : ""}`}>{p.label}</th>
                      )))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const roomValues = values[r.name] || {};
                      const locked = isRoomLocked(r.name);
                      const busy = savingRoom === r.name;
                      const oprName = roomValues["08:00"]?.opr || roomValues["13:00"]?.opr || "";
                      const spvName = roomValues["08:00"]?.spv || roomValues["13:00"]?.spv || "";
                      const canApproveOprHere = SESI.every((jam) => PARAM_DEFS.every((p) => !r.required?.[p.key] || roomValues[jam]?.[p.key] !== ""));
                      const canApproveSpvHere = SESI.every((jam) => !!roomValues[jam]?.opr);
                      return (
                        <tr key={r.code + r.name} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-2">
                            <div className="font-medium text-slate-700">{r.name}</div>
                            <div className="text-[10px] text-slate-400 mb-1">{r.code}</div>
                            <div className="flex flex-col gap-0.5">
                              {PARAM_DEFS.filter((p) => r.required?.[p.key] && r.limits?.[p.key]).map((p) => (
                                <span key={p.key} className="text-[9px] text-slate-400">
                                  {p.label}: {formatRange(r.limits[p.key].syaratL, r.limits[p.key].syaratU, p.unit)}
                                </span>
                              ))}
                            </div>
                            <button onClick={() => setView({ page: "formulir", facility: facilityKey, room: r.name, bulan: month })}
                              className="no-print mt-1 text-[10px] text-maroon-700 hover:underline">
                              Formulir Bulanan
                            </button>
                          </td>
                          {SESI.map((jam) => PARAM_DEFS.map((p, i) => {
                            const v = roomValues[jam]?.[p.key] ?? "";
                            const required = !!r.required?.[p.key];
                            const style = levelStyle(liveLevelFor(v, r.limits?.[p.key]));
                            return (
                              <td key={jam + p.key} className={`px-1 py-1 text-center ${i === 0 ? "border-l" : ""}`}>
                                <input
                                  value={v}
                                  disabled={!canInput || locked || !required}
                                  placeholder={required ? "" : "N/A"}
                                  onChange={(e) => updateField(r.name, jam, p.key, e.target.value)}
                                  className="w-14 text-center rounded px-1 py-1 border disabled:bg-slate-50 disabled:text-slate-300"
                                  style={{ background: v !== "" ? style.bg : undefined, color: v !== "" ? style.color : undefined }}
                                />
                              </td>
                            );
                          }))}
                          <td className="px-2 py-2 text-center text-slate-500 border-l">
                            {oprName ? (
                              <span className="inline-flex items-center gap-1">
                                {oprName}
                                <VerifyQR type="harian" facility={facilityKey} period={selectedDate} size={24} hideLabel />
                              </span>
                            ) : <span className="italic text-slate-400">belum di-ACC</span>}
                          </td>
                          <td className="px-2 py-2 text-center text-slate-500">
                            {spvName ? (
                              <span className="inline-flex items-center gap-1">
                                {spvName}
                                <VerifyQR type="harian" facility={facilityKey} period={selectedDate} size={24} hideLabel />
                              </span>
                            ) : <span className="italic text-slate-400">belum di-ACC</span>}
                          </td>
                          <td className="no-print px-2 py-2">
                            {locked ? (
                              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap text-[10px] text-maroon-700">
                                <Lock size={11} /> Terkunci
                              </span>
                            ) : (canInput || canApprove) ? (
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                {canInput && (
                                  <button onClick={() => handleSaveRoom(r)} disabled={busy} title="Simpan"
                                    className="inline-flex items-center justify-center rounded-md bg-slate-800 text-white p-1.5 disabled:opacity-60">
                                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                  </button>
                                )}
                                {isOperatorRole && (
                                  <button onClick={() => handleApproveOpr(r)} disabled={busy || !canApproveOprHere} title="Approve (OPR)"
                                    className="inline-flex items-center justify-center rounded-md bg-emerald-600 text-white p-1.5 disabled:opacity-60">
                                    <FileCheck2 size={12} />
                                  </button>
                                )}
                                {canApprove && (
                                  <button onClick={() => handleApproveSpv(r)} disabled={busy || !canApproveSpvHere} title="Approve (SPV)"
                                    className="inline-flex items-center justify-center rounded-md bg-emerald-700 text-white p-1.5 disabled:opacity-60">
                                    <FileCheck2 size={12} />
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================= GRAFIK PERBANDINGAN SELURUH RUANGAN (1 HARI) ================= */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Grafik Suhu, RH &amp; DPG — Seluruh Ruangan ({selectedDate})</h3>
          {!allRoomsFilled && rooms.length > 0 && (
            <span className="text-xs text-slate-400">{roomsFilledToday.size}/{rooms.length} ruangan sudah diisi</span>
          )}
        </div>
        {rooms.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada master ruangan untuk fasilitas ini.</p>
        ) : !allRoomsFilled ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <TrendingUp className="mx-auto mb-2 text-slate-300" size={26} />
            <p className="text-sm text-slate-500">Grafik perbandingan akan muncul di sini setelah seluruh {rooms.length} ruangan diisi datanya untuk tanggal {selectedDate}.</p>
            <p className="mt-1 text-xs text-slate-400">Saat ini baru {roomsFilledToday.size} ruangan yang terisi.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {PARAM_DEFS.map((p) => (
              <DayCompareChart key={p.key} paramLabel={p.label} unit={p.unit} rows={compareData[p.key]} />
            ))}
          </div>
        )}
      </div>

      {canApprove && <div className="no-print"><BackfillForm session={session} facilityKey={facilityKey} onOpened={loadAll} /></div>}
    </div>
  );
}
/* ========================================================================= PENGKAJIAN (QA) */

function PrintableTextarea({ value, onChange, disabled, rows = 3 }) {
  return (
    <>
      <textarea value={value} disabled={disabled} onChange={onChange} rows={rows} className="no-print w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
      <p className="only-print whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">{value || "-"}</p>
    </>
  );
}

// Menampilkan hasil parameter tertentu SETIAP HARI sepanjang bulan itu
// (semua ruangan) — tabel lengkap untuk dibaca QA, plus grafik tren per
// ruangan (dibatasi beberapa yang paling relevan/terburuk statusnya, supaya
// halaman tidak kepanjangan kalau ruangannya banyak).
function ParamBreakdown({ paramDef, entries, rooms }) {
  const roomByName = useMemo(() => {
    const m = {};
    rooms.forEach((r) => { m[r.name] = r; });
    return m;
  }, [rooms]);

  const rows = useMemo(() => {
    return entries
      .filter((e) => e.level?.[paramDef.key] !== null && e.level?.[paramDef.key] !== undefined)
      .slice()
      .sort((a, b) => (a.tanggal + a.jam + a.roomName).localeCompare(b.tanggal + b.jam + b.roomName));
  }, [entries, paramDef.key]);

  if (rows.length === 0) {
    return <p className="only-print no-print mt-1 text-xs text-slate-400 italic">Belum ada data {paramDef.label} bulan ini.</p>;
  }

  const roomsWithData = Array.from(new Set(rows.map((r) => r.roomName)))
    .map((name) => ({ name, worst: Math.max(0, ...rows.filter((r) => r.roomName === name).map((r) => r.level?.[paramDef.key] || 0)) }))
    .sort((a, b) => b.worst - a.worst)
    .slice(0, 4);

  return (
    <div className="mt-2 space-y-3">
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 print:max-h-none">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 print:static">
            <tr className="text-slate-400">
              <th className="px-2 py-1.5 text-left">Tanggal</th>
              <th className="px-2 py-1.5 text-left">Jam</th>
              <th className="px-2 py-1.5 text-left">Ruangan</th>
              <th className="px-2 py-1.5 text-center">Nilai</th>
              <th className="px-2 py-1.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const style = levelStyle(r.level?.[paramDef.key]);
              const val = r[paramDef.key];
              return (
                <tr key={r.id + paramDef.key} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-600">{r.tanggal}</td>
                  <td className="px-2 py-1 text-slate-500">{r.jam}</td>
                  <td className="px-2 py-1 text-slate-600">{r.roomName}</td>
                  <td className="px-2 py-1 text-center">{val === null || val === undefined || val === "" ? "—" : val}</td>
                  <td className="px-2 py-1 text-center">
                    <span className="inline-block rounded-full px-2 py-0.5 font-medium" style={{ background: style.bg, color: style.color }}>{style.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {roomsWithData.map(({ name }) => {
          const room = roomByName[name];
          if (!room?.limits?.[paramDef.key]) return null;
          return (
            <ParamTrendChart
              key={name}
              entries={entries.filter((e) => e.roomName === name)}
              paramKey={paramDef.key}
              paramLabel={`${paramDef.label} — ${name}`}
              unit={paramDef.unit}
              limit={room.limits[paramDef.key]}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ========================================================================= FORMULIR BULANAN (FM.QA.024/R11) — cetak per ruangan */

function FormulirBulananPrint({ session, facilityKey, roomName, bulan, setView }) {
  const cfg = FACILITIES.find((f) => f.key === facilityKey);
  const [room, setRoom] = useState(null);
  const [entries, setEntries] = useState([]);
  const [formulir, setFormulir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canKepalaBagian = cfg ? hasFacilityAccess(session, "Supervisor", cfg) : false;
  const canManagerQA = hasAccess(session, "Manager", "QA");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [master, entriesRes, formulirRes] = await Promise.all([
        fetchMaster(facilityKey),
        fetchEntries(facilityKey, bulan),
        fetchFormulirBulanan(facilityKey, bulan, roomName, session.token),
      ]);
      const rooms = Array.isArray(master) ? master : (master.rooms || []);
      const norm = (s) => String(s || "").trim();
      setRoom(rooms.find((r) => norm(r.name) === norm(roomName)) || null);
      const list = Array.isArray(entriesRes) ? entriesRes : (entriesRes.entries || []);
      setEntries(list.filter((e) => norm(e.roomName) === norm(roomName)));
      setFormulir(formulirRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey, bulan, roomName, session.token]);

  useEffect(() => { load(); }, [load]);

  async function handleApproveKepalaBagian() {
    setBusy(true); setError("");
    try { await apiApproveKepalaBagian(facilityKey, bulan, roomName, session.token); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function handleUnapproveKepalaBagian() {
    setBusy(true); setError("");
    try { await apiUnapproveKepalaBagian(facilityKey, bulan, roomName, session.token); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function handleApproveManagerQA() {
    setBusy(true); setError("");
    try { await apiApproveManagerQAFormulir(facilityKey, bulan, session.token); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function handleUnapproveManagerQA() {
    setBusy(true); setError("");
    try { await apiUnapproveManagerQAFormulir(facilityKey, bulan, session.token); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>;

  const n = daysInMonth(bulan);
  const byDay = {};
  entries.forEach((e) => { byDay[e.tanggal + "|" + e.jam] = e; });
  const kepalaBagianDone = !!formulir?.kepalaBagian?.nama;
  const managerQADone = !!formulir?.managerQA?.nama;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 print:max-w-none print:p-0">
      <div className="no-print flex items-center justify-between mb-4">
        <button onClick={() => setView({ page: "entry", facility: facilityKey })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Kembali ke {cfg?.label}
        </button>
        <div className="flex items-center gap-2">
          {hasAccess(session, "Supervisor", "QA") && (
            <button onClick={() => setView({ page: "pengkajian", facility: facilityKey, room: roomName })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <ClipboardList className="w-4 h-4" /> Pengkajian Ruangan Ini (Opsional)
            </button>
          )}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Printer className="w-4 h-4" /> Cetak
          </button>
        </div>
      </div>

      <div className="no-print relative mb-5 overflow-hidden rounded-xl border border-slate-200">
        <div className="relative overflow-hidden bg-gradient-to-r from-black via-maroon-950 to-maroon-800 px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-maroon-500/25 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-10 w-10 shrink-0 object-contain brightness-0 invert" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-maroon-200">PT. Rama Emerald Multi Sukses — QA</p>
              <h2 className="text-lg font-bold text-white">Formulir Bulanan — {room?.name || roomName} ({cfg?.label})</h2>
              <p className="text-sm text-maroon-50">Periode: {monthLabelID(bulan)}</p>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="no-print text-sm text-red-600 mb-3">{error}</p>}

      <div className="print-card avoid-break rounded-xl border-2 border-slate-800 bg-white p-5 text-xs">
        {/* Header — mengikuti tata letak fisik FM.QA.024/R11 */}
        <div className="mb-4 flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-12 w-12 object-contain" />
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
          <div className="space-y-1.5">
            <p><span className="font-semibold text-slate-600">Bulan - Tahun</span> : {monthLabelID(bulan)}</p>
            <p><span className="font-semibold text-slate-600">Gedung</span> : {cfg?.label}</p>
            <p><span className="font-semibold text-slate-600">Nama Ruang / No. Ruang</span> : {room?.name} ({room?.code})</p>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-slate-600">Kriteria Penerimaan:</p>
            {PARAM_DEFS.map((p) => {
              const lim = room?.limits?.[p.key];
              if (!room?.required?.[p.key] || !lim) return null;
              return <p key={p.key}>{p.label} : {formatRange(lim.syaratL, lim.syaratU, p.unit)}</p>;
            })}
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

        <div className="mt-6 flex items-start justify-between gap-4">
          <p className="text-[11px] text-slate-500">Mengetahui,</p>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="text-center">
            <p className="mb-2 text-[11px] text-slate-500">(Kepala Bagian)</p>
            {kepalaBagianDone ? (
              <>
                <div className="mb-1 flex justify-center"><VerifyQR type="formulir" facility={facilityKey} period={bulan} roomName={roomName} size={56} hideLabel /></div>
                <p className="text-sm font-semibold text-slate-800">{formulir.kepalaBagian.nama}</p>
                <p className="text-[11px] text-slate-400">{formulir.kepalaBagian.tanggal}</p>
                {canKepalaBagian && (
                  <button onClick={handleUnapproveKepalaBagian} disabled={busy || managerQADone} className="no-print mt-2 rounded-lg border border-slate-300 px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">Buka Kembali</button>
                )}
              </>
            ) : (
              <>
                <p className="mb-2 text-[11px] italic text-slate-400">Belum di-ACC</p>
                {canKepalaBagian && (
                  <button onClick={handleApproveKepalaBagian} disabled={busy || entries.length === 0} className="no-print inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    <FileCheck2 size={13} /> Approve (Kepala Bagian)
                  </button>
                )}
              </>
            )}
          </div>
          <div className="text-center">
            <p className="mb-2 text-[11px] text-slate-500">(Manager QA)</p>
            {managerQADone ? (
              <>
                <div className="mb-1 flex justify-center"><VerifyQR type="formulir" facility={facilityKey} period={bulan} roomName={roomName} size={56} hideLabel /></div>
                <p className="text-sm font-semibold text-slate-800">{formulir.managerQA.nama}</p>
                <p className="text-[11px] text-slate-400">{formulir.managerQA.tanggal}</p>
                {session.role === "Administrator" && (
                  <button onClick={handleUnapproveManagerQA} disabled={busy} className="no-print mt-2 rounded-lg border border-slate-300 px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">Buka Kembali (Semua Ruangan)</button>
                )}
              </>
            ) : (
              <>
                <p className="mb-2 text-[11px] italic text-slate-400">{kepalaBagianDone ? "Belum di-ACC" : "Menunggu semua ruangan di-ACC Kepala Bagian"}</p>
                {canManagerQA && (
                  <button onClick={handleApproveManagerQA} disabled={busy} className="no-print inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-black to-maroon-800 px-3 py-1.5 text-xs font-semibold text-white hover:to-maroon-700 disabled:opacity-50">
                    <FileCheck2 size={13} /> Approve (Manager QA) — Semua Ruangan Fasilitas Ini
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PengkajianPage({ session, month, setView, initialFacility, initialRoom }) {
  const [facilityKey, setFacilityKey] = useState(initialFacility || FACILITIES[0].key);
  const roomName = initialRoom || ""; // diisi = Pengkajian RUANGAN (opsional); kosong = Pengkajian fasilitas (wajib)
  const [report, setReport] = useState(null);
  const [pendahuluan, setPendahuluan] = useState("");
  const [kesimpulan, setKesimpulan] = useState("");
  const [perParameter, setPerParameter] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const cfg = FACILITIES.find((f) => f.key === facilityKey);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, roomList, entries] = await Promise.all([
        fetchReport(facilityKey, month, session.token, roomName),
        fetchMaster(facilityKey),
        fetchEntries(facilityKey, month),
      ]);
      setReport(r);
      setPendahuluan(r.narrative?.pendahuluan || "");
      setKesimpulan(r.narrative?.kesimpulanUmum || "");
      setPerParameter(r.narrative?.perParameter || {});
      setRooms(roomList);
      setMonthEntries(roomName ? entries.filter((e) => e.roomName === roomName) : entries);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey, month, session.token, roomName]);

  useEffect(() => { load(); }, [load]);

  const canDraft = hasAccess(session, "Supervisor", "QA");
  const canFinal = hasAccess(session, "Manager", "QA");
  const isFinal = !!report?.signoff?.diperiksa?.nama;

  async function handleSave() {
    setError("");
    try {
      await apiSaveReport(facilityKey, month, { pendahuluan, kesimpulanUmum: kesimpulan, perParameter }, session.token, roomName);
      await load();
    } catch (err) { setError(err.message); }
  }
  async function handleDikaji() {
    setError("");
    try { await apiApproveDikaji(facilityKey, month, session.token, roomName); await load(); } catch (err) { setError(err.message); }
  }
  async function handleMengetahui() {
    setError("");
    try { await apiApproveMengetahui(facilityKey, month, session.token, roomName); await load(); } catch (err) { setError(err.message); }
  }

  // Generate narasi otomatis: susun statistik dari data mentah (master +
  // entries fasilitas ini bulan ini), lalu minta Gemini menyusun narasinya.
  // Kalau Gemini gagal (mis. API key belum diset), pakai narasi lokal
  // sederhana sebagai cadangan supaya tetap ada draf untuk diedit.
  async function handleGenerateAI() {
    setGenerating(true);
    setError("");
    try {
      const [roomsRaw, entriesRaw] = await Promise.all([fetchMaster(facilityKey), fetchEntries(facilityKey, month)]);
      const roomsList = Array.isArray(roomsRaw) ? roomsRaw : (roomsRaw.rooms || []);
      const entriesList = Array.isArray(entriesRaw) ? entriesRaw : (entriesRaw.entries || []);
      const scopedEntries = roomName ? entriesList.filter((e) => e.roomName === roomName) : entriesList;
      const facilityStats = buildFacilityStats({ facilityLabel: cfg.label + (roomName ? " — " + roomName : ""), monthLabel: monthLabelID(month), entries: scopedEntries, rooms: roomsList });
      let narrative;
      try {
        narrative = await generateNarrative({ facilityLabel: cfg.label + (roomName ? " — " + roomName : ""), monthLabel: monthLabelID(month), stats: facilityStats.stats });
      } catch (aiErr) {
        narrative = generateLocalNarrative({ facilityLabel: cfg.label + (roomName ? " — " + roomName : ""), monthLabel: monthLabelID(month), entries: scopedEntries, rooms: roomsList });
        setError("Narasi AI gagal (" + aiErr.message + ") — dipakai narasi lokal sebagai draf awal, silakan disunting.");
      }
      setPendahuluan(narrative.pendahuluan || "");
      setPerParameter(narrative.perParameter || {});
      setKesimpulan(narrative.kesimpulanUmum || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 print:max-w-none print:p-0">
      <div className="no-print flex items-center justify-between mb-4">
        <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Kembali
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Printer className="w-4 h-4" /> Cetak
        </button>
      </div>

      <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 print-card">
        <div className="relative overflow-hidden bg-gradient-to-r from-black via-maroon-950 to-maroon-800 px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-maroon-500/25 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3">
              <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-12 w-12 shrink-0 object-contain brightness-0 invert" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-maroon-200">PT. Rama Emerald Multi Sukses — QA</p>
                <h2 className="text-xl font-bold text-white">{roomName ? "Pengkajian Ruangan (Opsional)" : "Pengkajian EM Non Viable"}</h2>
                <p className="text-sm text-maroon-50">
                  Fasilitas: <span className="font-medium text-white">{cfg?.label}</span>
                  {roomName && <> · Ruangan: <span className="font-medium text-white">{roomName}</span></>}
                  {" "}· Periode: <span className="font-medium text-white">{monthLabelID(month)}</span>
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-maroon-100">
              <p>Acuan: FM.QA.024/R11</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between bg-white px-5 py-3">
          <span className="text-xs text-slate-400">Status keseluruhan periode ini</span>
          <StatusPill level={facilityOverallLevel(monthEntries)} hasData={monthEntries.length > 0} />
        </div>
      </div>

      {!roomName && (
        <div className="no-print flex flex-wrap gap-2 mb-4">
          {FACILITIES.map((f) => (
            <button key={f.key} onClick={() => setFacilityKey(f.key)}
              className={`text-xs rounded-full px-3 py-1 border ${facilityKey === f.key ? "bg-gradient-to-r from-black to-maroon-800 text-white border-maroon-800" : "border-slate-300 text-slate-600"}`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="no-print text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <div className="no-print text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>
      ) : (
        <div className="print-card bg-white rounded-xl border p-5 space-y-4">
          {canDraft && !isFinal && (
            <div className="no-print flex justify-end">
              <button onClick={handleGenerateAI} disabled={generating} className="text-sm bg-gradient-to-r from-black to-maroon-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:to-maroon-600 disabled:opacity-60">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate Narasi AI
              </button>
            </div>
          )}
          <div>
            <label className="no-print block text-xs font-medium text-slate-500 mb-1">Pendahuluan</label>
            <p className="only-print font-semibold text-sm text-slate-700 mb-1">Pendahuluan</p>
            <PrintableTextarea value={pendahuluan} disabled={!canDraft || isFinal} onChange={(e) => setPendahuluan(e.target.value)} rows={3} />
          </div>
          {PARAM_DEFS.map((p) => (
            <div key={p.key}>
              <label className="no-print block text-xs font-medium text-slate-500 mb-1">Pembahasan {p.label}</label>
              <p className="only-print font-semibold text-sm text-slate-700 mb-1">Pembahasan {p.label}</p>
              <PrintableTextarea
                value={perParameter[p.key] || ""}
                disabled={!canDraft || isFinal}
                onChange={(e) => setPerParameter((prev) => ({ ...prev, [p.key]: e.target.value }))}
                rows={3}
              />
              <ParamBreakdown paramDef={p} entries={monthEntries} rooms={rooms} />
            </div>
          ))}
          <div>
            <label className="no-print block text-xs font-medium text-slate-500 mb-1">Kesimpulan Umum</label>
            <p className="only-print font-semibold text-sm text-slate-700 mb-1">Kesimpulan Umum</p>
            <PrintableTextarea value={kesimpulan} disabled={!canDraft || isFinal} onChange={(e) => setKesimpulan(e.target.value)} rows={3} />
          </div>

          <div className="no-print flex flex-wrap items-center gap-2 pt-2 border-t">
            {canDraft && !isFinal && (
              <button onClick={handleSave} className="text-sm bg-slate-800 text-white rounded-lg px-4 py-2 flex items-center gap-2"><Save className="w-4 h-4" /> Simpan Draf</button>
            )}
            {canDraft && report?.found && !report?.signoff?.dinilai?.nama && (
              <button onClick={handleDikaji} className="text-sm bg-gradient-to-r from-black to-maroon-800 text-white rounded-lg px-4 py-2 hover:to-maroon-700">Approve "Dikaji Oleh"</button>
            )}
            {canFinal && report?.signoff?.dinilai?.nama && !isFinal && (
              <button onClick={handleMengetahui} className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-2">Approve Final "Mengetahui"</button>
            )}
          </div>

          {(report?.signoff?.dinilai?.nama || report?.signoff?.diperiksa?.nama) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t avoid-break">
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-2">Dikaji Oleh</p>
                {report.signoff.dinilai?.nama ? (
                  <>
                    <div className="flex justify-center mb-2 print:h-24"><VerifyQR type="pengkajian" facility={facilityKey} period={month} roomName={roomName} size={64} /></div>
                    <p className="text-sm font-medium text-slate-800">{report.signoff.dinilai.nama}</p>
                    <p className="text-xs text-slate-400">{report.signoff.dinilai.jabatan} — {report.signoff.dinilai.tanggal}</p>
                  </>
                ) : <p className="text-xs text-slate-400 italic">Belum di-ACC</p>}
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-2">Mengetahui (Final)</p>
                {report.signoff.diperiksa?.nama ? (
                  <>
                    <div className="flex justify-center mb-2 print:h-24"><VerifyQR type="pengkajian" facility={facilityKey} period={month} roomName={roomName} size={64} /></div>
                    <p className="text-sm font-medium text-slate-800">{report.signoff.diperiksa.nama}</p>
                    <p className="text-xs text-slate-400">{report.signoff.diperiksa.jabatan} — {report.signoff.diperiksa.tanggal}</p>
                  </>
                ) : <p className="text-xs text-slate-400 italic">Belum di-ACC</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ========================================================================= RIWAYAT AKTIVITAS */

function ActivityPage({ session, month, setView }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allMonths, setAllMonths] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchActivityLog(session.token, { month: allMonths ? undefined : month })
      .then((l) => { if (!cancelled) setLogs(l); })
      .catch((err) => { if (!cancelled) setError(err.message || "Gagal memuat riwayat aktivitas."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session.token, month, allMonths]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> Kembali
      </button>

      <div className="relative mb-5 overflow-hidden rounded-xl border border-slate-200">
        <div className="relative overflow-hidden bg-gradient-to-r from-black via-maroon-950 to-maroon-800 px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-maroon-500/25 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-10 w-10 shrink-0 object-contain brightness-0 invert" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-maroon-200">PT. Rama Emerald Multi Sukses — QA</p>
              <h2 className="text-lg font-bold text-white">Riwayat Aktivitas</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-sm font-medium text-slate-600">{allMonths ? "Semua Bulan" : month}</p>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} />
          Tampilkan semua bulan
        </label>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>
      ) : error ? null : (
        <div className="bg-white rounded-xl border divide-y">
          {logs.length === 0 && <p className="text-sm text-slate-500 px-4 py-6">Tidak ada aktivitas bulan ini.</p>}
          {logs.map((l, i) => (
            <div key={i} className="px-4 py-2.5 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="text-slate-400 w-36">{new Date(l.waktu).toLocaleString("id-ID")}</span>
              <span className="font-medium text-slate-700">{l.nama}</span>
              <span className="text-slate-400">{l.role}{l.departemen ? " · " + l.departemen : ""}</span>
              <span className="text-slate-600">{l.aksi}</span>
              {l.fasilitas && <span className="text-slate-400">{l.fasilitas}</span>}
              {l.detail && <span className="text-slate-400">— {l.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================================================= VERIFIKASI PUBLIK (/verify) */

function VerifyPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const type = params.get("type"); // "harian" | "pengkajian" | "formulir"
  const facilityKey = params.get("facility");
  const roomName = params.get("roomName") || "";
  const period = type === "pengkajian" ? params.get("month") : type === "formulir" ? params.get("bulan") : params.get("tanggal");
  const facility = FACILITIES.find((f) => f.key === facilityKey);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!type || !facilityKey || !period || !facility) {
        setErrorMsg("Kode QR tidak lengkap atau tidak dikenali.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetchVerify(type, facilityKey, period, roomName);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setErrorMsg(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let docLabel = "";
  let periodLabel = "";
  let signerRows = [];
  if (data && !data.error) {
    if (type === "harian") {
      docLabel = "Data Pemantauan Harian EM Non Viable (FM.QA.024)";
      periodLabel = "Tanggal: " + fullDateID(period);
      if (data.found) signerRows = [{ label: "Disetujui SPV/Manager", nama: data.approvedBy?.nama, tanggal: data.approvedBy?.at }];
      if (data.backfill) signerRows.push({ label: "Dibuka via Backfill oleh", nama: data.backfill.byNama, tanggal: data.backfill.at, note: data.backfill.alasan });
    } else if (type === "formulir") {
      docLabel = "Formulir Bulanan EM Non Viable (FM.QA.024/R11)" + (roomName ? " — " + roomName : "");
      periodLabel = "Periode: " + monthLabelID(period);
      if (data.found) {
        signerRows = [
          { label: "Kepala Bagian", nama: data.kepalaBagian?.nama, tanggal: data.kepalaBagian?.tanggal },
          { label: "Manager QA", nama: data.managerQA?.nama, tanggal: data.managerQA?.tanggal },
        ];
      }
    } else {
      docLabel = "Pengkajian EM Non Viable" + (roomName ? " — Ruangan: " + roomName : "");
      periodLabel = "Periode: " + monthLabelID(period);
      if (data.found) {
        signerRows = [
          { label: "Dikaji Oleh", nama: data.signoff?.dinilai?.nama, tanggal: data.signoff?.dinilai?.tanggal },
          { label: "Mengetahui (Final)", nama: data.signoff?.diperiksa?.nama, tanggal: data.signoff?.diperiksa?.tanggal },
        ];
      }
    }
  }
  const isValid = data?.found && signerRows.some((s) => s.nama);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex flex-col items-center gap-1.5">
          <h1 className="text-center text-base font-bold text-slate-800">Verifikasi Dokumen EM Non Viable</h1>
          <p className="text-center text-xs text-slate-500">PT. Rama Emerald Multi Sukses</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {loading ? (
            <p className="py-4 text-center text-sm text-slate-400">Memeriksa data…</p>
          ) : errorMsg || !facility || data?.error ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <AlertTriangle className="text-red-500" size={28} />
              <p className="text-sm font-semibold text-red-600">Kode tidak valid</p>
              <p className="text-xs text-slate-500">{errorMsg || data?.error || "Dokumen tidak ditemukan di sistem."}</p>
            </div>
          ) : !isValid ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <AlertTriangle className="text-amber-500" size={28} />
              <p className="text-sm font-semibold text-amber-600">Belum ditandatangani</p>
              <p className="text-xs text-slate-500">Dokumen ini belum di-approve di sistem.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-1 text-center">
              <CheckCircle2 className="text-emerald-600" size={32} />
              <p className="text-sm font-semibold text-emerald-700">Dokumen tercatat sah dalam sistem</p>
              <div className="w-full space-y-1.5 rounded-lg bg-slate-50 p-3 text-left text-sm">
                <p><span className="text-slate-400">Dokumen: </span><span className="font-medium">{docLabel}</span></p>
                <p><span className="text-slate-400">Fasilitas: </span><span className="font-medium">{facility.label}</span></p>
                <p><span className="text-slate-400">{periodLabel.split(": ")[0]}: </span><span className="font-medium">{periodLabel.split(": ")[1]}</span></p>
                {signerRows.filter((s) => s.nama).map((s) => (
                  <p key={s.label}><span className="text-slate-400">{s.label}: </span><span className="font-medium">{s.nama}</span>{s.tanggal ? <span className="text-slate-400"> ({s.tanggal})</span> : null}{s.note ? <span className="block text-xs text-slate-500 italic">"{s.note}"</span> : null}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mx-auto mt-4 max-w-xs text-center text-[11px] text-slate-400">
          Halaman ini menampilkan data langsung dari sistem EM Non Viable secara real-time, bukan dari isi file PDF yang di-scan.
        </p>
      </div>
    </div>
  );
}

/* ========================================================================= APP ROOT */

export default function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/verify") {
    return <VerifyPage />;
  }
  const { session, checking, login, logout } = useAuth();
  const [view, setView] = useState({ page: "dashboard" });
  const [month, setMonth] = useState(currentMonth());
  const [showLogin, setShowLogin] = useState(false);

  // Sama seperti EM Viable: Dashboard bisa dilihat siapa saja tanpa login.
  // Login (lewat tombol di TopBar / prompt saat buka fasilitas) cuma
  // diperlukan untuk input, approve, atau menyusun Pengkajian. Tombol Cetak
  // disembunyikan untuk Tamu/publik, dan dijaga juga lewat CSS @media print
  // (print-blocked) supaya Ctrl+P pun tidak menghasilkan cetakan berarti.
  const canPrint = !!session && session.role !== "Tamu";

  // Kalau logout ketika sedang di halaman yang butuh login, lempar balik ke
  // Dashboard.
  useEffect(() => {
    const needsAuthPages = ["entry", "pengkajian", "activity"];
    if (needsAuthPages.includes(view.page) && !session) setView({ page: "dashboard" });
  }, [session, view.page]);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${!canPrint ? "print-blocked" : ""}`}>
      <div className="print-only-notice">
        Dokumen ini tidak bisa dicetak oleh akun Tamu atau publik tanpa login. Hubungi personil QC/QA untuk salinan resmi.
      </div>
      <style>{`
        .only-print { display: none; }
        .print-only-notice { display: none; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          .no-print { display: none !important; }
          .only-print { display: block !important; }
          .print-card { box-shadow: none !important; border: 1px solid #cbd5e1 !important; page-break-inside: avoid; break-inside: avoid; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
          .print-blocked > *:not(.print-only-notice) { display: none !important; }
          .print-blocked .print-only-notice {
            display: block !important;
            padding: 5cm 2cm;
            text-align: center;
            font-size: 14px;
            color: #334155;
          }
        }
        @page {
          margin: 1.5cm 1.5cm 2cm 1.5cm;
        }
      `}</style>
      <TopBar session={session} onLoginClick={() => setShowLogin(true)} onLogout={logout} view={view} setView={setView} />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={login} />}
      {view.page === "dashboard" && (
        <Dashboard month={month} setMonth={setMonth} setView={setView} session={session} onNeedLogin={() => setShowLogin(true)} />
      )}
      {view.page === "entry" && session && <EntryPage session={session} facilityKey={view.facility} setView={setView} />}
      {view.page === "formulir" && session && <FormulirBulananPrint session={session} facilityKey={view.facility} roomName={view.room} bulan={view.bulan || month} setView={setView} />}
      {view.page === "pengkajian" && session && <PengkajianPage session={session} month={month} setView={setView} initialFacility={view.facility} initialRoom={view.room} />}
      {view.page === "activity" && session && <ActivityPage session={session} month={month} setView={setView} />}
    </div>
  );
}
