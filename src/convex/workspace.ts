// §9.2 Analyst workspace: provenanced notes on actors/edges/events and
// reusable saved views (filters + time slice). User-scoped, deterministic.

import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function requireUserId(ctx: { auth: unknown; db: unknown }) {
  const userId = await getAuthUserId(ctx as never);
  if (!userId) throw new Error("NOT_AUTHENTICATED");
  return userId;
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export const listNotes = query({
  args: {
    targetType: v.union(v.literal("ACTOR"), v.literal("EDGE"), v.literal("EVENT")),
    targetId: v.string(),
  },
  handler: async (ctx, { targetType, targetId }) => {
    return await ctx.db
      .query("userNotes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", targetType).eq("targetId", targetId),
      )
      .order("desc")
      .take(50);
  },
});

export const addNote = mutation({
  args: {
    targetType: v.union(v.literal("ACTOR"), v.literal("EDGE"), v.literal("EVENT")),
    targetId: v.string(),
    body: v.string(),
    authorName: v.optional(v.string()),
  },
  handler: async (ctx, { targetType, targetId, body, authorName }) => {
    const userId = await requireUserId(ctx);
    const trimmed = body.trim();
    if (!trimmed) return null;
    const user = userId ? await ctx.db.get(userId) : null;
    return await ctx.db.insert("userNotes", {
      userId,
      authorName: authorName ?? user?.name ?? user?.email ?? "analyst",
      targetType,
      targetId,
      body: trimmed.slice(0, 4000),
      ts: Date.now(),
    });
  },
});

export const deleteNote = mutation({
  args: { id: v.id("userNotes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const note = await ctx.db.get(id);
    if (!note) return;
    if (note.userId !== userId) throw new Error("FORBIDDEN");
    await ctx.db.delete(id);
  },
});

// ─── Saved views ────────────────────────────────────────────────────────────

export const listViews = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("savedViews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
  },
});

export const saveView = mutation({
  args: {
    name: v.string(),
    filters: v.string(), // JSON blob: kinds, search, focusMode
    timeSlice: v.optional(v.number()),
  },
  handler: async (ctx, { name, filters, timeSlice }) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("savedViews", {
      userId,
      name: name.trim().slice(0, 80),
      filters,
      timeSlice,
      createdAt: Date.now(),
    });
  },
});

export const deleteView = mutation({
  args: { id: v.id("savedViews") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const view = await ctx.db.get(id);
    if (!view) return;
    if (view.userId !== userId) throw new Error("FORBIDDEN");
    await ctx.db.delete(id);
  },
});
