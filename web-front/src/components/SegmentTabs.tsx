import "./SegmentTabs.css";

type Tab<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
};

export default function SegmentTabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="segment-tabs" role="tablist" aria-label="Sections">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`segment-tabs__item${isActive ? " segment-tabs__item--active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
