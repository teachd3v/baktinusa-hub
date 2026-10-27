const wib = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatWib = (iso: string) => `${wib.format(new Date(iso))} WIB`;

const wibDate = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Hanya tanggalnya, untuk jadwal siklus: jam buka di tengah kalimat membuat rentang tanggal sulit dibaca.
export const formatWibDate = (iso: string) => wibDate.format(new Date(iso));
