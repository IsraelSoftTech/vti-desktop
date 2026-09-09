const fs = require("fs");
const path = require("path");

/**
 * Write google-services.json from an EAS secret when the file is not on disk.
 * Accepts raw JSON or base64. Never invents a fake Firebase config.
 */
function resolveGoogleServicesFile() {
  const dest = path.join(__dirname, "google-services.json");
  if (!fs.existsSync(dest) && process.env.GOOGLE_SERVICES_JSON) {
    const raw = String(process.env.GOOGLE_SERVICES_JSON).trim();
    const text = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    if (text.trim().startsWith("{")) {
      fs.writeFileSync(dest, text);
    }
  }
  if (!fs.existsSync(dest)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(dest, "utf8"));
    if (!parsed?.project_info?.project_id) return null;
  } catch {
    return null;
  }
  return "./google-services.json";
}

module.exports = () => {
  const app = JSON.parse(JSON.stringify(require("./app.json")));
  const expo = app.expo;
  const googleServicesFile = resolveGoogleServicesFile();
  if (googleServicesFile) {
    expo.android = {
      ...expo.android,
      googleServicesFile,
    };
  }
  return expo;
};
