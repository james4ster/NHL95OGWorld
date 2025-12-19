// RawStandings params
const raw_standings_col_start = "A";
const streak_col = "G";
const longest_win_streak_col = "AQ";
const longest_lose_streak_col = "AR";
//======================================================
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
//======================================================
// Main function to update streaks
export default async function updateCoachesStreaks({
  sheets,
  spreadsheetId,
  homeCoach,
  awayCoach,
  homeTeamScore,
  awayTeamScore
}) {
  ////////////////////////
  // Fetch RawStandings (now including AQ and AR columns)
  ////////////////////////
  const range = `RawStandings!${raw_standings_col_start}:${longest_lose_streak_col}`;
  const managers_res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  if (managers_res.status !== 200 || managers_res.statusText !== "OK") {
    throw new Error("Error in reading standings sheet in order to get coaches row");
  }
  const rawStandingsData = managers_res.data.values;
  let homeCoachesRawStandings, awayCoachesRawStandings;
  let homeCoachFound = false, awayCoachFound = false;

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

  if (!homeCoachFound) throw new Error("Home coach not found.");
  if (!awayCoachFound) throw new Error("Away coach not found.");

  // Get current values (index 6 = column G, index 42 = column AQ, index 43 = column AR)
  const previousHomeCoachesStreak = rawStandingsData[homeCoachesRawStandings - 1][6];
  const previousAwayCoachesStreak = rawStandingsData[awayCoachesRawStandings - 1][6];
  const homeLongestWinStreak = rawStandingsData[homeCoachesRawStandings - 1][42] || 0;
  const homeLongestLoseStreak = rawStandingsData[homeCoachesRawStandings - 1][43] || 0;
  const awayLongestWinStreak = rawStandingsData[awayCoachesRawStandings - 1][42] || 0;
  const awayLongestLoseStreak = rawStandingsData[awayCoachesRawStandings - 1][43] || 0;

  ////////////////////////
  // Determine results
  ////////////////////////
  let homeTeamResult, awayTeamResult;
  if (+homeTeamScore > +awayTeamScore) {
    homeTeamResult = "W"; awayTeamResult = "L";
  } else if (+homeTeamScore < +awayTeamScore) {
    homeTeamResult = "L"; awayTeamResult = "W";
  } else {
    homeTeamResult = "T"; awayTeamResult = "T";
  }

  ////////////////////////
  // Compute updated streaks
  ////////////////////////
  const parsedHome = parseStreak(previousHomeCoachesStreak);
  const updatedHomeCoachesStreak = !parsedHome || parsedHome.type !== homeTeamResult
    ? `1${homeTeamResult}`
    : `${parsedHome.length + 1}${homeTeamResult}`;

  const parsedAway = parseStreak(previousAwayCoachesStreak);
  const updatedAwayCoachesStreak = !parsedAway || parsedAway.type !== awayTeamResult
    ? `1${awayTeamResult}`
    : `${parsedAway.length + 1}${awayTeamResult}`;

  ////////////////////////
  // Check for longest streak updates
  ////////////////////////
  const updateStreakRequests = [
    { range: `RawStandings!${streak_col}${homeCoachesRawStandings}`, values: [[updatedHomeCoachesStreak]] },
    { range: `RawStandings!${streak_col}${awayCoachesRawStandings}`, values: [[updatedAwayCoachesStreak]] },
  ];

  // Parse the new streaks to check against longest
  const newHomeParsed = parseStreak(updatedHomeCoachesStreak);
  const newAwayParsed = parseStreak(updatedAwayCoachesStreak);

  // Home coach: check if new win streak exceeds longest win streak
  if (newHomeParsed && newHomeParsed.type === "W" && newHomeParsed.length > +homeLongestWinStreak) {
    updateStreakRequests.push({
      range: `RawStandings!${longest_win_streak_col}${homeCoachesRawStandings}`,
      values: [[newHomeParsed.length]]
    });
  }

  // Home coach: check if new lose streak exceeds longest lose streak
  if (newHomeParsed && newHomeParsed.type === "L" && newHomeParsed.length > +homeLongestLoseStreak) {
    updateStreakRequests.push({
      range: `RawStandings!${longest_lose_streak_col}${homeCoachesRawStandings}`,
      values: [[newHomeParsed.length]]
    });
  }

  // Away coach: check if new win streak exceeds longest win streak
  if (newAwayParsed && newAwayParsed.type === "W" && newAwayParsed.length > +awayLongestWinStreak) {
    updateStreakRequests.push({
      range: `RawStandings!${longest_win_streak_col}${awayCoachesRawStandings}`,
      values: [[newAwayParsed.length]]
    });
  }

  // Away coach: check if new lose streak exceeds longest lose streak
  if (newAwayParsed && newAwayParsed.type === "L" && newAwayParsed.length > +awayLongestLoseStreak) {
    updateStreakRequests.push({
      range: `RawStandings!${longest_lose_streak_col}${awayCoachesRawStandings}`,
      values: [[newAwayParsed.length]]
    });
  }

  ////////////////////////
  // Write all updates to RawStandings
  ////////////////////////
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      data: updateStreakRequests,
      valueInputOption: "RAW",
    },
  });
}