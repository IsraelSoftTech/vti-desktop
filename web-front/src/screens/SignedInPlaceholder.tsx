import Icon from "../components/Icon";
import AppTopBarActions from "../components/AppTopBarActions";
import { isAccountant } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import "./SignedInPlaceholder.css";

/** Temporary shell until web fee screens mirror mobile accountant tabs. */
export default function SignedInPlaceholder() {
  const { user } = useAuth();
  const roleLabel = isAccountant(user) ? "Accountant" : "Administrator";

  return (
    <div className="signed-in">
      <header className="signed-in__bar">
        <div className="signed-in__brand-row">
          <div className="signed-in__logo">
            <Icon name="shield-checkmark" size={22} />
          </div>
          <div>
            <p className="signed-in__brand">MPASAT</p>
            <p className="signed-in__tag">Attendance System</p>
          </div>
        </div>
        <AppTopBarActions variant="gradient" notificationCount={0} />
      </header>
      <main className="signed-in__main">
        <h1>Signed in</h1>
        <p>
          {user?.fullName || user?.username}{" "}
          <span className="signed-in__muted">
            (@{user?.username} · {roleLabel})
          </span>
        </p>
        <p className="signed-in__hint">
          The rest of the web portal will mirror the mobile app here next. Use the profile icon
          above for account options and logout.
        </p>
      </main>
    </div>
  );
}
