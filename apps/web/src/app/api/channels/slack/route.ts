import { NextRequest, NextResponse } from "next/server";
import { handleChannelWebhook } from "@/server/channels/webhook";
import { parseSlackSlashCommand, verifySlackSignature } from "@/server/channels/slack";

export const runtime = "nodejs";

function slackSuccessResponse(message: string) {
  return NextResponse.json({
    response_type: "in_channel",
    text: message.slice(0, 3000),
  });
}

function slackDeniedResponse(message: string) {
  return NextResponse.json({
    response_type: "ephemeral",
    text: message.slice(0, 3000),
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  return handleChannelWebhook({
    req,
    rawBody,
    provider: "slack",
    verifyRequest: ({ rawBody, headers, verificationSecret }) =>
      verifySlackSignature({
        rawBody,
        timestamp: headers.get("x-slack-request-timestamp"),
        signature: headers.get("x-slack-signature"),
        signingSecret: verificationSecret,
      }),
    parseCommand: parseSlackSlashCommand,
    successResponse: slackSuccessResponse,
    deniedResponse: slackDeniedResponse,
  });
}
