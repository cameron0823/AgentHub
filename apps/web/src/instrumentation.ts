export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startAutomationWorker } = await import("./server/workers/automationWorker");
      startAutomationWorker();
    } catch (err) {
      console.warn("[instrumentation] automation worker failed to start:", err);
    }
    try {
      const { startTaskWorker } = await import("./server/workers/taskWorker");
      startTaskWorker();
    } catch (err) {
      console.warn("[instrumentation] task worker failed to start:", err);
    }
  }
}
