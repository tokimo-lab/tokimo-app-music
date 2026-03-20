import {
  AddToPlaylistInputSchema,
  CreatePlaylistInputSchema,
  PlaylistDetailOutputSchema,
  PlaylistOutputSchema,
  RemoveFromPlaylistInputSchema,
  ReorderPlaylistInputSchema,
  UpdatePlaylistInputSchema,
} from "@acme/types";
import { z } from "zod";
import { protectedProcedure } from "../../trpc/middlewares";
import { router } from "../../trpc/trpc";
import { playlistService } from "./playlist.service";

export const playlistRouter = router({
  list: protectedProcedure
    .output(z.array(PlaylistOutputSchema))
    .query(async ({ ctx }) => {
      return playlistService.list(ctx.userId);
    }),

  getById: protectedProcedure
    .input(z.object({ playlistId: z.string() }))
    .output(PlaylistDetailOutputSchema)
    .query(async ({ input, ctx }) => {
      return playlistService.getById(input.playlistId, ctx.userId);
    }),

  create: protectedProcedure
    .input(CreatePlaylistInputSchema)
    .output(PlaylistOutputSchema)
    .mutation(async ({ input, ctx }) => {
      return playlistService.create(ctx.userId, input);
    }),

  update: protectedProcedure
    .input(UpdatePlaylistInputSchema)
    .output(PlaylistOutputSchema)
    .mutation(async ({ input, ctx }) => {
      return playlistService.update(ctx.userId, input);
    }),

  delete: protectedProcedure
    .input(z.object({ playlistId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await playlistService.delete(input.playlistId, ctx.userId);
    }),

  addTracks: protectedProcedure
    .input(AddToPlaylistInputSchema)
    .mutation(async ({ input, ctx }) => {
      await playlistService.addTracks(
        input.playlistId,
        ctx.userId,
        input.trackIds,
      );
    }),

  removeItems: protectedProcedure
    .input(RemoveFromPlaylistInputSchema)
    .mutation(async ({ input, ctx }) => {
      await playlistService.removeItems(
        input.playlistId,
        ctx.userId,
        input.itemIds,
      );
    }),

  reorder: protectedProcedure
    .input(ReorderPlaylistInputSchema)
    .mutation(async ({ input, ctx }) => {
      await playlistService.reorder(
        input.playlistId,
        ctx.userId,
        input.itemIds,
      );
    }),
});
