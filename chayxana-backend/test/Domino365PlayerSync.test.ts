import assert from "assert";
import { ColyseusTestServer } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { Domino365RoomState } from "../src/rooms/schema/Domino365RoomState.js";
import { getTestServer, resetMockAuth } from "./testServer.js";

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("Domino 365 Player Presence & Synchronization Tests", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => {
    colyseus = await getTestServer();
  });

  afterEach(async () => {
    resetMockAuth();
    await colyseus.cleanup();
  });

  it("one player joins: all clients see one player with seatIndex 0", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
    const client1 = await colyseus.connectTo(room, { name: "Ali" });

    await waitFor(() => client1.state.players.length === 1);

    assert.strictEqual(client1.state.players.length, 1);
    assert.strictEqual(client1.state.players[0].sessionId, client1.sessionId);
    assert.strictEqual(client1.state.players[0].name, "Ali");
    assert.strictEqual(client1.state.players[0].seatIndex, 0);
    assert.strictEqual(client1.state.players[0].connected, true);
    assert.strictEqual("uid" in client1.state.players[0], false);

    await client1.leave();
  });

  it("second player joins: both clients see two players with unique seat indexes", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    const client1 = await colyseus.connectTo(room, { name: "Ali" });
    let lastWaitingUpdateForClient1: any = null;
    client1.onMessage("waiting_room_updated", (payload) => {
      lastWaitingUpdateForClient1 = payload;
    });

    const client2 = await colyseus.connectTo(room, { name: "Veli" });

    await waitFor(
      () =>
        client1.state.players.length === 2 &&
        client2.state.players.length === 2 &&
        lastWaitingUpdateForClient1?.playerCount === 2
    );

    // State sync check for both clients
    for (const c of [client1, client2]) {
      assert.strictEqual(c.state.players.length, 2);
      assert.strictEqual(c.state.players[0].sessionId, client1.sessionId);
      assert.strictEqual(c.state.players[0].seatIndex, 0);
      assert.strictEqual(c.state.players[1].sessionId, client2.sessionId);
      assert.strictEqual(c.state.players[1].seatIndex, 1);
    }

    // Broadcast waiting_room_updated check
    assert.strictEqual(lastWaitingUpdateForClient1.playerCount, 2);
    assert.strictEqual(lastWaitingUpdateForClient1.players[1].name, "Veli");
    assert.strictEqual(lastWaitingUpdateForClient1.players[1].seatIndex, 1);

    await client1.leave();
    await client2.leave();
  });

  it("four players join: all clients see four players with unique seat indexes 0..3", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
    const clients = [];

    for (let i = 0; i < 4; i++) {
      clients.push(await colyseus.connectTo(room, { name: `Player ${i + 1}` }));
    }

    await waitFor(() => clients.every((c) => c.state.players.length === 4));

    for (const c of clients) {
      assert.strictEqual(c.state.players.length, 4);
      const seatIndexes = c.state.players.map((p) => p.seatIndex);
      assert.deepStrictEqual(seatIndexes, [0, 1, 2, 3]);
      assert.strictEqual(new Set(seatIndexes).size, 4);
    }

    for (const c of clients) {
      await c.leave();
    }
  });

  it("fifth player cannot join a 4-player room", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
    const clients = [];

    for (let i = 0; i < 4; i++) {
      clients.push(await colyseus.connectTo(room, { name: `Player ${i + 1}` }));
    }

    let fifthRejected = false;
    try {
      await colyseus.connectTo(room, { name: "Player 5" });
    } catch {
      fifthRejected = true;
    }

    assert.strictEqual(fifthRejected, true, "5th player must be rejected");
    assert.strictEqual(room.state.players.length, 4);

    for (const c of clients) {
      await c.leave();
    }
  });

  it("player leaves waiting room: remaining clients see updated list with unique seat indexes", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    const client1 = await colyseus.connectTo(room, { name: "P1" });
    const client2 = await colyseus.connectTo(room, { name: "P2" });
    const client3 = await colyseus.connectTo(room, { name: "P3" });

    let latestUpdateForClient2: any = null;
    client2.onMessage("waiting_room_updated", (payload) => {
      latestUpdateForClient2 = payload;
    });

    await client1.leave();

    await waitFor(
      () =>
        client2.state.players.length === 2 &&
        client3.state.players.length === 2 &&
        latestUpdateForClient2?.playerCount === 2
    );

    for (const c of [client2, client3]) {
      assert.strictEqual(c.state.players.length, 2);
      assert.strictEqual(c.state.players[0].sessionId, client2.sessionId);
      assert.strictEqual(c.state.players[0].seatIndex, 0);
      assert.strictEqual(c.state.players[1].sessionId, client3.sessionId);
      assert.strictEqual(c.state.players[1].seatIndex, 1);
    }

    await client2.leave();
    await client3.leave();
  });
});
