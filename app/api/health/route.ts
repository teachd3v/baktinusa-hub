import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

async function probe(check: () => Promise<unknown>) {
  try {
    await check();
    return true;
  } catch (error) {
    console.error("[health]", error);
    return false;
  }
}

export async function GET() {
  const [db, sessions, files] = await Promise.all([
    probe(() => env.DB.prepare("SELECT 1").first()),
    probe(() => env.SESSIONS.get("health-probe")),
    probe(() => env.FILES.head("health-probe")),
  ]);
  const ok = db && sessions && files;

  return Response.json({ ok, db, sessions, files }, { status: ok ? 200 : 503 });
}
