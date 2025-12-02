// Function to read and process the CSV file using async/await

import fs from "node:fs/promises";
import path from "node:path";

async function readSkatersAttributes() {
  const skaterCsvFile = path.join(process.cwd(), "gameStateParsing", "csv", "Skater_Attributes.csv");

  const skatersArray = [];
  const skatersContainingObject = {};

  try {
    // Read the CSV file as a string
    const skatersAttributes = await fs.readFile(skaterCsvFile, "utf8");

    // Split the CSV data into rows and trim carriage returns
    const rows = skatersAttributes.split("\n").map((row) => row.trimEnd("\r"));

    // Skip the header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i].split(",");

      // Skip empty rows
      if (row.join("").trim() === "") continue;

      skatersArray.push(row);
    }

    let curTeam = "";
    skatersArray.forEach((skaterRow) => {
      if (skaterRow[1] !== curTeam) {
        curTeam = skaterRow[1];
        skatersContainingObject[curTeam] = [skaterRow[0]];
      } else {
        skatersContainingObject[curTeam].push(skaterRow[0]);
      }
    });

    return skatersContainingObject;
  } catch (error) {
    console.error("There was a problem reading the CSV file:", error);
  }
}

export default readSkatersAttributes;

