// RawStandings params
const raw_standings_col_start = "A"
const streak_col = "G"

// Helper function to parse streak strings (e.g., "5W")
function parseStreak(streak) {
  if (!streak) return null;

  const match = streak.toString().trim().match(/^(\d+)([WLT])$/);
  if (!match) return null;

  return {
    length: Number(match[1]),
    type: match[2],
  };
}

export default async function updateCoachesStreaks({
  sheets,
  spreadsheetId,
  homeCoach,
  awayCoach,
  homeTeamScore,
  awayTeamScore
}) {

  ////////////////////////
  // begin fetching streak
  ////////////////////////

  const range = `RawStandings!${raw_standings_col_start}:${streak_col}`;

  const managers_res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  if (managers_res.status !== 200 || managers_res.statusText !== "OK") {
    throw new Error("Error in reading standings sheet in order to get coaches row");
  }

  const rawStandingsData = managers_res.data.values;

  let homeCoachesRawStandings;
  let awayCoachesRawStandings;
  let homeCoachFound = false;
  let awayCoachFound = false;

  for (let i = 0; i < rawStandingsData.length; i++) {
    if (rawStandingsData[i][0] === homeCoach) {
      homeCoachesRawStandings = i + 1;
      homeCoachFound = true;
    }
    if (rawStandingsData[i][0] === awayCoach) {
      awayCoachesRawStandings = i + 1;
      awayCoachFound = true;
    }
    if (homeCoachFound && awayCoachFound) break;
  }

  if (!homeCoachFound) throw new Error("Home teams coach not found.");
  if (!awayCoachFound) throw new Error("Away teams coach not found.");

  const previousHomeCoachesStreak = rawStandingsData[homeCoachesRawStandings - 1][6];
  const previousAwayCoachesStreak = rawStandingsData[awayCoachesRawStandings - 1][6];

  let homeTeamResult;
  let awayTeamResult;

  if (+homeTeamScore > +awayTeamScore) {
    homeTeamResult = "W";
    awayTeamResult = "L";
  } else if (+homeTeamScore < +awayTeamScore) {
    homeTeamResult = "L";
    awayTeamResult = "W";
  } else {
    homeTeamResult = "T";
    awayTeamResult = "T";
  }

  ////////////////////////
  // FIXED STREAK LOGIC
  ////////////////////////

  let updatedHomeCoachesStreak;
  let updatedAwayCoachesStreak;

  const parsedHome = parseStreak(previousHomeCoachesStreak);
  if (!parsedHome || parsedHome.type !== homeTeamResult) {
    updatedHomeCoachesStreak = `1${homeTeamResult}`;
  } else {
    updatedHomeCoachesStreak = `${parsedHome.length + 1}${homeTeamResult}`;
  }

  const parsedAway = parseStreak(previousAwayCoachesStreak);
  if (!parsedAway || parsedAway.type !== awayTeamResult) {
    updatedAwayCoachesStreak = `1${awayTeamResult}`;
  } else {
    updatedAwayCoachesStreak = `${parsedAway.length + 1}${awayTeamResult}`;
  }

  ////////////////////////
  // write updates
  ////////////////////////

  const updateStreakRequests = [
    {
      range: `RawStandings!${streak_col}${homeCoachesRawStandings}`,
      values: [[updatedHomeCoachesStreak]],
    },
    {
      range: `RawStandings!${streak_col}${awayCoachesRawStandings}`,
      values: [[updatedAwayCoachesStreak]],
    },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      data: updateStreakRequests,
      valueInputOption: "RAW",
    },
  });
}
