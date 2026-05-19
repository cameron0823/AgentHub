import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { db } from "./db";
import { auth } from "./auth";
import { workspaceMembers } from "./db/schema";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth(opts.headers);
  return {
    db,
    session,
    ...opts,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});

export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if ((ctx.user as any).role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const workspaceRoles = ["owner", "admin", "member", "viewer"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type WorkspacePermission =
  | "agent:create"
  | "agent:read"
  | "agent:update"
  | "agent:delete"
  | "document:create"
  | "document:read"
  | "document:update"
  | "document:delete"
  | "member:invite"
  | "member:remove"
  | "member:update_role"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:manage_billing"
  | "model_binding:manage"
  | "embedding:manage"
  | "file:manage"
  | "settings:read"
  | "settings:update";

export const rolePermissions: Record<WorkspaceRole, readonly (WorkspacePermission | "*")[]> = {
  owner: ["*"],
  admin: [
    "agent:create",
    "agent:read",
    "agent:update",
    "agent:delete",
    "document:create",
    "document:read",
    "document:update",
    "document:delete",
    "member:invite",
    "member:remove",
    "member:update_role",
    "workspace:update",
    "workspace:manage_billing",
    "model_binding:manage",
    "embedding:manage",
    "file:manage",
    "settings:read",
    "settings:update",
  ],
  member: [
    "agent:create",
    "agent:read",
    "agent:update",
    "document:create",
    "document:read",
    "document:update",
    "document:delete",
    "embedding:manage",
    "file:manage",
    "settings:read",
  ],
  viewer: ["agent:read", "document:read", "settings:read"],
};

export function hasWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission) {
  const permissions = rolePermissions[role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export const workspaceProcedure = authedProcedure.use(async ({ ctx, input, next, meta }) => {
  const workspaceId =
    input && typeof input === "object" && "workspaceId" in input
      ? (input as { workspaceId?: unknown }).workspaceId
      : undefined;

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Workspace ID is required" });
  }

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, ctx.user.id)))
    .limit(1);

  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this workspace" });
  }

  const requiredPermission = (meta as { requiredPermission?: WorkspacePermission } | undefined)?.requiredPermission;
  if (requiredPermission && !hasWorkspacePermission(membership.role as WorkspaceRole, requiredPermission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Missing permission: ${requiredPermission}` });
  }

  return next({
    ctx: {
      ...ctx,
      workspaceId,
      workspaceRole: membership.role as WorkspaceRole,
      workspaceMember: membership,
    },
  });
});
