// RawStandings params
const raw_standings_col_start = "A";
const streak_col = "G";
const emoji_col = "AS"; // column to store streak emoji

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
// Helper function to get streak emoji
function getStreakEmoji(streak) {
  if (!streak) return "";
  const num = parseInt(streak.slice(0, -1), 10); // numeric part
  const type = streak.slice(-1).toUpperCase();   // W/L/T

  if (type === "W") {
    if (num >= 10) return "🔥🔥";
    if (num >= 5) return "🔥";
  } else if (type === "L") {
    if (num >= 10) return "🧊🧊";
    if (num >= 5) return "🧊";
  }
  return "";
}

//======================================================
// Main function to update streaks and emoji
export default async function updateCoachesStreaks({
  sheets,
  spreadsheetId,
  homeCoach,
  awayCoach,
  homeTeamScore,
  awayTeamScore
}) {
  ////////////////////////
  // Fetch RawStandings
  ////////////////////////
  const range = `RawStandings!${raw_standings_col_start}:${streak_col}`;
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

  if (!homeCoachFound) throw new Error("Home teams coach not found.");
  if (!awayCoachFound) throw new Error("Away teams coach not found.");

  const previousHomeCoachesStreak = rawStandingsData[homeCoachesRawStandings - 1][6];
  const previousAwayCoachesStreak = rawStandingsData[awayCoachesRawStandings - 1][6];

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
  // Compute emojis
  ////////////////////////
  const homeEmoji = getStreakEmoji(updatedHomeCoachesStreak);
  const awayEmoji = getStreakEmoji(updatedAwayCoachesStreak);

  ////////////////////////
  // Write streaks + emoji
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
    {
      range: `RawStandings!${emoji_col}${homeCoachesRawStandings}`,
      values: [[homeEmoji]],
    },
    {
      range: `RawStandings!${emoji_col}${awayCoachesRawStandings}`,
      values: [[awayEmoji]],
    }
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      data: updateStreakRequests,
      valueInputOption: "RAW",
    },
  });
}
