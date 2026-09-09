import { useState, type FormEvent } from "react";
import { accountDeletionUrl, isDesktopRuntime, privacyPolicyUrl } from "../api/config";
import { useAuth } from "../context/AuthContext";
import TextField from "../components/TextField";
import PrimaryButton from "../components/PrimaryButton";
import ThemeToggle from "../components/ThemeToggle";
import MpasatWordmark from "../components/MpasatWordmark";
import "./LoginScreen.css";

export default function LoginScreen() {
  const { login, register, signingIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    try {
      if (isRegister) {
        if (password !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        await register(fullName.trim(), phone.trim(), password);
      } else {
        await login(username.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isRegister ? "Registration failed" : "Login failed");
    }
  }

  return (
    <div className={isDesktopRuntime() ? "login login--desktop" : "login"}>
      <div className="login__theme-row">
        <ThemeToggle onDarkBar={false} />
      </div>

      <main className="login__body">
        <form className="login__card" onSubmit={handleSubmit}>
          <MpasatWordmark />
          <h1 className="login__title">{isRegister ? "Register" : "Sign in"}</h1>
          <p className="login__subtitle">
            {isRegister
              ? "Phone number is your login. Staff should sign in instead."
              : "Staff username or parent phone"}
          </p>

          <div className="login__form">
            {isRegister ? (
              <>
                <TextField
                  label="Full name"
                  value={fullName}
                  onChange={(ev) => setFullName(ev.target.value)}
                  autoComplete="name"
                  autoCapitalize="words"
                  placeholder="Your full name"
                />
                <TextField
                  label="Cameroon phone"
                  value={phone}
                  onChange={(ev) => setPhone(ev.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="6XX XX XX XX"
                />
              </>
            ) : (
              <TextField
                label="Username or phone"
                value={username}
                onChange={(ev) => setUsername(ev.target.value)}
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Staff username or parent phone"
              />
            )}
            <TextField
              label="Password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder={isRegister ? "At least 6 characters" : "Enter your password"}
              secureToggle
              autoComplete={isRegister ? "new-password" : "current-password"}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !isRegister) void handleSubmit();
              }}
            />
            {isRegister ? (
              <TextField
                label="Confirm password"
                value={confirm}
                onChange={(ev) => setConfirm(ev.target.value)}
                placeholder="Re-enter password"
                secureToggle
                autoComplete="new-password"
              />
            ) : null}

            {error ? (
              <div className="login__error" role="alert">
                {error}
              </div>
            ) : null}

            <PrimaryButton
              title={
                signingIn
                  ? isRegister
                    ? "Creating account…"
                    : "Signing in…"
                  : isRegister
                    ? "Create parent account"
                    : "Sign in"
              }
              loading={signingIn}
              fullWidth
              type="submit"
            />

            <button
              type="button"
              className="login__switch"
              onClick={() => {
                setError("");
                setMode(isRegister ? "login" : "register");
              }}
            >
              {isRegister ? "Already have an account? Sign in" : "I’m a parent — create an account"}
            </button>
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
