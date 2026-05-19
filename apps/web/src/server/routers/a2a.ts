import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { authedProcedure, router } from "../trpc";
import { db } from "../db";
import { a2aCommunities, a2aCommunityMembers, a2aPeers } from "../db/schema";
import {
  A2A_COMMUNITY_ROLES,
  A2A_DISCOVERY_SOURCES,
  A2A_FRAMEWORK_ADAPTERS,
  A2A_FRAMEWORKS,
  A2A_PEER_STATUSES,
  delegateToA2APeer,
  discoverLocalA2APeers,
  ensureDefaultA2ACommunity,
  getA2AMdnsDiscoveryQueries,
  listA2ACommunities,
  listA2APeers,
  upsertA2APeer,
} from "../a2a-discovery";

const frameworkSchema = z.enum(A2A_FRAMEWORKS);
const discoverySourceSchema = z.enum(A2A_DISCOVERY_SOURCES);
const peerStatusSchema = z.enum(A2A_PEER_STATUSES);
const roleSchema = z.enum(A2A_COMMUNITY_ROLES);

export const a2aRouter = router({
  adapterContracts: authedProcedure.query(() => ({
    mdns: getA2AMdnsDiscoveryQueries(),
    adapters: A2A_FRAMEWORK_ADAPTERS,
  })),

  communities: authedProcedure.query(async ({ ctx }) => {
    const communities = await listA2ACommunities(ctx.user.id);
    if (communities.length > 0) return communities;
    return [await ensureDefaultA2ACommunity(ctx.user.id)];
  }),

  createCommunity: authedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional().nullable(),
        agentGroupId: z.string().uuid().optional().nullable(),
        sharedMemoryKnowledgeBaseId: z.string().uuid().optional().nullable(),
        sharedMemoryEnabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [community] = await db
        .insert(a2aCommunities)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          agentGroupId: input.agentGroupId ?? null,
          sharedMemoryKnowledgeBaseId: input.sharedMemoryKnowledgeBaseId ?? null,
          sharedMemoryEnabled: input.sharedMemoryEnabled,
        })
        .returning();
      return community;
    }),

  peers: authedProcedure
    .input(z.object({ communityId: z.string().uuid().optional().nullable() }).optional())
    .query(async ({ ctx, input }) => listA2APeers(ctx.user.id, input?.communityId)),

  upsertPeer: authedProcedure
    .input(
      z.object({
        communityId: z.string().uuid().optional().nullable(),
        name: z.string().trim().min(1).max(160),
        endpoint: z.string().url(),
        framework: frameworkSchema.default("a2a"),
        discoverySource: discoverySourceSchema.default("manual"),
        status: peerStatusSchema.default("unknown"),
        authScheme: z.enum(["none", "apiKey", "oauth2", "openIdConnect"]).default("none"),
        metadata: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const communityId = input.communityId ?? (await ensureDefaultA2ACommunity(ctx.user.id)).id;
      return upsertA2APeer({
        userId: ctx.user.id,
        communityId,
        name: input.name,
        endpoint: input.endpoint,
        framework: input.framework,
        discoverySource: input.discoverySource,
        status: input.status,
        authScheme: input.authScheme,
        metadata: input.metadata,
      });
    }),

  addMember: authedProcedure
    .input(
      z.object({
        communityId: z.string().uuid(),
        agentId: z.string().uuid().optional().nullable(),
        peerId: z.string().uuid().optional().nullable(),
        role: roleSchema.default("worker"),
        permissions: z.array(z.string()).default(["delegate"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.agentId && !input.peerId) throw new Error("agentId or peerId is required");
      const [community] = await db
        .select()
        .from(a2aCommunities)
        .where(and(eq(a2aCommunities.id, input.communityId), eq(a2aCommunities.userId, ctx.user.id)))
        .limit(1);
      if (!community) throw new Error("A2A community not found");

      const [member] = await db
        .insert(a2aCommunityMembers)
        .values({
          communityId: input.communityId,
          userId: ctx.user.id,
          agentId: input.agentId ?? null,
          peerId: input.peerId ?? null,
          role: input.role,
          permissions: input.permissions,
        })
        .onConflictDoNothing()
        .returning();
      return member ?? { success: true };
    }),

  discoverLocal: authedProcedure
    .input(
      z
        .object({
          communityId: z.string().uuid().optional().nullable(),
          endpoints: z.array(z.string().url()).optional(),
          includeLoopback: z.boolean().default(true),
          timeoutMs: z.number().int().min(100).max(5_000).default(900),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const communityId = input?.communityId ?? (await ensureDefaultA2ACommunity(ctx.user.id)).id;
      const discovered = await discoverLocalA2APeers({
        endpoints: input?.endpoints,
        includeLoopback: input?.includeLoopback ?? true,
        timeoutMs: input?.timeoutMs ?? 900,
      });
      const peers = [];
      for (const peer of discovered) {
        peers.push(
          await upsertA2APeer({
            userId: ctx.user.id,
            communityId,
            name: peer.name,
            endpoint: peer.endpoint,
            framework: peer.framework,
            agentCard: peer.agentCard,
            capabilities: peer.capabilities,
            authScheme: peer.authScheme,
            discoverySource: peer.source,
            status: peer.status,
            metadata: peer.metadata,
          }),
        );
      }
      return {
        discovered: peers,
        mdns: getA2AMdnsDiscoveryQueries(),
      };
    }),

  delegate: authedProcedure
    .input(
      z.object({
        peerId: z.string().uuid(),
        task: z.string().trim().min(1).max(10_000),
        agentId: z.string().uuid().optional().nullable(),
        metadata: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      delegateToA2APeer({
        userId: ctx.user.id,
        peerId: input.peerId,
        task: input.task,
        agentId: input.agentId,
        metadata: input.metadata,
      }),
    ),

  removePeer: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await db.delete(a2aPeers).where(and(eq(a2aPeers.id, input.id), eq(a2aPeers.userId, ctx.user.id)));
    return { success: true };
  }),
});
