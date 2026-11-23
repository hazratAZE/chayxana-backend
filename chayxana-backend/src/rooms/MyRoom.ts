import { Room, Client, CloseCode } from "colyseus";
import { MyRoomState, Player } from "./schema/MyRoomState.js";

export class MyRoom extends Room<{ state: MyRoomState }> {
  maxClients = 4;

  state = new MyRoomState();

  onCreate(options: any) {
    console.log("Domino room created:", this.roomId);

    this.onMessage("set_name", (client, message) => {
      const player = this.state.players.find(
        (p) => p.sessionId === client.sessionId
      );

      if (!player) return;

      if (typeof message?.name !== "string") return;

      const name = message.name.trim().slice(0, 20);

      if (!name) return;

      player.name = name;
    });

    this.onMessage("ready", (client) => {
      const player = this.state.players.find(
        (p) => p.sessionId === client.sessionId
      );

      if (!player) return;

      player.ready = true;
    });
  }

  onJoin(client: Client, options: any) {
    const player = new Player({
      sessionId: client.sessionId,
      name: `Player ${this.state.players.length + 1}`,
      ready: false,
    });

    this.state.players.push(player);

    console.log(client.sessionId, "joined!");
  }

  onLeave(client: Client, code: CloseCode) {
    const index = this.state.players.findIndex(
      (p) => p.sessionId === client.sessionId
    );

    if (index !== -1) {
      this.state.players.splice(index, 1);
    }

    console.log(client.sessionId, "left!", code);
  }

  onDispose() {
    console.log("Room disposed:", this.roomId);
  }
}
