import Icon from "../components/Icon";
import ThemeToggle from "../components/ThemeToggle";
import AppTopBarActions from "../components/AppTopBarActions";
import "./StaffHeader.css";

type Props = {
  subtitle: string;
  pageTitle: string;
  menuOpen: boolean;
  onOpenMenu: () => void;
  notificationCount?: number;
  onNotificationsPress?: () => void;
};

export default function StaffHeader({
  subtitle,
  pageTitle,
  menuOpen,
  onOpenMenu,
  notificationCount = 0,
  onNotificationsPress,
}: Props) {
  return (
    <header className="staff-header">
      <h1 className="staff-header__sr">{pageTitle}</h1>
      <div className="staff-header__start">
        <button
          type="button"
          className="staff-header__menu"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={onOpenMenu}
        >
          <Icon name="menu" size={22} />
        </button>
        <div className="staff-header__brand">
          <div className="staff-header__logo">
            <Icon name="shield-checkmark" size={22} />
          </div>
          <div>
            <p className="staff-header__name">MPASAT</p>
            <p className="staff-header__tag">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="staff-header__actions">
        <ThemeToggle />
        <AppTopBarActions
          variant="gradient"
          notificationCount={notificationCount}
          onNotificationsPress={onNotificationsPress}
        />
      </div>
    </header>
  );
}
