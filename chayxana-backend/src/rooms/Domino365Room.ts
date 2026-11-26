import { Room, type Client, Delayed } from "colyseus";

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
  findFirstPlayableDomino365Move,
  type Domino365GameState,
} from "../games/domino/domino365/Domino365Game.js";

export class Domino365Room extends Room<{ state: Domino365RoomState }> {
  private game: Domino365GameState | null = null;
  private turnTimer: Delayed | null = null;
  private readonly turnTimeoutMs = 25000;
  private pausedTurnRemainingMs = 0;
  private pausedTurnPlayerId: string | null = null;
  private roomCleanupTimer: Delayed | null = null;

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

    // Oyunçu şəxsi daşlarını istədikdə.
    this.onMessage("get_hand", (client: Client) => {
      this.sendPrivateHand(client);
    });

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

          if (this.game.status === "playing") {
            this.startTurnTimer();
          } else {
            this.stopTurnTimer();
          }
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

        if (this.game.status === "playing") {
          this.startTurnTimer();
        } else {
          this.stopTurnTimer();
        }
      } catch (error) {
        this.sendGameError(client, error);
      }
    });

    // Oyunçu növbəti raund üçün hazır olduğunu bildirir.
    this.onMessage("ready", (client: Client) => {
      if (!this.game || this.state.status === "abandoned") return;

      try {
        // Oyunçu otaqda olmalıdır.
        const player = this.state.players.find(
          (item) => item.sessionId === client.sessionId
        );

        if (!player) {
          throw new Error("Player is not in this room");
        }

        // Oyun artıq bitibsə yeni raund başlaya bilməz.
        if (this.game.status === "finished") {
          throw new Error("Game has already finished");
        }

        // Ready yalnız raund bitdikdən sonra mümkündür.
        if (this.game.status !== "round_ended") {
          throw new Error("Cannot ready up before round ends");
        }

        // Eyni oyunçu ikinci dəfə Ready göndərməsin.
        if (player.ready) return;

        player.ready = true;

        const readyCount = this.state.players.filter(
          (item) => item.ready
        ).length;

        // Digər oyunçulara Ready məlumatı göndərilir.
        this.broadcast("player_ready", {
          playerId: client.sessionId,
          readyCount,
          totalPlayers: 4,
        });

        console.log(
          `Player ready: ${player.name} (${readyCount}/4)`
        );

        // Dörd oyunçu da hazır olmayıbsa gözləyirik.
        if (readyCount < 4) return;

        // Hamı hazırdırsa növbəti raund başlayır.
        this.game = startNextDomino365Round(this.game);

        // Ready vəziyyətləri sıfırlanır.
        for (const roomPlayer of this.state.players) {
          roomPlayer.ready = false;
        }

        this.syncPublicState();

        // Hər oyunçuya yeni əl göndərilir.
        this.sendAllPrivateHands();

        this.broadcast("round_started", {
          roundNumber: this.game.roundNumber,
          currentPlayerId:
            this.game.players[this.game.currentPlayerIndex].playerId,
          scoreA: this.game.scores.A,
          scoreB: this.game.scores.B,
          endgameMode: this.game.endgameMode,
        });

        this.startTurnTimer();

        console.log(
          `Domino365 Round ${this.game.roundNumber} started!`
        );

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
    player.connected = true;
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

  // İnternet bağlantısı gözlənilmədən kəsildikdə.
  async onDrop(client: Client, code: number): Promise<void> {
    const player = this.state.players.find(
      (item) => item.sessionId === client.sessionId
    );

    if (!player) return;

    player.connected = false;

    console.log(
      `Domino365 Player disconnected: ${player.name}`,
      code
    );

    // Yalnız növbəsi olan oyunçunun timer-ini dayandır.
    if (
      this.game?.status === "playing" &&
      this.state.currentPlayerId === client.sessionId
    ) {
      this.pauseTurnTimer(client.sessionId);
    }

    this.broadcast("player_disconnected", {
      playerId: client.sessionId,
      playerName: player.name,
      reconnectTimeout: 30,
    });

    try {
      // 30 saniyə ərzində reconnect gözləyirik.
      await this.allowReconnection(client, 30);

      console.log(
        `Domino365 Reconnection successful: ${player.name}`
      );

    } catch (error) {
      console.log(
        `Domino365 Reconnection failed: ${player.name}`
      );

      if (this.state.status !== "waiting") {
        this.abandonGame(client.sessionId);
      }
    }
  }

  // Oyunçu yenidən qoşulduqda.
  onReconnect(client: Client): void {
    const player = this.state.players.find(
      (item) => item.sessionId === client.sessionId
    );

    if (!player) return;

    player.connected = true;

    console.log(
      `Domino365 Player reconnected: ${player.name}`
    );

    // Oyunçunun şəxsi daşlarını yenidən göndər.
    this.sendPrivateHand(client);

    // Əgər bu oyunçunun növbəsi dayandırılmışdısa,
    // timer qalan vaxtdan davam edir.
    if (this.pausedTurnPlayerId === client.sessionId) {
      const remainingTime = this.pausedTurnRemainingMs;

      this.startTurnTimer(remainingTime);
    }

    this.broadcast("player_reconnected", {
      playerId: client.sessionId,
      playerName: player.name,
    });
  }

  onLeave(client: Client): void {
    const playerIndex = this.state.players.findIndex(
      (player) => player.sessionId === client.sessionId
    );

    if (playerIndex === -1) return;

    const player = this.state.players[playerIndex];

    player.connected = false;

    // Oyun hələ başlamayıbsa, oyunçunu otaqdan çıxar.
    if (this.state.status === "waiting") {
      this.state.players.splice(playerIndex, 1);

      for (let i = 0; i < this.state.players.length; i++) {
        this.state.players[i].teamId =
          i % 2 === 0 ? "A" : "B";
      }

      this.broadcast("player_left", {
        playerId: client.sessionId,
        playerCount: this.state.players.length,
      });

      this.broadcast("waiting_room_updated", {
        players: this.state.players.map((roomPlayer, index) => ({
          sessionId: roomPlayer.sessionId,
          name: roomPlayer.name,
          teamId: roomPlayer.teamId,
          seatIndex: index,
        })),
        playerCount: this.state.players.length,
      });

      return;
    }

    // Oyun zamanı oyunçu çıxarsa, oyunu dayandır.
    this.abandonGame(client.sessionId);
  }

  private startGame(): void {
    if (this.state.players.length !== 4) return;

    // Oyun başladıqdan sonra yeni oyunçu qəbul etmə.
    this.lock();

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

    this.startTurnTimer();
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

    if (game.status === "finished") {
      this.scheduleRoomDisposal(30000);
    }

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

  private startTurnTimer(
    durationMs: number = this.turnTimeoutMs
  ): void {
    this.stopTurnTimer();

    // Əvvəlki pause məlumatlarını təmizlə.
    this.pausedTurnRemainingMs = 0;
    this.pausedTurnPlayerId = null;

    if (!this.game || this.game.status !== "playing") {
      this.state.turnExpiresAt = 0;
      return;
    }

    const safeDuration = Math.max(1, durationMs);

    this.state.turnExpiresAt = Date.now() + safeDuration;

    this.turnTimer = this.clock.setTimeout(() => {
      this.handleTurnTimeout();
    }, safeDuration);
  }

  private pauseTurnTimer(playerId: string): void {
    if (!this.turnTimer) return;

    this.pausedTurnRemainingMs = Math.max(
      0,
      this.state.turnExpiresAt - Date.now()
    );

    this.pausedTurnPlayerId = playerId;

    this.stopTurnTimer();

    console.log(
      `Turn timer paused. Remaining: ${this.pausedTurnRemainingMs}ms`
    );
  }

  private abandonGame(playerId: string): void {
    // Eyni abandon hadisəsi iki dəfə işləməsin.
    if (
      this.state.status === "abandoned" ||
      this.state.status === "finished"
    ) {
      return;
    }

    console.log(
      `Domino365 Game abandoned by player: ${playerId}`
    );

    this.stopTurnTimer();

    this.pausedTurnRemainingMs = 0;
    this.pausedTurnPlayerId = null;

    this.state.status = "abandoned";

    this.broadcast("game_abandoned", {
      playerId,
      message: "A player left the game.",
    });

    this.scheduleRoomDisposal(5000);
  }

  private stopTurnTimer(): void {
    if (this.turnTimer) {
      this.turnTimer.clear();
      this.turnTimer = null;
    }
    this.state.turnExpiresAt = 0;
  }

  private handleTurnTimeout(): void {
    if (
      !this.game ||
      this.game.status !== "playing" ||
      this.state.status === "abandoned"
    ) {
      this.stopTurnTimer();
      return;
    }

    const currentPlayer = this.game.players[this.game.currentPlayerIndex];
    if (!currentPlayer) return;

    const currentClient = this.clients.find(
      (c) => c.sessionId === currentPlayer.playerId
    );

    const playableMove = findFirstPlayableDomino365Move(
      this.game.board,
      currentPlayer.hand
    );

    if (playableMove) {
      try {
        this.game = playDomino365GameTile(
          this.game,
          currentPlayer.playerId,
          playableMove.tileId,
          playableMove.endId
        );

        this.syncPublicState();

        if (currentClient) {
          this.sendPrivateHand(currentClient);
        }

        this.broadcast("move_played", {
          playerId: currentPlayer.playerId,
          tileId: playableMove.tileId,
          points: this.game.lastMoveScore?.points ?? 0,
          currentPlayerId: this.state.currentPlayerId,
          status: this.game.status,
          autoPlayed: true,
        });

        this.broadcastRoundResultIfNeeded();
      } catch (error) {
        console.error("Auto play error:", error);
      }
    } else {
      try {
        this.game = passDomino365GameTurn(
          this.game,
          currentPlayer.playerId
        );

        this.syncPublicState();

        this.broadcast("turn_passed", {
          playerId: currentPlayer.playerId,
          currentPlayerId: this.state.currentPlayerId,
          consecutivePasses: this.game.consecutivePasses,
          status: this.game.status,
          autoPassed: true,
        });

        this.broadcastRoundResultIfNeeded();
      } catch (error) {
        console.error("Auto pass error:", error);
      }
    }

    if (this.game && this.game.status === "playing") {
      this.startTurnTimer();
    } else {
      this.stopTurnTimer();
    }
  }

  private scheduleRoomDisposal(delayMs: number): void {
    if (this.roomCleanupTimer) return;

    this.roomCleanupTimer = this.clock.setTimeout(async () => {
      try {
        await this.disconnect();
      } catch (error) {
        console.error("Error disposing room:", error);
      }
    }, delayMs);
  }

  onDispose(): void {
    this.stopTurnTimer();

    if (this.roomCleanupTimer) {
      this.roomCleanupTimer.clear();
      this.roomCleanupTimer = null;
    }

    console.log("Domino365 Room disposed:", this.roomId);
  }
}
