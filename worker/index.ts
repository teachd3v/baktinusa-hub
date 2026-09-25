import vinext from "vinext/server/fetch-handler";
import { runScheduled } from "../lib/data/cron";

export * from "vinext/server/fetch-handler";

// Dua jadwal, satu handler. Yang sering hanya memindahkan status periode; cadangan cukup sekali sehari.
const BACKUP_CRON = "10 17 * * *"; // 00.10 WIB

export default {
  fetch(request, env, ctx) {
    return vinext.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime).toISOString();
    const run = async () => {
      try {
        const report = await runScheduled(env.DB, env.FILES, now, { backup: controller.cron === BACKUP_CRON });
        console.log(
          `[cron ${controller.cron}] dibuka=${report.opened.length} ditutup=${report.closed.length} ` +
            `belum-penuh=${report.behind}${report.backup ? ` cadangan=${report.backup.rows} baris` : ""}`,
        );
      } catch (error) {
        // Gagal di satu jalan tidak boleh menghentikan jadwal berikutnya; Workers Observability yang menyimpan jejaknya.
        console.error(`[cron ${controller.cron}] gagal:`, error);
      }
    };
    ctx.waitUntil(run());
  },
} satisfies ExportedHandler<Env>;
