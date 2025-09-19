// backup.js
const { google } = require("googleapis");

const DEFAULT_SPREADSHEET_ID =
  process.env.SPREADSHEET_ID ||
  "1LdByKgvhMdvQm1jwqP0m5EpOUr-l2DBand_45v3-1c8";

// যে শীটগুলো snapshot নিতে হবে
const SHEET_NAMES = [
  "Hourly Order Update",
  "Gold Team (Live)",
  "Live-Silver",
  "Live-Bronze",
  "Platinum Team(Live)",
  "Diamond Team (Live)",
  "Hourly Target Ach",
];

function timestampForName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function sheetExists(sheetsApi, spreadsheetId, sheetName) {
  const res = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });
  return res.data.sheets?.some((s) => s.properties?.title === sheetName);
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
    console.error("❌ GOOGLE_SERVICE_ACCOUNT environment variable not set.");
    process.exit(1);
  }

  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const ts = timestampForName();
  console.log("📂 Backup started:", ts, "spreadsheet:", spreadsheetId);

  // সব শীটের মেটাডাটা একবারেই নিয়ে আসা – এতে বারবার API কল কম হয়
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });
  const allSheets = meta.data.sheets || [];

  for (const sheetName of SHEET_NAMES) {
    try {
      const src = allSheets.find(
        (s) => s.properties?.title === sheetName
      );
      if (!src) {
        console.warn(`⚠️ Sheet not found: "${sheetName}" — skipping`);
        continue;
      }

      const sheetId = src.properties.sheetId;
      const baseBackupTitle = `${sheetName}_Backup_${ts}`;
      const backupTitle = await ensureUniqueTitle(
        sheets,
        spreadsheetId,
        baseBackupTitle
      );

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              duplicateSheet: {
                sourceSheetId: sheetId,
                insertSheetIndex: 0,
                newSheetName: backupTitle,
              },
            },
          ],
        },
      });

      console.log(`✅ Snapshot created: ${backupTitle}`);
    } catch (err) {
      console.error(`❌ Error while backing up "${sheetName}":`, err.message);
    }
  }

  console.log("🏁 Backup finished:", new Date().toISOString());
}

// CLI থেকে চালানো হলে
if (require.main === module) {
  runBackup().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(2);
  });
}

module.exports = { runBackup };