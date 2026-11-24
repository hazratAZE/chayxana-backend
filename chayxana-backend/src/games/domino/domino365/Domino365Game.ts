import {
  createDomino365Board,
  canPlaceDomino365Tile,
  placeDomino365Tile,
  type Domino365Board,
} from "./Domino365Board.js";

import {
  calculateDomino365MoveScore,
  type Domino365ScoreResult,
} from "./Domino365Scoring.js";

import {
  settleDomino365Round,
  type Domino365RoundPlayer,
  type Domino365RoundEndReason,
  type Domino365RoundResult,
  type Domino365TeamId,
} from "./Domino365RoundManager.js";

import {
  createDominoSet,
  shuffleDominoSet,
  dealDominoTiles,
} from "../shared/DominoSet.js";

import type { DominoTile } from "../shared/DominoTile.js";

export interface Domino365PlayerSetup {
  playerId: string;
  teamId: Domino365TeamId;
}

export interface Domino365GamePlayer extends Domino365RoundPlayer {}

export type Domino365GameStatus =
  | "playing"
  | "round_ended"
  | "finished";

export interface Domino365GameState {
  players: Domino365GamePlayer[];
  board: Domino365Board;

  scores: {
    A: number;
    B: number;
  };

  currentPlayerIndex: number;
  roundStartingPlayerIndex: number;
  consecutivePasses: number;

  endgameMode: boolean;
  roundNumber: number;
  status: Domino365GameStatus;

  lastMoveScore: Domino365ScoreResult | null;
  roundResult: Domino365RoundResult | null;
}

function validatePlayerSetup(
  players: Domino365PlayerSetup[]
): void {
  if (players.length !== 4) {
    throw new Error("Domino 365 requires exactly 4 players");
  }

  const ids = new Set(players.map((player) => player.playerId));

  if (ids.size !== 4) {
    throw new Error("Duplicate player ID");
  }

  const teamA = players.filter((p) => p.teamId === "A").length;
  const teamB = players.filter((p) => p.teamId === "B").length;

  if (teamA !== 2 || teamB !== 2) {
    throw new Error("Each team must have exactly 2 players");
  }
}

export function createDomino365Game(
  playerSetup: Domino365PlayerSetup[],
  firstPlayerIndex: number,
  random: () => number = Math.random
): Domino365GameState {
  validatePlayerSetup(playerSetup);

  if (
    !Number.isInteger(firstPlayerIndex) ||
    firstPlayerIndex < 0 ||
    firstPlayerIndex >= 4
  ) {
    throw new Error("Invalid first player index");
  }

  const shuffledTiles = shuffleDominoSet(
    createDominoSet(),
    random
  );

  const deal = dealDominoTiles(shuffledTiles, 4, 7);

  const players: Domino365GamePlayer[] = playerSetup.map(
    (player, index) => ({
      playerId: player.playerId,
      teamId: player.teamId,
      hand: deal.hands[index],
    })
  );

  return {
    players,
    board: createDomino365Board(),

    scores: {
      A: 0,
      B: 0,
    },

    currentPlayerIndex: firstPlayerIndex,
    roundStartingPlayerIndex: firstPlayerIndex,
    consecutivePasses: 0,

    endgameMode: false,
    roundNumber: 1,
    status: "playing",

    lastMoveScore: null,
    roundResult: null,
  };
}

export function getDomino365CurrentPlayer(
  game: Domino365GameState
): Domino365GamePlayer {
  return game.players[game.currentPlayerIndex];
}

export function hasPlayableDomino365Tile(
  board: Domino365Board,
  hand: DominoTile[]
): boolean {
  if (board.tiles.length === 0) {
    return hand.length > 0;
  }

  return hand.some((tile) =>
    board.openEnds.some((end) =>
      canPlaceDomino365Tile(board, tile, end.id)
    )
  );
}

function assertGameIsPlaying(game: Domino365GameState): void {
  if (game.status !== "playing") {
    throw new Error("Game is not currently playing");
  }
}

function finishRound(
  game: Domino365GameState,
  players: Domino365GamePlayer[],
  scores: { A: number; B: number },
  endReason: Domino365RoundEndReason
): Domino365GameState {
  const result = settleDomino365Round({
    players,
    scores,
    endReason,
    endgameMode: game.endgameMode,
  });

  return {
    ...game,
    players,
    scores: result.scores,
    endgameMode: result.endgameMode,
    status: result.sessionEnded ? "finished" : "round_ended",
    roundResult: result,
  };
}

export function playDomino365GameTile(
  game: Domino365GameState,
  playerId: string,
  tileId: string,
  endId?: string
): Domino365GameState {
  assertGameIsPlaying(game);

  const currentPlayer = getDomino365CurrentPlayer(game);

  if (currentPlayer.playerId !== playerId) {
    throw new Error("It is not this player's turn");
  }

  const tile = currentPlayer.hand.find(
    (item) => item.id === tileId
  );

  if (!tile) {
    throw new Error("Tile does not belong to this player");
  }

  if (!canPlaceDomino365Tile(game.board, tile, endId)) {
    throw new Error("Invalid tile placement");
  }

  const nextBoard = placeDomino365Tile(
    game.board,
    tile,
    endId
  );

  const nextPlayers = game.players.map((player) => ({
    ...player,
    hand:
      player.playerId === playerId
        ? player.hand.filter((item) => item.id !== tileId)
        : [...player.hand],
  }));

  const scoreResult = calculateDomino365MoveScore(nextBoard);

  const nextScores = {
    ...game.scores,
    [currentPlayer.teamId]:
      game.scores[currentPlayer.teamId] + scoreResult.points,
  };

  const nextGame: Domino365GameState = {
    ...game,
    players: nextPlayers,
    board: nextBoard,
    scores: nextScores,
    currentPlayerIndex: (game.currentPlayerIndex + 1) % 4,
    consecutivePasses: 0,
    lastMoveScore: scoreResult,
    roundResult: null,
  };

  const updatedPlayer = nextPlayers.find(
    (player) => player.playerId === playerId
  )!;

  if (updatedPlayer.hand.length === 0) {
    return finishRound(
      nextGame,
      nextPlayers,
      nextScores,
      {
        type: "player_finished",
        playerId,
      }
    );
  }

  return nextGame;
}

export function passDomino365GameTurn(
  game: Domino365GameState,
  playerId: string
): Domino365GameState {
  assertGameIsPlaying(game);

  const currentPlayer = getDomino365CurrentPlayer(game);

  if (currentPlayer.playerId !== playerId) {
    throw new Error("It is not this player's turn");
  }

  if (
    hasPlayableDomino365Tile(
      game.board,
      currentPlayer.hand
    )
  ) {
    throw new Error("Player has a playable tile and cannot pass");
  }

  const nextPassCount = game.consecutivePasses + 1;

  const nextGame: Domino365GameState = {
    ...game,
    currentPlayerIndex: (game.currentPlayerIndex + 1) % 4,
    consecutivePasses: nextPassCount,
    lastMoveScore: null,
    roundResult: null,
  };

  if (nextPassCount >= 4) {
    return finishRound(
      nextGame,
      game.players,
      game.scores,
      { type: "blocked" }
    );
  }

  return nextGame;
}

export function startNextDomino365Round(
  game: Domino365GameState,
  random: () => number = Math.random
): Domino365GameState {
  if (game.status === "finished") {
    throw new Error("Game has already finished");
  }

  if (game.status !== "round_ended") {
    throw new Error("Current round has not ended");
  }

  const nextFirstPlayerIndex =
    (game.roundStartingPlayerIndex + 1) % 4;

  const shuffledTiles = shuffleDominoSet(
    createDominoSet(),
    random
  );

  const deal = dealDominoTiles(shuffledTiles, 4, 7);

  const nextPlayers: Domino365GamePlayer[] =
    game.players.map((player, index) => ({
      playerId: player.playerId,
      teamId: player.teamId,
      hand: deal.hands[index],
    }));

  return {
    ...game,

    players: nextPlayers,
    board: createDomino365Board(),

    currentPlayerIndex: nextFirstPlayerIndex,
    roundStartingPlayerIndex: nextFirstPlayerIndex,

    consecutivePasses: 0,

    roundNumber: game.roundNumber + 1,

    status: "playing",

    lastMoveScore: null,
    roundResult: null,
  };
}
