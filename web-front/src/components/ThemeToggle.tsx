import Icon from "./Icon";
import { useTheme } from "../context/ThemeContext";
import "./ThemeToggle.css";

type Props = {
  onDarkBar?: boolean;
};

export default function ThemeToggle({ onDarkBar = true }: Props) {
  const { scheme, setScheme } = useTheme();

  return (
    <div className={`theme-toggle${onDarkBar ? "" : " theme-toggle--on-light"}`}>
      <button
        type="button"
        className={`theme-toggle__btn${scheme === "light" ? " theme-toggle__btn--active" : ""}`}
        aria-label="Light mode"
        aria-pressed={scheme === "light"}
        onClick={() => setScheme("light")}
      >
        <Icon name={scheme === "light" ? "sunny" : "sunny-outline"} size={18} />
      </button>
      <button
        type="button"
        className={`theme-toggle__btn${scheme === "dark" ? " theme-toggle__btn--active" : ""}`}
        aria-label="Dark mode"
        aria-pressed={scheme === "dark"}
        onClick={() => setScheme("dark")}
      >
        <Icon name={scheme === "dark" ? "moon" : "moon-outline"} size={16} />
      </button>
    </div>
  );
}
