// backup.js
const { google } = require("googleapis");
const moment = require("moment-timezone"); // timezone package

// Spreadsheet ID (env বা default)
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
];

// Timestamp function (Asia/Dhaka timezone)
function timestampForName() {
  return moment().tz("Asia/Dhaka").format("YYYY-MM-DD_HHmm");
}

// Check if sheet exists
async function sheetExists(sheetsApi, spreadsheetId, sheetName) {
  const res = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });
  return res.data.sheets?.some((s) => s.properties?.title === sheetName);
}

// Ensure unique backup title
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

// Main backup function
async function runBackup() {
  const spreadsheetId = DEFAULT_SPREADSHEET_ID;

  console.log("📌 DEBUG: Spreadsheet ID:", spreadsheetId);

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
  console.log("📂 Backup started:", ts);

  // Fetch all sheets metadata once
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });
  const allSheets = meta.data.sheets || [];

  for (const sheetName of SHEET_NAMES) {
    try {
      console.log("➡️ Checking sheet:", sheetName);
      const src = allSheets.find((s) => s.properties?.title === sheetName);
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

      console.log(`🔹 Duplicating "${sheetName}" as "${backupTitle}" ...`);
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

      // নতুন শীট আইডি বের করা
      const newMeta = await sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
      });
      const newSheet = newMeta.data.sheets.find(
        (s) => s.properties.title === backupTitle
      );

      if (newSheet) {
        // ফর্মুলা সরিয়ে শুধু ভ্যালু রেখে দেওয়া
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                copyPaste: {
                  source: {
                    sheetId: newSheet.properties.sheetId,
                  },
                  destination: {
                    sheetId: newSheet.properties.sheetId,
                  },
                  pasteType: "PASTE_VALUES",
                  pasteOrientation: "NORMAL",
                },
              },
            ],
          },
        });
      }

      console.log(`✅ Static snapshot created: ${backupTitle}`);
    } catch (err) {
      console.error(`❌ Error while backing up "${sheetName}":`, err);
    }
  }

  console.log("🏁 Backup finished:", moment().tz("Asia/Dhaka").format());
}

// CLI থেকে run করা হলে
if (require.main === module) {
  runBackup().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(2);
  });
}

module.exports = { runBackup };
