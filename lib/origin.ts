import { headers } from "next/headers";

// Origin publik hub untuk menyusun tautan yang dibagikan (tautan survei, tautan masuk).
export async function publicOrigin(): Promise<string> {
  const host = (await headers()).get("host") ?? "baktinusa-hub.te4ch.workers.dev";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return `${local ? "http" : "https"}://${host}`;
}
