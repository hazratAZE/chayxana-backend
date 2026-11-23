import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";

describe("testing your Colyseus app", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("connecting into a room", async () => {
    // `room` is the server-side Room instance reference.
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});

    // `client1` is the client-side `Room` instance reference (same as JavaScript SDK)
    const client1 = await colyseus.connectTo(room);

    // make your assertions
    assert.strictEqual(client1.sessionId, room.clients[0].sessionId);

    assert.strictEqual(client1.state.players.length, 1);
    assert.strictEqual(client1.state.players[0].sessionId, client1.sessionId);
    assert.strictEqual(client1.state.players[0].name, "Player 1");
    assert.strictEqual(client1.state.players[0].ready, false);
  });
});
