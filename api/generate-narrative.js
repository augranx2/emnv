// Vercel Serverless Function: /api/generate-narrative
// Menerima ringkasan statistik EM Non Viable (Suhu/RH/DPG) dari website,
// memanggil Gemini API (Google AI Studio) untuk menyusun narasi, dan
// mengembalikan hasilnya.
//
// PENTING: GEMINI_API_KEY diambil dari Environment Variable di Vercel,
// BUKAN ditulis langsung di file ini.
//
// Cara set di Vercel:
// 1. Buka project di dashboard Vercel -> Settings -> Environment Variables
// 2. Tambahkan: Name = GEMINI_API_KEY, Value = (API key Gemini Anda)
// 3. Pilih semua environment (Production, Preview, Development), lalu Save
// 4. Redeploy project agar env var terbaca

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        "GEMINI_API_KEY belum diset di Environment Variables Vercel. Buka Settings > Environment Variables lalu tambahkan GEMINI_API_KEY, kemudian redeploy.",
    });
    return;
  }

  let payload;
  try {
    payload = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch {
    res.status(400).json({ error: "Body request tidak valid" });
    return;
  }

  const { facilityLabel, monthLabel, stats, prevSummary } = payload;

  const prompt = `Anda adalah QA Apoteker berpengalaman di industri farmasi Indonesia yang menyusun bagian pembahasan untuk dokumen resmi "Pengkajian EM Non Viable" (pemantauan Suhu, Kelembaban/RH, dan Perbedaan Tekanan/DPG antar ruang), mengacu pada Protap POS.QA.025 dan Standar CPOB tahun 2024/2025 yang berlaku.
Fasilitas: ${facilityLabel}
Periode: ${monthLabel}
Ringkasan kesimpulan bulan sebelumnya: ${prevSummary || "Tidak ada data bulan sebelumnya."}

Data ringkasan per parameter (suhu/rh/dpg) — berisi status apakah semua data baik (allGood), level tertinggi yang terjadi (1=Baik, 2=Alert, 3=Action, 4=Deviasi/melebihi Syarat), dan daftar titik yang mencapai Alert/Action/Deviasi (ruangan, tanggal, jam, nilai, arah "terlalu rendah"/"terlalu tinggi"):
${JSON.stringify(stats, null, 2)}

Tulis narasi Bahasa Indonesia formal ala dokumen QA farmasi (gaya umum yang mudah dipahami, bukan bahasa akademis berat), mengacu HANYA pada data di atas — jangan mengarang angka, ruangan, atau tanggal yang tidak ada di data.

KETENTUAN PENTING soal istilah "penyimpangan": hasil yang mencapai Alert Limit atau Action Limit (level 2 atau 3) BUKAN penyimpangan — itu masih di bawah batas Syarat (spesifikasi), jadi masih memenuhi persyaratan. Untuk hasil seperti itu, JANGAN pakai kata "penyimpangan", dan jangan sarankan tindakan berat seperti investigasi RCA/CAPA formal. Cukup sebutkan bahwa nilai tersebut perlu dievaluasi pada periode berikutnya. Istilah "penyimpangan" HANYA dipakai untuk level 4 (melebihi batas Syarat) — dalam kasus itu baru sarankan investigasi dan tindak lanjut. Gunakan kata "terkendali", JANGAN gunakan istilah "state of control" atau istilah Inggris lain yang tidak perlu.

Balas HANYA dengan JSON valid (tanpa markdown, tanpa teks lain) dengan struktur persis:
{
  "pendahuluan": "1-2 kalimat pembuka menjelaskan cakupan pengkajian ini (fasilitas, periode, parameter Suhu/RH/DPG, acuan Protap POS.QA.025)",
  "perParameter": {
    "suhu": "narasi 3-6 kalimat tentang hasil pemantauan Suhu periode ini, sebutkan titik tertinggi/terendah beserta ruangan & tanggal bila ada, dan status terhadap Alert/Action/Syarat",
    "rh": "sama seperti di atas untuk RH (Kelembaban)",
    "dpg": "sama seperti di atas untuk DPG (Perbedaan Tekanan)"
  },
  "kesimpulanUmum": "ringkasan akhir 5-8 kalimat/beberapa paragraf pendek menggabungkan ketiga parameter, kaitkan dengan bulan sebelumnya bila relevan, DIAKHIRI pernyataan tegas apakah fasilitas ini memenuhi persyaratan periode ini"
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error (HTTP ${geminiRes.status}): ${errText}`);
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const cleanText = text
      .replace(/^```json\n?/i, "")
      .replace(/^```\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    const parsed = JSON.parse(cleanText);

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
