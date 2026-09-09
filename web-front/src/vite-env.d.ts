/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DESKTOP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type SoftwareCheckStatus =
  | "upToDate"
  | "updatesFound"
  | "installerRequired"
  | "checkFailed";

type SoftwareCheckResult = {
  status: SoftwareCheckStatus;
  currentVersion: string;
  remoteVersion: string;
  shellVersion: string;
  notes: string[];
  message?: string;
  manifestUrl?: string;
};

type SoftwareStatusResult = {
  currentVersion: string;
  shellVersion: string;
  installedCommit: string;
  justApplied: boolean;
  lastCheckAt: string | null;
  manifestUrl: string;
};

type SoftwareApplyResult = {
  ok: boolean;
  error?: string;
};

interface Window {
  mpasatDesktop?: {
    runtime?: string;
    software?: {
      check: () => Promise<SoftwareCheckResult>;
      status: () => Promise<SoftwareStatusResult>;
      apply: () => Promise<SoftwareApplyResult>;
      probe: () => Promise<{ reachable: boolean }>;
      ackApplied: () => Promise<SoftwareStatusResult>;
    };
  };
}
