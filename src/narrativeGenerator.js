// Helper module untuk EM Non Viable — menyusun ringkasan statistik
// (dipakai sebagai konteks untuk AI) dan narasi lokal cadangan (dipakai
// kalau panggilan ke Gemini gagal), untuk parameter Suhu/RH/DPG yang
// sifatnya DUA SISI (nilai bisa terlalu rendah ATAU terlalu tinggi,
// beda dari EM Viable yang cuma "makin tinggi makin buruk").

export const PARAM_DEFS = [
  { key: "suhu", label: "Suhu", unit: "°C" },
  { key: "rh", label: "RH (Kelembaban)", unit: "%" },
  { key: "dpg", label: "DPG (Perbedaan Tekanan)", unit: "Pa" },
];

const LEVEL_LABEL = { 1: "Baik", 2: "Alert", 3: "Action", 4: "Deviasi (melebihi Syarat)" };

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function fullDateID(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_ID[Number(m) - 1] || m} ${y}`;
}

export function monthLabelID(monthKey) {
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-");
  return `${MONTHS_ID[Number(m) - 1] || m} ${y}`;
}

function toNum(v) {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

// Arah penyimpangan relatif ke Alert Limit ruangan itu — dipakai supaya
// narasi bisa bilang "terlalu rendah" / "terlalu tinggi", bukan cuma "di
// luar batas".
function direction(value, limit) {
  if (!limit) return "";
  if (limit.alertL !== null && value < limit.alertL) return "terlalu rendah";
  if (limit.alertU !== null && value > limit.alertU) return "terlalu tinggi";
  return "";
}

// Bangun ringkasan statistik 1 parameter untuk 1 fasilitas+bulan — dipakai
// sebagai konteks yang dikirim ke Gemini (supaya AI tidak mengarang angka)
// dan juga dasar narasi lokal cadangan.
export function buildParamStats(entries, rooms, paramKey) {
  const roomLimit = {};
  rooms.forEach((r) => { roomLimit[r.name] = r.limits?.[paramKey] || null; });

  const points = entries
    .map((e) => {
      const v = toNum(e[paramKey]);
      const level = e.level?.[paramKey];
      if (v === null || level === null || level === undefined) return null;
      return { room: e.roomName, tanggal: e.tanggal, jam: e.jam, value: v, level, dir: direction(v, roomLimit[e.roomName]) };
    })
    .filter(Boolean);

  if (points.length === 0) return { hasData: false, points: [], breaches: [] };

  const breaches = points.filter((p) => p.level >= 2).sort((a, b) => b.level - a.level);
  const maxLevel = Math.max(...points.map((p) => p.level));
  const allGood = maxLevel <= 1;

  return {
    hasData: true,
    totalPoints: points.length,
    allGood,
    maxLevel,
    // Titik-titik ekstrem (level tertinggi), maksimal 5, buat konteks AI.
    topBreaches: breaches.slice(0, 5).map((p) => ({ room: p.room, tanggal: p.tanggal, jam: p.jam, value: p.value, level: p.level, levelLabel: LEVEL_LABEL[p.level], arah: p.dir })),
  };
}

export function buildFacilityStats({ facilityLabel, monthLabel, entries, rooms }) {
  const stats = {};
  PARAM_DEFS.forEach((p) => { stats[p.key] = buildParamStats(entries, rooms, p.key); });
  return { facilityLabel, monthLabel, stats };
}

// Narasi lokal cadangan (dipakai kalau Gemini gagal/API key belum diset) —
// jauh lebih sederhana dari hasil AI, tapi tetap berbasis data asli (tidak
// mengarang angka).
export function generateLocalNarrative({ facilityLabel, monthLabel, entries, rooms }) {
  const perParameter = {};
  let anyData = false;
  let anyBreach = false;
  let anyDeviation = false;

  PARAM_DEFS.forEach((p) => {
    const st = buildParamStats(entries, rooms, p.key);
    if (!st.hasData) {
      perParameter[p.key] = `Belum terdapat data ${p.label} yang tercatat untuk fasilitas ${facilityLabel} pada periode ${monthLabel}.`;
      return;
    }
    anyData = true;
    if (st.allGood) {
      perParameter[p.key] = `Seluruh hasil pemantauan ${p.label} pada periode ${monthLabel} berada dalam rentang Alert Limit yang ditetapkan, menunjukkan kondisi ${p.label.toLowerCase()} ruangan terkendali dengan baik.`;
    } else {
      anyBreach = true;
      const top = st.topBreaches[0];
      const hasDeviation = st.maxLevel >= 4;
      if (hasDeviation) anyDeviation = true;
      const roomsList = Array.from(new Set(st.topBreaches.map((b) => b.room))).slice(0, 3).join(", ");
      perParameter[p.key] = `Hasil pemantauan ${p.label} menunjukkan nilai tertinggi/terendah pada ${top.room} sebesar ${top.value} ${p.unit} (${fullDateID(top.tanggal)}, jam ${top.jam}), tercatat ${top.arah || "di luar rentang Alert"}. Titik yang mencapai Alert/Action/Deviasi antara lain: ${roomsList}. ${hasDeviation ? "Terdapat titik yang melampaui batas Syarat sehingga dikategorikan sebagai penyimpangan dan memerlukan tindak lanjut." : "Nilai tersebut masih berada dalam batas Syarat sehingga belum dikategorikan sebagai penyimpangan, namun perlu dievaluasi pada periode berikutnya."}`;
    }
  });

  let kesimpulanUmum;
  if (!anyData) {
    kesimpulanUmum = `Belum ada data pemantauan Suhu, RH, dan DPG yang tercatat untuk fasilitas ${facilityLabel} pada periode ${monthLabel}.`;
  } else if (!anyBreach) {
    kesimpulanUmum = `Berdasarkan evaluasi data pemantauan Suhu, RH, dan DPG periode ${monthLabel} pada fasilitas ${facilityLabel}, seluruh parameter berada dalam kondisi terkendali dan memenuhi persyaratan yang ditetapkan.`;
  } else if (anyDeviation) {
    kesimpulanUmum = `Berdasarkan evaluasi data pemantauan Suhu, RH, dan DPG periode ${monthLabel} pada fasilitas ${facilityLabel}, terdapat titik yang melampaui batas persyaratan (penyimpangan) pada satu atau lebih parameter, sehingga memerlukan investigasi dan tindak lanjut lebih lanjut.`;
  } else {
    kesimpulanUmum = `Berdasarkan evaluasi data pemantauan Suhu, RH, dan DPG periode ${monthLabel} pada fasilitas ${facilityLabel}, kondisi lingkungan secara umum masih terkendali dan memenuhi persyaratan (spesifikasi) yang ditetapkan, dengan beberapa hasil yang mencapai Alert/Action Limit namun belum dikategorikan sebagai penyimpangan.`;
  }

  return { perParameter, kesimpulanUmum, pendahuluan: `Dokumen ini menyajikan hasil pengkajian trend data pemantauan Suhu, Kelembaban (RH), dan Perbedaan Tekanan (DPG) pada fasilitas ${facilityLabel} untuk periode ${monthLabel}, mengacu pada persyaratan yang ditetapkan di Protap POS.QA.025.` };
}
