import type { DominoTile } from "../shared/DominoTile.js";

export type Domino365TeamId = "A" | "B";

export interface Domino365RoundPlayer {
  playerId: string;
  teamId: Domino365TeamId;
  hand: DominoTile[];
}

export type Domino365RoundEndReason =
  | {
      type: "player_finished";
      playerId: string;
    }
  | {
      type: "blocked";
    };

export interface Domino365RoundInput {
  players: Domino365RoundPlayer[];

  // Raund başlamazdan əvvəlki ümumi komanda xalları.
  scores: {
    A: number;
    B: number;
  };

  endReason: Domino365RoundEndReason;

  // Əvvəlki raundda 300 xal qaydası aktivləşibsə true.
  endgameMode: boolean;
}

export interface Domino365RoundResult {
  scores: {
    A: number;
    B: number;
  };

  bonusPoints: {
    A: number;
    B: number;
  };

  remainingPips: {
    A: number;
    B: number;
  };

  endgameMode: boolean;

  sessionEnded: boolean;
  sessionWinnerTeamId: Domino365TeamId | null;
  bothTeamsReachedTarget: boolean;

  bonusReason:
    | "player_finished"
    | "blocked"
    | "blocked_tie"
    | "endgame_no_bonus";
}

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}

function calculateTeamRemainingPips(
  players: Domino365RoundPlayer[]
): { A: number; B: number } {
  const result = { A: 0, B: 0 };

  for (const player of players) {
    for (const tile of player.hand) {
      if (
        !Number.isInteger(tile.left) ||
        !Number.isInteger(tile.right) ||
        tile.left < 0 ||
        tile.left > 6 ||
        tile.right < 0 ||
        tile.right > 6
      ) {
        throw new Error("Invalid domino tile");
      }

      result[player.teamId] += tile.left + tile.right;
    }
  }

  return result;
}

function validateInput(input: Domino365RoundInput): void {
  if (input.players.length !== 4) {
    throw new Error("Domino 365 requires exactly 4 players");
  }

  const playerIds = new Set(
    input.players.map((player) => player.playerId)
  );

  if (playerIds.size !== 4) {
    throw new Error("Duplicate player ID");
  }

  const teamAPlayers = input.players.filter(
    (player) => player.teamId === "A"
  ).length;

  const teamBPlayers = input.players.filter(
    (player) => player.teamId === "B"
  ).length;

  if (teamAPlayers !== 2 || teamBPlayers !== 2) {
    throw new Error("Each team must have exactly 2 players");
  }

  if (
    !Number.isFinite(input.scores.A) ||
    !Number.isFinite(input.scores.B) ||
    input.scores.A < 0 ||
    input.scores.B < 0
  ) {
    throw new Error("Invalid team scores");
  }

  if (input.endReason.type === "player_finished") {
    const finishingPlayerId = input.endReason.playerId;
    const player = input.players.find(
      (item) => item.playerId === finishingPlayerId
    );

    if (!player) {
      throw new Error("Finishing player does not exist");
    }

    if (player.hand.length !== 0) {
      throw new Error("Finishing player must have an empty hand");
    }
  }
}

export function settleDomino365Round(
  input: Domino365RoundInput
): Domino365RoundResult {
  validateInput(input);

  const remainingPips = calculateTeamRemainingPips(
    input.players
  );

  const bonusPoints = {
    A: 0,
    B: 0,
  };

  let bonusReason: Domino365RoundResult["bonusReason"];

  // 300 xal rejimi aktivdirsə, əlində qalan daşlara görə
  // heç bir komandaya bonus verilmir.
  if (input.endgameMode) {
    bonusReason = "endgame_no_bonus";
  } else if (input.endReason.type === "player_finished") {
    const finishingPlayerId = input.endReason.playerId;
    const finishingPlayer = input.players.find(
      (player) => player.playerId === finishingPlayerId
    )!;

    const winningTeam = finishingPlayer.teamId;
    const losingTeam: Domino365TeamId =
      winningTeam === "A" ? "B" : "A";

    bonusPoints[winningTeam] = roundToNearestFive(
      remainingPips[losingTeam]
    );

    bonusReason = "player_finished";
  } else {
    // Bloklanmış raund: daha az pip qalan komanda qalibdir.
    if (remainingPips.A < remainingPips.B) {
      bonusPoints.A = roundToNearestFive(remainingPips.B);
      bonusReason = "blocked";
    } else if (remainingPips.B < remainingPips.A) {
      bonusPoints.B = roundToNearestFive(remainingPips.A);
      bonusReason = "blocked";
    } else {
      // Bərabərlikdə heç kim bonus qazanmır.
      bonusReason = "blocked_tie";
    }
  }

  const scores = {
    A: input.scores.A + bonusPoints.A,
    B: input.scores.B + bonusPoints.B,
  };

  // 300 xal həddi raund bitdikdən sonra yoxlanılır.
  const endgameMode =
    input.endgameMode ||
    scores.A >= 300 ||
    scores.B >= 300;

  // 365 xal həddi də raundun yekun hesabından sonra yoxlanılır.
  const teamAReachedTarget = scores.A >= 365;
  const teamBReachedTarget = scores.B >= 365;

  const sessionEnded =
    teamAReachedTarget || teamBReachedTarget;

  let sessionWinnerTeamId: Domino365TeamId | null = null;

  if (teamAReachedTarget && !teamBReachedTarget) {
    sessionWinnerTeamId = "A";
  } else if (teamBReachedTarget && !teamAReachedTarget) {
    sessionWinnerTeamId = "B";
  }

  return {
    scores,
    bonusPoints,
    remainingPips,
    endgameMode,
    sessionEnded,
    sessionWinnerTeamId,
    bothTeamsReachedTarget:
      teamAReachedTarget && teamBReachedTarget,
    bonusReason,
  };
}
