export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startAutomationWorker } = await import("./server/workers/automationWorker");
      startAutomationWorker();
    } catch (err) {
      console.warn("[instrumentation] automation worker failed to start:", err);
    }
  }
}
