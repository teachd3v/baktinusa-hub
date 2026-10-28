// Foto awardee ada di public/images/<wilayah>/<nama lengkap>.webp. Berkasnya bisa tidak ada: pemakainya
// harus menyiapkan pengganti (inisial) lewat onError.
export const awardeePhotoUrl = (region: string, name: string) =>
  `/images/${encodeURIComponent(region.toLowerCase().replaceAll(" ", "-"))}/${encodeURIComponent(name)}.webp`;
