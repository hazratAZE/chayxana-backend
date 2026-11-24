import { Room, type Client } from "colyseus";

import {
  Domino365RoomState,
  Domino365RoomPlayer,
  Domino365PublicTile,
  Domino365PublicOpenEnd,
} from "./schema/Domino365RoomState.js";

import {
  createDomino365Game,
  playDomino365GameTile,
  passDomino365GameTurn,
  startNextDomino365Round,
  type Domino365GameState,
} from "../games/domino/domino365/Domino365Game.js";

export class Domino365Room extends Room<{ state: Domino365RoomState }> {
  private game: Domino365GameState | null = null;

  onCreate(): void {
    console.log("Domino365 Room created:", this.roomId);

    this.setState(new Domino365RoomState());
    this.maxClients = 4;

    this.onMessage(
      "set_name",
      (client: Client, message: { name?: string }) => {
        if (this.state.status !== "waiting") return;
        if (typeof message?.name !== "string") return;

        const player = this.state.players.find(
          (item) => item.sessionId === client.sessionId
        );

        if (!player) return;

        const name = message.name.trim().slice(0, 20);

        if (name.length > 0) {
          player.name = name;
        }
      }
    );

    // Oyunçu daş oynayır.
    this.onMessage(
      "play_tile",
      (
        client: Client,
        message: { tileId?: string; endId?: string }
      ) => {
        if (!this.game || this.state.status === "abandoned") return;

        try {
          if (typeof message?.tileId !== "string") {
            throw new Error("Invalid tile ID");
          }

          if (
            message.endId !== undefined &&
            typeof message.endId !== "string"
          ) {
            throw new Error("Invalid end ID");
          }

          const previousGame = this.game;

          this.game = playDomino365GameTile(
            previousGame,
            client.sessionId,
            message.tileId,
            message.endId
          );

          this.syncPublicState();

          // Yalnız gediş edən oyunçuya yenilənmiş əl göndərilir.
          this.sendPrivateHand(client);

          this.broadcast("move_played", {
            playerId: client.sessionId,
            tileId: message.tileId,
            points: this.game.lastMoveScore?.points ?? 0,
            currentPlayerId: this.state.currentPlayerId,
            status: this.game.status,
          });

          this.broadcastRoundResultIfNeeded();
        } catch (error) {
          this.sendGameError(client, error);
        }
      }
    );

    // Oyunçu yalnız oynana bilən daşı yoxdursa pass edə bilər.
    this.onMessage("pass_turn", (client: Client) => {
      if (!this.game || this.state.status === "abandoned") return;

      try {
        this.game = passDomino365GameTurn(
          this.game,
          client.sessionId
        );

        this.syncPublicState();

        this.broadcast("turn_passed", {
          playerId: client.sessionId,
          currentPlayerId: this.state.currentPlayerId,
          consecutivePasses: this.game.consecutivePasses,
          status: this.game.status,
        });

        this.broadcastRoundResultIfNeeded();
      } catch (error) {
        this.sendGameError(client, error);
      }
    });

    // Raund bitdikdən sonra növbəti raundu başladır.
    this.onMessage("next_round", (client: Client) => {
      if (!this.game || this.state.status === "abandoned") return;

      try {
        const isPlayer = this.state.players.some(
          (player) => player.sessionId === client.sessionId
        );

        if (!isPlayer) {
          throw new Error("Player is not in this room");
        }

        this.game = startNextDomino365Round(this.game);

        this.syncPublicState();

        // Yeni raundda hər oyunçuya yeni əlini göndəririk.
        this.sendAllPrivateHands();

        this.broadcast("round_started", {
          roundNumber: this.game.roundNumber,
          currentPlayerId:
            this.game.players[this.game.currentPlayerIndex].playerId,
          scoreA: this.game.scores.A,
          scoreB: this.game.scores.B,
          endgameMode: this.game.endgameMode,
        });
      } catch (error) {
        this.sendGameError(client, error);
      }
    });
  }

  onJoin(
    client: Client,
    options: { name?: string }
  ): void {
    console.log(
      "Domino365 Player joined:",
      client.sessionId,
      options?.name
    );

    if (this.state.status !== "waiting") {
      throw new Error("Game has already started");
    }

    const slot = this.state.players.length;

    if (slot >= 4) {
      throw new Error("Room is full");
    }

    const teamId = slot % 2 === 0 ? "A" : "B";

    const name =
      typeof options?.name === "string" &&
      options.name.trim().length > 0
        ? options.name.trim().slice(0, 20)
        : `Player ${slot + 1}`;

    const player = new Domino365RoomPlayer();

    player.sessionId = client.sessionId;
    player.name = name;
    player.teamId = teamId;
    player.ready = false;
    player.handCount = 7;

    this.state.players.push(player);

    this.broadcast("player_joined", {
      playerId: client.sessionId,
      name,
      teamId,
      playerCount: this.state.players.length,
    });

    if (this.state.players.length === 4) {
      this.startGame();
    }
  }

  onLeave(client: Client): void {
    const playerIndex = this.state.players.findIndex(
      (player) => player.sessionId === client.sessionId
    );

    if (playerIndex === -1) return;

    if (this.state.status === "waiting") {
      this.state.players.splice(playerIndex, 1);

      this.broadcast("player_left", {
        playerId: client.sessionId,
        playerCount: this.state.players.length,
      });

      return;
    }

    this.state.status = "abandoned";

    this.broadcast("game_abandoned", {
      playerId: client.sessionId,
      message: "A player left the game.",
    });
  }

  private startGame(): void {
    if (this.state.players.length !== 4) return;

    const playerSetup = this.state.players.map((player) => ({
      playerId: player.sessionId,
      teamId: player.teamId as "A" | "B",
    }));

    this.game = createDomino365Game(playerSetup, 0);

    this.syncPublicState();
    this.sendAllPrivateHands();

    console.log("Domino365 Game started!");

    console.log(
      "Players:",
      this.state.players.map((player) => ({
        name: player.name,
        team: player.teamId,
      }))
    );

    this.broadcast("game_started", {
      roundNumber: this.game.roundNumber,
      currentPlayerId:
        this.game.players[this.game.currentPlayerIndex].playerId,
    });
  }

  private sendPrivateHand(client: Client): void {
    if (!this.game) return;

    const player = this.game.players.find(
      (item) => item.playerId === client.sessionId
    );

    if (!player) return;

    client.send("your_hand", {
      tiles: player.hand.map((tile) => ({
        id: tile.id,
        left: tile.left,
        right: tile.right,
      })),
    });

    console.log(
      `Private hand sent to ${player.playerId}:`,
      player.hand.length,
      "tiles"
    );
  }

  private sendAllPrivateHands(): void {
    if (!this.game) return;

    for (const player of this.game.players) {
      const client = this.clients.find(
        (item) => item.sessionId === player.playerId
      );

      if (client) {
        this.sendPrivateHand(client);
      }
    }
  }

  private syncPublicState(): void {
    if (!this.game) return;

    const game = this.game;

    this.state.status = game.status;

    this.state.scoreA = game.scores.A;
    this.state.scoreB = game.scores.B;

    this.state.roundNumber = game.roundNumber;
    this.state.consecutivePasses = game.consecutivePasses;
    this.state.endgameMode = game.endgameMode;

    this.state.currentPlayerId =
      game.status === "playing"
        ? game.players[game.currentPlayerIndex].playerId
        : "";

    // Yalnız açıq oyunçu məlumatları.
    for (const publicPlayer of this.state.players) {
      const gamePlayer = game.players.find(
        (player) => player.playerId === publicPlayer.sessionId
      );

      if (gamePlayer) {
        publicPlayer.handCount = gamePlayer.hand.length;
      }
    }

    // Masadakı daşlar.
    this.state.boardTiles.splice(
      0,
      this.state.boardTiles.length
    );

    for (const placed of game.board.tiles) {
      const publicTile = new Domino365PublicTile();

      publicTile.id = placed.tile.id;
      publicTile.left = placed.tile.left;
      publicTile.right = placed.tile.right;
      publicTile.connectedEndId = placed.connectedEndId ?? "";
      publicTile.matchedValue = placed.matchedValue ?? -1;
      publicTile.freeValue = placed.freeValue ?? -1;

      this.state.boardTiles.push(publicTile);
    }

    // Masanın açıq ucları.
    this.state.openEnds.splice(
      0,
      this.state.openEnds.length
    );

    for (const end of game.board.openEnds) {
      const publicEnd = new Domino365PublicOpenEnd();

      publicEnd.id = end.id;
      publicEnd.value = end.value;
      publicEnd.sourceTileId = end.sourceTileId;
      publicEnd.countsForSpinnerActivation =
        end.countsForSpinnerActivation;

      this.state.openEnds.push(publicEnd);
    }

    // Spinner.
    this.state.spinnerActive = game.board.spinner !== null;
    this.state.spinnerTileId =
      game.board.spinner?.tileId ?? "";
    this.state.spinnerValue =
      game.board.spinner?.value ?? -1;

    this.state.winnerTeamId =
      game.roundResult?.sessionWinnerTeamId ?? "";
  }

  private broadcastRoundResultIfNeeded(): void {
    if (!this.game || !this.game.roundResult) return;

    const result = this.game.roundResult;

    this.broadcast("round_ended", {
      roundNumber: this.game.roundNumber,
      scores: result.scores,
      bonusPoints: result.bonusPoints,
      remainingPips: result.remainingPips,
      bonusReason: result.bonusReason,
      endgameMode: result.endgameMode,
      sessionEnded: result.sessionEnded,
      sessionWinnerTeamId: result.sessionWinnerTeamId,
      bothTeamsReachedTarget: result.bothTeamsReachedTarget,
    });

    if (result.sessionEnded) {
      this.broadcast("game_finished", {
        winnerTeamId: result.sessionWinnerTeamId,
        bothTeamsReachedTarget: result.bothTeamsReachedTarget,
        scores: result.scores,
      });
    }
  }

  private sendGameError(client: Client, error: unknown): void {
    const message =
      error instanceof Error
        ? error.message
        : "An unexpected game error occurred";

    client.send("game_error", { message });
  }
}
