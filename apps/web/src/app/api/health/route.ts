export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    app: "agenthub",
    runtime: "nodejs",
    version: process.env.AGENTHUB_VERSION ?? "dev",
  });
}
