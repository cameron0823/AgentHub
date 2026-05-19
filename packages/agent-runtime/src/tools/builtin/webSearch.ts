import { z } from "zod";
import { ToolDefinition } from "../registry";

interface SearXNGResult {
  title: string;
  url: string;
  content: string;
}

interface SearXNGResponse {
  results: SearXNGResult[];
}

export const webSearch: ToolDefinition = {
  name: "web_search",
  description: "Search the web for current information. Returns top 5 results with titles, URLs, and snippets.",
  parameters: z.object({
    query: z.string().describe("The search query"),
  }),
  execute: async ({ query }) => {
    const baseUrl = process.env.SEARXNG_BASE_URL;
    if (!baseUrl) {
      throw new Error("SEARXNG_BASE_URL is not configured");
    }

    const url = new URL(`${baseUrl}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", "general");

    const res = await fetch(url.toString(), {
      headers: { "X-Real-IP": "127.0.0.1" },
    });
    if (!res.ok) {
      throw new Error(`SearXNG error: ${res.status}`);
    }

    const data = (await res.json()) as SearXNGResponse;
    return data.results.slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
  },
};
