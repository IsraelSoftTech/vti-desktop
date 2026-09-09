import { useEffect, useState } from "react";

/** Live clock isolated so parent tabs do not re-render every second (breaks QR scanner). */
export default function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="take-attendance__time-value">
      {now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })}
    </span>
  );
}
