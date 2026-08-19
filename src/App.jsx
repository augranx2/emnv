import { useState, useEffect, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
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
  if (rawValue === "-") return 1;
  const v = toNumberSafe(rawValue);
  if (rawValue === "" || rawValue === null || rawValue === undefined || Number.isNaN(v)) return 0;
  if (inRangeClient(v, limit.alertL, limit.alertU)) return 1;
  if (inRangeClient(v, limit.actionL, limit.actionU)) return 2;
  if (inRangeClient(v, limit.syaratL, limit.syaratU)) return 3;
  return 4;
}

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
              <stop offset="0%" stopColor="#ea580c" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
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
          <Line type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={2} dot={<ChartDot />} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ========================================================================= TOPBAR, LOGIN, DASHBOARD */

function TopBar({ session, onLoginClick, onLogout, view, setView }) {
  const [showProfile, setShowProfile] = useState(false);
  return (
    <div className="no-print border-b border-orange-100 bg-white px-4 py-2.5 shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <button onClick={() => setView({ page: "dashboard" })} className="flex items-center gap-2.5 text-sm font-bold text-slate-800">
          <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-8 w-8 object-contain" />
          EM Non Viable — PT. Rama Emerald Multi Sukses
        </button>
        <div className="flex items-center gap-2">
          {session && hasAccess(session, "Supervisor", "QA") && (
            <button onClick={() => setView({ page: "pengkajian" })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view.page === "pengkajian" ? "bg-orange-600 text-white shadow-sm" : "border border-slate-300 text-slate-600 hover:bg-orange-50"}`}>
              <ClipboardList size={14} /> Pengkajian
            </button>
          )}
          {session && hasAccess(session, "Supervisor") && (
            <button onClick={() => setView({ page: "activity" })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view.page === "activity" ? "bg-orange-600 text-white shadow-sm" : "border border-slate-300 text-slate-600 hover:bg-orange-50"}`}>
              <History size={14} /> Riwayat Aktivitas
            </button>
          )}
          {session ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowProfile(true)}
                className="hidden items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-950 border border-orange-200/80 hover:bg-orange-100 sm:inline-flex">
                <User size={13} className="text-orange-600" /> {session.nama} · {session.role}{session.departemen ? ` ${session.departemen}` : ""}
              </button>
              <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <LogOut size={14} /> Keluar
              </button>
            </div>
          ) : (
            <button onClick={onLoginClick} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 shadow-sm">
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
          <Lock size={18} className="text-orange-600" />
          <h3 className="text-base font-bold text-slate-800">Login EM Non Viable</h3>
        </div>
        <form onSubmit={submit}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Username</label>
          <input autoFocus type="text" value={username} onChange={(ev) => setUsername(ev.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
          <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Batal
            </button>
            <button type="submit" disabled={submitting || !username || !password}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
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
          <User size={18} className="text-orange-600" />
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
            <button onClick={() => setShowChangePw(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
              <Lock size={14} /> Ganti Password
            </button>
          </div>
        ) : success ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-600" size={28} />
            <p className="mb-4 text-sm text-slate-600">Password berhasil diubah.</p>
            <button onClick={onClose} className="rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">Tutup</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password Lama</label>
            <input type="password" value={oldPassword} onChange={(ev) => setOldPassword(ev.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password Baru</label>
            <input type="password" value={newPassword} onChange={(ev) => setNewPassword(ev.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Konfirmasi Password Baru</label>
            <input type="password" value={confirmPassword} onChange={(ev) => setConfirmPassword(ev.target.value)}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowChangePw(false); setError(""); }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Kembali
              </button>
              <button type="submit" disabled={submitting || !oldPassword || !newPassword || !confirmPassword}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
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
      {/* GRADASI DIBALIK: ORANYE / AMBER KE PUTIH */}
      <div className="relative overflow-hidden border-b border-orange-100 bg-gradient-to-r from-amber-600 via-orange-500 to-white shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/40 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-amber-400/30 blur-2xl" />
        <div className="relative mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-6 py-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-100">PT. Rama Emerald Multi Sukses — QA</p>
            <h1 className="text-2xl font-extrabold text-white drop-shadow-sm">Dashboard EM Non Viable</h1>
            <p className="mt-1 text-sm font-medium text-orange-50">Rekap pemantauan Suhu, Kelembaban (RH), dan Perbedaan Tekanan (DPG) per fasilitas</p>
          </div>
          <label className="no-print inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white/90 px-3.5 py-2 text-sm text-slate-800 shadow-sm backdrop-blur-sm">
            <Calendar size={15} className="text-orange-600" />
            <input type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} onClick={(ev) => ev.currentTarget.showPicker?.()}
              className="border-none bg-transparent text-sm font-semibold text-slate-800 outline-none" />
          </label>
        </div>
      </div>
      <div className="mx-auto max-w-5xl p-6">

        {statusError && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{statusError}</p>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard icon={<LayoutGrid size={17} />} iconColor="#ea580c" tint="#ffedd5" border="#fed7aa" value={FACILITIES.length} label="Total Fasilitas" />
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
                className="group flex w-full items-center justify-between overflow-hidden rounded-xl border border-slate-200 bg-white pr-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-md">
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
                  <ChevronRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-orange-600" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= ENTRY HARIAN */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function EntryPage({ session, facilityKey, setView }) {
  const cfg = FACILITIES.find((f) => f.key === facilityKey);
  const canInput = hasFacilityAccess(session, "Staff", cfg);
  const canApprove = hasFacilityAccess(session, "Supervisor", cfg);
  const isOperatorRole = session.role === "Staff" || session.role === "Administrator";

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [rooms, setRooms] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const [dayStatus, setDayStatus] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approvingDate, setApprovingDate] = useState(null);
  const [dateStatusMap, setDateStatusMap] = useState({});
  const [error, setError] = useState("");

  const month = selectedDate.slice(0, 7);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const roomList = await fetchMaster(facilityKey);
      setRooms(roomList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey]);

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

  useEffect(() => {
    if (!selectedRoom) { setValues({}); return; }
    const byJam = { "08:00": null, "13:00": null };
    monthEntries.filter((e) => e.roomName === selectedRoom.name && e.tanggal === selectedDate).forEach((e) => { byJam[e.jam] = e; });
    const req = selectedRoom.required || {};
    const init = {};
    SESI.forEach((jam) => {
      const e = byJam[jam];
      const dash = (key) => (e ? (e[key] ?? "") : (req[key] ? "" : "-"));
      init[jam] = { suhu: dash("suhu"), rh: dash("rh"), dpg: dash("dpg"), opr: e?.opr ?? "", spv: e?.spv ?? "", level: e?.level || { suhu: null, rh: null, dpg: null } };
    });
    setValues(init);
  }, [selectedRoom, monthEntries, selectedDate]);

  function updateField(jam, field, val) {
    const normalized = (field === "suhu" || field === "rh" || field === "dpg") ? val.replace(/\./g, ",") : val;
    setValues((prev) => ({ ...prev, [jam]: { ...prev[jam], [field]: normalized } }));
  }

  const roomLocked = !!selectedRoom && session.role !== "Administrator" && SESI.some((jam) => !!values[jam]?.spv);

  function validateRoom() {
    const missing = [];
    const req = selectedRoom?.required || {};
    SESI.forEach((jam) => {
      const v = values[jam];
      if (!v) return;
      const anyFilled = PARAM_DEFS.some((p) => req[p.key] && v[p.key] !== "");
      if (!anyFilled) return;
      PARAM_DEFS.forEach((p) => {
        if (req[p.key] && v[p.key] === "") missing.push(`${jam} — ${p.label}`);
      });
    });
    return missing;
  }

  async function saveCurrentRoom() {
    if (!selectedRoom) return false;
    const missing = validateRoom();
    if (missing.length > 0) {
      setError("Data belum lengkap, mohon isi dulu: " + missing.join(", "));
      return false;
    }
    setError("");
    try {
      const req = selectedRoom.required || {};
      const editedRows = SESI.filter((jam) => PARAM_DEFS.some((p) => req[p.key] && values[jam][p.key] !== "")).map((jam) => ({
        id: `${selectedRoom.name}|${selectedDate}|${jam}`,
        tanggal: selectedDate, jam, roomName: selectedRoom.name, persyaratanKey: selectedRoom.persyaratanKey,
        suhu: values[jam].suhu === "" ? null : values[jam].suhu,
        rh: values[jam].rh === "" ? null : values[jam].rh,
        dpg: values[jam].dpg === "" ? null : values[jam].dpg,
        opr: "", spv: "",
      }));
      const others = monthEntries
        .filter((e) => !(e.roomName === selectedRoom.name && e.tanggal === selectedDate))
        .map((e) => ({ tanggal: e.tanggal, jam: e.jam, roomName: e.roomName, persyaratanKey: e.persyaratanKey, suhu: e.suhu, rh: e.rh, dpg: e.dpg, opr: e.opr, spv: e.spv, id: e.id }));
      const merged = others.concat(editedRows);
      await apiSaveEntries(facilityKey, month, merged, session.token);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function handleSaveRoom() {
    setSaving(true);
    const ok = await saveCurrentRoom();
    if (ok) await loadDate();
    setSaving(false);
  }

  async function handleApproveOpr() {
    if (!selectedRoom) return;
    setSaving(true);
    try {
      const ok = await saveCurrentRoom();
      if (!ok) return;
      await apiApproveOpr(facilityKey, selectedDate, selectedRoom.name, session.token);
      await loadDate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveSpv() {
    if (!selectedRoom) return;
    setSaving(true);
    try {
      const ok = await saveCurrentRoom();
      if (!ok) return;
      await apiApproveSpv(facilityKey, selectedDate, selectedRoom.name, session.token);
      await loadDate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
  const pendingRoomsToday = Array.from(roomsFilledToday).filter((r) => {
    const rows = todaysEntries.filter((e) => e.roomName === r);
    return !rows.every((e) => !!e.spv);
  });
  const isApproved = todaysEntries.length > 0 && todaysEntries.every((e) => !!e.spv);

  const roomDates = useMemo(() => {
    if (!selectedRoom) return [];
    return Array.from(new Set(monthEntries.filter((e) => e.roomName === selectedRoom.name).map((e) => e.tanggal)));
  }, [monthEntries, selectedRoom]);

  useEffect(() => {
    let cancelled = false;
    const toFetch = roomDates.filter((d) => d !== selectedDate && !(d in dateStatusMap));
    if (toFetch.length === 0) return;
    Promise.all(toFetch.map((d) => fetchDayStatus(facilityKey, d, session.token).then((s) => [d, s]).catch(() => [d, null])))
      .then((pairs) => {
        if (cancelled) return;
        setDateStatusMap((prev) => {
          const next = { ...prev };
          pairs.forEach(([d, s]) => { next[d] = s; });
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [roomDates, selectedDate, facilityKey, session.token, dateStatusMap]);

  const historyByDate = useMemo(() => {
    if (!selectedRoom) return [];
    const roomEntries = monthEntries.filter((e) => e.roomName === selectedRoom.name);
    const groups = {};
    roomEntries.forEach((e) => {
      if (!groups[e.tanggal]) groups[e.tanggal] = [];
      groups[e.tanggal].push(e);
    });
    return Object.keys(groups).sort().reverse().map((tanggal) => {
      const status = tanggal === selectedDate ? dayStatus : dateStatusMap[tanggal];
      return {
        tanggal,
        entries: groups[tanggal].sort((a, b) => (a.jam + a.roomName).localeCompare(b.jam + b.roomName)),
        approved: tanggal === selectedDate ? isApproved : groups[tanggal].every((e) => !!e.spv),
        approvedBy: groups[tanggal].find((e) => e.spv)?.spv || null,
        backfillNote: status?.backfill || null,
      };
    });
  }, [monthEntries, selectedRoom, selectedDate, isApproved, dayStatus, dateStatusMap]);

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>;

  const liveLevel = selectedRoom ? liveRoomLevel(values, selectedRoom) : facilityOverallLevel(todaysEntries);
  const liveHasData = selectedRoom ? SESI.some((jam) => PARAM_DEFS.some((p) => values[jam]?.[p.key] && values[jam][p.key] !== "-")) : todaysEntries.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 print:max-w-none print:p-0">
      <div className="no-print flex items-center justify-between mb-4">
        <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Kembali ke Dashboard
        </button>
        <div className="flex items-center gap-2">
          {hasAccess(session, "Supervisor", "QA") && (
            <button onClick={() => setView({ page: "pengkajian", facility: facilityKey })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-orange-50">
              <ClipboardList className="w-4 h-4" /> Pengkajian QA
            </button>
          )}
          {selectedRoom && (
            <button onClick={() => setView({ page: "formulir", facility: facilityKey, room: selectedRoom.name, bulan: month })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-orange-50">
              <FileCheck2 className="w-4 h-4" /> Formulir Bulanan (FM.QA.024/R11)
            </button>
          )}
          {selectedRoom && (
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <Printer className="w-4 h-4" /> Cetak
            </button>
          )}
        </div>
      </div>

      {/* GRADASI DIBALIK: ORANYE / AMBER KE PUTIH */}
      <div className="mb-5 overflow-hidden rounded-xl border border-orange-200 print-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-600 via-orange-500 to-white px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/40 blur-2xl" />
          <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3">
              <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-12 w-12 shrink-0 object-contain drop-shadow" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-100">PT. Rama Emerald Multi Sukses — QA</p>
                <h2 className="text-xl font-bold text-white drop-shadow-sm">Data Pemantauan Suhu, RH &amp; DPG — {cfg?.label}</h2>
                <p className="text-sm font-medium text-orange-50">Tanggal Data: <span className="font-semibold text-white">{selectedDate}</span></p>
              </div>
            </div>
            <div className="text-right text-xs font-semibold text-slate-700 sm:text-slate-700">
              <p className="rounded-md bg-white/80 px-2.5 py-1 backdrop-blur-sm">No. Formulir: FM.QA.024/R11</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between bg-white px-5 py-3 border-t border-orange-100">
          <span className="text-xs text-slate-500 font-medium">{selectedRoom ? `Status ${selectedRoom.name} (langsung dari input)` : "Status keseluruhan tanggal ini"}</span>
          <StatusPill level={liveLevel} hasData={liveHasData} />
        </div>
      </div>

      {error && <p className="no-print text-sm text-red-600 mb-3 whitespace-pre-line">{error}</p>}

      <div className="no-print flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => { setSelectedDate(todayStr()); setSelectedRoom(null); }}
          className={`text-xs rounded-full px-3.5 py-1.5 border font-medium ${selectedDate === todayStr() ? "bg-orange-600 text-white border-orange-600 shadow-sm" : "border-slate-300 text-slate-600 hover:bg-orange-50"}`}>
          Hari ini
        </button>
        <input type="date" value={selectedDate} max={todayStr()}
          onChange={(ev) => { if (ev.target.value) { setSelectedDate(ev.target.value); setSelectedRoom(null); } }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-orange-500 focus:outline-none" />
        <span className="text-xs text-slate-400">
          Pilih tanggal pemantauan. Tanggal lampau tetap dapat diisi selama belum di-ACC oleh SPV/Manager.
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
              <button onClick={() => handleApproveDate(selectedDate)} disabled={approvingDate === selectedDate || pendingRoomsToday.length === 0} className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-60 shadow-sm">
                {approvingDate === selectedDate ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />} Approve Semua ({pendingRoomsToday.length} ruangan)
              </button>
            ) : (
              <button onClick={() => handleUnapproveDate(selectedDate)} disabled={approvingDate === selectedDate} className="text-sm bg-slate-200 text-slate-700 rounded-lg px-4 py-2 hover:bg-slate-300">Buka Kembali</button>
            )}
          </div>
        )}
      </div>

      <div className="print-card avoid-break no-print mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Pilih Ruangan</label>
        <select
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none sm:w-auto"
          value={selectedRoom ? selectedRoom.code + "|" + selectedRoom.name : ""}
          onChange={(ev) => {
            const [code, ...rest] = ev.target.value.split("|");
            const name = rest.join("|");
            const room = rooms.find((r) => r.code === code && r.name === name);
            setSelectedRoom(room || null);
            setError("");
          }}
        >
          <option value="">-- Pilih ruangan --</option>
          {Array.from(new Set(rooms.map(roomCategory))).map((cat) => (
            <optgroup key={cat} label={cat}>
              {rooms.filter((r) => roomCategory(r) === cat).map((r) => {
                const filled = roomsFilledToday.has(r.name);
                const rowsApproved = todaysEntries.filter((e) => e.roomName === r.name).some((e) => !!e.spv);
                return (
                  <option key={r.code + r.name} value={r.code + "|" + r.name}>
                    {r.name} ({r.code}){filled ? (rowsApproved ? " ✓ disetujui" : " • terisi") : ""}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
      </div>

      {!selectedRoom ? (
        <p className="no-print text-sm text-slate-500">Pilih ruangan di atas untuk isi/lihat data tanggal {selectedDate}.</p>
      ) : (
        <div className="print-card avoid-break bg-white rounded-xl border overflow-hidden mb-6 shadow-sm">
          <div className="px-4 py-3 border-b bg-slate-50">
            <div className="font-medium text-slate-800 text-sm">{selectedRoom.name} <span className="text-slate-400 font-normal">({selectedRoom.code})</span></div>
            <div className="text-xs text-slate-500 mb-2">{selectedRoom.persyaratanKey}</div>
            <div className="flex flex-wrap gap-3">
              {PARAM_DEFS.map((p) => {
                const lim = selectedRoom.limits?.[p.key];
                if (!selectedRoom.required?.[p.key] || !lim) return null;
                return (
                  <div key={p.key} className="text-xs bg-white border rounded-lg px-2.5 py-1.5 shadow-2xs">
                    <span className="font-medium text-slate-600">{p.label}: </span>
                    <span className="text-slate-700">{formatRange(lim.syaratL, lim.syaratU, p.unit)}</span>
                    <span className="text-slate-400"> · Alert {formatRange(lim.alertL, lim.alertU, p.unit)}</span>
                    <span className="text-slate-400"> · Action {formatRange(lim.actionL, lim.actionU, p.unit)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-2 py-2 text-left">Jam</th>
                {PARAM_DEFS.map((p) => <th key={p.key} className="px-2 py-2 text-center">{p.label} ({p.unit})</th>)}
                <th className="px-2 py-2 text-center">OPR</th>
                <th className="px-2 py-2 text-center">SPV</th>
              </tr>
            </thead>
            <tbody>
              {SESI.map((jam) => (
                <tr key={jam} className="border-t">
                  <td className="px-2 py-2 text-slate-500">{jam}</td>
                  {PARAM_DEFS.map((p) => {
                    const v = values[jam]?.[p.key] ?? "";
                    const style = levelStyle(liveLevelFor(v, selectedRoom.limits?.[p.key]));
                    const required = !!selectedRoom?.required?.[p.key];
                    return (
                      <td key={p.key} className="px-1 py-1 text-center">
                        <input
                          value={v}
                          disabled={!canInput || roomLocked || !required}
                          placeholder={required ? "" : "N/A"}
                          onChange={(e) => updateField(jam, p.key, e.target.value)}
                          className="w-16 text-center rounded px-1 py-1 border disabled:bg-slate-50 disabled:text-slate-300 focus:border-orange-500 focus:outline-none"
                          style={{ background: v !== "" ? style.bg : undefined, color: v !== "" ? style.color : undefined }}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center text-slate-500">
                    {values[jam]?.opr ? (
                      <span className="inline-flex items-center gap-1">
                        {values[jam].opr}
                        <VerifyQR type="harian" facility={facilityKey} period={selectedDate} size={26} hideLabel />
                      </span>
                    ) : <span className="italic text-slate-400">belum di-ACC</span>}
                  </td>
                  <td className="px-2 py-1 text-center text-slate-500">
                    {values[jam]?.spv ? (
                      <span className="inline-flex items-center gap-1">
                        {values[jam].spv}
                        <VerifyQR type="harian" facility={facilityKey} period={selectedDate} size={26} hideLabel />
                      </span>
                    ) : <span className="italic text-slate-400">belum di-ACC</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(canInput || canApprove) && !roomLocked && (
            <div className="px-4 py-3 border-t bg-slate-50 flex flex-wrap justify-end gap-2">
              {canInput && (
                <button onClick={handleSaveRoom} disabled={saving} className="flex items-center gap-2 bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900 disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan Ruangan Ini
                </button>
              )}
              {isOperatorRole && (
                <button onClick={handleApproveOpr} disabled={saving || !SESI.every((jam) => PARAM_DEFS.every((p) => !selectedRoom.required?.[p.key] || values[jam]?.[p.key] !== ""))} className="flex items-center gap-2 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-60">
                  <FileCheck2 className="w-4 h-4" /> Approve (OPR)
                </button>
              )}
              {canApprove && (
                <button onClick={handleApproveSpv} disabled={saving || !SESI.every((jam) => !!values[jam]?.opr)} className="flex items-center gap-2 bg-orange-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-orange-700 disabled:opacity-60 shadow-sm">
                  <FileCheck2 className="w-4 h-4" /> Approve (SPV)
                </button>
              )}
            </div>
          )}
          {roomLocked && (
            <div className="px-4 py-3 border-t bg-amber-50 text-amber-800 text-xs flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" /> Ruangan ini tanggal {selectedDate} sudah di-approve SPV/Manager — terkunci.
            </div>
          )}
        </div>
      )}

      {selectedRoom && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {PARAM_DEFS.filter((p) => selectedRoom.required?.[p.key]).map((p) => (
            <ParamTrendChart
              key={p.key}
              entries={monthEntries.filter((e) => e.roomName === selectedRoom.name)}
              paramKey={p.key}
              paramLabel={p.label}
              unit={p.unit}
              limit={selectedRoom.limits?.[p.key]}
            />
          ))}
        </div>
      )}

      {selectedRoom && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Riwayat {selectedRoom.name} — Bulan Ini ({month})</h3>
          {historyByDate.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada data ruangan ini bulan ini.</p>
          ) : (
            <div className="space-y-3">
              {historyByDate.map((g) => (
                <div key={g.tanggal} className="print-card avoid-break bg-white rounded-xl border overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b">
                    <div className="text-sm font-medium text-slate-700">{g.tanggal}</div>
                    <div className="flex items-center gap-2">
                      {g.approved ? (
                        <span className="text-xs inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Disetujui {g.approvedBy}
                        </span>
                      ) : (
                        <span className="text-xs inline-flex items-center gap-1 text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                          <XOctagon className="w-3.5 h-3.5" /> Belum di-ACC
                        </span>
                      )}
                      {canApprove && !g.approved && g.tanggal !== selectedDate && (
                        <button onClick={() => handleApproveDate(g.tanggal)} disabled={approvingDate === g.tanggal} className="no-print text-xs bg-emerald-600 text-white rounded-lg px-3 py-1.5 flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-60">
                          {approvingDate === g.tanggal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5" />} Approve (tanggal terlewat)
                        </button>
                      )}
                      {canApprove && g.approved && g.tanggal !== selectedDate && session.role === "Administrator" && (
                        <button onClick={() => handleUnapproveDate(g.tanggal)} disabled={approvingDate === g.tanggal} className="text-xs bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-300">Buka Kembali</button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400">
                          <th className="px-3 py-1.5 text-left">Jam</th>
                          {PARAM_DEFS.map((p) => <th key={p.key} className="px-2 py-1.5 text-center">{p.label}</th>)}
                          <th className="px-3 py-1.5 text-center">OPR</th>
                          <th className="px-3 py-1.5 text-center">SPV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.entries.map((e) => (
                          <tr key={e.id} className="border-t">
                            <td className="px-3 py-1 text-slate-500">{e.jam}</td>
                            {PARAM_DEFS.map((p) => {
                              const style = levelStyle(e.level?.[p.key]);
                              const val = e[p.key];
                              return (
                                <td key={p.key} className="px-2 py-1 text-center">
                                  {val === null || val === undefined || val === "" ? <span className="text-slate-300">—</span> : (
                                    <span className="inline-block rounded px-1.5 py-0.5" style={{ background: style.bg, color: style.color }}>{val}</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-1 text-center text-slate-500">
                              {e.opr ? <span className="inline-flex items-center gap-1">{e.opr}<VerifyQR type="harian" facility={facilityKey} period={g.tanggal} size={22} hideLabel /></span> : "—"}
                            </td>
                            <td className="px-3 py-1 text-center text-slate-500">
                              {e.spv ? <span className="inline-flex items-center gap-1">{e.spv}<VerifyQR type="harian" facility={facilityKey} period={g.tanggal} size={22} hideLabel /></span> : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ========================================================================= PENGKAJIAN (QA) */

function PrintableTextarea({ value, onChange, disabled, rows = 3 }) {
  return (
    <>
      <textarea value={value} disabled={disabled} onChange={onChange} rows={rows} className="no-print w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 focus:border-orange-500 focus:outline-none" />
      <p className="only-print whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">{value || "-"}</p>
    </>
  );
}

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

/* ========================================================================= FORMULIR BULANAN */

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
      const rooms = master.rooms || master;
      setRoom(rooms.find((r) => r.name === roomName) || null);
      const list = entriesRes.entries || entriesRes;
      setEntries(list.filter((e) => e.roomName === roomName));
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
            <button onClick={() => setView({ page: "pengkajian", facility: facilityKey, room: roomName })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-orange-50">
              <ClipboardList className="w-4 h-4" /> Pengkajian Ruangan Ini (Opsional)
            </button>
          )}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <Printer className="w-4 h-4" /> Cetak
          </button>
        </div>
      </div>

      {error && <p className="no-print text-sm text-red-600 mb-3">{error}</p>}

      <div className="print-card avoid-break rounded-xl border-2 border-slate-800 bg-white p-5 text-xs">
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
                  <button onClick={handleApproveManagerQA} disabled={busy} className="no-print inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 shadow-sm">
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
  const roomName = initialRoom || "";
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

  async function handleGenerateAI() {
    setGenerating(true);
    setError("");
    try {
      const [rooms, entries] = await Promise.all([fetchMaster(facilityKey), fetchEntries(facilityKey, month)]);
      const scopedEntries = roomName ? (entries.entries || entries).filter((e) => e.roomName === roomName) : (entries.entries || entries);
      const facilityStats = buildFacilityStats({ facilityLabel: cfg.label + (roomName ? " — " + roomName : ""), monthLabel: monthLabelID(month), entries: scopedEntries, rooms: rooms.rooms || rooms });
      let narrative;
      try {
        narrative = await generateNarrative({ facilityLabel: cfg.label + (roomName ? " — " + roomName : ""), monthLabel: monthLabelID(month), stats: facilityStats.stats });
      } catch (aiErr) {
        narrative = generateLocalNarrative({ facilityLabel: cfg.label + (roomName ? " — " + roomName : ""), monthLabel: monthLabelID(month), entries: scopedEntries, rooms: rooms.rooms || rooms });
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

      {/* GRADASI DIBALIK: ORANYE / AMBER KE PUTIH */}
      <div className="mb-5 overflow-hidden rounded-xl border border-orange-200 print-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-600 via-orange-500 to-white px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/40 blur-2xl" />
          <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3">
              <img src="/logo-rama.png" alt="Logo PT. Rama Emerald Multi Sukses" className="h-12 w-12 shrink-0 object-contain drop-shadow" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-100">PT. Rama Emerald Multi Sukses — QA</p>
                <h2 className="text-xl font-bold text-white drop-shadow-sm">{roomName ? "Pengkajian Ruangan (Opsional)" : "Pengkajian EM Non Viable"}</h2>
                <p className="text-sm font-medium text-orange-50">
                  Fasilitas: <span className="font-semibold text-white">{cfg?.label}</span>
                  {roomName && <> · Ruangan: <span className="font-semibold text-white">{roomName}</span></>}
                  {" "}· Periode: <span className="font-semibold text-white">{monthLabelID(month)}</span>
                </p>
              </div>
            </div>
            <div className="text-right text-xs font-semibold text-slate-700">
              <p className="rounded-md bg-white/80 px-2.5 py-1 backdrop-blur-sm">Acuan: FM.QA.024/R11</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between bg-white px-5 py-3 border-t border-orange-100">
          <span className="text-xs text-slate-500 font-medium">Status keseluruhan periode ini</span>
          <StatusPill level={facilityOverallLevel(monthEntries)} hasData={monthEntries.length > 0} />
        </div>
      </div>

      {!roomName && (
        <div className="no-print flex flex-wrap gap-2 mb-4">
          {FACILITIES.map((f) => (
            <button key={f.key} onClick={() => setFacilityKey(f.key)}
              className={`text-xs rounded-full px-3 py-1 border font-medium ${facilityKey === f.key ? "bg-orange-600 text-white border-orange-600 shadow-sm" : "border-slate-300 text-slate-600 hover:bg-orange-50"}`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="no-print text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <div className="no-print text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>
      ) : (
        <div className="print-card bg-white rounded-xl border p-5 space-y-4 shadow-sm">
          {canDraft && !isFinal && (
            <div className="no-print flex justify-end">
              <button onClick={handleGenerateAI} disabled={generating} className="text-sm bg-orange-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-orange-700 disabled:opacity-60 shadow-sm">
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
              <button onClick={handleSave} className="text-sm bg-slate-800 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-slate-900"><Save className="w-4 h-4" /> Simpan Draf</button>
            )}
            {canDraft && report?.found && !report?.signoff?.dinilai?.nama && (
              <button onClick={handleDikaji} className="text-sm bg-orange-600 text-white rounded-lg px-4 py-2 hover:bg-orange-700 shadow-sm">Approve "Dikaji Oleh"</button>
            )}
            {canFinal && report?.signoff?.dinilai?.nama && !isFinal && (
              <button onClick={handleMengetahui} className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 shadow-sm">Approve Final "Mengetahui"</button>
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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-base font-semibold text-slate-800">Riwayat Aktivitas {allMonths ? "— Semua Bulan" : "— " + month}</h2>
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
  const type = params.get("type");
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
  }, [type, facilityKey, period, roomName, facility]);

  let docLabel = "";
  let periodLabel = "";
  let signerRows = [];
  if (data && !data.error) {
    if (type === "harian") {
      docLabel = "Data Pemantauan Harian EM Non Viable (FM.QA.024)";
      periodLabel = "Tanggal Data: " + fullDateID(period);
      if (data.found) signerRows = [{ label: "Disetujui SPV/Manager", nama: data.approvedBy?.nama, tanggal: data.approvedBy?.at }];
      if (data.backfill) signerRows.push({ label: "Catatan Tambahan", nama: data.backfill.byNama, tanggal: data.backfill.at, note: data.backfill.alasan });
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

  const canPrint = !!session && session.role !== "Tamu";

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
