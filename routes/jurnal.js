const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const roleFinance = requireRole('admin', 'keuangan');

/**
 * ===================================
 *  AUTO-POST: Kas Bank → Jurnal Umum
 * ===================================
 * Dipanggil dari routes/crud.js setelah insert/update kas_bank
 * agar setiap transaksi kas tercatat otomatis di jurnal double-entry.
 */
async function autoPostKasBankToJurnal(kas, tenant_id) {
  // Cek duplikat: sudah pernah di-post?
  const [[existing]] = await db.query(
    'SELECT id FROM jurnal WHERE tenant_id=? AND sumber_transaksi=? AND sumber_id=?',
    [tenant_id, 'kas_bank', kas.id]
  );
  if (existing) return;

  // Tentukan akun debit/kredit berdasarkan tipe & kategori transaksi
  let akunDebitId, akunKreditId, deskripsiDetail;

  if (kas.tipe === 'masuk') {
    // Kas Masuk: Debit Kas, Kredit Pendapatan
    const [[akunKas]] = await db.query(
      'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
      [tenant_id, '1100']
    );
    const [[akunPendapatan]] = await db.query(
      'SELECT id FROM akun WHERE tenant_id=? AND kode LIKE ? AND is_active=1 LIMIT 1',
      [tenant_id, '410%']
    );
    akunDebitId = akunKas?.id;
    akunKreditId = akunPendapatan?.id || (await getAkunByKode(tenant_id, '4102'))?.id;
    deskripsiDetail = kas.deskripsi || 'Penerimaan Kas';

    if (!akunDebitId || !akunKreditId) {
      console.warn('⚠️ Auto-post jurnal skip (akun Kas/Pendapatan blm ada):', kas.id);
      return;
    }
  } else {
    // Kas Keluar: Debit Biaya, Kredit Kas
    const [[akunKas]] = await db.query(
      'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
      [tenant_id, '1100']
    );
    const kodeBiayaMap = {
      'Pembayaran Supplier': '5100',
      'Gaji': '5200',
      'Biaya Operasional': '5300',
      'Lainnya': '5400',
    };
    const kodeBiaya = kodeBiayaMap[kas.kategori] || '5400';
    const [[akunBiaya]] = await db.query(
      'SELECT id FROM akun WHERE tenant_id=? AND kode=?',
      [tenant_id, kodeBiaya]
    );
    akunDebitId = akunBiaya?.id;
    akunKreditId = akunKas?.id;
    deskripsiDetail = kas.deskripsi || 'Pengeluaran Kas';

    if (!akunDebitId || !akunKreditId) {
      console.warn('⚠️ Auto-post jurnal skip (akun Biaya/Kas blm ada):', kas.id);
      return;
    }
  }

  const noJurnal = `JRN/${kas.id}/${Date.now().toString(36).toUpperCase()}`;
  const jumlah = Number(kas.jumlah) || 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [jr] = await conn.query(
      `INSERT INTO jurnal (tenant_id, no_jurnal, tanggal, sumber_transaksi, sumber_id, deskripsi)
       VALUES (?, ?, ?, 'kas_bank', ?, ?)`,
      [tenant_id, noJurnal, kas.tanggal, kas.id,
       `Kas ${kas.tipe === 'masuk' ? 'Masuk' : 'Keluar'}: ${deskripsiDetail}`]
    );
    const jurnalId = jr.insertId;

    // Debit entry
    await conn.query(
      `INSERT INTO jurnal_detail (jurnal_id, akun_id, debit, kredit, deskripsi)
       VALUES (?, ?, ?, 0, ?)`,
      [jurnalId, akunDebitId, jumlah, deskripsiDetail]
    );

    // Kredit entry
    await conn.query(
      `INSERT INTO jurnal_detail (jurnal_id, akun_id, debit, kredit, deskripsi)
       VALUES (?, ?, 0, ?, ?)`,
      [jurnalId, akunKreditId, jumlah, deskripsiDetail]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('❌ Auto-post jurnal gagal:', e);
    throw e;
  } finally {
    conn.release();
  }
}

async function getAkunByKode(tenant_id, kode) {
  const [[r]] = await db.query('SELECT id, nama FROM akun WHERE tenant_id=? AND kode=?', [tenant_id, kode]);
  return r;
}

/**
 * ===================================
 *  API ENDPOINTS
 * ===================================
 */

// ---- 1. Auto-post ulang semua kas_bank ke jurnal (migrasi data lama) ----
router.post('/jurnal/repot', roleFinance, async (req, res) => {
  try {
    const [kasList] = await db.query(
      'SELECT * FROM kas_bank WHERE tenant_id=? ORDER BY id ASC',
      [req.user.tenant_id]
    );
    let posted = 0, skipped = 0;
    for (const kas of kasList) {
      try {
        await autoPostKasBankToJurnal(kas, req.user.tenant_id);
        posted++;
      } catch {
        skipped++;
      }
    }
    res.json({ ok: true, posted, skipped, total: kasList.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- 2. Jurnal Umum (daftar jurnal) ----
router.get('/laporan/jurnal-umum', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { tanggal_mulai, tanggal_selesai } = req.query;
  const now = new Date();
  const start = tanggal_mulai || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = tanggal_selesai || now.toISOString().slice(0, 10);

  const [rows] = await db.query(
    `SELECT j.*,
            GROUP_CONCAT(
              CONCAT(jd.debit, '|', jd.kredit, '|', a.kode, '|', a.nama, '|', a.kelompok, '|', COALESCE(jd.deskripsi, ''))
              ORDER BY jd.id SEPARATOR '||'
            ) AS details
     FROM jurnal j
     LEFT JOIN jurnal_detail jd ON jd.jurnal_id = j.id
     LEFT JOIN akun a ON a.id = jd.akun_id
     WHERE j.tenant_id=? AND j.tanggal BETWEEN ? AND ?
     GROUP BY j.id
     ORDER BY j.tanggal ASC, j.id ASC`,
    [t, start, end]
  );

  const jurnal = rows.map(j => {
    const details = (j.details || '').split('||').filter(Boolean).map(d => {
      const [debit, kredit, kode, nama, kelompok, desk] = d.split('|');
      return {
        akun_kode: kode || '',
        akun_nama: nama || '',
        kelompok: kelompok || '',
        debit: Number(debit) || 0,
        kredit: Number(kredit) || 0,
        deskripsi: desk || '',
      };
    });
    const totalDebit = details.reduce((s, d) => s + d.debit, 0);
    const totalKredit = details.reduce((s, d) => s + d.kredit, 0);
    return {
      id: j.id,
      no_jurnal: j.no_jurnal,
      tanggal: j.tanggal,
      sumber_transaksi: j.sumber_transaksi,
      sumber_id: j.sumber_id,
      deskripsi: j.deskripsi,
      total_debit: totalDebit,
      total_kredit: totalKredit,
      details,
    };
  });

  const grandDebit = jurnal.reduce((s, j) => s + j.total_debit, 0);
  const grandKredit = jurnal.reduce((s, j) => s + j.total_kredit, 0);

  res.json({ jurnal, total: jurnal.length, grand_debit: grandDebit, grand_kredit: grandKredit, periode: { start, end } });
});

// ---- 3. Buku Besar (per akun) ----
router.get('/laporan/buku-besar', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { akun_id, tanggal_mulai, tanggal_selesai } = req.query;
  const now = new Date();
  const start = tanggal_mulai || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = tanggal_selesai || now.toISOString().slice(0, 10);

  // Ambil daftar akun
  let [akunList] = await db.query(
    'SELECT * FROM akun WHERE tenant_id=? AND is_active=1 ORDER BY kode',
    [t]
  );

  if (akun_id) {
    akunList = akunList.filter(a => Number(a.id) === Number(akun_id));
  }

  const result = [];
  for (const akun of akunList) {
    // Saldo awal (sebelum start date)
    const [[{ saldo_awal_debit } = { saldo_awal_debit: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jd.debit), 0) AS saldo_awal_debit
       FROM jurnal_detail jd
       JOIN jurnal j ON j.id = jd.jurnal_id
       WHERE j.tenant_id=? AND jd.akun_id=? AND j.tanggal < ?`,
      [t, akun.id, start]
    );
    const [[{ saldo_awal_kredit } = { saldo_awal_kredit: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jd.kredit), 0) AS saldo_awal_kredit
       FROM jurnal_detail jd
       JOIN jurnal j ON j.id = jd.jurnal_id
       WHERE j.tenant_id=? AND jd.akun_id=? AND j.tanggal < ?`,
      [t, akun.id, start]
    );

    let saldoAwal = akun.saldo_normal === 'Debit'
      ? Number(saldo_awal_debit) - Number(saldo_awal_kredit)
      : Number(saldo_awal_kredit) - Number(saldo_awal_debit);

    // Transaksi periode ini
    const [transaksi] = await db.query(
      `SELECT j.tanggal, j.no_jurnal, j.deskripsi AS jurnal_deskripsi,
              jd.debit, jd.kredit, jd.deskripsi AS detail_deskripsi
       FROM jurnal_detail jd
       JOIN jurnal j ON j.id = jd.jurnal_id
       WHERE j.tenant_id=? AND jd.akun_id=? AND j.tanggal BETWEEN ? AND ?
       ORDER BY j.tanggal ASC, j.id ASC`,
      [t, akun.id, start, end]
    );

    let saldoBerjalan = saldoAwal;
    const mutasi = transaksi.map(t => {
      if (akun.saldo_normal === 'Debit') {
        saldoBerjalan = saldoBerjalan + Number(t.debit) - Number(t.kredit);
      } else {
        saldoBerjalan = saldoBerjalan + Number(t.kredit) - Number(t.debit);
      }
      return {
        tanggal: t.tanggal,
        no_jurnal: t.no_jurnal,
        deskripsi: t.detail_deskripsi || t.jurnal_deskripsi,
        debit: Number(t.debit),
        kredit: Number(t.kredit),
        saldo: saldoBerjalan,
      };
    });

    const totalDebit = transaksi.reduce((s, t) => s + Number(t.debit), 0);
    const totalKredit = transaksi.reduce((s, t) => s + Number(t.kredit), 0);
    const saldoAkhir = saldoBerjalan;

    result.push({
      akun_id: akun.id,
      akun_kode: akun.kode,
      akun_nama: akun.nama,
      kelompok: akun.kelompok,
      saldo_normal: akun.saldo_normal,
      saldo_awal: saldoAwal,
      total_debit: totalDebit,
      total_kredit: totalKredit,
      saldo_akhir: saldoAkhir,
      mutasi,
    });
  }

  res.json({ result, periode: { start, end }, total_akun: result.length });
});

// ---- 4. Neraca (Balance Sheet) ----
router.get('/laporan/neraca', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { tanggal } = req.query;
  const tglNeraca = tanggal || new Date().toISOString().slice(0, 10);

  // Ambil semua akun aktif
  const [akunList] = await db.query(
    'SELECT * FROM akun WHERE tenant_id=? AND is_active=1 ORDER BY kode',
    [t]
  );

  const rincian = [];
  let totalAktiva = 0, totalKewajiban = 0, totalEkuitas = 0;

  for (const akun of akunList) {
    // Hitung saldo dari jurnal_detail sampai tanggal neraca
    const [[{ totalDebit } = { totalDebit: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jd.debit), 0) AS totalDebit
       FROM jurnal_detail jd
       JOIN jurnal j ON j.id = jd.jurnal_id
       WHERE j.tenant_id=? AND jd.akun_id=? AND j.tanggal <= ?`,
      [t, akun.id, tglNeraca]
    );
    const [[{ totalKredit } = { totalKredit: 0 }]] = await db.query(
      `SELECT COALESCE(SUM(jd.kredit), 0) AS totalKredit
       FROM jurnal_detail jd
       JOIN jurnal j ON j.id = jd.jurnal_id
       WHERE j.tenant_id=? AND jd.akun_id=? AND j.tanggal <= ?`,
      [t, akun.id, tglNeraca]
    );

    let saldo = akun.saldo_normal === 'Debit'
      ? Number(totalDebit) - Number(totalKredit)
      : Number(totalKredit) - Number(totalDebit);

    if (saldo !== 0) {
      rincian.push({
        akun_kode: akun.kode,
        akun_nama: akun.nama,
        kelompok: akun.kelompok,
        saldo_normal: akun.saldo_normal,
        saldo,
      });
    }

    if (akun.kelompok === 'AKTIVA') totalAktiva += saldo;
    else if (akun.kelompok === 'KEWAJIBAN') totalKewajiban += saldo;
    else if (akun.kelompok === 'EKUITAS') totalEkuitas += saldo;
  }

  // Hitung laba/rugi periode berjalan: PENDAPATAN - BIAYA
  const totalPendapatan = rincian
    .filter(r => r.kelompok === 'PENDAPATAN')
    .reduce((s, r) => s + r.saldo, 0);
  const totalBiaya = rincian
    .filter(r => r.kelompok === 'BIAYA')
    .reduce((s, r) => s + r.saldo, 0);
  const labaRugiBerjalan = totalPendapatan - totalBiaya;

  // Ekuitas akhir = Ekuitas (modal) + Laba Rugi Berjalan
  const totalEkuitasAkhir = totalEkuitas + labaRugiBerjalan;

  // Pisahkan rincian: Neraca (AKTIVA, KEWAJIBAN, EKUITAS) vs Laba Rugi (PENDAPATAN, BIAYA)
  const neracaRincian = rincian.filter(r => r.kelompok !== 'PENDAPATAN' && r.kelompok !== 'BIAYA');

  res.json({
    tanggal: tglNeraca,
    aktiva: {
      total: totalAktiva,
      rincian: neracaRincian.filter(r => r.kelompok === 'AKTIVA'),
    },
    kewajiban: {
      total: totalKewajiban,
      rincian: neracaRincian.filter(r => r.kelompok === 'KEWAJIBAN'),
    },
    ekuitas: {
      total: totalEkuitasAkhir,
      modal: totalEkuitas,
      laba_berjalan: labaRugiBerjalan,
      rincian: neracaRincian.filter(r => r.kelompok === 'EKUITAS'),
    },
    laba_rugi: {
      total_pendapatan: totalPendapatan,
      total_biaya: totalBiaya,
      laba_rugi_berjalan: labaRugiBerjalan,
      rincian: rincian.filter(r => r.kelompok === 'PENDAPATAN' || r.kelompok === 'BIAYA'),
    },
    total_pasiva: totalKewajiban + totalEkuitasAkhir,
    selisih: totalAktiva - (totalKewajiban + totalEkuitasAkhir),
  });
});

// ---- 5. Manual Jurnal Entry ----
router.post('/jurnal/manual', roleFinance, async (req, res) => {
  const t = req.user.tenant_id;
  const { tanggal, deskripsi, details } = req.body;

  if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib diisi' });
  if (!details || !Array.isArray(details) || details.length < 2) {
    return res.status(400).json({ error: 'Minimal 2 baris (debit & kredit)' });
  }

  // Validasi total debit = total kredit
  const totalDebit = details.reduce((s, d) => s + Number(d.debit || 0), 0);
  const totalKredit = details.reduce((s, d) => s + Number(d.kredit || 0), 0);
  if (Math.abs(totalDebit - totalKredit) > 0.01) {
    return res.status(400).json({ error: `Total Debit (${totalDebit}) ≠ Total Kredit (${totalKredit})` });
  }

  const noJurnal = `JRN-M/${Date.now().toString(36).toUpperCase()}`;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [jr] = await conn.query(
      `INSERT INTO jurnal (tenant_id, no_jurnal, tanggal, sumber_transaksi, deskripsi)
       VALUES (?, ?, ?, 'manual', ?)`,
      [t, noJurnal, tanggal, deskripsi || 'Jurnal Manual']
    );

    for (const d of details) {
      if (!d.akun_id) continue;
      await conn.query(
        `INSERT INTO jurnal_detail (jurnal_id, akun_id, debit, kredit, deskripsi)
         VALUES (?, ?, ?, ?, ?)`,
        [jr.insertId, d.akun_id, Number(d.debit) || 0, Number(d.kredit) || 0, d.deskripsi || '']
      );
    }

    await conn.commit();

    const [[jurnal]] = await conn.query('SELECT * FROM jurnal WHERE id=?', [jr.insertId]);
    res.json(jurnal);
  } catch (e) {
    await conn.rollback();
    console.error('Jurnal manual error:', e);
    res.status(400).json({ error: 'Gagal membuat jurnal' });
  } finally {
    conn.release();
  }
});

// ---- 6. Daftar Akun (COA) untuk dropdown ----
router.get('/akun/coa', roleFinance, async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, kode, nama, kelompok, saldo_normal FROM akun WHERE tenant_id=? AND is_active=1 ORDER BY kode',
    [req.user.tenant_id]
  );
  res.json(rows);
});

module.exports = { router, autoPostKasBankToJurnal };
