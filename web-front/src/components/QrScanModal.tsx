import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import Icon from "./Icon";
import {
  buildCameraCandidates,
  scanConfigForCamera,
  scanTimeoutMs,
  scanTimeoutSeconds,
} from "../utils/qrCamera";
import "./QrScanModal.css";

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  onTimeout: () => void;
};

function waitForElement(id: string, attempts = 20): Promise<void> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      if (document.getElementById(id)) {
        resolve();
        return;
      }
      n += 1;
      if (n >= attempts) {
        reject(new Error("Scanner view not ready"));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export default function QrScanModal({ visible, onClose, onScanned, onTimeout }: Props) {
  const regionId = useId().replace(/:/g, "");
  const readerId = `qr-reader-${regionId}`;
  const [secondsLeft, setSecondsLeft] = useState(scanTimeoutSeconds);
  const [status, setStatus] = useState("Opening camera…");
  const [error, setError] = useState<string | null>(null);
  const lockedRef = useRef(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);

  const onScannedRef = useRef(onScanned);
  const onTimeoutRef = useRef(onTimeout);
  const onCloseRef = useRef(onClose);
  onScannedRef.current = onScanned;
  onTimeoutRef.current = onTimeout;
  onCloseRef.current = onClose;

  function finishTimers() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      /* ignore */
    }
    try {
      await scanner.clear();
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!visible) {
      lockedRef.current = false;
      startingRef.current = false;
      finishTimers();
      void stopScanner();
      return;
    }

    lockedRef.current = false;
    startingRef.current = true;
    setError(null);
    setStatus("Opening camera…");
    setSecondsLeft(scanTimeoutSeconds());

    let cancelled = false;
    const timeoutMs = scanTimeoutMs();

    (async () => {
      try {
        await waitForElement(readerId);
        if (cancelled) return;

        await stopScanner();
        if (cancelled) return;

        const cameras = await buildCameraCandidates();
        if (cancelled) return;

        let started = false;
        let lastErr: unknown = null;

        for (const camera of cameras) {
          if (cancelled) break;

          const scanner = new Html5Qrcode(readerId, {
            verbose: false,
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            useBarCodeDetectorIfSupported: true,
          });
          scannerRef.current = scanner;

          try {
            await scanner.start(
              camera,
              scanConfigForCamera(camera),
              (decoded) => {
                if (lockedRef.current || cancelled) return;
                const code = decoded.trim();
                if (!code) return;
                lockedRef.current = true;
                finishTimers();
                void stopScanner();
                onScannedRef.current(code);
              },
              () => {}
            );
            started = true;
            break;
          } catch (e) {
            lastErr = e;
            await stopScanner();
          }
        }

        if (cancelled) {
          await stopScanner();
          return;
        }

        if (!started) {
          throw lastErr ?? new Error("Could not start the camera.");
        }

        startingRef.current = false;
        setStatus("Point at the student ID QR code");

        timeoutRef.current = setTimeout(() => {
          if (lockedRef.current || cancelled) return;
          finishTimers();
          void stopScanner();
          onTimeoutRef.current();
        }, timeoutMs);

        tickRef.current = setInterval(() => {
          setSecondsLeft((s) => Math.max(0, s - 1));
        }, 1000);
      } catch (e) {
        if (cancelled) return;
        startingRef.current = false;
        const msg =
          e instanceof Error ? e.message : "Could not access the camera. Check permissions.";
        setError(msg);
        setStatus("Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      lockedRef.current = false;
      startingRef.current = false;
      finishTimers();
      void stopScanner();
    };
    // Only restart when the modal opens/closes — not when parent re-renders (live clock).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, readerId]);

  if (!visible) return null;

  return (
    <div className="qr-scan" role="dialog" aria-modal="true" aria-label="Scan ID QR Code">
      <div className="qr-scan__top">
        <div>
          <h2 className="qr-scan__title">Scan ID QR Code</h2>
          <p className="qr-scan__sub">Camera · {secondsLeft}s remaining</p>
        </div>
        <button
          type="button"
          className="qr-scan__close"
          aria-label="Close"
          onClick={() => onCloseRef.current()}
        >
          <Icon name="close" size={22} />
        </button>
      </div>

      <div className="qr-scan__camera-wrap">
        <div id={readerId} className="qr-scan__reader" />
        <div className="qr-scan__frame" aria-hidden />
        {error ? <p className="qr-scan__error">{error}</p> : null}
      </div>

      <p className="qr-scan__hint">{status}</p>
      <p className="qr-scan__tip">
        Fill the frame with the QR code, hold steady, and use good light. Printed cards work best.
      </p>
    </div>
  );
}
