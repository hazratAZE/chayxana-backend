import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";

describe("Domino multiplayer tests", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => {
    colyseus = await boot(appConfig);
  });

  after(async () => {
    await colyseus.shutdown();
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
});
