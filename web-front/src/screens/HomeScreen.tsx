import { useCallback, useEffect } from "react";
import StatCard, { StatCardGrid, StatSkeleton } from "../components/StatCard";
import { attendanceRate, getDashboard, type DashboardData } from "../api/dashboard";
import { useCachedQuery } from "../hooks/useCachedQuery";
import "./HomeScreen.css";

type Props = {
  isFocused?: boolean;
};

export default function HomeScreen({ isFocused = true }: Props) {
  const loader = useCallback(() => getDashboard(), []);
  const { data, loading, refreshing, error, reload, softLoad } = useCachedQuery<DashboardData>(
    loader,
    { cacheKey: "dashboard", maxAgeMs: 90_000 }
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
  const rate = stats ? attendanceRate(stats) : 0;
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
            <h2 className="home-welcome__lead">Dashboard</h2>
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
              <div className="stat-grid__full">
                <StatSkeleton />
              </div>
            </StatCardGrid>
          ) : (
            <StatCardGrid>
              <StatCard
                label="Students"
                value={String(stats?.totalStudents ?? 0)}
                icon="people-outline"
                accent="var(--color-primary)"
                accentSoft="var(--color-primary-soft)"
              />
              <StatCard
                label="Attendance Rate"
                value={`${rate}%`}
                icon="trending-up-outline"
                accent="var(--color-accent-teal)"
                accentSoft="var(--color-accent-teal-soft)"
              />
              <div className="stat-grid__full">
                <StatCard
                  label="Classes"
                  value={String(stats?.totalClasses ?? 0)}
                  icon="school-outline"
                  accent="var(--color-accent-purple)"
                  accentSoft="#f0edff"
                />
              </div>
            </StatCardGrid>
          )}

          {data && stats ? (
            <section className="home-summary">
              <h2 className="home-summary__title">Today&apos;s Activity</h2>
              <div className="home-summary__row">
                <span className="home-summary__label">Present</span>
                <span className="home-summary__value">{stats.presentToday}</span>
              </div>
              <div className="home-summary__row">
                <span className="home-summary__label">Check-ins</span>
                <span className="home-summary__value">{stats.checkInsToday}</span>
              </div>
              <div className="home-summary__row">
                <span className="home-summary__label">Check-outs</span>
                <span className="home-summary__value">{stats.checkOutsToday}</span>
              </div>
            </section>
          ) : null}

          {loading && data ? (
            <div className="home-inline-load" aria-hidden>
              <span className="home-inline-load__spinner" />
            </div>
          ) : null}
        </div>
      </div>
  );
}
