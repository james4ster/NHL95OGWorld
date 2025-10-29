export function buildDatasets(flatElo) {
  const gamesSet = new Set();
  flatElo.forEach(e => gamesSet.add(e.game));
  const games = Array.from(gamesSet).sort((a,b) => a-b);

  const managerMap = {};
  flatElo.forEach(e => {
    if (!managerMap[e.manager]) {
      managerMap[e.manager] = {
        label: `${e.manager} (${e.discordId})`,
        data: [],
      };
    }
    managerMap[e.manager].data.push({ x: e.game, y: e.elo });
  });

  const datasets = Object.values(managerMap).map(ds => ({
    label: ds.label,
    data: ds.data,
    fill: false,
    borderWidth: 2,
  }));

  return { games, datasets };
}
