import "../styles/pagePanel.css";

type Props = {
  subtitle?: string;
};

/** Placeholder for routes not yet ported — shell header shows the page name. */
export default function PlaceholderScreen({ subtitle }: Props) {
  return (
    <div className="page-panel">
      <div className="page-panel__inner">
        <div className="ui-card">
          <p className="ui-card__sub" style={{ marginBottom: 0 }}>
            {subtitle || "This section will be built next."}
          </p>
        </div>
      </div>
    </div>
  );
}
