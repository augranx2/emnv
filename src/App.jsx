import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LogIn, LogOut, User, Loader2, Building2, LayoutGrid, ChevronLeft,
  Lock, CheckCircle2, XOctagon, History, Save, FileCheck2, ClipboardList,
} from "lucide-react";
import {
  fetchMaster, fetchEntries, saveEntries as apiSaveEntries,
  fetchReport, saveReport as apiSaveReport, fetchStatusIndex,
  approveDikaji as apiApproveDikaji, approveMengetahui as apiApproveMengetahui,
  fetchActivityLog, fetchDayStatus, fetchOpenInputDates,
  approveDay as apiApproveDay, unapproveDay as apiUnapproveDay,
  openBackfill as apiOpenBackfill, changePassword as apiChangePassword,
} from "./api.js";
import { useAuth, hasAccess, hasFacilityAccess } from "./auth.js";

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

function daysInMonth(monthStr) {
  if (!monthStr) return 31;
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/* ========================================================================= LOGIN */

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err.message || "Login gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-2">
          <h1 className="text-lg font-semibold text-slate-800">EM Non Viable</h1>
          <p className="text-sm text-slate-500">PT. Rama Emerald Multi Sukses</p>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" autoFocus />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 bg-slate-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          Masuk
        </button>
      </form>
    </div>
  );
}

/* ========================================================================= LAYOUT */

function Header({ session, onLogout, view, setView, month, setMonth }) {
  return (
    <header className="bg-white border-b sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setView({ page: "dashboard" })} className="font-semibold text-slate-800 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" /> EM Non Viable
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border rounded-lg px-2 py-1 text-sm" />
          {hasAccess(session, "Supervisor") && (
            <button onClick={() => setView({ page: "activity" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <History className="w-4 h-4" /> Riwayat
            </button>
          )}
          {hasAccess(session, "Supervisor", "QA") && (
            <button onClick={() => setView({ page: "pengkajian" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <ClipboardList className="w-4 h-4" /> Pengkajian
            </button>
          )}
          <div className="text-sm text-slate-600 flex items-center gap-1">
            <User className="w-4 h-4" /> {session.nama} <span className="text-slate-400">({session.role}{session.departemen ? " · " + session.departemen : ""})</span>
          </div>
          <button onClick={onLogout} className="text-sm text-slate-500 hover:text-red-600 flex items-center gap-1">
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>
      </div>
    </header>
  );
}

/* ========================================================================= DASHBOARD */

function Dashboard({ month, setView }) {
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStatusIndex(month).then((d) => { if (!cancelled) setStatus(d); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h2 className="text-base font-semibold text-slate-800 mb-4">Rekap Status — {month}</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {FACILITIES.map((f) => {
            const s = status[f.key] || { level: 0, hasData: false };
            const style = levelStyle(s.hasData ? s.level : null);
            return (
              <button key={f.key} onClick={() => setView({ page: "entry", facility: f.key })}
                className="rounded-xl border bg-white p-4 text-left hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-800 text-sm flex items-center gap-1"><Building2 className="w-4 h-4 text-slate-400" /> {f.label}</span>
                </div>
                <span className="inline-block text-xs font-medium rounded-full px-2 py-0.5" style={{ color: style.color, background: style.bg }}>
                  {s.hasData ? style.label : "Belum ada data"}
                </span>
              </button>
            );
          })}
        </div>
      )}
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
      <div className="text-sm font-medium text-slate-700">Buka Akses Backfill (tanggal lewat yang belum diisi)</div>
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

  const [openDates, setOpenDates] = useState({ today: todayStr(), backfillDates: [] });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [rooms, setRooms] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const [dayStatus, setDayStatus] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [values, setValues] = useState({}); // { "08:00": {suhu,rh,dpg}, "13:00": {...} }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    if (!selectedRoom) { setValues({}); return; }
    const byJam = { "08:00": null, "13:00": null };
    monthEntries.filter((e) => e.roomName === selectedRoom.name && e.tanggal === selectedDate).forEach((e) => { byJam[e.jam] = e; });
    const init = {};
    SESI.forEach((jam) => {
      const e = byJam[jam];
      init[jam] = { suhu: e?.suhu ?? "", rh: e?.rh ?? "", dpg: e?.dpg ?? "", opr: e?.opr ?? "", spv: e?.spv ?? "", level: e?.level || { suhu: null, rh: null, dpg: null } };
    });
    setValues(init);
  }, [selectedRoom, monthEntries, selectedDate]);

  function updateField(jam, field, val) {
    setValues((prev) => ({ ...prev, [jam]: { ...prev[jam], [field]: val } }));
  }

  const isApproved = !!dayStatus?.approved;
  const rowsLocked = isApproved && session.role !== "Administrator";
  const dateOptions = [{ tanggal: openDates.today, label: "Hari ini", isBackfill: false }]
    .concat((openDates.backfillDates || []).map((b) => ({ tanggal: b.tanggal, label: b.tanggal, isBackfill: true, alasan: b.alasan })));

  // Validasi kelengkapan: parameter yang PUNYA persyaratan (level bukan null,
  // artinya wajib diisi untuk ruangan ini) tidak boleh kosong kalau sesi itu
  // sudah mulai diisi (minimal satu parameter terisi).
  function validateRoom() {
    const missing = [];
    SESI.forEach((jam) => {
      const v = values[jam];
      if (!v) return;
      const anyFilled = v.suhu !== "" || v.rh !== "" || v.dpg !== "";
      if (!anyFilled) return;
      PARAM_DEFS.forEach((p) => {
        const required = v.level?.[p.key] !== null && v.level?.[p.key] !== undefined;
        if (required && v[p.key] === "") missing.push(`${jam} — ${p.label}`);
      });
    });
    return missing;
  }

  async function handleSaveRoom() {
    if (!selectedRoom) return;
    const missing = validateRoom();
    if (missing.length > 0) {
      setError("Data belum lengkap, mohon isi dulu: " + missing.join(", "));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const editedRows = SESI.filter((jam) => values[jam].suhu !== "" || values[jam].rh !== "" || values[jam].dpg !== "").map((jam) => ({
        tanggal: selectedDate, jam, roomName: selectedRoom.name, persyaratanKey: selectedRoom.persyaratanKey,
        suhu: values[jam].suhu === "" ? null : values[jam].suhu,
        rh: values[jam].rh === "" ? null : values[jam].rh,
        dpg: values[jam].dpg === "" ? null : values[jam].dpg,
        opr: "", spv: "",
      }));
      const others = monthEntries
        .filter((e) => !(e.roomName === selectedRoom.name && e.tanggal === selectedDate))
        .map((e) => ({ tanggal: e.tanggal, jam: e.jam, roomName: e.roomName, persyaratanKey: e.persyaratanKey, suhu: e.suhu, rh: e.rh, dpg: e.dpg, opr: e.opr, spv: e.spv, id: e.id }));
      const merged = others.concat(editedRows.map((r, i) => ({ ...r, id: `new-${selectedDate}-${i}` })));
      await apiSaveEntries(facilityKey, month, merged, session.token);
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

  // Riwayat bulan ini, dikelompokkan per tanggal (terbaru dulu).
  const historyByDate = useMemo(() => {
    const groups = {};
    monthEntries.forEach((e) => {
      if (!groups[e.tanggal]) groups[e.tanggal] = [];
      groups[e.tanggal].push(e);
    });
    return Object.keys(groups).sort().reverse().map((tanggal) => ({
      tanggal,
      entries: groups[tanggal].sort((a, b) => (a.jam + a.roomName).localeCompare(b.jam + b.roomName)),
      approved: tanggal === selectedDate ? isApproved : groups[tanggal].every((e) => !!e.spv),
      approvedBy: groups[tanggal].find((e) => e.spv)?.spv || null,
    }));
  }, [monthEntries, selectedDate, isApproved]);

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> Kembali
      </button>
      <h2 className="text-base font-semibold text-slate-800 mb-1">{cfg?.label}</h2>
      {error && <p className="text-sm text-red-600 mb-3 whitespace-pre-line">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-4">
        {dateOptions.map((d) => (
          <button key={d.tanggal} onClick={() => { setSelectedDate(d.tanggal); setSelectedRoom(null); }}
            className={`text-xs rounded-full px-3 py-1.5 border flex items-center gap-1 ${selectedDate === d.tanggal ? "bg-slate-800 text-white border-slate-800" : "border-slate-300 text-slate-600"}`}>
            {d.isBackfill && <ClipboardList className="w-3 h-3" />} {d.label}
          </button>
        ))}
        {canApprove && !openDates.backfillDates?.length && (
          <span className="text-xs text-slate-400 self-center">Operator hanya bisa isi hari ini kecuali dibuka backfill di bawah.</span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl border p-4 mb-4">
        <div className="text-sm">
          <span className="text-slate-500">Tanggal terpilih: </span>
          <span className="font-medium text-slate-800">{selectedDate}</span>
          {isApproved ? (
            <span className="ml-2 text-xs inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Disetujui {dayStatus.approvedBy?.nama} ({dayStatus.approvedBy?.at})
            </span>
          ) : (
            <span className="ml-2 text-xs inline-flex items-center gap-1 text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
              <XOctagon className="w-3.5 h-3.5" /> Belum di-ACC{todaysEntries.length > 0 ? ` — ${roomsFilledToday.size} ruangan terisi` : ""}
            </span>
          )}
        </div>
        {canApprove && (
          <div>
            {!isApproved ? (
              <button onClick={() => handleApproveDate(selectedDate)} disabled={approvingDate === selectedDate || todaysEntries.length === 0} className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 disabled:opacity-60">
                {approvingDate === selectedDate ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />} Approve Semua ({roomsFilledToday.size} ruangan)
              </button>
            ) : (
              <button onClick={() => handleUnapproveDate(selectedDate)} disabled={approvingDate === selectedDate} className="text-sm bg-slate-200 text-slate-700 rounded-lg px-4 py-2">Buka Kembali</button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {rooms.map((r) => {
          const filled = roomsFilledToday.has(r.name);
          const entriesForRoom = todaysEntries.filter((e) => e.roomName === r.name);
          const lvl = facilityOverallLevel(entriesForRoom);
          const style = filled ? levelStyle(lvl) : { color: "#94a3b8", bg: "#f1f5f9" };
          const selected = selectedRoom?.name === r.name;
          return (
            <button key={r.code + r.name} onClick={() => { setSelectedRoom(r); setError(""); }}
              className={`text-xs rounded-full px-3 py-1 border ${selected ? "border-slate-800" : "border-transparent"}`}
              style={{ color: style.color, background: style.bg }}>
              {r.name}{filled && " ✓"}
            </button>
          );
        })}
      </div>

      {!selectedRoom ? (
        <p className="text-sm text-slate-500">Pilih ruangan di atas untuk isi/lihat data tanggal {selectedDate}.</p>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden mb-6">
          <div className="px-4 py-3 border-b bg-slate-50">
            <div className="font-medium text-slate-800 text-sm">{selectedRoom.name} <span className="text-slate-400 font-normal">({selectedRoom.code})</span></div>
            <div className="text-xs text-slate-500">{selectedRoom.persyaratanKey}</div>
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
                    const style = levelStyle(values[jam]?.level?.[p.key]);
                    const required = values[jam]?.level?.[p.key] !== null && values[jam]?.level?.[p.key] !== undefined;
                    return (
                      <td key={p.key} className="px-1 py-1 text-center">
                        <input
                          value={v}
                          disabled={!canInput || rowsLocked || !required}
                          placeholder={required ? "" : "N/A"}
                          onChange={(e) => updateField(jam, p.key, e.target.value)}
                          className="w-16 text-center rounded px-1 py-1 border disabled:bg-slate-50 disabled:text-slate-300"
                          style={{ background: v !== "" ? style.bg : undefined, color: v !== "" ? style.color : undefined }}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center text-slate-500">
                    {values[jam]?.opr || <span className="italic text-slate-400">otomatis</span>}
                  </td>
                  <td className="px-2 py-1 text-center text-slate-500">
                    {values[jam]?.spv || <span className="italic text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canInput && !rowsLocked && (
            <div className="px-4 py-3 border-t bg-slate-50 flex justify-end">
              <button onClick={handleSaveRoom} disabled={saving} className="flex items-center gap-2 bg-slate-800 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan Ruangan Ini
              </button>
            </div>
          )}
          {rowsLocked && (
            <div className="px-4 py-3 border-t bg-amber-50 text-amber-700 text-xs flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" /> Tanggal ini sudah di-ACC — terkunci.
            </div>
          )}
        </div>
      )}

      {canApprove && <BackfillForm session={session} facilityKey={facilityKey} onOpened={loadAll} />}

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Riwayat Bulan Ini ({month})</h3>
        {historyByDate.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada data bulan ini.</p>
        ) : (
          <div className="space-y-3">
            {historyByDate.map((g) => (
              <div key={g.tanggal} className="bg-white rounded-xl border overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b">
                  <div className="text-sm font-medium text-slate-700">{g.tanggal} <span className="text-slate-400 font-normal">({new Set(g.entries.map((e) => e.roomName)).size} ruangan)</span></div>
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
                    {canApprove && !g.approved && (
                      <button onClick={() => handleApproveDate(g.tanggal)} disabled={approvingDate === g.tanggal} className="text-xs bg-emerald-600 text-white rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-60">
                        {approvingDate === g.tanggal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5" />} Approve
                      </button>
                    )}
                    {canApprove && g.approved && session.role === "Administrator" && (
                      <button onClick={() => handleUnapproveDate(g.tanggal)} disabled={approvingDate === g.tanggal} className="text-xs bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5">Buka Kembali</button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="px-3 py-1.5 text-left">Jam</th>
                        <th className="px-3 py-1.5 text-left">Ruangan</th>
                        {PARAM_DEFS.map((p) => <th key={p.key} className="px-2 py-1.5 text-center">{p.label}</th>)}
                        <th className="px-3 py-1.5 text-center">OPR</th>
                        <th className="px-3 py-1.5 text-center">SPV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.entries.map((e) => (
                        <tr key={e.id} className="border-t">
                          <td className="px-3 py-1 text-slate-500">{e.jam}</td>
                          <td className="px-3 py-1 text-slate-700">{e.roomName}</td>
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
                          <td className="px-3 py-1 text-center text-slate-500">{e.opr || "—"}</td>
                          <td className="px-3 py-1 text-center text-slate-500">{e.spv || "—"}</td>
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
    </div>
  );
}
/* ========================================================================= PENGKAJIAN (QA) */

function PengkajianPage({ session, month, setView }) {
  const [facilityKey, setFacilityKey] = useState(FACILITIES[0].key);
  const [report, setReport] = useState(null);
  const [pendahuluan, setPendahuluan] = useState("");
  const [kesimpulan, setKesimpulan] = useState("");
  const [perParameter, setPerParameter] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cfg = FACILITIES.find((f) => f.key === facilityKey);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchReport(facilityKey, month, session.token);
      setReport(r);
      setPendahuluan(r.narrative?.pendahuluan || "");
      setKesimpulan(r.narrative?.kesimpulanUmum || "");
      setPerParameter(r.narrative?.perParameter || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey, month, session.token]);

  useEffect(() => { load(); }, [load]);

  const canDraft = hasAccess(session, "Supervisor", "QA");
  const canFinal = hasAccess(session, "Manager", "QA");
  const isFinal = !!report?.signoff?.diperiksa?.nama;

  async function handleSave() {
    setError("");
    try {
      await apiSaveReport(facilityKey, month, { pendahuluan, kesimpulanUmum: kesimpulan, perParameter }, session.token);
      await load();
    } catch (err) { setError(err.message); }
  }
  async function handleDikaji() {
    setError("");
    try { await apiApproveDikaji(facilityKey, month, session.token); await load(); } catch (err) { setError(err.message); }
  }
  async function handleMengetahui() {
    setError("");
    try { await apiApproveMengetahui(facilityKey, month, session.token); await load(); } catch (err) { setError(err.message); }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> Kembali
      </button>
      <h2 className="text-base font-semibold text-slate-800 mb-4">Pengkajian EM Non Viable — {month}</h2>

      <div className="flex flex-wrap gap-2 mb-4">
        {FACILITIES.map((f) => (
          <button key={f.key} onClick={() => setFacilityKey(f.key)}
            className={`text-xs rounded-full px-3 py-1 border ${facilityKey === f.key ? "bg-slate-800 text-white border-slate-800" : "border-slate-300 text-slate-600"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>
      ) : (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Pendahuluan</label>
            <textarea value={pendahuluan} disabled={!canDraft || isFinal} onChange={(e) => setPendahuluan(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
          </div>
          {PARAM_DEFS.map((p) => (
            <div key={p.key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">Pembahasan {p.label}</label>
              <textarea
                value={perParameter[p.key] || ""}
                disabled={!canDraft || isFinal}
                onChange={(e) => setPerParameter((prev) => ({ ...prev, [p.key]: e.target.value }))}
                rows={3} className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Kesimpulan Umum</label>
            <textarea value={kesimpulan} disabled={!canDraft || isFinal} onChange={(e) => setKesimpulan(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            {canDraft && !isFinal && (
              <button onClick={handleSave} className="text-sm bg-slate-800 text-white rounded-lg px-4 py-2 flex items-center gap-2"><Save className="w-4 h-4" /> Simpan Draf</button>
            )}
            {canDraft && report?.found && !report?.signoff?.dinilai?.nama && (
              <button onClick={handleDikaji} className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2">Approve "Dikaji Oleh"</button>
            )}
            {canFinal && report?.signoff?.dinilai?.nama && !isFinal && (
              <button onClick={handleMengetahui} className="text-sm bg-emerald-600 text-white rounded-lg px-4 py-2">Approve Final "Mengetahui"</button>
            )}
            {isFinal && (
              <span className="text-xs text-emerald-700 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Sudah final — Mengetahui oleh {report.signoff.diperiksa.nama} ({report.signoff.diperiksa.tanggal})</span>
            )}
          </div>
          {report?.signoff?.dinilai?.nama && (
            <p className="text-xs text-slate-500">Dikaji oleh: {report.signoff.dinilai.nama} ({report.signoff.dinilai.tanggal})</p>
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchActivityLog(session.token, { month }).then((l) => { if (!cancelled) setLogs(l); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session.token, month]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> Kembali
      </button>
      <h2 className="text-base font-semibold text-slate-800 mb-4">Riwayat Aktivitas — {month}</h2>
      {loading ? (
        <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>
      ) : (
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

/* ========================================================================= APP ROOT */

export default function App() {
  const { session, checking, login, logout } = useAuth();
  const [view, setView] = useState({ page: "dashboard" });
  const [month, setMonth] = useState(currentMonth());

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header session={session} onLogout={logout} view={view} setView={setView} month={month} setMonth={setMonth} />
      {view.page === "dashboard" && <Dashboard month={month} setView={setView} />}
      {view.page === "entry" && <EntryPage session={session} facilityKey={view.facility} setView={setView} />}
      {view.page === "pengkajian" && <PengkajianPage session={session} month={month} setView={setView} />}
      {view.page === "activity" && <ActivityPage session={session} month={month} setView={setView} />}
    </div>
  );
}
