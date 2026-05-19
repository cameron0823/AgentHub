import { NextRequest, NextResponse } from "next/server";
import { handleChannelWebhook } from "@/server/channels/webhook";
import { parseDiscordInteraction, verifyDiscordSignature } from "@/server/channels/discord";

export const runtime = "nodejs";

function discordInteractionResponse(message: string, ephemeral = false) {
  return NextResponse.json({
    type: 4,
    data: {
      content: message.slice(0, 2000),
      ...(ephemeral && { flags: 64 }),
    },
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  return handleChannelWebhook({
    req,
    rawBody,
    provider: "discord",
    verifyRequest: ({ rawBody, headers, verificationSecret }) =>
      verifyDiscordSignature({
        rawBody,
        timestamp: headers.get("x-signature-timestamp"),
        signature: headers.get("x-signature-ed25519"),
        publicKey: verificationSecret,
      }),
    parseCommand: parseDiscordInteraction,
    successResponse: (message) => discordInteractionResponse(message),
    deniedResponse: (message) => discordInteractionResponse(message, true),
    pingResponse: () => NextResponse.json({ type: 1 }),
  });
}
