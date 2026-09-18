import { env } from "cloudflare:workers";
import { findAwardee } from "@/lib/survey";

export const dynamic = "force-dynamic";

// Foto asli di R2 berukuran 0,2–1,5 MB; yang dikirim ke browser hanya versi 320 px.
export async function GET(_request: Request, { params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  const awardee = await findAwardee(kode);
  const object = awardee?.photoKey ? await env.FILES.get(awardee.photoKey) : null;
  if (!object) return new Response("Foto tidak ditemukan", { status: 404 });

  const image = await env.IMAGES.input(object.body)
    .transform({ width: 320, height: 320, fit: "cover" })
    .output({ format: "image/webp", quality: 80 });
  const response = image.response();
  return new Response(response.body, {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
