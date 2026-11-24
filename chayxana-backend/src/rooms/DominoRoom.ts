import { Room, Client, CloseCode } from "colyseus";

import {
  MyRoomState,
  Player,
  BoardTile,
} from "./schema/MyRoomState.js";

import {
  createDominoSet,
  shuffleDominoSet,
  dealDominoTiles,
} from "../games/domino/shared/DominoSet.js";

import type { DominoTile } from "../games/domino/shared/DominoTile.js";

import {
  createDominoBoard,
  placeTile,
  hasPlayableTile,
} from "../games/domino/shared/DominoBoard.js";

import type { DominoBoard } from "../games/domino/shared/DominoBoard.js";

export class DominoRoom extends Room<{ state: MyRoomState }> {
  maxClients = 4;

  state = new MyRoomState();

  // Private server-side data
  private playerHands = new Map<string, DominoTile[]>();

  // Server-side board model
  private board: DominoBoard = createDominoBoard();

  private startGame() {
    const tiles = shuffleDominoSet(createDominoSet());
    const deal = dealDominoTiles(tiles, 4, 7);

    this.board = createDominoBoard();
    this.state.board.clear();

    this.state.leftEnd = -1;
    this.state.rightEnd = -1;
    this.state.turnIndex = 0;
    this.state.consecutivePasses = 0;
    this.state.winnerSessionId = "";
    this.state.status = "playing";

    this.state.players.forEach((player, index) => {
      const hand = deal.hands[index];

      this.playerHands.set(player.sessionId, hand);

      const client = this.clients.find(
        (c) => c.sessionId === player.sessionId
      );

      client?.send("your_hand", hand);
    });

    console.log("Domino game started!");
    console.log(
      "First turn:",
      this.state.players[0]?.name
    );
  }

  private handlePassTurn(client: Client) {
    if (this.state.status !== "playing") {
      client.send("move_rejected", {
        reason: "Game is not active.",
      });
      return;
    }

    const currentPlayer = this.state.players[this.state.turnIndex];

    if (!currentPlayer || currentPlayer.sessionId !== client.sessionId) {
      client.send("move_rejected", {
        reason: "It is not your turn.",
      });
      return;
    }

    const hand = this.playerHands.get(client.sessionId);

    if (!hand) {
      client.send("move_rejected", {
        reason: "Player hand not found.",
      });
      return;
    }

    if (hasPlayableTile(this.board, hand)) {
      client.send("move_rejected", {
        reason: "You have a playable tile. You cannot pass.",
      });
      return;
    }

    this.state.consecutivePasses++;

    console.log(`${currentPlayer.name} passed.`);

    // All four players passed consecutively.
    if (this.state.consecutivePasses >= this.state.players.length) {
      this.state.status = "blocked";

      console.log("Domino game blocked!");

      return;
    }

    this.state.turnIndex =
      (this.state.turnIndex + 1) % this.state.players.length;
  }

  private handlePlaceTile(client: Client, message: any) {
    if (this.state.status !== "playing") {
      client.send("move_rejected", {
        reason: "Game is not active.",
      });
      return;
    }

    const currentPlayer = this.state.players[this.state.turnIndex];

    if (!currentPlayer || currentPlayer.sessionId !== client.sessionId) {
      client.send("move_rejected", {
        reason: "It is not your turn.",
      });
      return;
    }

    if (
      typeof message?.tileId !== "string" ||
      (message?.side !== "left" && message?.side !== "right")
    ) {
      client.send("move_rejected", {
        reason: "Invalid move data.",
      });
      return;
    }

    const hand = this.playerHands.get(client.sessionId);

    if (!hand) {
      client.send("move_rejected", {
        reason: "Player hand not found.",
      });
      return;
    }

    const tileIndex = hand.findIndex(
      (tile) => tile.id === message.tileId
    );

    if (tileIndex === -1) {
      client.send("move_rejected", {
        reason: "This tile is not in your hand.",
      });
      return;
    }

    const tile = hand[tileIndex];

    try {
      // Validate and calculate the new board.
      const newBoard = placeTile(
        this.board,
        tile,
        message.side
      );

      // Commit the move only after validation succeeds.
      this.board = newBoard;

      hand.splice(tileIndex, 1);

      // Synchronize public board state.
      this.state.board.clear();

      for (const boardTile of this.board.tiles) {
        this.state.board.push(
          new BoardTile({
            id: boardTile.id,
            left: boardTile.left,
            right: boardTile.right,
          })
        );
      }

      this.state.leftEnd = this.board.leftEnd ?? -1;
      this.state.rightEnd = this.board.rightEnd ?? -1;

      // Send the updated private hand only to its owner.
      client.send("your_hand", hand);

      console.log(
        `${currentPlayer.name} placed ${tile.id} on ${message.side}`
      );

      // Check for winner.
      if (hand.length === 0) {
        this.state.status = "finished";
        this.state.winnerSessionId = client.sessionId;

        console.log("Winner:", currentPlayer.name);
        return;
      }

      this.state.consecutivePasses = 0;

      // Move to the next player.
      this.state.turnIndex =
        (this.state.turnIndex + 1) % this.state.players.length;

    } catch {
      client.send("move_rejected", {
        reason: "Tile cannot be placed on this side.",
      });
    }
  }

  onCreate(options: any) {
    console.log("Domino room created:", this.roomId);

    this.onMessage("set_name", (client, message) => {
      const player = this.state.players.find(
        (p) => p.sessionId === client.sessionId
      );

      if (!player || typeof message?.name !== "string") return;

      const name = message.name.trim().slice(0, 20);

      if (name.length > 0) {
        player.name = name;
      }
    });

    this.onMessage("ready", (client) => {
      const player = this.state.players.find(
        (p) => p.sessionId === client.sessionId
      );

      if (player && this.state.status === "waiting") {
        player.ready = true;
      }
    });

    this.onMessage("place_tile", (client, message) => {
      this.handlePlaceTile(client, message);
    });

    this.onMessage("pass_turn", (client) => {
      this.handlePassTurn(client);
    });
  }

  onJoin(client: Client, options: any) {
    const player = new Player({
      sessionId: client.sessionId,
      name: `Player ${this.state.players.length + 1}`,
      ready: false,
    });

    this.state.players.push(player);

    console.log("Player joined:", client.sessionId);

    if (this.state.players.length === 4) {
      this.startGame();
    }
  }

  onLeave(client: Client, code: CloseCode) {
    const oldIndex = this.state.players.findIndex(
      (p) => p.sessionId === client.sessionId
    );

    this.playerHands.delete(client.sessionId);

    if (oldIndex !== -1) {
      this.state.players.splice(oldIndex, 1);

      if (this.state.status === "playing") {
        // For now, a disconnect ends the current game.
        this.state.status = "abandoned";
      }

      if (oldIndex < this.state.turnIndex) {
        this.state.turnIndex--;
      }

      if (this.state.players.length === 0) {
        this.state.turnIndex = 0;
      } else {
        this.state.turnIndex %= this.state.players.length;
      }
    }

    console.log("Player left:", client.sessionId);
  }

  onDispose() {
    this.playerHands.clear();
    console.log("Domino room disposed:", this.roomId);
  }
}
