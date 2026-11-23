import { schema, t, type SchemaType } from "@colyseus/schema";

export const Player = schema({
  sessionId: t.string(),
  name: t.string(),
  ready: t.boolean().default(false),
});
export type Player = SchemaType<typeof Player>;

export const MyRoomState = schema({
  players: t.array(Player),
});

export type MyRoomState = SchemaType<typeof MyRoomState>;
