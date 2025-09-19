// backup.js
// CommonJS (node >= 16/18/20) -- Google Sheets API দিয়ে পুরো snapshot (values + formatting + formulas)

// Google API
const { google } = require("googleapis");

const DEFAULT_SPREADSHEET_ID =
  process.env.SPREADSHEET_ID ||
  "1LdByKgvhMdvQm1jwqP0m5EpOUr-l2DBand_45v3-1c8"; // এখানে তোমার spreadsheet ID দিতে পারো

// যে শীটগুলো snapshot নিতে হবে
const SHEET_NAMES = [
  "Hourly Order Update",
  "Gold Team (Live)",
  "Live-Silver",
  "Live-Bronze",
  "Platinum Team(Live)",
  "Diamond Team (Live)",
  "Hourly Target Ach"
];

function timestampForName() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  const Y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${Y}-${M}-${D}_${hh}${mm}`;
}

async function sheetExists(sheetsApi, spreadsheetId, sheetName) {
  try {
    const r = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      ranges: [sheetName],
      includeGridData: false
    });
    return Array.isArray(r.data.sheets) && r.data.sheets.length > 0;
  } catch (err) {
    return false;
  }
}

async function ensureUniqueTitle(sheetsApi, spreadsheetId, baseTitle) {
  let title = baseTitle.substring(0, 100);
  let i = 1;
  while (await sheetExists(sheetsApi, spreadsheetId, title)) {
    const suffix = `_${i}`;
    const maxBaseLen = 100 - suffix.length;
    title = (baseTitle.substring(0, maxBaseLen) + suffix).substring(0, 100);
    i++;
    if (i > 999) break;
  }
  return title;
}

async function runBackup() {
  const spreadsheetId = DEFAULT_SPREADSHEET_ID;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.error("Error: GOOGLE_SERVICE_ACCOUNT environment variable not set.");
    process.exit(1);
  }

  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  const ts = timestampForName();
  console.log("Backup started:", ts, "spreadsheet:", spreadsheetId);

  for (const sheetName of SHEET_NAMES) {
    try {
      console.log("Processing sheet:", sheetName);

      // get metadata (to retrieve sheetId)
      const meta = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [sheetName],
        includeGridData: false
      });

      if (!meta.data.sheets || meta.data.sheets.length === 0) {
        console.warn(`Sheet not found: "${sheetName}" — skipping`);
        continue;
      }

      const sheetId = meta.data.sheets[0].properties.sheetId;

      // Prepare backup sheet title (unique)
      const baseBackupTitle = `${sheetName}_Backup_${ts}`;
      const backupTitle = await ensureUniqueTitle(
        sheets,
        spreadsheetId,
        baseBackupTitle
      );

      // Duplicate with formatting + formulas
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              duplicateSheet: {
                sourceSheetId: sheetId,
                insertSheetIndex: 0,
                newSheetName: backupTitle
              }
            }
          ]
        }
      });

      console.log(`✅ Snapshot created: ${backupTitle}`);
    } catch (err) {
      console.error(
        `❌ Error while backing up "${sheetName}":`,
        err.message || err
      );
    }
  }

  console.log("Backup finished:", new Date().toISOString());
}

// Run if executed directly
if (require.main === module) {
  runBackup().catch(err => {
    console.error("Fatal error:", err);
    process.exit(2);
  });
}

module.exports = { runBackup };