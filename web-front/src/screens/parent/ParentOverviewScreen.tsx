import { useCallback } from "react";
import Icon from "../../components/Icon";
import { getParentOverview, type ParentOverview, type ParentOverviewTrend } from "../../api/parent";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { useAuth } from "../../context/AuthContext";
import { useParentInbox } from "../../layout/ParentInboxContext";
import { formatMoney } from "../../utils/currency";
import "./parentScreens.css";

function TrendChart({ trend, emptyText }: { trend: ParentOverviewTrend[]; emptyText: string }) {
  return (
    <div className="parent-card">
      <div>
        <p className="parent-card__kicker">Last 7 school days</p>
        <h2 className="parent-card__title">Daily attendance</h2>
      </div>
      {trend.length === 0 ? (
        <p className="parent-settings__hint" style={{ textAlign: "center", padding: "24px 0" }}>
          {emptyText}
        </p>
      ) : (
        <div className="parent-chart">
          {trend.map((day) => {
            const h = Math.max(8, Math.round((day.rate / 100) * 112));
            return (
              <div key={day.date} className="parent-chart__col">
                <span className="parent-chart__pct">{day.rate}%</span>
                <div className="parent-chart__track">
                  <div
                    className={`parent-chart__bar${day.rate >= 80 ? " parent-chart__bar--ok" : " parent-chart__bar--mid"}`}
                    style={{ height: h }}
                  />
                </div>
                <span className="parent-chart__label">{day.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ParentOverviewScreen() {
  const { user } = useAuth();
  const { navigate } = useParentInbox();
  const loader = useCallback(() => getParentOverview(), []);
  const { data, loading, error } = useCachedQuery<ParentOverview>(loader, {
    cacheKey: "parent-overview",
    maxAgeMs: 20_000,
  });

  const fees = data?.fees;

  return (
    <div className="parent-page">
      <div className="parent-page__inner">
        <div>
          <p className="parent-hello__kicker">Overview</p>
          <h1 className="parent-hello__title">{user?.fullName || "Parent"}</h1>
        </div>

        {error && !data ? <div className="parent-error">{error}</div> : null}

        {loading && !data ? (
          <div className="parent-skeleton" style={{ height: 220 }} />
        ) : (
          <>
            <div className="parent-stat-row">
              <div className="parent-stat">
                <div className="parent-stat__icon parent-stat__icon--people">
                  <Icon name="people" size={18} />
                </div>
                <p className="parent-stat__value">{data?.monitoredCount ?? 0}</p>
                <p className="parent-stat__label">Monitored</p>
              </div>
              <div className="parent-stat">
                <div className="parent-stat__icon parent-stat__icon--ok">
                  <Icon name="checkmark-done" size={18} />
                </div>
                <p className="parent-stat__value">{data?.attendanceRate ?? 0}%</p>
                <p className="parent-stat__label">Recent rate</p>
              </div>
            </div>
            <p className="parent-caption">
              {data?.presentCount ?? 0} check-ins of {data?.expectedCount ?? 0} expected over the last 7
              school days
            </p>

            <button type="button" className="parent-card parent-card--tap" onClick={() => navigate("Fees")}>
              <div className="parent-card__head">
                <div>
                  <p className="parent-card__kicker">Fees</p>
                  <h2 className="parent-card__title">Overall balance</h2>
                </div>
                <Icon name="chevron-forward" size={18} />
              </div>
              <div className="parent-fee-row">
                <div>
                  <p className="parent-fee-box__val">{formatMoney(fees?.totalExpected ?? 0)}</p>
                  <p className="parent-fee-box__lbl">Expected</p>
                </div>
                <div>
                  <p className="parent-fee-box__val" style={{ color: "var(--color-success)" }}>
                    {formatMoney(fees?.totalPaid ?? 0)}
                  </p>
                  <p className="parent-fee-box__lbl">Paid</p>
                </div>
                <div>
                  <p
                    className="parent-fee-box__val"
                    style={{
                      color: (fees?.totalBalance ?? 0) > 0 ? "var(--color-danger)" : "var(--color-success)",
                    }}
                  >
                    {formatMoney(fees?.totalBalance ?? 0)}
                  </p>
                  <p className="parent-fee-box__lbl">Balance</p>
                </div>
              </div>
              {(fees?.discountAmount ?? 0) > 0 ? (
                <p className="parent-note--discount">Discount applied {formatMoney(fees?.discountAmount ?? 0)}</p>
              ) : null}
              {(fees?.owingCount ?? 0) > 0 ? (
                <p className="parent-note--owing">
                  {fees?.owingCount} student{(fees?.owingCount || 0) === 1 ? "" : "s"} still owing
                </p>
              ) : data?.monitoredCount ? (
                <p className="parent-note--ok">No outstanding balance</p>
              ) : (
                <p className="parent-note--ok">Link a student to see fee records</p>
              )}
            </button>

            <TrendChart
              trend={data?.trend || []}
              emptyText={
                data?.monitoredCount ? "No school days in this window yet." : "Link a student to see attendance."
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
