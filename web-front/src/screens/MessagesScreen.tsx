import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import PrimaryButton from "../components/PrimaryButton";
import SelectField from "../components/SelectField";
import TextField from "../components/TextField";
import StatCard, { StatCardGrid } from "../components/StatCard";
import DataTable, { type TableColumn } from "../components/DataTable";
import Pagination from "../components/Pagination";
import SegmentTabs from "../components/SegmentTabs";
import ParentChatPane from "./ParentChatPane";
import { getSmsCredit, getSmsMessages, type SmsCredit, type SmsMessage } from "../api/sms";
import { isAccountant } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatDateTime12 } from "../utils/dateTime";
import "../styles/pagePanel.css";
import "./MessagesScreen.css";

const STATUS_OPTIONS = [
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "queued", label: "Queued" },
  { value: "failed", label: "Failed" },
  { value: "undelivered", label: "Undelivered" },
];

const KIND_OPTIONS = [
  { value: "pair_summary", label: "Pair summary" },
  { value: "absence", label: "Absence" },
  { value: "missed_checkout", label: "Missed checkout" },
  { value: "check_in", label: "Check-in" },
  { value: "check_out", label: "Check-out" },
  { value: "daily_summary", label: "Daily summary" },
  { value: "announcement", label: "Announcement" },
  { value: "other", label: "Other" },
];

function statusClass(status: string) {
  if (status === "delivered") return "sms-status sms-status--ok";
  if (status === "sent") return "sms-status sms-status--sent";
  if (status === "queued") return "sms-status sms-status--queued";
  return "sms-status sms-status--err";
}

function formatWhen(iso?: string | null) {
  return formatDateTime12(iso);
}

export default function MessagesScreen() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const accountant = isAccountant(user);
  const [segment, setSegment] = useState<"sms" | "parents">(accountant ? "parents" : "sms");
  const [credit, setCredit] = useState<SmsCredit | null>(null);
  const [items, setItems] = useState<SmsMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (accountant) return;
      if (!opts?.silent) setRefreshing(true);
      try {
        const [creditData, list] = await Promise.all([
          getSmsCredit(),
          getSmsMessages({ page, pageSize, status, kind, q }),
        ]);
        setCredit(creditData);
        setItems(list.items);
        setTotal(list.total);
        if (list.page !== page) setPage(list.page);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load messages", "err");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountant, page, pageSize, status, kind, q, showToast]
  );

  useEffect(() => {
    if (accountant) {
      setLoading(false);
      return;
    }
    void load({ silent: true });
  }, [load, accountant]);

  useEffect(() => {
    if (accountant) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 30000);
    return () => window.clearInterval(id);
  }, [load, accountant]);

  const columns = useMemo<TableColumn<SmsMessage>[]>(
    () => [
      {
        key: "when",
        title: "Sent",
        minWidth: 110,
        render: (row) => formatWhen(row.createdAt),
      },
      {
        key: "kind",
        title: "Type",
        minWidth: 120,
        render: (row) => row.kindLabel,
      },
      {
        key: "to",
        title: "Recipient",
        minWidth: 160,
        render: (row) => (
          <div className="sms-to">
            <strong>{row.studentName || "Guardian"}</strong>
            <span>{row.mobile || "—"}</span>
          </div>
        ),
      },
      {
        key: "body",
        title: "Message",
        minWidth: 220,
        render: (row) => <span className="sms-body">{row.body}</span>,
      },
      {
        key: "status",
        title: "Status",
        minWidth: 110,
        render: (row) => (
          <span className={statusClass(String(row.status))}>
            {row.status}
            {row.errorDescription ? (
              <em className="sms-status__err" title={row.errorDescription}>
                {row.errorDescription}
              </em>
            ) : null}
          </span>
        ),
      },
    ],
    []
  );

  const creditLabel =
    credit?.credit == null ? "—" : Number(credit.credit).toLocaleString();

  return (
    <div className={`page-panel${segment === "parents" || accountant ? " page-panel--chat" : ""}`}>
      <div
        className={`page-panel__inner messages-screen${
          segment === "parents" || accountant ? " messages-screen--chat" : ""
        }`}
      >
        {segment === "sms" ? (
        <header className="reports-hero">
          <Icon name="chatbubbles-outline" size={28} />
          <div>
            <h2 className="reports-hero__title">Messages</h2>
            <p className="reports-hero__sub">
              SMS delivery log and live chat with parents.
            </p>
          </div>
        </header>
        ) : null}

        {!accountant ? (
          <SegmentTabs
            tabs={[
              { id: "sms", label: "SMS" },
              { id: "parents", label: "Parents" },
            ]}
            active={segment}
            onChange={setSegment}
          />
        ) : null}

        {segment === "parents" || accountant ? (
          <ParentChatPane />
        ) : (
          <>

        {credit?.desktop ? (
          <div className="settings-banner settings-banner--info">
            SMS is sent from the school server when this PC uploads attendance. Open the web app to
            monitor credit and delivery.
          </div>
        ) : null}

        {credit && !credit.configured && !credit.desktop ? (
          <div className="settings-banner settings-banner--warn">
            SMS is not configured on the server. Set SMS_API_USER and SMS_API_PASSWORD, then restart
            the API.
          </div>
        ) : null}

        {credit?.error && credit.configured ? (
          <div className="settings-banner settings-banner--warn">{credit.error}</div>
        ) : null}

        <StatCardGrid>
          <StatCard
            label="SMS credit"
            value={creditLabel}
            icon="wallet-outline"
            accent="var(--color-primary)"
            accentSoft="var(--color-primary-soft)"
          />
          <StatCard
            label="Sent today"
            value={String(credit?.stats.sentToday ?? 0)}
            icon="chatbubbles-outline"
            accent="var(--color-accent-teal)"
            accentSoft="var(--color-accent-teal-soft)"
          />
          <StatCard
            label="Delivered"
            value={String(credit?.stats.delivered ?? 0)}
            icon="checkmark-circle-outline"
            accent="var(--color-success)"
            accentSoft="var(--color-success-soft)"
          />
          <StatCard
            label="Failed"
            value={String(credit?.stats.failed ?? 0)}
            icon="alert-circle-outline"
            accent="var(--color-danger)"
            accentSoft="var(--color-danger-soft)"
          />
        </StatCardGrid>

        {credit?.accountExpDate || credit?.balanceExpDate ? (
          <p className="messages-screen__expiry">
            {credit.senderId ? <>Sender <strong>{credit.senderId}</strong> · </> : null}
            {credit.accountExpDate ? <>Account expires {credit.accountExpDate}</> : null}
            {credit.accountExpDate && credit.balanceExpDate ? " · " : null}
            {credit.balanceExpDate ? <>Balance expires {credit.balanceExpDate}</> : null}
          </p>
        ) : credit?.senderId ? (
          <p className="messages-screen__expiry">
            Sender <strong>{credit.senderId}</strong>
          </p>
        ) : null}

        <section className="ui-card">
          <div className="messages-screen__toolbar">
            <h3 className="ui-card__title">Sent messages</h3>
            <PrimaryButton
              title={refreshing ? "Refreshing…" : "Refresh"}
              loading={refreshing}
              onClick={() => void load()}
            />
          </div>
          <div className="messages-screen__filters">
            <TextField
              label="Search"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Name, phone, or message"
            />
            <SelectField
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              placeholder="All statuses"
              onChange={(value) => {
                setPage(1);
                setStatus(value);
              }}
            />
            <SelectField
              label="Type"
              value={kind}
              options={KIND_OPTIONS}
              placeholder="All types"
              onChange={(value) => {
                setPage(1);
                setKind(value);
              }}
            />
          </div>
          {loading && !items.length ? (
            <p className="messages-screen__empty">Loading messages…</p>
          ) : (
            <DataTable
              columns={columns}
              data={items}
              keyExtractor={(row) => row.id}
              emptyText="No SMS has been sent yet."
              bordered
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
          </>
        )}
      </div>
    </div>
  );
}
