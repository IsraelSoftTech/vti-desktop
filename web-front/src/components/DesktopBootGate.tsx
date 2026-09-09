import { useEffect, useRef, useState, type ReactNode } from "react";
import { isDesktopRuntime } from "../api/config";
import { getDesktopSyncStatus, probeDesktopConnectivity, pullDesktopUpdates } from "../api/desktop";
import {
  ackDesktopSoftwareApplied,
  applyDesktopSoftwareUpdates,
  checkDesktopSoftwareUpdates,
  getDesktopSoftwareStatus,
  probeDesktopSoftwareManifest,
} from "../api/software";
import "./DesktopStartupSync.css";

type Phase =
  | "starting"
  | "syncing"
  | "syncDone"
  | "syncError"
  | "checking"
  | "updatesFound"
  | "installerRequired"
  | "applying"
  | "softwareDone"
  | "applyError"
  | "ready";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function initialPhase(): Phase {
  if (!isDesktopRuntime()) return "ready";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "ready";
  return "starting";
}

function CheckMark() {
  return (
    <span className="desktop-startup-sync__check" aria-hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path
          d="M20 6L9 17l-5-5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function DesktopBootGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [remoteVersion, setRemoteVersion] = useState("");
  const continueRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      setPhase("ready");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setPhase("ready");
      return;
    }

    let cancelled = false;

    function waitForContinue() {
      return new Promise<void>((resolve) => {
        continueRef.current = resolve;
      });
    }

    async function hold(ms: number, started: number) {
      const elapsed = Date.now() - started;
      if (elapsed < ms) await sleep(ms - elapsed);
    }

    async function runDataSync() {
      const syncStatus = await getDesktopSyncStatus();
      if (cancelled) return;
      if (!syncStatus?.paired) return;
      setPhase("syncing");
      const started = Date.now();
      try {
        const result = await pullDesktopUpdates();
        if (cancelled) return;
        if (result.skipped === "unpaired") return;
        if (result.skipped === "offline") {
          if (typeof navigator !== "undefined" && navigator.onLine) {
            setError(
              "Could not reach the school server. Check that the online attendance API is running."
            );
            setPhase("syncError");
            await waitForContinue();
          }
          return;
        }
        await hold(700, started);
        if (cancelled) return;
        setPhase("syncDone");
        await sleep(1400);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not download updates");
        setPhase("syncError");
        await waitForContinue();
      }
    }

    async function runSoftwareCheck() {
      setPhase("checking");
      const started = Date.now();
      const result = await checkDesktopSoftwareUpdates();
      await hold(700, started);
      if (cancelled) return;
      if (result.currentVersion) setVersion(result.currentVersion);
      if (result.status === "updatesFound") {
        setNotes(result.notes);
        setRemoteVersion(result.remoteVersion);
        setPhase("updatesFound");
        return;
      }
      if (result.status === "installerRequired") {
        setNotes(result.notes);
        setRemoteVersion(result.remoteVersion);
        setError(result.message || "This update needs a new MPASAT installer.");
        setPhase("installerRequired");
        return;
      }
      setPhase("ready");
    }

    async function run() {
      const status = await getDesktopSoftwareStatus();
      if (cancelled) return;
      if (status?.currentVersion) setVersion(status.currentVersion);

      if (status?.justApplied) {
        setPhase("softwareDone");
        await ackDesktopSoftwareApplied();
        await sleep(1400);
        if (!cancelled) setPhase("ready");
        return;
      }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setPhase("ready");
        return;
      }

      const [cloudOk, githubOk] = await Promise.all([
        probeDesktopConnectivity(),
        probeDesktopSoftwareManifest(),
      ]);
      if (cancelled) return;
      if (!cloudOk && !githubOk) {
        setPhase("ready");
        return;
      }

      await runDataSync();
      if (cancelled) return;
      await runSoftwareCheck();
    }

    void run();
    return () => {
      cancelled = true;
      const resume = continueRef.current;
      continueRef.current = null;
      resume?.();
    };
  }, []);

  function openLogin() {
    continueRef.current = null;
    setPhase("ready");
  }

  function handleContinue() {
    const resume = continueRef.current;
    continueRef.current = null;
    resume?.();
  }

  async function handleUpdateNow() {
    setError("");
    setPhase("applying");
    try {
      const result = await applyDesktopSoftwareUpdates();
      if (result.ok) return;
      setError(result.error || "Could not apply software updates");
      setPhase("applyError");
    } catch {
      /* Window reload replaces this page. The new boot gate shows Software Updates Done. */
    }
  }

  if (phase === "ready") return <>{children}</>;

  const busy =
    phase === "starting" ||
    phase === "syncing" ||
    phase === "checking" ||
    phase === "applying";

  return (
    <div
      className="desktop-startup-sync"
      role="status"
      aria-live="polite"
      aria-busy={busy}
    >
      <div className="desktop-startup-sync__card">
        {phase === "starting" ? (
          <>
            <span className="desktop-startup-sync__spinner" aria-hidden />
            <h1 className="desktop-startup-sync__title">Starting…</h1>
            <p className="desktop-startup-sync__copy">Preparing this PC.</p>
          </>
        ) : null}

        {phase === "syncing" ? (
          <>
            <span className="desktop-startup-sync__spinner" aria-hidden />
            <h1 className="desktop-startup-sync__title">Syncing updates</h1>
            <p className="desktop-startup-sync__copy">
              Checking the school server for the latest records…
            </p>
          </>
        ) : null}

        {phase === "syncDone" ? (
          <>
            <CheckMark />
            <h1 className="desktop-startup-sync__title">Sync Done</h1>
            <p className="desktop-startup-sync__copy">Records are up to date.</p>
          </>
        ) : null}

        {phase === "checking" ? (
          <>
            <span className="desktop-startup-sync__spinner" aria-hidden />
            <h1 className="desktop-startup-sync__title">Checking for software updates</h1>
            <p className="desktop-startup-sync__copy">
              Looking on GitHub for a newer desktop version…
            </p>
          </>
        ) : null}

        {phase === "updatesFound" ? (
          <>
            <h1 className="desktop-startup-sync__title">Updates Found</h1>
            {notes.length ? (
              <ul className="desktop-startup-sync__notes">
                {notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="desktop-startup-sync__copy">A newer desktop version is ready.</p>
            )}
            {remoteVersion ? (
              <p className="desktop-startup-sync__copy">
                Version {version || "—"} → {remoteVersion}
              </p>
            ) : null}
            <div className="desktop-startup-sync__actions">
              <button type="button" className="desktop-startup-sync__continue" onClick={() => void handleUpdateNow()}>
                Update Now
              </button>
              <button type="button" className="desktop-startup-sync__skip" onClick={openLogin}>
                Skip
              </button>
            </div>
          </>
        ) : null}

        {phase === "installerRequired" ? (
          <>
            <h1 className="desktop-startup-sync__title">Installer needed</h1>
            <p className="desktop-startup-sync__copy">{error}</p>
            {remoteVersion ? (
              <p className="desktop-startup-sync__copy">
                Version {version || "—"} → {remoteVersion}
              </p>
            ) : null}
            <div className="desktop-startup-sync__actions">
              <button type="button" className="desktop-startup-sync__skip" onClick={openLogin}>
                Skip
              </button>
            </div>
          </>
        ) : null}

        {phase === "applying" ? (
          <>
            <span className="desktop-startup-sync__spinner" aria-hidden />
            <h1 className="desktop-startup-sync__title">Updating software…</h1>
            <p className="desktop-startup-sync__copy">Please wait while this PC is updated.</p>
          </>
        ) : null}

        {phase === "softwareDone" ? (
          <>
            <CheckMark />
            <h1 className="desktop-startup-sync__title">Software Updates Done</h1>
            <p className="desktop-startup-sync__copy">Opening the login screen…</p>
          </>
        ) : null}

        {phase === "syncError" ? (
          <>
            <h1 className="desktop-startup-sync__title">Working on this PC</h1>
            <p className="desktop-startup-sync__copy">{error}</p>
            <button type="button" className="desktop-startup-sync__continue" onClick={handleContinue}>
              Continue
            </button>
          </>
        ) : null}

        {phase === "applyError" ? (
          <>
            <h1 className="desktop-startup-sync__title">Working on this PC</h1>
            <p className="desktop-startup-sync__copy">{error}</p>
            <button type="button" className="desktop-startup-sync__continue" onClick={openLogin}>
              Continue
            </button>
          </>
        ) : null}

        {version ? <p className="desktop-startup-sync__version">Version {version}</p> : null}
      </div>
    </div>
  );
}
