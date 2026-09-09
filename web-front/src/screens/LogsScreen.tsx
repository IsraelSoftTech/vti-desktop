import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import PrimaryButton from "../components/PrimaryButton";
import TextField from "../components/TextField";
import DataTable, { type TableColumn } from "../components/DataTable";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { clearActivityLogs, getActivityLogs, type ActivityLog } from "../api/logs";
import { useToast } from "../context/ToastContext";
import { formatDateTime12 } from "../utils/dateTime";
import "../styles/pagePanel.css";
import "./LogsScreen.css";

function formatWhen(iso?: string | null) {
  return formatDateTime12(iso);
}

function sourceLabel(source?: string | null) {
  if (source === "mobile") return "Mobile";
  if (source === "desktop") return "Desktop";
  if (source === "web") return "Web";
  if (source === "api") return "API";
  return source || "—";
}

function roleLabel(role?: string | null) {
  if (role === "attendance_admin") return "Admin";
  if (role === "attendance_accountant") return "Accountant";
  if (role === "attendance_parent") return "Parent";
  if (role === "sync_device") return "Desktop";
  return role || "—";
}

export default function LogsScreen() {
  const { showToast } = useToast();
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      try {
        const data = await getActivityLogs({
          limit: pageSize,
          offset: (page - 1) * pageSize,
          q,
        });
        setItems(data.items);
        setTotal(data.total);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load logs", "err");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, q, showToast]
  );

  useEffect(() => {
    void load({ silent: true });
  }, [load]);

  async function handleClear() {
    setClearing(true);
    try {
      await clearActivityLogs();
      setConfirmClear(false);
      setPage(1);
      showToast("Logs cleared.");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not clear logs", "err");
    } finally {
      setClearing(false);
    }
  }

  const columns = useMemo<TableColumn<ActivityLog>[]>(
    () => [
      {
        key: "when",
        title: "When",
        minWidth: 168,
        render: (row) => formatWhen(row.occurred_at),
      },
      {
        key: "who",
        title: "Who",
        minWidth: 140,
        render: (row) => (
          <span className="logs-who">
            <strong>{row.actor_username || "System"}</strong>
            <span>{roleLabel(row.actor_role)}</span>
          </span>
        ),
      },
      {
        key: "action",
        title: "Action",
        minWidth: 280,
        render: (row) => (
          <span className="logs-action">
            <strong>{row.summary}</strong>
            {row.path ? (
              <span>
                {row.method} {row.path}
                {row.status_code ? ` · ${row.status_code}` : ""}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: "source",
        title: "From",
        width: 90,
        render: (row) => sourceLabel(row.source),
      },
    ],
    []
  );

  return (
    <div className="page-panel">
      <div className="page-panel__inner logs-screen">
        <header className="reports-hero">
          <Icon name="list-outline" size={28} />
          <div>
            <h2 className="reports-hero__title">Logs</h2>
            <p className="reports-hero__sub">
              Every sign-in, change, and sync recorded on this system. Admins can clear the history.
            </p>
          </div>
        </header>

        <section className="ui-card">
          <div className="messages-screen__toolbar logs-toolbar">
            <h3 className="ui-card__title">Activity</h3>
            <div className="logs-toolbar__actions">
              <PrimaryButton
                title={refreshing ? "Refreshing…" : "Refresh"}
                loading={refreshing}
                onClick={() => void load()}
              />
              <button
                type="button"
                className="logs-clear-btn"
                disabled={clearing || (!items.length && !total)}
                onClick={() => setConfirmClear(true)}
              >
                Clear logs
              </button>
            </div>
          </div>
          <div className="logs-filters">
            <TextField
              label="Search"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="User, action, or path"
            />
          </div>
          {loading && !items.length ? (
            <p className="messages-screen__empty">Loading logs…</p>
          ) : (
            <DataTable
              columns={columns}
              data={items}
              keyExtractor={(row) => row.id}
              emptyText="No activity recorded yet."
            />
          )}
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
          />
        </section>
      </div>

      <ConfirmModal
        visible={confirmClear}
        title="Clear all logs?"
        message="This permanently deletes the activity history on this system. A single entry will be kept to record that the logs were cleared."
        confirmLabel={clearing ? "Clearing…" : "Clear logs"}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void handleClear()}
      />
    </div>
  );
}
