import { useState, type FormEvent } from "react";
import { accountDeletionUrl, isDesktopRuntime, privacyPolicyUrl } from "../api/config";
import { useAuth } from "../context/AuthContext";
import TextField from "../components/TextField";
import PrimaryButton from "../components/PrimaryButton";
import ThemeToggle from "../components/ThemeToggle";
import MpasatWordmark from "../components/MpasatWordmark";
import "./LoginScreen.css";

export default function LoginScreen() {
  const { login, monitor, signingIn } = useAuth();
  const [mode, setMode] = useState<"login" | "monitor">("login");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const desktop = isDesktopRuntime();
  const isMonitor = mode === "monitor" && !desktop;

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    try {
      if (isMonitor) {
        await monitor(phone.trim());
      } else {
        await login(username.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isMonitor ? "Could not open parent access" : "Login failed");
    }
  }

  return (
    <div className={desktop ? "login login--desktop" : "login"}>
      <div className="login__theme-row">
        <ThemeToggle onDarkBar={false} />
      </div>

      <main className="login__body">
        <form className="login__card" onSubmit={handleSubmit}>
          <MpasatWordmark />
          <h1 className="login__title">{isMonitor ? "Monitor my child" : "Sign in"}</h1>
          <p className="login__subtitle">
            {isMonitor
              ? "Enter Phone Number as seen on student’s ID Card"
              : "Staff username or parent phone"}
          </p>

          <div className="login__form">
            {isMonitor ? (
              <TextField
                label="Phone number"
                value={phone}
                onChange={(ev) => setPhone(ev.target.value)}
                autoComplete="tel"
                inputMode="tel"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="6XX XX XX XX"
              />
            ) : (
              <>
                <TextField
                  label="Username or phone"
                  value={username}
                  onChange={(ev) => setUsername(ev.target.value)}
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="Staff username or parent phone"
                />
                <TextField
                  label="Password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  placeholder="Enter your password"
                  secureToggle
                  autoComplete="current-password"
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") void handleSubmit();
                  }}
                />
              </>
            )}

            {error ? (
              <div className="login__error" role="alert">
                {error}
              </div>
            ) : null}

            <PrimaryButton
              title={
                signingIn
                  ? isMonitor
                    ? "Opening…"
                    : "Signing in…"
                  : isMonitor
                    ? "Proceed"
                    : "Sign in"
              }
              loading={signingIn}
              fullWidth
              type="submit"
            />

            {desktop ? null : (
              <button
                type="button"
                className="login__switch"
                onClick={() => {
                  setError("");
                  setMode(isMonitor ? "login" : "monitor");
                }}
              >
                {isMonitor ? "Staff sign in" : "I’m a parent — Monitor My Child"}
              </button>
            )}
          </div>
        </form>

        <a className="login__legal" href={privacyPolicyUrl()} target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
        <a className="login__legal" href={accountDeletionUrl()} target="_blank" rel="noreferrer">
          Request data deletion
        </a>
      </main>
    </div>
  );
}
