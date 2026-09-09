export type IconName =
  | "people-outline"
  | "trending-up-outline"
  | "school-outline"
  | "shield-checkmark"
  | "notifications-outline"
  | "person-circle-outline"
  | "log-out-outline"
  | "lock-closed-outline"
  | "home"
  | "home-outline"
  | "people"
  | "school"
  | "clipboard"
  | "clipboard-outline"
  | "grid"
  | "grid-outline"
  | "menu"
  | "close"
  | "calendar-outline"
  | "time-outline"
  | "checkmark-circle"
  | "alert-circle"
  | "log-in-outline"
  | "log-out-outline"
  | "scan-outline"
  | "analytics-outline"
  | "speedometer-outline"
  | "settings"
  | "settings-outline"
  | "cash-outline"
  | "cash"
  | "scan"
  | "wallet-outline"
  | "checkmark-circle-outline"
  | "alert-circle-outline"
  | "information-circle"
  | "qr-code"
  | "chevron-forward"
  | "list-outline"
  | "chatbubbles-outline"
  | "chatbubbles"
  | "checkmark-done"
  | "mic-outline"
  | "attach-outline"
  | "document-outline"
  | "image-outline"
  | "play"
  | "send"
  | "arrow-back"
  | "happy-outline"
  | "sunny"
  | "sunny-outline"
  | "moon"
  | "moon-outline"
  | "card"
  | "card-outline"
  | "barcode-outline"
  | "trash-outline"
  | "trash-bin-outline"
  | "person"
  | "add"
  | "remove"
  | "chevron-back"
  | "close-circle-outline"
  | "enter-outline"
  | "exit-outline"
  | "chatbubble-ellipses-outline"
  | "megaphone"
  | "megaphone-outline"
  | "document-text-outline";

type Props = { name: IconName; size?: number; className?: string };

export default function Icon({ name, size = 22, className = "" }: Props) {
  const common = {
    width: size,
    height: size,
    className,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "people-outline":
    case "people":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          {name === "people" ? (
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-8-3.5z" />
          ) : (
            <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45v1.5h6v-2c0-2.66-5.33-4-8-4z" />
          )}
        </svg>
      );
    case "trending-up-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 17l6-6 4 4 8-10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 5h7v7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "school-outline":
    case "school":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3L1 9l4 2v8h6v-6h2v6h6v-8l4-2-11-6zm0 2.18L18.82 9 12 12.82 5.18 9 12 5.18z" />
        </svg>
      );
    case "shield-checkmark":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2 4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1.06 13.54-3.54-3.54 1.41-1.41 2.13 2.13 4.13-4.13 1.41 1.41-5.54 5.54z" />
        </svg>
      );
    case "notifications-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" />
        </svg>
      );
    case "person-circle-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 11a3 3 0 100-6 3 3 0 000 6zM6.2 18.4c.8-2.2 3.2-3.4 5.8-3.4s5 1.2 5.8 3.4" strokeLinecap="round" />
        </svg>
      );
    case "log-out-outline":
    case "exit-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "lock-closed-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
        </svg>
      );
    case "home":
    case "home-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill={name === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={name === "home" ? 0 : 2}>
          {name === "home" ? (
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
          ) : (
            <path d="M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      );
    case "clipboard":
    case "clipboard-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" fill={name === "clipboard" ? "currentColor" : "none"} />
        </svg>
      );
    case "grid":
    case "grid-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill={name === "grid" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={name === "grid" ? 0 : 2}>
          {name === "grid" ? (
            <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
          ) : (
            <>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </>
          )}
        </svg>
      );
    case "menu":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      );
    case "close":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      );
    case "calendar-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
      );
    case "time-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "checkmark-circle":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.59-4.24-4.24 1.41-1.41L11 13.76l6.83-6.83 1.41 1.41L11 16.59z" />
        </svg>
      );
    case "alert-circle":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      );
    case "log-in-outline":
    case "enter-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "scan-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2" strokeLinecap="round" />
          <path d="M7 12h10" strokeLinecap="round" />
        </svg>
      );
    case "analytics-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" strokeLinecap="round" />
          <path d="M7 14l4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "speedometer-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 14l3-3" strokeLinecap="round" />
          <path d="M12 3a9 9 0 109 9" strokeLinecap="round" />
        </svg>
      );
    case "settings-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path
            d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            strokeLinecap="round"
          />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.52-.4-1.08-.73-1.69-.98l-.36-2.54A.484.484 0 0014 2h-4c-.25 0-.46.18-.49.42l-.36 2.54c-.61.25-1.17.59-1.69.98l-2.39-.96a.488.488 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.52.4 1.08.73 1.69.98l.36 2.54c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.36-2.54c.61-.25 1.17-.59 1.69-.98l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
        </svg>
      );
    case "cash-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 10h.01M18 14h.01" strokeLinecap="round" />
        </svg>
      );
    case "card":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
        </svg>
      );
    case "card-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case "cash":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 7H2a1 1 0 00-1 1v8a1 1 0 001 1h20a1 1 0 001-1V8a1 1 0 00-1-1zm-2 5h-2v2h-2v-2h-2v-2h2V8h2v2h2v2z" />
        </svg>
      );
    case "scan":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 7V5a2 2 0 012-2h2v2H6v2H4zm16 0V5h-2V3h2a2 2 0 012 2v2h-2v2h-2zM4 17v2h2v2H4a2 2 0 01-2-2v-2h2v-2h2zm16 4h-2v-2h2v-2h2v2a2 2 0 01-2 2zm-8-6h8v2H12v-2z" />
        </svg>
      );
    case "wallet-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2z" strokeLinecap="round" />
          <path d="M16 12h4M3 10V8a2 2 0 012-2h14" strokeLinecap="round" />
        </svg>
      );
    case "checkmark-circle-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "alert-circle-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </svg>
      );
    case "information-circle":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
      );
    case "qr-code":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h2v2h-2v-2zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zm2-6h2v2h-2v-2zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z" />
        </svg>
      );
    case "chevron-forward":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "list-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
          <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "chatbubbles":
    case "chatbubbles-outline":
    case "chatbubble-ellipses-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill={name === "chatbubbles" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={name === "chatbubbles" ? 0 : 2}>
          {name === "chatbubbles" ? (
            <path d="M4 4h12a2 2 0 012 2v7a2 2 0 01-2 2H9l-5 4V6a2 2 0 012-2zm14 4h2a2 2 0 012 2v9l-4-3h-6a2 2 0 01-1.73-1" />
          ) : (
            <>
              <path d="M5 5h11a2 2 0 012 2v6a2 2 0 01-2 2H9l-4 3V7a2 2 0 012-2z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 8h.5A1.5 1.5 0 0121 9.5V16l-2.5-2H15" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
        </svg>
      );
    case "megaphone":
    case "megaphone-outline":
      return (
        <svg
          {...common}
          viewBox="0 0 24 24"
          fill={name === "megaphone" ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={name === "megaphone" ? 0 : 2}
        >
          <path d="M3 11v2a1 1 0 001 1h2l6 5V5L6 10H4a1 1 0 00-1 1z" strokeLinejoin="round" />
          {name === "megaphone-outline" ? (
            <path d="M16 9.5a3.5 3.5 0 010 5M18.5 8a6 6 0 010 8" strokeLinecap="round" />
          ) : (
            <path d="M16 9.5a3.5 3.5 0 010 5M18.5 8a6 6 0 010 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      );
    case "checkmark-done":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M2.5 12.5l3.5 3.5L13 8.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 15.5l2 2L21.5 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "mic-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0014 0M12 18v3" strokeLinecap="round" />
        </svg>
      );
    case "attach-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.4 11.6l-8.5 8.5a6 6 0 01-8.5-8.5l8.5-8.5a4 4 0 015.7 5.7l-8.5 8.5a2 2 0 01-2.8-2.8l7.8-7.8" strokeLinecap="round" />
        </svg>
      );
    case "document-outline":
    case "document-text-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "image-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M21 16l-5-5-8 8" strokeLinecap="round" />
        </svg>
      );
    case "play":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      );
    case "send":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 11.5L21 4l-7.5 18-2.2-7.3L3 11.5z" />
        </svg>
      );
    case "arrow-back":
    case "chevron-back":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 6l-6 6 6 6M9 12h12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "happy-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 10h.01M15.5 10h.01M8 15c1.2 1.3 2.5 2 4 2s2.8-.7 4-2" strokeLinecap="round" />
        </svg>
      );
    case "sunny":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "sunny-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 14.3A9 9 0 1110.2 3a7 7 0 0010.8 11.3z" />
        </svg>
      );
    case "moon-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 14.3A9 9 0 1110.2 3a7 7 0 0010.8 11.3z" strokeLinejoin="round" />
        </svg>
      );
    case "barcode-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6v12M7 6v12M9 6v12M13 6v12M16 6v12M20 6v12" strokeLinecap="round" />
        </svg>
      );
    case "trash-outline":
    case "trash-bin-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "person":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z" />
        </svg>
      );
    case "add":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      );
    case "remove":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M5 12h14" strokeLinecap="round" />
        </svg>
      );
    case "close-circle-outline":
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
