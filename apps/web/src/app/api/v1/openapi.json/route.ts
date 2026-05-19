import { agentHubOpenApiDocument } from "@/server/public-api-openapi";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(agentHubOpenApiDocument, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
