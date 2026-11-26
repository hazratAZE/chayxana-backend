import assert from "assert";
import { ColyseusTestServer } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { Domino365RoomState } from "../src/rooms/schema/Domino365RoomState.js";
import { Domino365Room } from "../src/rooms/Domino365Room.js";
import { getTestServer } from "./testServer.js";

describe("Domino 365 Real Multiplayer Integration Tests", () => {
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
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    const clients = [];
    const receivedHands: Map<string, any[]> = new Map();

    for (let i = 0; i < 4; i++) {
      const client = await colyseus.connectTo(room, { name: `Player ${i + 1}` });
      client.onMessage("your_hand", (message: any) => {
        receivedHands.set(client.sessionId, message.tiles);
      });
      clients.push(client);
    }

    // Request private hand for all clients to ensure hand reception
    for (const client of clients) {
      client.send("get_hand");
    }

    // Wait until all 4 clients have received their hand
    await waitForCondition(() => receivedHands.size === 4, 3000);

    return { room, clients, receivedHands };
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

  function waitForMessage<T = any>(client: any, type: string, timeout = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for message '${type}'`));
      }, timeout);

      client.onMessage(type, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  it("should connect 4 players to the same room and automatically start the game", async () => {
    const { room, clients } = await createFourPlayers();

    assert.strictEqual(clients.length, 4);

    // 4 clients must share the exact same room ID
    const firstRoomId = clients[0].roomId;
    for (const client of clients) {
      assert.strictEqual(client.roomId, firstRoomId);
      assert.strictEqual(client.roomId, room.roomId);
    }

    // Status must be 'playing'
    assert.strictEqual(room.state.status, "playing");
    assert.strictEqual(room.state.players.length, 4);

    // Teams must alternate A-B-A-B
    assert.strictEqual(room.state.players[0].teamId, "A");
    assert.strictEqual(room.state.players[1].teamId, "B");
    assert.strictEqual(room.state.players[2].teamId, "A");
    assert.strictEqual(room.state.players[3].teamId, "B");

    for (const client of clients) {
      await client.leave();
    }
  });

  it("should deal 7 private tiles to each player and keep hands private", async () => {
    const { room, clients, receivedHands } = await createFourPlayers();

    assert.strictEqual(receivedHands.size, 4);

    const allTiles: any[] = [];
    for (const [sessionId, hand] of receivedHands.entries()) {
      assert.strictEqual(hand.length, 7, `Player ${sessionId} must have 7 tiles`);
      allTiles.push(...hand);
    }

    // 28 unique tiles total
    assert.strictEqual(allTiles.length, 28);
    const tileIds = new Set(allTiles.map((t) => t.id));
    assert.strictEqual(tileIds.size, 28);

    // Hands must NOT be in public room state
    assert.strictEqual("hands" in room.state, false);
    assert.strictEqual("playerHands" in room.state, false);

    for (const client of clients) {
      await client.leave();
    }
  });

  it("should reject a move from a player whose turn has not arrived", async () => {
    const { room, clients, receivedHands } = await createFourPlayers();

    const activePlayerId = room.state.currentPlayerId;
    const inactiveClient = clients.find((c) => c.sessionId !== activePlayerId)!;
    const inactiveHand = receivedHands.get(inactiveClient.sessionId)!;

    const errorPromise = waitForMessage(inactiveClient, "game_error");

    inactiveClient.send("play_tile", {
      tileId: inactiveHand[0].id,
    });

    const error = await errorPromise;
    assert.strictEqual(error.message, "It is not this player's turn");
    assert.strictEqual(room.state.boardTiles.length, 0);

    for (const client of clients) {
      await client.leave();
    }
  });

  it("should allow the active player to place a valid opening tile", async () => {
    const { room, clients, receivedHands } = await createFourPlayers();

    const activePlayerId = room.state.currentPlayerId;
    const activeClient = clients.find((c) => c.sessionId === activePlayerId)!;
    const activeHand = receivedHands.get(activeClient.sessionId)!;
    const tileToPlay = activeHand[0];

    const movePromise = waitForMessage(activeClient, "move_played");

    activeClient.send("play_tile", {
      tileId: tileToPlay.id,
    });

    const moveData = await movePromise;
    assert.strictEqual(moveData.playerId, activePlayerId);
    assert.strictEqual(moveData.tileId, tileToPlay.id);

    await waitForCondition(() => room.state.boardTiles.length === 1);

    assert.strictEqual(room.state.boardTiles.length, 1);
    assert.strictEqual(room.state.boardTiles[0].id, tileToPlay.id);
    assert.notStrictEqual(room.state.currentPlayerId, activePlayerId);

    for (const client of clients) {
      await client.leave();
    }
  });

  it("should reject pass_turn when player has playable tiles", async () => {
    const { room, clients } = await createFourPlayers();

    const activePlayerId = room.state.currentPlayerId;
    const activeClient = clients.find((c) => c.sessionId === activePlayerId)!;

    const errorPromise = waitForMessage(activeClient, "game_error");

    // Board is empty so player always has a playable tile on open board
    activeClient.send("pass_turn");

    const error = await errorPromise;
    assert.strictEqual(error.message, "Player has a playable tile and cannot pass");
    assert.strictEqual(room.state.consecutivePasses, 0);

    for (const client of clients) {
      await client.leave();
    }
  });

  it("should allow pass_turn when player has no playable tiles", async () => {
    const { room, clients } = await createFourPlayers();
    const r = room as unknown as Domino365Room;

    const activePlayerId = room.state.currentPlayerId;
    const activeClient = clients.find((c) => c.sessionId === activePlayerId)!;

    // Simulate board with tiles and empty current player's hand so they cannot play
    const game = (r as any).game;
    const currentPlayer = game.players[game.currentPlayerIndex];
    currentPlayer.hand = [];

    // Place one tile on board so it is not an empty board
    game.board = {
      tiles: [{ tile: { id: "6-6", left: 6, right: 6 } }],
      openEnds: [
        { id: "end_6_0", value: 6, sourceTileId: "6-6", countsForSpinnerActivation: true },
        { id: "end_6_1", value: 6, sourceTileId: "6-6", countsForSpinnerActivation: true },
      ],
      spinner: null,
      doubleCandidate: null,
    };

    const passPromise = waitForMessage(activeClient, "turn_passed");

    activeClient.send("pass_turn");

    const passData = await passPromise;
    assert.strictEqual(passData.playerId, activePlayerId);
    assert.strictEqual(passData.consecutivePasses, 1);
    assert.strictEqual(room.state.consecutivePasses, 1);

    for (const client of clients) {
      await client.leave();
    }
  });

  it("should handle disconnect and successful reconnection seamlessly", async () => {
    const { room, clients } = await createFourPlayers();

    const activePlayerId = room.state.currentPlayerId;
    const activeClient = clients.find((c) => c.sessionId === activePlayerId)!;
    const reconnectionToken = activeClient.reconnectionToken;

    assert.ok(reconnectionToken.length > 0);

    // Disconnect active player
    await activeClient.leave(false);

    // Check player is marked disconnected and turn timer is paused
    await waitForCondition(() => !room.state.players.find((p) => p.sessionId === activePlayerId)!.connected);
    assert.strictEqual(room.state.turnExpiresAt, 0);

    // Reconnect using token
    const reconnectedClient = await colyseus.sdk.reconnect(reconnectionToken);
    assert.strictEqual(reconnectedClient.sessionId, activePlayerId);

    // Player marked connected again
    await waitForCondition(() => room.state.players.find((p) => p.sessionId === activePlayerId)!.connected);
    assert.strictEqual(room.state.players.find((p) => p.sessionId === activePlayerId)!.connected, true);

    // Turn timer resumed
    assert.ok(room.state.turnExpiresAt > Date.now());

    for (const client of clients) {
      if (client.sessionId !== activePlayerId) {
        await client.leave();
      }
    }
    await reconnectedClient.leave();
  });

  it("should transition to abandoned when reconnection fails or is abandoned", async () => {
    const { room, clients } = await createFourPlayers();
    const r = room as unknown as Domino365Room;

    assert.strictEqual(room.state.status, "playing");

    // Abandon game directly
    (r as any).abandonGame(clients[0].sessionId);

    assert.strictEqual(room.state.status, "abandoned");
    assert.strictEqual(room.state.turnExpiresAt, 0);

    for (const client of clients) {
      await client.leave();
    }
  });
});
