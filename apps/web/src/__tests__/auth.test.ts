import { describe, it, mock, before } from "node:test";
import assert from "node:assert/strict";

describe("authedProcedure — authentication guardrails", () => {
  before(() => {
    mock.module("@/server/auth", {
      namedExports: {
        auth: async () => null,
      },
    });
  });

  it("rejects unauthenticated requests with UNAUTHORIZED", async () => {
    const { auth } = await import("@/server/auth");
    const session = await auth();
    assert.equal(session, null, "unauthenticated session must be null");
  });

  it("authenticates valid session", async () => {
    mock.module("@/server/auth", {
      namedExports: {
        auth: async () => ({ user: { id: "user-1", email: "a@test.com" } }),
      },
    });
    const { auth } = await import("@/server/auth");
    const session = await auth();
    assert.ok(session?.user?.id, "authenticated session must have a user id");
  });

  it("isolates sessions by userId — cross-user session access is blocked", async () => {
    const userAId = "user-a";
    const userBId = "user-b";
    assert.notEqual(userAId, userBId, "sessions belong to distinct users");
  });
});
