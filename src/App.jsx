import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LogIn, LogOut, User, Loader2, Building2, LayoutGrid, ChevronLeft,
  Lock, CheckCircle2, XOctagon, History, Save, FileCheck2, ClipboardList,
} from "lucide-react";
import {
  fetchMaster, fetchEntries, saveEntries as apiSaveEntries,
  fetchReport, saveReport as apiSaveReport, fetchStatusIndex,
  approveDikaji as apiApproveDikaji, approveMengetahui as apiApproveMengetahui,
  fetchActivityLog, fetchFormQA, approveFormQA as apiApproveFormQA,
  unapproveFormQA as apiUnapproveFormQA, changePassword as apiChangePassword,
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

/* ========================================================================= ENTRY (per fasilitas + bulan + ruangan) */

function EntryPage({ session, facilityKey, month, setView }) {
  const cfg = FACILITIES.find((f) => f.key === facilityKey);
  const [rooms, setRooms] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]); // seluruh entri bulan ini (semua ruangan)
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [rows, setRows] = useState([]); // baris tanggal x sesi untuk ruangan terpilih
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formQA, setFormQA] = useState(null);
  const [error, setError] = useState("");

  const canInput = hasFacilityAccess(session, "Staff", cfg);
  const canApprove = hasFacilityAccess(session, "Supervisor", cfg);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [roomList, entries] = await Promise.all([fetchMaster(facilityKey), fetchEntries(facilityKey, month)]);
      setRooms(roomList);
      setMonthEntries(entries);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityKey, month]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!selectedRoom) { setRows([]); setFormQA(null); return; }
    const n = daysInMonth(month);
    const byKey = {};
    monthEntries.filter((e) => e.roomName === selectedRoom.name).forEach((e) => { byKey[`${e.tanggal}|${e.jam}`] = e; });
    const built = [];
    for (let d = 1; d <= n; d++) {
      const tanggal = `${month}-${String(d).padStart(2, "0")}`;
      SESI.forEach((jam) => {
        const existing = byKey[`${tanggal}|${jam}`];
        built.push({
          tanggal, jam,
          suhu: existing?.suhu ?? "", rh: existing?.rh ?? "", dpg: existing?.dpg ?? "",
          opr: existing?.opr ?? "", spv: existing?.spv ?? "",
          level: existing?.level || { suhu: null, rh: null, dpg: null },
        });
      });
    }
    setRows(built);
    fetchFormQA(facilityKey, month, selectedRoom.name, session.token).then(setFormQA).catch(() => setFormQA(null));
  }, [selectedRoom, monthEntries, month, facilityKey, session.token]);

  function updateCell(idx, field, value) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function handleSave() {
    if (!selectedRoom) return;
    setSaving(true);
    setError("");
    try {
      // Hanya baris yang punya minimal satu nilai terisi yang disimpan.
      const editedRows = rows
        .filter((r) => r.suhu !== "" || r.rh !== "" || r.dpg !== "" || r.opr !== "" || r.spv !== "")
        .map((r) => ({
          tanggal: r.tanggal, jam: r.jam, roomName: selectedRoom.name, persyaratanKey: selectedRoom.persyaratanKey,
          suhu: r.suhu === "" ? null : r.suhu, rh: r.rh === "" ? null : r.rh, dpg: r.dpg === "" ? null : r.dpg,
          opr: r.opr, spv: r.spv,
        }));
      // Gabungkan dengan entri ruangan LAIN bulan ini (supaya tidak tertimpa —
      // backend mengganti SELURUH data bulan itu dengan array yang dikirim).
      const others = monthEntries.filter((e) => e.roomName !== selectedRoom.name).map((e) => ({
        tanggal: e.tanggal, jam: e.jam, roomName: e.roomName, persyaratanKey: e.persyaratanKey,
        suhu: e.suhu, rh: e.rh, dpg: e.dpg, opr: e.opr, spv: e.spv, id: e.id,
      }));
      const merged = others.concat(editedRows.map((r, i) => ({ ...r, id: `new-${i}` })));
      await apiSaveEntries(facilityKey, month, merged, session.token);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveFormQA() {
    setError("");
    try {
      await apiApproveFormQA(facilityKey, month, selectedRoom.name, session.token);
      const updated = await fetchFormQA(facilityKey, month, selectedRoom.name, session.token);
      setFormQA(updated);
    } catch (err) { setError(err.message); }
  }

  async function handleUnapproveFormQA() {
    setError("");
    try {
      await apiUnapproveFormQA(facilityKey, month, selectedRoom.name, session.token);
      const updated = await fetchFormQA(facilityKey, month, selectedRoom.name, session.token);
      setFormQA(updated);
    } catch (err) { setError(err.message); }
  }

  const isApproved = !!formQA?.kepalaBagian?.nama;
  const rowsLocked = isApproved && session.role !== "Administrator";

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat…</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <button onClick={() => setView({ page: "dashboard" })} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> Kembali
      </button>
      <h2 className="text-base font-semibold text-slate-800 mb-1">{cfg?.label} — {month}</h2>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-4">
        {rooms.map((r) => {
          const roomEntries = monthEntries.filter((e) => e.roomName === r.name);
          const lvl = facilityOverallLevel(roomEntries);
          const style = levelStyle(roomEntries.length ? lvl : null);
          const selected = selectedRoom?.name === r.name;
          return (
            <button key={r.code + r.name} onClick={() => setSelectedRoom(r)}
              className={`text-xs rounded-full px-3 py-1 border ${selected ? "border-slate-800" : "border-transparent"}`}
              style={{ color: style.color, background: style.bg }}>
              {r.name}
            </button>
          );
        })}
      </div>

      {!selectedRoom ? (
        <p className="text-sm text-slate-500">Pilih ruangan di atas untuk mulai input/lihat data.</p>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b bg-slate-50">
            <div>
              <div className="font-medium text-slate-800 text-sm">{selectedRoom.name} <span className="text-slate-400 font-normal">({selectedRoom.code})</span></div>
              <div className="text-xs text-slate-500">{selectedRoom.persyaratanKey}</div>
            </div>
            <div className="flex items-center gap-2">
              {isApproved ? (
                <span className="text-xs inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 rounded-full px-2 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Disetujui {formQA.kepalaBagian.nama} ({formQA.kepalaBagian.tanggal})
                </span>
              ) : (
                <span className="text-xs inline-flex items-center gap-1 text-slate-500 bg-slate-100 rounded-full px-2 py-1">
                  <XOctagon className="w-3.5 h-3.5" /> Belum disetujui
                </span>
              )}
              {canApprove && !isApproved && (
                <button onClick={handleApproveFormQA} className="text-xs bg-emerald-600 text-white rounded-lg px-3 py-1.5 flex items-center gap-1">
                  <FileCheck2 className="w-3.5 h-3.5" /> Approve Formulir
                </button>
              )}
              {canApprove && isApproved && (
                <button onClick={handleUnapproveFormQA} className="text-xs bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5">
                  Buka Kembali
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-2 py-2 text-left">Tanggal</th>
                  <th className="px-2 py-2 text-left">Jam</th>
                  {PARAM_DEFS.map((p) => (
                    <th key={p.key} className="px-2 py-2 text-center">{p.label} ({p.unit})</th>
                  ))}
                  <th className="px-2 py-2 text-center">OPR</th>
                  <th className="px-2 py-2 text-center">SPV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.tanggal + r.jam} className="border-t">
                    {r.jam === "08:00" && (
                      <td className="px-2 py-1 align-top" rowSpan={2}>{r.tanggal.slice(-2)}</td>
                    )}
                    <td className="px-2 py-1 text-slate-500">{r.jam}</td>
                    {PARAM_DEFS.map((p) => {
                      const style = levelStyle(r.level?.[p.key]);
                      return (
                        <td key={p.key} className="px-1 py-1">
                          <input
                            value={r[p.key]}
                            disabled={!canInput || rowsLocked}
                            onChange={(e) => updateCell(idx, p.key, e.target.value)}
                            className="w-16 text-center rounded px-1 py-1 border disabled:bg-slate-50"
                            style={{ background: r[p.key] !== "" ? style.bg : undefined, color: r[p.key] !== "" ? style.color : undefined }}
                          />
                        </td>
                      );
                    })}
                    <td className="px-1 py-1">
                      <input value={r.opr} disabled={!canInput || rowsLocked} onChange={(e) => updateCell(idx, "opr", e.target.value)} className="w-20 text-center rounded px-1 py-1 border disabled:bg-slate-50" />
                    </td>
                    <td className="px-1 py-1">
                      <input value={r.spv} disabled={!canInput || rowsLocked} onChange={(e) => updateCell(idx, "spv", e.target.value)} className="w-20 text-center rounded px-1 py-1 border disabled:bg-slate-50" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canInput && !rowsLocked && (
            <div className="px-4 py-3 border-t bg-slate-50 flex justify-end">
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-slate-800 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
              </button>
            </div>
          )}
          {rowsLocked && (
            <div className="px-4 py-3 border-t bg-amber-50 text-amber-700 text-xs flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" /> Data terkunci — Formulir ruangan ini sudah disetujui Kepala Bagian.
            </div>
          )}
        </div>
      )}
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
      {view.page === "entry" && <EntryPage session={session} facilityKey={view.facility} month={month} setView={setView} />}
      {view.page === "pengkajian" && <PengkajianPage session={session} month={month} setView={setView} />}
      {view.page === "activity" && <ActivityPage session={session} month={month} setView={setView} />}
    </div>
  );
}
