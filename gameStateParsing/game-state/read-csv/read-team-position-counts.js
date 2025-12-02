// Function to read and process the CSV file using async/await

import fs from "node:fs/promises";
import path from "node:path";

async function readTeamPositionCounts() {
  const teamCsvFile = path.join(process.cwd(), "gameStateParsing", "csv", "Team_Position_Counts.csv");

  const teamsArray = [];
  const teamsContainingObject = {};

  try {
    // Read the CSV file as a string
    const teamsAttributes = await fs.readFile(teamCsvFile, "utf8");

    // Split the CSV data into rows and trim carriage returns
    const rows = teamsAttributes.split("\n").map((row) => row.trimEnd("\r"));

    // Skip the header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i].split(",");

      // Skip empty rows
      if (row.join("").trim() === "") continue;

      teamsArray.push(row);
    }

    // Build the object structure
    teamsArray.forEach((teamRow) => {
      teamsContainingObject[teamRow[0]] = {
        goalies: teamRow[1],
        forwards: teamRow[2],
        defensemen: teamRow[3],
      };
    });

    return teamsContainingObject;
  } catch (error) {
    console.error("There was a problem reading the CSV file:", error);
  }
}

export default readTeamPositionCounts;

