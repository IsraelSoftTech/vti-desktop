import { useCallback, useEffect } from "react";
import StatCard, { StatCardGrid, StatSkeleton } from "../../components/StatCard";
import { getFeeDashboard, type FeeDashboardData } from "../../api/fees";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { formatMoney } from "../../utils/currency";
import "../HomeScreen.css";

type Props = {
  isFocused?: boolean;
};

export default function AccountantHomeScreen({ isFocused = true }: Props) {
  const loader = useCallback(() => getFeeDashboard(), []);
  const { data, loading, refreshing, error, reload, softLoad } = useCachedQuery<FeeDashboardData>(
    loader,
    { cacheKey: "fee-dashboard", maxAgeMs: 60_000 }
  );

  useEffect(() => {
    if (isFocused) softLoad();
  }, [isFocused, softLoad]);

  useEffect(() => {
    if (!isFocused) return;
    const onVis = () => {
      if (document.visibilityState === "visible") softLoad();
    };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isFocused, softLoad]);

  const stats = data?.stats;
  const showSkeleton = loading && !data;

  return (
    <div
      className={`home-scroll${refreshing ? " home-scroll--refreshing" : ""}`}
      onTouchStart={(e) => {
        const el = e.currentTarget;
        (el as HTMLElement & { _pullStart?: number })._pullStart = e.touches[0]?.clientY;
      }}
      onTouchMove={(e) => {
        const el = e.currentTarget as HTMLElement & { _pullStart?: number };
        if (el.scrollTop > 0 || el._pullStart == null) return;
        const dy = (e.touches[0]?.clientY ?? 0) - el._pullStart;
        if (dy > 80 && !refreshing) {
          el._pullStart = undefined;
          reload();
        }
      }}
    >
      {refreshing ? (
        <div className="home-scroll__refresh" aria-live="polite">
          <span className="home-scroll__refresh-spinner" aria-hidden />
        </div>
      ) : null}

      <div className="home-scroll__inner">
        <section className="home-welcome">
          <h2 className="home-welcome__lead" style={{ marginBottom: 6 }}>
            Home
          </h2>
          {data?.activeYear ? (
            <span className="home-welcome__year">{data.activeYear.name}</span>
          ) : (
            <p className="home-welcome__warn">No active academic year set</p>
          )}
        </section>

        {error && !data ? (
          <div className="home-error" role="alert">
            {error}
          </div>
        ) : showSkeleton ? (
          <StatCardGrid>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </StatCardGrid>
        ) : (
          <StatCardGrid>
            <StatCard
              label="Total Students"
              value={String(stats?.totalStudents ?? 0)}
              icon="people-outline"
              accent="var(--color-primary)"
              accentSoft="var(--color-primary-soft)"
            />
            <StatCard
              label="Total Fee Expected"
              value={formatMoney(stats?.totalFeeExpected ?? 0)}
              icon="wallet-outline"
              accent="var(--color-accent-purple)"
              accentSoft="#f0edff"
            />
            <StatCard
              label="Total Fee Paid"
              value={formatMoney(stats?.totalFeePaid ?? 0)}
              icon="checkmark-circle-outline"
              accent="var(--color-accent-teal)"
              accentSoft="var(--color-accent-teal-soft)"
            />
            <StatCard
              label="Total Fee Owed"
              value={formatMoney(stats?.totalFeeOwed ?? 0)}
              icon="alert-circle-outline"
              accent="var(--color-danger)"
              accentSoft="var(--color-danger-soft)"
            />
          </StatCardGrid>
        )}

        {loading && data ? (
          <div className="home-inline-load" aria-hidden>
            <span className="home-inline-load__spinner" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
