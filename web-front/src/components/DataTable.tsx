import type { ReactNode } from "react";
import "./DataTable.css";

export type TableColumn<T> = {
  key: string;
  title: string;
  width?: number | string;
  minWidth?: number;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  emptyText?: string;
  bordered?: boolean;
};

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyText = "No records yet.",
  bordered = false,
}: Props<T>) {
  if (!data.length) {
    return (
      <div className="data-table__empty">
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={`data-table__scroll${bordered ? " data-table__scroll--bordered" : ""}`}>
      <table className={`data-table${bordered ? " data-table--bordered" : ""}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  minWidth: col.minWidth ?? (typeof col.width === "number" ? col.width : undefined),
                }}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={keyExtractor(row)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
