import { ReactNode, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

export type TableColumn<T> = {
  key: string;
  title: string;
  width?: number;
  flex?: number;
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!data.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.empty}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.table, bordered && styles.tableBordered]}>
        <View style={[styles.headRow, bordered && styles.headRowBordered]}>
          {columns.map((col) => (
            <View
              key={col.key}
              style={[
                styles.headCell,
                bordered && styles.cellBordered,
                col.width ? { width: col.width } : { flex: col.flex ?? 1 },
              ]}
            >
              <Text style={[styles.headText, bordered && styles.headTextBordered]}>
                {col.title}
              </Text>
            </View>
          ))}
        </View>
        {data.map((row) => (
          <View key={keyExtractor(row)} style={[styles.row, bordered && styles.rowBordered]}>
            {columns.map((col) => (
              <View
                key={col.key}
                style={[
                  styles.cell,
                  bordered && styles.cellBordered,
                  col.width ? { width: col.width } : { flex: col.flex ?? 1 },
                ]}
              >
                {col.render(row)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  table: {
    minWidth: "100%",
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: colors.primarySoft,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  headCell: { paddingHorizontal: 6 },
  headText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cell: { paddingHorizontal: 6, justifyContent: "center" },
  emptyWrap: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  empty: { color: colors.textMuted, fontSize: 14 },
  tableBordered: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(45, 91, 255, 0.12)",
    shadowOpacity: 0,
    elevation: 0,
  },
  headRowBordered: {
    backgroundColor: "rgba(45, 91, 255, 0.04)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(45, 91, 255, 0.1)",
  },
  headTextBordered: {
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 13,
    color: colors.text,
    fontWeight: "700",
  },
  rowBordered: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(45, 91, 255, 0.08)",
  },
  cellBordered: {
    borderRightWidth: 1,
    borderRightColor: "rgba(45, 91, 255, 0.08)",
    paddingVertical: 14,
  },
  });
}
