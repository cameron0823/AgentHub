import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { channelAccounts, channelAuditLog } from "@/server/db/schema";
import { limitFromRequest, requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const limit = limitFromRequest(req);

  const [accounts, recentEvents] = await Promise.all([
    db
      .select({
        id: channelAccounts.id,
        agentId: channelAccounts.agentId,
        provider: channelAccounts.provider,
        name: channelAccounts.name,
        externalTeamId: channelAccounts.externalTeamId,
        externalChannelId: channelAccounts.externalChannelId,
        verificationSecretHint: channelAccounts.verificationSecretHint,
        isEnabled: channelAccounts.isEnabled,
        dmPolicy: channelAccounts.dmPolicy,
        allowedTools: channelAccounts.allowedTools,
        createdAt: channelAccounts.createdAt,
        updatedAt: channelAccounts.updatedAt,
      })
      .from(channelAccounts)
      .where(eq(channelAccounts.userId, userId))
      .orderBy(desc(channelAccounts.updatedAt))
      .limit(limit),
    db
      .select()
      .from(channelAuditLog)
      .where(eq(channelAuditLog.userId, userId))
      .orderBy(desc(channelAuditLog.createdAt))
      .limit(limit),
  ]);

  return NextResponse.json({ data: { accounts, recentEvents } });
}
