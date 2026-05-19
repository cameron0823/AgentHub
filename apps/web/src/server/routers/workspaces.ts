import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  router,
  authedProcedure,
  hasWorkspacePermission,
  workspaceProcedure,
  type WorkspacePermission,
  type WorkspaceRole,
} from "../trpc";
import { db } from "../db";
import { workspaceInvitations, workspaceMembers, workspaces, users } from "../db/schema";

const workspaceRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
const inviteRoleSchema = z.enum(["admin", "member", "viewer"]);

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "workspace"
  );
}

async function ownerRows(workspaceId: string) {
  return db
    .select({ id: workspaceMembers.id, userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")));
}

async function assertWorkspacePermission(userId: string, workspaceId: string, permission: WorkspacePermission) {
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this workspace" });
  if (!hasWorkspacePermission(membership.role as WorkspaceRole, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Missing permission: ${permission}` });
  }
  return membership;
}

async function assertNotLastOwner(workspaceId: string, memberId: string) {
  const owners = await ownerRows(workspaceId);
  if (owners.length <= 1 && owners[0]?.id === memberId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Transfer ownership before removing or demoting the last owner",
    });
  }
}

export const workspacesRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ workspace: workspaces, member: workspaceMembers })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, ctx.user.id), isNull(workspaces.deletedAt)))
      .orderBy(desc(workspaceMembers.joinedAt));
    return rows.map((row) => ({
      ...row.workspace,
      role: row.member.role,
      permissions: row.member.permissions,
    }));
  }),

  get: workspaceProcedure.input(z.object({ workspaceId: z.string().uuid() })).query(async ({ input }) => {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.deletedAt)))
      .limit(1);
    if (!workspace) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
    return workspace;
  }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        slug: z.string().trim().min(1).max(80).optional(),
        brandColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#1890ff"),
        defaultLocale: z.string().trim().min(2).max(12).default("en-US"),
        defaultModel: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slugBase = slugify(input.slug ?? input.name);
      const [workspace] = await db
        .insert(workspaces)
        .values({
          name: input.name,
          slug: `${slugBase}-${nanoid(6).toLowerCase()}`,
          brandColor: input.brandColor,
          defaultLocale: input.defaultLocale,
          defaultModel: input.defaultModel || null,
        })
        .returning();
      await db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: ctx.user.id,
        role: "owner",
      });
      return workspace;
    }),

  update: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        logo: z.string().url().nullable().optional(),
        brandColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        defaultLocale: z.string().trim().min(2).max(12).optional(),
        defaultModel: z.string().trim().max(120).nullable().optional(),
        systemPrompt: z.string().max(8000).nullable().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspacePermission(ctx.user.id, input.workspaceId, "workspace:update");
      const [workspace] = await db
        .update(workspaces)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.logo !== undefined && { logo: input.logo }),
          ...(input.brandColor && { brandColor: input.brandColor }),
          ...(input.defaultLocale && { defaultLocale: input.defaultLocale }),
          ...(input.defaultModel !== undefined && { defaultModel: input.defaultModel }),
          ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
          ...(input.metadata && { metadata: input.metadata }),
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, input.workspaceId))
        .returning();
      return workspace;
    }),

  members: workspaceProcedure.input(z.object({ workspaceId: z.string().uuid() })).query(async ({ input }) => {
    return db
      .select({
        id: workspaceMembers.id,
        workspaceId: workspaceMembers.workspaceId,
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        permissions: workspaceMembers.permissions,
        joinedAt: workspaceMembers.joinedAt,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, input.workspaceId));
  }),

  invite: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        email: z.string().email(),
        role: inviteRoleSchema.default("member"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspacePermission(ctx.user.id, input.workspaceId, "member:invite");
      const [invitation] = await db
        .insert(workspaceInvitations)
        .values({
          workspaceId: input.workspaceId,
          email: input.email.toLowerCase(),
          role: input.role,
          token: nanoid(32),
          invitedBy: ctx.user.id,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        })
        .returning();
      return invitation;
    }),

  acceptInvitation: authedProcedure.input(z.object({ token: z.string().min(16) })).mutation(async ({ ctx, input }) => {
    const [invitation] = await db
      .select()
      .from(workspaceInvitations)
      .where(and(eq(workspaceInvitations.token, input.token), isNull(workspaceInvitations.acceptedAt)))
      .limit(1);
    if (!invitation || invitation.expiresAt < new Date())
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found or expired" });
    if (ctx.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Invitation email does not match current user" });
    }
    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: invitation.workspaceId,
        userId: ctx.user.id,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
      })
      .onConflictDoNothing();
    await db
      .update(workspaceInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(workspaceInvitations.id, invitation.id));
    return { success: true, workspaceId: invitation.workspaceId };
  }),

  updateMemberRole: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        memberId: z.string().uuid(),
        role: workspaceRoleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspacePermission(ctx.user.id, input.workspaceId, "member:update_role");
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.id, input.memberId), eq(workspaceMembers.workspaceId, input.workspaceId)))
        .limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace member not found" });
      if (member.role === "owner" && input.role !== "owner") await assertNotLastOwner(input.workspaceId, member.id);
      const [updated] = await db
        .update(workspaceMembers)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(workspaceMembers.id, input.memberId))
        .returning();
      return updated;
    }),

  removeMember: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        memberId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspacePermission(ctx.user.id, input.workspaceId, "member:remove");
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.id, input.memberId), eq(workspaceMembers.workspaceId, input.workspaceId)))
        .limit(1);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace member not found" });
      if (member.role === "owner") await assertNotLastOwner(input.workspaceId, member.id);
      await db.delete(workspaceMembers).where(eq(workspaceMembers.id, input.memberId));
      return { success: true };
    }),

  softDelete: workspaceProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertWorkspacePermission(ctx.user.id, input.workspaceId, "workspace:delete");
      const otherOwners = await db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.role, "owner"),
            ne(workspaceMembers.userId, ctx.user.id),
          ),
        );
      if (otherOwners.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transfer ownership before deleting the workspace" });
      }
      const [workspace] = await db
        .update(workspaces)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaces.id, input.workspaceId))
        .returning();
      return workspace;
    }),
});
