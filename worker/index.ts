import vinext from "vinext/server/fetch-handler";

export * from "vinext/server/fetch-handler";

export default {
  fetch(request, env, ctx) {
    return vinext.fetch(request, env, ctx);
  },

  // Cron Triggers belum dipasang di wrangler.jsonc — jadwalnya ditambahkan di Fase 6.
  async scheduled(controller) {
    console.log(`[scheduled] cron="${controller.cron}" at ${new Date(controller.scheduledTime).toISOString()}`);
  },
} satisfies ExportedHandler<Env>;
