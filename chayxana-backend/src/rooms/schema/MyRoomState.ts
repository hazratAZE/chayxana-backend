import { schema, t, type SchemaType } from "@colyseus/schema";

export const Player = schema({
  sessionId: t.string(),
  name: t.string(),
  ready: t.boolean().default(false),
});

export type Player = SchemaType<typeof Player>;

export const BoardTile = schema({
  id: t.string(),
  left: t.number(),
  right: t.number(),
});

export type BoardTile = SchemaType<typeof BoardTile>;

export const MyRoomState = schema({
  status: t.string().default("waiting"),
  players: t.array(Player),

  // Public game board
  board: t.array(BoardTile),
  leftEnd: t.number().default(-1),
  rightEnd: t.number().default(-1),

  // Current player's index in players[]
  turnIndex: t.number().default(0),
  consecutivePasses: t.number().default(0),

  // Empty until someone wins
  winnerSessionId: t.string().default(""),
});

export type MyRoomState = SchemaType<typeof MyRoomState>;
