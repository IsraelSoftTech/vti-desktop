import Icon from "../components/Icon";
import AnnouncementPane from "./AnnouncementPane";
import "../styles/pagePanel.css";
import "./MessagesScreen.css";

export default function AnnouncementScreen() {
  return (
    <div className="page-panel">
      <div className="page-panel__inner messages-screen">
        <header className="reports-hero">
          <Icon name="megaphone-outline" size={28} />
          <div>
            <h2 className="reports-hero__title">Announcement</h2>
            <p className="reports-hero__sub">
              One message to guardians by SMS and/or the parent-app inbox.
            </p>
          </div>
        </header>
        <AnnouncementPane />
      </div>
    </div>
  );
}
