function isDesktop() {
  return process.env.ATTENDANCE_RUNTIME === 'desktop';
}

function userDataDir() {
  return process.env.ATTENDANCE_USER_DATA || process.cwd();
}

function mediaRoot() {
  const path = require('path');
  return path.join(userDataDir(), 'media');
}

function sqlitePath() {
  const path = require('path');
  return path.join(userDataDir(), 'data.sqlite');
}

module.exports = {
  isDesktop,
  userDataDir,
  mediaRoot,
  sqlitePath,
};
