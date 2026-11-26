import assert from "assert";
import { ColyseusTestServer } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { Domino365RoomState } from "../src/rooms/schema/Domino365RoomState.js";
import { Domino365Room } from "../src/rooms/Domino365Room.js";
import { getTestServer } from "./testServer.js";

describe("Domino multiplayer tests", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => {
    colyseus = await getTestServer();
  });

  after(async () => {
    await colyseus.cleanup();
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  async function createFourPlayers() {
    const room = await colyseus.createRoom<MyRoomState>("domino", {});

    const clients = [];

    for (let i = 0; i < 4; i++) {
      clients.push(await colyseus.connectTo(room));
    }

    return { room, clients };
  }

  function waitForCondition(
    condition: () => boolean,
    timeout = 3000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now();

      const check = () => {
        if (condition()) {
          resolve();
          return;
        }

        if (Date.now() - started > timeout) {
          reject(new Error("Condition timed out"));
          return;
        }

        setTimeout(check, 10);
      };

      check();
    });
  }

  function waitForRejection(client: any): Promise<any> {
    return new Promise((resolve) => {
      client.onMessage("move_rejected", (message: any) => {
        resolve(message);
      });
    });
  }

  it("should connect four players and start the game", async () => {
    const { room, clients } = await createFourPlayers();

    assert.strictEqual(clients.length, 4);
    assert.strictEqual(room.state.players.length, 4);
    assert.strictEqual(room.state.status, "playing");
  });

  it("should deal 7 private tiles to each player", async () => {
    const { room } = await createFourPlayers();

    // Access private server data for testing only.
    const hands: Map<string, any[]> =
      (room as any).playerHands;

    assert.strictEqual(hands.size, 4);

    const allTiles = Array.from(hands.values()).flat();

    for (const hand of hands.values()) {
      assert.strictEqual(hand.length, 7);
    }

    assert.strictEqual(allTiles.length, 28);

    const uniqueIds = new Set(
      allTiles.map((tile) => tile.id)
    );

    assert.strictEqual(uniqueIds.size, 28);

    // Private hands must not be in public synchronized state.
    assert.strictEqual(
      "playerHands" in room.state,
      false
    );
  });

  it("should allow the first player to place a tile", async () => {
    const { room, clients } = await createFourPlayers();

    const hands: Map<string, any[]> =
      (room as any).playerHands;

    const firstPlayer = clients[0];

    const hand = hands.get(firstPlayer.sessionId)!;
    const tile = hand[0];

    firstPlayer.send("place_tile", {
      tileId: tile.id,
      side: "right",
    });

    await waitForCondition(
      () => room.state.board.length === 1
    );

    assert.strictEqual(room.state.board.length, 1);
    assert.strictEqual(hand.length, 6);
    assert.strictEqual(room.state.turnIndex, 1);
  });

  it("should reject a move from a player whose turn has not arrived", async () => {
    const { room, clients } = await createFourPlayers();

    const secondPlayer = clients[1];

    const rejection = waitForRejection(secondPlayer);

    secondPlayer.send("place_tile", {
      tileId: (room as any).playerHands
        .get(secondPlayer.sessionId)[0].id,
      side: "right",
    });

    const response = await rejection;

    assert.strictEqual(
      response.reason,
      "It is not your turn."
    );

    assert.strictEqual(room.state.board.length, 0);
    assert.strictEqual(room.state.turnIndex, 0);
  });

  it("should reject a tile that belongs to another player", async () => {
    const { room, clients } = await createFourPlayers();

    const hands: Map<string, any[]> =
      (room as any).playerHands;

    const firstPlayer = clients[0];
    const secondPlayer = clients[1];

    const secondPlayerTile = hands.get(
      secondPlayer.sessionId
    )![0];

    const rejection = waitForRejection(firstPlayer);

    firstPlayer.send("place_tile", {
      tileId: secondPlayerTile.id,
      side: "right",
    });

    const response = await rejection;

    assert.strictEqual(
      response.reason,
      "This tile is not in your hand."
    );

    assert.strictEqual(room.state.board.length, 0);
    assert.strictEqual(
      hands.get(secondPlayer.sessionId)!.length,
      7
    );
  });

  it("should reject a tile that does not exist in the player's hand", async () => {
    const { room, clients } = await createFourPlayers();

    const firstPlayer = clients[0];

    const rejection = waitForRejection(firstPlayer);

    firstPlayer.send("place_tile", {
      tileId: "invalid-tile",
      side: "right",
    });

    const response = await rejection;

    assert.strictEqual(
      response.reason,
      "This tile is not in your hand."
    );

    assert.strictEqual(room.state.board.length, 0);
  });

  it("should allow a player to pass when no tile is playable", async () => {
    const { room, clients } = await createFourPlayers();

    const serverRoom = room as any;
    const firstPlayer = clients[0];

    serverRoom.board = {
      tiles: [{ id: "0-0", left: 0, right: 0 }],
      leftEnd: 0,
      rightEnd: 0,
    };

    serverRoom.playerHands.set(firstPlayer.sessionId, [
      { id: "1-2", left: 1, right: 2 },
    ]);

    firstPlayer.send("pass_turn");

    await waitForCondition(
      () => room.state.turnIndex === 1
    );

    assert.equal(room.state.consecutivePasses, 1);
  });

  it("should reject passing when a playable tile exists", async () => {
    const { room, clients } = await createFourPlayers();

    const firstPlayer = clients[0];

    const serverRoom = room as any;

    serverRoom.board = {
      tiles: [{ id: "2-5", left: 2, right: 5 }],
      leftEnd: 2,
      rightEnd: 5,
    };

    serverRoom.playerHands.set(firstPlayer.sessionId, [
      { id: "5-6", left: 5, right: 6 },
    ]);

    const rejection = waitForRejection(firstPlayer);

    firstPlayer.send("pass_turn");

    const response = await rejection;

    assert.equal(
      response.reason,
      "You have a playable tile. You cannot pass."
    );

    assert.equal(room.state.turnIndex, 0);
    assert.equal(room.state.consecutivePasses, 0);
  });

  describe("Domino365 Room Lifecycle & Disconnect", () => {
    it("should remove only leaving player from waiting room and re-balance teams", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

      const client1 = await colyseus.connectTo(room, { name: "Player 1" });
      const client2 = await colyseus.connectTo(room, { name: "Player 2" });
      const client3 = await colyseus.connectTo(room, { name: "Player 3" });

      assert.strictEqual(room.state.players.length, 3);
      assert.strictEqual(room.state.players[0].teamId, "A");
      assert.strictEqual(room.state.players[1].teamId, "B");
      assert.strictEqual(room.state.players[2].teamId, "A");
      assert.strictEqual(room.state.status, "waiting");

      // Player 1 leaves waiting room
      await client1.leave();

      assert.strictEqual(room.state.players.length, 2);
      assert.strictEqual(room.state.status, "waiting");

      // Teams should be re-balanced to A and B
      assert.strictEqual(room.state.players[0].name, "Player 2");
      assert.strictEqual(room.state.players[0].teamId, "A");
      assert.strictEqual(room.state.players[1].name, "Player 3");
      assert.strictEqual(room.state.players[1].teamId, "B");

      await client2.leave();
      await client3.leave();
    });

    it("should pause turn timer when active player disconnects", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      const client1 = await colyseus.connectTo(room);
      const client2 = await colyseus.connectTo(room);
      const client3 = await colyseus.connectTo(room);
      const client4 = await colyseus.connectTo(room);

      assert.strictEqual(room.state.status, "playing");
      const activePlayerId = room.state.currentPlayerId;
      assert.ok(activePlayerId.length > 0);

      // Turn timer should be active
      assert.ok(room.state.turnExpiresAt > Date.now());

      // Simulate active player disconnecting (pause turn timer)
      (r as any).pauseTurnTimer(activePlayerId);

      const pausedMs = (r as any).pausedTurnRemainingMs;
      assert.ok(pausedMs > 0 && pausedMs <= 25000);
      assert.strictEqual((r as any).pausedTurnPlayerId, activePlayerId);
      assert.strictEqual(room.state.turnExpiresAt, 0);

      await client1.leave();
      await client2.leave();
      await client3.leave();
      await client4.leave();
    });

    it("should resume turn timer with remaining time upon player reconnect", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      const clients = [];
      for (let i = 0; i < 4; i++) {
        clients.push(await colyseus.connectTo(room));
      }

      assert.strictEqual(room.state.status, "playing");
      const activePlayerId = room.state.currentPlayerId;

      // Pause with 12000 ms remaining
      (r as any).pausedTurnRemainingMs = 12000;
      (r as any).pausedTurnPlayerId = activePlayerId;
      (r as any).stopTurnTimer();

      assert.strictEqual(room.state.turnExpiresAt, 0);

      // Resume timer
      (r as any).startTurnTimer((r as any).pausedTurnRemainingMs);

      assert.ok(room.state.turnExpiresAt > Date.now());
      assert.ok(room.state.turnExpiresAt <= Date.now() + 12050);

      for (const c of clients) {
        await c.leave();
      }
    });

    it("should set game status to abandoned when abandonGame is called", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      const clients = [];
      for (let i = 0; i < 4; i++) {
        clients.push(await colyseus.connectTo(room));
      }

      assert.strictEqual(room.state.status, "playing");

      (r as any).abandonGame(clients[0].sessionId);

      assert.strictEqual(room.state.status, "abandoned");
      assert.strictEqual(room.state.turnExpiresAt, 0);
      assert.strictEqual((r as any).pausedTurnRemainingMs, 0);
      assert.strictEqual((r as any).pausedTurnPlayerId, null);

      for (const c of clients) {
        await c.leave();
      }
    });

    it("should ignore duplicate abandon calls", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      const clients = [];
      for (let i = 0; i < 4; i++) {
        clients.push(await colyseus.connectTo(room));
      }

      (r as any).abandonGame(clients[0].sessionId);
      assert.strictEqual(room.state.status, "abandoned");

      // Second call should return early without throwing or changing anything
      (r as any).abandonGame(clients[1].sessionId);
      assert.strictEqual(room.state.status, "abandoned");

      for (const c of clients) {
        await c.leave();
      }
    });

    it("should preserve finished status if abandonGame is called after game finish", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      const clients = [];
      for (let i = 0; i < 4; i++) {
        clients.push(await colyseus.connectTo(room));
      }

      // Set game to finished
      room.state.status = "finished";

      (r as any).abandonGame(clients[0].sessionId);

      assert.strictEqual(room.state.status, "finished");

      for (const c of clients) {
        await c.leave();
      }
    });

    it("should schedule 5000ms cleanup when room is abandoned", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      const clients = [];
      for (let i = 0; i < 4; i++) {
        clients.push(await colyseus.connectTo(room));
      }

      (r as any).abandonGame(clients[0].sessionId);

      assert.strictEqual(room.state.status, "abandoned");
      assert.ok((r as any).roomCleanupTimer !== null);

      for (const c of clients) {
        await c.leave();
      }
    });

    it("should schedule 30000ms cleanup when game is finished", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      const clients = [];
      for (let i = 0; i < 4; i++) {
        clients.push(await colyseus.connectTo(room));
      }

      // Simulate game reaching finished state in game model
      (r as any).game.status = "finished";
      (r as any).syncPublicState();

      assert.strictEqual(room.state.status, "finished");
      assert.ok((r as any).roomCleanupTimer !== null);

      for (const c of clients) {
        await c.leave();
      }
    });

    it("should not create duplicate cleanup timer if already scheduled", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      (r as any).scheduleRoomDisposal(5000);
      const initialTimer = (r as any).roomCleanupTimer;
      assert.ok(initialTimer !== null);

      // Attempt second disposal schedule
      (r as any).scheduleRoomDisposal(10000);
      assert.strictEqual((r as any).roomCleanupTimer, initialTimer);
    });

    it("should clear both turnTimer and roomCleanupTimer on onDispose", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const r = room as unknown as Domino365Room;

      (r as any).turnTimer = (r as any).clock.setTimeout(() => {}, 25000);
      (r as any).scheduleRoomDisposal(5000);

      assert.ok((r as any).turnTimer !== null);
      assert.ok((r as any).roomCleanupTimer !== null);

      (r as any).onDispose();

      assert.strictEqual((r as any).turnTimer, null);
      assert.strictEqual((r as any).roomCleanupTimer, null);
    });

    it("should preserve standard autoDispose behavior when last player leaves waiting room", async () => {
      const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});
      const client = await colyseus.connectTo(room);

      assert.strictEqual(room.state.players.length, 1);
      assert.strictEqual(room.state.status, "waiting");
      assert.strictEqual(room.autoDispose, true);

      await client.leave();

      assert.strictEqual(room.state.players.length, 0);
    });
  });
});
