import { google } from "googleapis";

// Parse the service account JSON from env variable
const raw = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const credentials = {
  ...raw,
  private_key: raw.private_key.replace(/\\n/g, '\n'),
};


// Google Auth using the JSON object
const auth = new google.auth.GoogleAuth({
  credentials, // <-- pass the parsed JSON directly
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"], // or full read/write if needed
});

// Sheets client
const sheets = google.sheets({ version: "v4", auth });

// Function to get rows
async function getSheetData(spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });
  return res.data.values; // rows as array of arrays
}

// Test
async function main() {
  const spreadsheetId = process.env.SPREADSHEET_ID; // your new sheet ID
  const rows = await getSheetData(spreadsheetId, "LogoMaster"); // adjust tab name if needed
  console.log(rows);
}

main().catch(console.error);
