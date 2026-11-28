import assert from "assert";
import { ColyseusTestServer } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { Domino365RoomState } from "../src/rooms/schema/Domino365RoomState.js";
import { setTokenVerifier } from "../src/services/firebase.js";
import { getTestServer, resetMockAuth } from "./testServer.js";

describe("Domino 365 Firebase Authentication Tests", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => {
    colyseus = await getTestServer();
  });

  afterEach(async () => {
    resetMockAuth();
    await colyseus.cleanup();
  });

  it("should reject connection when token is missing in production mode (no mock verifier)", async () => {
    setTokenVerifier(null);

    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    let rejected = false;
    try {
      await colyseus.connectTo(room, { name: "No Token User" });
    } catch (error) {
      rejected = true;
    }

    assert.strictEqual(rejected, true, "Connection without token must be rejected");
    assert.strictEqual(room.state.players.length, 0);
  });

  it("should reject connection when token is invalid", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    let rejected = false;
    try {
      await colyseus.connectTo(room, {
        token: "invalid-token",
        name: "Hacker",
      });
    } catch (error) {
      rejected = true;
    }

    assert.strictEqual(rejected, true, "Connection with invalid token must be rejected");
    assert.strictEqual(room.state.players.length, 0);
  });

  it("should accept valid token and NOT expose UID in public Domino365RoomPlayer schema", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    const client = await colyseus.connectTo(room, {
      token: "mock-token-firebase123",
      name: "Elvin",
    });

    assert.strictEqual(room.state.players.length, 1);
    const player = room.state.players[0];

    assert.strictEqual(player.name, "Elvin");
    assert.strictEqual(player.sessionId, client.sessionId);

    // Public schema-da UID olmamalıdır
    assert.strictEqual("uid" in player, false);
    assert.strictEqual((player as any).uid, undefined);
  });

  it("should prevent duplicate active session with the same Firebase UID in the same room", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    // 1-ci qoşulma uğurlu olur
    await colyseus.connectTo(room, {
      token: "mock-token-sameuser",
      name: "Elvin",
    });

    assert.strictEqual(room.state.players.length, 1);

    // Eyni UID ilə 2-ci aktiv qoşulma rədd edilməlidir
    let duplicateRejected = false;
    try {
      await colyseus.connectTo(room, {
        token: "mock-token-sameuser",
        name: "Elvin Copy",
      });
    } catch (error) {
      duplicateRejected = true;
    }

    assert.strictEqual(duplicateRejected, true, "Duplicate active UID in same room must be rejected");
    assert.strictEqual(room.state.players.length, 1);
  });

  it("should allow same UID to join after leaving waiting room", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    // Otağın autoDispose olmaması üçün 1-ci oyunçu gözləmədə qalır
    await colyseus.connectTo(room, {
      token: "mock-token-anchoruser",
      name: "Anchor",
    });

    const client1 = await colyseus.connectTo(room, {
      token: "mock-token-rejoinuser",
      name: "Tural",
    });

    await client1.leave();
    await new Promise((r) => setTimeout(r, 50));

    assert.strictEqual(room.state.players.length, 1);

    const client2 = await colyseus.connectTo(room, {
      token: "mock-token-rejoinuser",
      name: "Tural",
    });

    assert.strictEqual(room.state.players.length, 2);
    assert.strictEqual(room.state.players[1].sessionId, client2.sessionId);
  });

  it("should block new join with same UID while player is disconnected (in 30s reconnect window)", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    const client1 = await colyseus.connectTo(room, {
      token: "mock-token-dropuser",
      name: "Ramin",
    });

    await colyseus.connectTo(room, {
      token: "mock-token-otheruser",
      name: "Kamran",
    });

    // Gözlənilmədən bağlantı kəsilir (30s reconnect pəncərəsi açılır)
    await client1.leave(false);
    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(room.state.players[0].connected, false);

    // Eyni UID ilə başqa cihazdan yeni join cəhdi bloklanmalıdır
    let duplicateRejected = false;
    try {
      await colyseus.connectTo(room, {
        token: "mock-token-dropuser",
        name: "Ramin 2nd Device",
      });
    } catch {
      duplicateRejected = true;
    }

    assert.strictEqual(
      duplicateRejected,
      true,
      "New join with same UID during reconnect window must be blocked"
    );
    assert.strictEqual(room.state.players.length, 2);
  });

  it("should allow original player to reconnect and preserve UID association", async () => {
    const room = await colyseus.createRoom<Domino365RoomState>("domino365", {});

    const client1 = await colyseus.connectTo(room, {
      token: "mock-token-reconuser",
      name: "Samir",
    });

    await colyseus.connectTo(room, {
      token: "mock-token-partner",
      name: "Vusal",
    });

    const reconnectionToken = client1.reconnectionToken;

    // Bağlantı kəsilir
    await client1.leave(false);
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(room.state.players[0].connected, false);

    // Orijinal oyunçu Colyseus reconnect mexanizmi ilə geri qayıdır
    const reconnectedClient = await colyseus.sdk.reconnect(reconnectionToken);
    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(reconnectedClient.sessionId, client1.sessionId);
    assert.strictEqual(room.state.players[0].connected, true);

    // Reconnect sonrası UID əlaqəsi qorunur — eyni UID ilə yeni join yenə bloklanır
    let duplicateAfterReconnectRejected = false;
    try {
      await colyseus.connectTo(room, {
        token: "mock-token-reconuser",
        name: "Samir Clone",
      });
    } catch {
      duplicateAfterReconnectRejected = true;
    }

    assert.strictEqual(
      duplicateAfterReconnectRejected,
      true,
      "Duplicate UID join after reconnect must still be blocked"
    );
  });
});
