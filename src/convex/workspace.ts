// §9.2 Analyst workspace: provenanced notes on actors/edges/events and
// reusable saved views (filters + time slice). Auth removed — the app is a
// single shared analyst workspace, so notes and views are global.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const WORKSPACE_ID = "shared-workspace";

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
    const trimmed = body.trim();
    if (!trimmed) return null;
    return await ctx.db.insert("userNotes", {
      userId: WORKSPACE_ID,
      authorName: authorName ?? "analyst",
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
    await ctx.db.delete(id);
  },
});

// ─── Saved views ────────────────────────────────────────────────────────────

export const listViews = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("savedViews")
      .withIndex("by_user", (q) => q.eq("userId", WORKSPACE_ID))
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
    return await ctx.db.insert("savedViews", {
      userId: WORKSPACE_ID,
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
    await ctx.db.delete(id);
  },
});
