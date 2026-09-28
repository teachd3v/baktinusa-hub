// Alat sekali pakai: mendaftar dan mengosongkan bucket R2 produksi.
//
// BUKAN bagian dari Worker yang di-deploy. Hidup hanya selama `wrangler dev --remote` di bawah
// dijalankan, dengan config-nya sendiri di sebelah berkas ini.
//
//   npx wrangler dev --remote -c scripts/r2-kosongkan/wrangler.jsonc --port 8799
//
//   http://localhost:8799/                  → cuma mendaftar isinya, tidak menghapus apa pun
//   http://localhost:8799/?ya=hapus-semua   → menghapus semuanya
//
// Dibuat karena `wrangler r2 object` hanya bisa get/put/delete per kunci, tidak bisa list — sementara
// `r2 bucket delete` menolak bucket yang belum kosong. Binding R2 punya list(), jadi tidak ada kunci
// yang perlu ditebak: yang tidak kita ketahui pun ikut terhitung dan ikut terhapus.

const AMAN = "hapus-semua";

export default {
  async fetch(request, env) {
    const hapus = new URL(request.url).searchParams.get("ya") === AMAN;

    const kunci = [];
    let cursor;
    do {
      const halaman = await env.FILES.list({ cursor, limit: 1000 });
      for (const objek of halaman.objects) kunci.push({ key: objek.key, size: objek.size });
      cursor = halaman.truncated ? halaman.cursor : undefined;
    } while (cursor);

    // Dikelompokkan per awalan supaya isinya terbaca tanpa menumpahkan 55 nama berkas —
    // nama berkas foto memuat kode referal awardee.
    const per = {};
    for (const o of kunci) {
      const awalan = o.key.includes("/") ? `${o.key.slice(0, o.key.indexOf("/"))}/` : "(tanpa awalan)";
      per[awalan] = per[awalan] ?? { objek: 0, bytes: 0 };
      per[awalan].objek += 1;
      per[awalan].bytes += o.size;
    }

    if (!hapus) {
      return Response.json({ mode: "daftar saja", total: kunci.length, per, cara: `tambahkan ?ya=${AMAN}` }, null, 2);
    }

    // delete() menerima maksimal 1000 kunci sekali panggil.
    let terhapus = 0;
    for (let i = 0; i < kunci.length; i += 1000) {
      const potongan = kunci.slice(i, i + 1000).map((o) => o.key);
      await env.FILES.delete(potongan);
      terhapus += potongan.length;
    }

    const sisa = await env.FILES.list({ limit: 1 });
    return Response.json({ mode: "hapus", terhapus, per, kosong: sisa.objects.length === 0 }, null, 2);
  },
};
