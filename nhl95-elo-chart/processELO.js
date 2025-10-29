export function flattenEloHistory(eloRows, adamRows) {
  const managerMap = {};
  adamRows.forEach(([discordId, team, managerName]) => {
    managerMap[managerName] = discordId;
  });

  const flat = [];

  eloRows.forEach(row => {
    const [
      GameID, Season, GameDate, HomeManager, AwayManager,
      HomeTeam, HomeResult, HomeScore, AwayTeam, AwayResult, AwayScore,
      HomePreElo, AwayPreElo, HomePostElo, AwayPostElo
    ] = row;

    if (HomeManager in managerMap) {
      flat.push({
        manager: HomeManager,
        discordId: managerMap[HomeManager],
        game: GameID,
        elo: Number(HomePostElo)
      });
    }

    if (AwayManager in managerMap) {
      flat.push({
        manager: AwayManager,
        discordId: managerMap[AwayManager],
        game: GameID,
        elo: Number(AwayPostElo)
      });
    }
  });

  return flat;
}
