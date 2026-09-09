import { Html5Qrcode } from "html5-qrcode";

const BACK_LABEL = /back|rear|environment|rück|trás|arrière|wide|camera 2|camera2/i;

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function cameraAccessError(e: unknown): Error {
  const err = e as DOMException & { message?: string };
  if (err?.name === "NotAllowedError") {
    return new Error(
      "Camera blocked. Click Allow in the browser prompt, or enable camera access for this site in settings."
    );
  }
  if (err?.name === "NotFoundError") {
    return new Error("No camera found. Connect a webcam or use a phone with Expo Go to scan.");
  }
  if (err?.name === "NotReadableError") {
    return new Error("Camera is busy. Close other apps using the camera and try again.");
  }
  if (err?.name === "SecurityError" || !window.isSecureContext) {
    return new Error(
      "Camera needs a secure page. Use http://localhost:5173 (not your LAN IP over plain HTTP)."
    );
  }
  if (e instanceof Error && e.message) return e;
  return new Error("Could not access the camera. Check permissions.");
}

/** Prompt once so enumerateDevices / getCameras can see labels and devices. */
async function ensureCameraPermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support camera access. Try Chrome or Edge.");
  }
  if (!window.isSecureContext) {
    throw cameraAccessError(new DOMException("insecure", "SecurityError"));
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch (e) {
    throw cameraAccessError(e);
  }
  stream.getTracks().forEach((t) => t.stop());
}

/**
 * Ordered camera options for html5-qrcode.start() — try each until one works.
 */
export async function buildCameraCandidates(): Promise<(string | MediaTrackConstraints)[]> {
  await ensureCameraPermission();

  const candidates: (string | MediaTrackConstraints)[] = [];
  const seen = new Set<string>();

  function add(c: string | MediaTrackConstraints) {
    const key = typeof c === "string" ? c : JSON.stringify(c);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(c);
  }

  if (isIOS()) {
    add({ facingMode: "environment" });
    add({ facingMode: "user" });
    return candidates;
  }

  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras?.length) {
      const labeledBack = cameras.find((c) => BACK_LABEL.test(c.label));
      if (labeledBack) add(labeledBack.id);
      for (const cam of cameras) add(cam.id);
    }
  } catch {
    /* fall through to facingMode */
  }

  // Laptops / desktops usually only have a front-facing webcam
  add({ facingMode: "user" });
  add({ facingMode: "environment" });

  return candidates;
}

/** @deprecated use buildCameraCandidates — kept for tests / single-shot use */
export async function resolveBackCamera(): Promise<string | MediaTrackConstraints> {
  const list = await buildCameraCandidates();
  return list[0];
}

export function scanConfigForCamera(camera: string | MediaTrackConstraints) {
  const base: {
    fps: number;
    disableFlip: boolean;
    videoConstraints?: MediaTrackConstraints;
  } = {
    fps: 15,
    disableFlip: false,
  };

  if (typeof camera === "string") {
    return base;
  }

  const raw = camera.facingMode;
  const facing =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw[0]
        : raw && typeof raw === "object" && "ideal" in raw
          ? (raw as ConstrainDOMStringParameters).ideal
          : undefined;

  base.videoConstraints = {
    facingMode: facing === "user" ? { ideal: "user" } : { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  return base;
}

/** Give enough time to aim; desktop web decoding is slower than native. */
export function scanTimeoutMs() {
  if (isIOS()) return 20_000;
  if (typeof navigator !== "undefined" && /Android|Mobile/i.test(navigator.userAgent)) {
    return 15_000;
  }
  return 30_000;
}

export function scanTimeoutSeconds() {
  return Math.ceil(scanTimeoutMs() / 1000);
}
