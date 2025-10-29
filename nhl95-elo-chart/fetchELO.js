import { google } from 'googleapis';

// Instead of reading a local JSON file, parse it from an environment variable
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

export async function getSheetData(range) {
  const auth = new google.auth.GoogleAuth({
    credentials, // <-- use the parsed JSON here
    scopes: SCOPES,
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '19xiNC-8xF5q8iaro_thpxwyoaUSsPy1Xv28XSIEz5S8'; // your Sheet ID

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values || [];
}