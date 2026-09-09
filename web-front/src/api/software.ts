function softwareBridge() {
  return window.mpasatDesktop?.software;
}

export async function getDesktopSoftwareStatus() {
  const bridge = softwareBridge();
  if (!bridge) return null;
  return bridge.status();
}

export async function checkDesktopSoftwareUpdates(): Promise<SoftwareCheckResult> {
  const bridge = softwareBridge();
  if (!bridge) {
    return {
      status: "checkFailed",
      currentVersion: "",
      remoteVersion: "",
      shellVersion: "",
      notes: [],
      message: "Not running as the desktop app",
    };
  }
  return bridge.check();
}

export async function applyDesktopSoftwareUpdates(): Promise<SoftwareApplyResult> {
  const bridge = softwareBridge();
  if (!bridge) {
    return { ok: false, error: "Not running as the desktop app" };
  }
  return bridge.apply();
}

export async function probeDesktopSoftwareManifest() {
  const bridge = softwareBridge();
  if (!bridge?.probe) return false;
  try {
    const result = await bridge.probe();
    return Boolean(result.reachable);
  } catch {
    return false;
  }
}

export async function ackDesktopSoftwareApplied() {
  const bridge = softwareBridge();
  if (!bridge?.ackApplied) return null;
  return bridge.ackApplied();
}
