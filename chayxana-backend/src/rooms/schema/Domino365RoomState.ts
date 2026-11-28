import { schema, t, type SchemaType } from "@colyseus/schema";

export const Domino365RoomPlayer = schema({
  sessionId: t.string(),
  name: t.string(),
  teamId: t.string(),
  seatIndex: t.number().default(0),
  ready: t.boolean().default(false),
  connected: t.boolean().default(true),
  handCount: t.number().default(7),
});

export type Domino365RoomPlayer =
  SchemaType<typeof Domino365RoomPlayer>;

export const Domino365PublicTile = schema({
  id: t.string(),
  left: t.number(),
  right: t.number(),
  connectedEndId: t.string().default(""),
  matchedValue: t.number().default(-1),
  freeValue: t.number().default(-1),
});

export type Domino365PublicTile =
  SchemaType<typeof Domino365PublicTile>;

export const Domino365PublicOpenEnd = schema({
  id: t.string(),
  value: t.number(),
  sourceTileId: t.string(),
  countsForSpinnerActivation: t.boolean(),
});

export type Domino365PublicOpenEnd =
  SchemaType<typeof Domino365PublicOpenEnd>;

export const Domino365RoomState = schema({
  status: t.string().default("waiting"),

  players: t.array(Domino365RoomPlayer),

  boardTiles: t.array(Domino365PublicTile),
  openEnds: t.array(Domino365PublicOpenEnd),

  scoreA: t.number().default(0),
  scoreB: t.number().default(0),

  currentPlayerId: t.string().default(""),

  roundNumber: t.number().default(1),
  consecutivePasses: t.number().default(0),

  endgameMode: t.boolean().default(false),

  spinnerActive: t.boolean().default(false),
  spinnerTileId: t.string().default(""),
  spinnerValue: t.number().default(-1),

  winnerTeamId: t.string().default(""),

  turnExpiresAt: t.number().default(0),
});

export type Domino365RoomState =
  SchemaType<typeof Domino365RoomState>;
