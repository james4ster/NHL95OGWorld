// Function to read and process the CSV file using async/await

import fs from "node:fs/promises";
import path from "node:path";

async function readGoalieAttributes() {
  const goalieCsvFile = path.join(process.cwd(), "gameStateParsing", "csv", "Goalie_Attributes.csv");

  const goaliesArray = [];
  const goaliesContainingObject = {};

  try {
    // Read the CSV file as a string
    const goalieAttributes = await fs.readFile(goalieCsvFile, "utf8");

    // Split the CSV data into rows and trim carriage returns
    const rows = goalieAttributes.split("\n").map((row) => row.trimEnd("\r"));

    // Skip the header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i].split(",");

      // Skip empty rows
      if (row.join("").trim() === "") continue;

      goaliesArray.push(row);
    }

    let curTeam = "";
    goaliesArray.forEach((goalieRow) => {
      if (goalieRow[1] !== curTeam) {
        curTeam = goalieRow[1];
        goaliesContainingObject[curTeam] = [goalieRow[0]];
      } else {
        goaliesContainingObject[curTeam].push(goalieRow[0]);
      }
    });

    return goaliesContainingObject;
  } catch (error) {
    console.error("There was a problem reading the CSV file:", error);
  }
}

export default readGoalieAttributes;
