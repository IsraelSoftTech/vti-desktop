import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "../../components/PrimaryButton";
import DataTable from "../../components/DataTable";
import type { TableColumn } from "../../components/DataTable";
import FeeSectionHeader from "../../components/FeeSectionHeader";
import {
  bulkSetClassFees,
  getClassFees,
  getFeeHeads,
  type ClassFeeItem,
  type FeeHead,
} from "../../api/fees";
import { getClasses, type SchoolClass } from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { formatMoney, parseMoneyInput } from "../../utils/currency";
import { colors } from "../../theme/colors";
import { feeManagementStyles as styles } from "./feeManagementStyles";

type ClassRow = SchoolClass;

export default function FeeSetupTab() {
  const { showToast } = useToast();
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [amountEdits, setAmountEdits] = useState<Record<number, Record<number, string>>>({});
  const [feesByClass, setFeesByClass] = useState<Record<number, ClassFeeItem[]>>({});
  const [feesLoading, setFeesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const headsLoader = useCallback(() => getFeeHeads(), []);
  const classesLoader = useCallback(() => getClasses(), []);
  const { data: heads } = useCachedQuery<FeeHead[]>(headsLoader, {
    cacheKey: "fee-heads",
    maxAgeMs: 10_000,
  });
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });

  const activeHeads = useMemo(() => (heads || []).filter((h) => !h.trashedAt), [heads]);

  useEffect(() => {
    if (!classes?.length) {
      setFeesByClass({});
      return;
    }

    let active = true;
    setFeesLoading(true);

    Promise.all(
      classes.map(async (c) => {
        try {
          const summary = await getClassFees(c.id);
          return [c.id, summary.fees] as const;
        } catch {
          return [c.id, [] as ClassFeeItem[]] as const;
        }
      })
    )
      .then((entries) => {
        if (active) setFeesByClass(Object.fromEntries(entries));
      })
      .finally(() => {
        if (active) setFeesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [classes, reloadToken]);

  function getCellValue(classId: number, feeHeadId: number) {
    const edited = amountEdits[classId]?.[feeHeadId];
    if (edited !== undefined) return edited;
    const saved = feesByClass[classId]?.find((f) => f.feeHeadId === feeHeadId)?.amount;
    return saved != null && saved > 0 ? String(saved) : "";
  }

  function setCellValue(classId: number, feeHeadId: number, value: string) {
    setAmountEdits((prev) => ({
      ...prev,
      [classId]: { ...prev[classId], [feeHeadId]: value },
    }));
  }

  function rowTotal(classId: number) {
    return activeHeads.reduce((sum, head) => sum + parseMoneyInput(getCellValue(classId, head.id)), 0);
  }

  function toggleClass(id: number) {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAllClasses() {
    setSelectedClassIds((classes || []).map((c) => c.id));
  }

  function clearClasses() {
    setSelectedClassIds([]);
  }

  async function handleSave() {
    if (!selectedClassIds.length) {
      showToast("Select at least one class in the table.", "err");
      return;
    }
    if (!activeHeads.length) {
      showToast("Create fee types first.", "err");
      return;
    }

    setBusy(true);
    try {
      await Promise.all(
        selectedClassIds.map(async (classId) => {
          const payload = activeHeads.map((head) => ({
            feeHeadId: head.id,
            amount: parseMoneyInput(getCellValue(classId, head.id)),
          }));
          await bulkSetClassFees(classId, payload);
          clearCache(`class-fees-${classId}`);
        })
      );
      setAmountEdits({});
      setReloadToken((n) => n + 1);
      showToast(
        selectedClassIds.length === 1
          ? "Class fees saved."
          : `Fees saved for ${selectedClassIds.length} classes.`
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save fees", "err");
    } finally {
      setBusy(false);
    }
  }

  const allSelected = !!classes?.length && selectedClassIds.length === classes.length;
  const someSelected = selectedClassIds.length > 0 && !allSelected;

  const saveLabel =
    selectedClassIds.length > 0
      ? busy
        ? `Saving ${selectedClassIds.length} class${selectedClassIds.length === 1 ? "" : "es"}…`
        : `Save Selected (${selectedClassIds.length})`
      : busy
        ? "Saving…"
        : "Save Selected Classes";

  const columns: TableColumn<ClassRow>[] = useMemo(() => {
    const cols: TableColumn<ClassRow>[] = [
      {
        key: "select",
        title: "",
        width: 44,
        render: (c) => {
          const checked = selectedClassIds.includes(c.id);
          return (
            <Pressable onPress={() => toggleClass(c.id)} hitSlop={6}>
              <Ionicons
                name={checked ? "checkbox" : "square-outline"}
                size={18}
                color={checked ? colors.primary : colors.textMuted}
              />
            </Pressable>
          );
        },
      },
      {
        key: "class",
        title: "Class",
        width: 120,
        render: (c) => <Text style={styles.cellStrong}>{c.name}</Text>,
      },
      ...activeHeads.map((head) => ({
        key: `fee-${head.id}`,
        title: head.name,
        width: 100,
        render: (c: ClassRow) => (
          <TextInput
            value={getCellValue(c.id, head.id)}
            onChangeText={(v) => setCellValue(c.id, head.id, v)}
            style={styles.matrixInput}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={colors.textMuted}
          />
        ),
      })),
      {
        key: "total",
        title: "Total",
        width: 90,
        render: (c) => <Text style={styles.matrixTotal}>{formatMoney(rowTotal(c.id))}</Text>,
      },
    ];
    return cols;
  }, [activeHeads, selectedClassIds, amountEdits, feesByClass]);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.card}>
        <FeeSectionHeader
          title="Fee Setup"
          subtitle="Set fee amounts per class in the table. Select rows, edit amounts, then save."
        />

        <View style={styles.matrixToolbar}>
          <Text style={styles.matrixCount}>
            {selectedClassIds.length} of {classes?.length ?? 0} classes selected
          </Text>
          <View style={styles.classPickerActions}>
            <Pressable onPress={selectAllClasses}>
              <Text style={styles.classPickerLink}>Select all</Text>
            </Pressable>
            <Pressable onPress={clearClasses}>
              <Text style={styles.classPickerLink}>Clear</Text>
            </Pressable>
          </View>
        </View>

        {feesLoading ? (
          <Text style={styles.matrixLoading}>Loading class fees…</Text>
        ) : classes?.length ? (
          activeHeads.length ? (
            <>
              <Pressable
                style={styles.selectAllRow}
                onPress={() => (allSelected ? clearClasses() : selectAllClasses())}
              >
                <Ionicons
                  name={allSelected ? "checkbox" : someSelected ? "remove-circle-outline" : "square-outline"}
                  size={18}
                  color={allSelected || someSelected ? colors.primary : colors.textMuted}
                />
                <Text style={styles.selectAllText}>Select all classes</Text>
              </Pressable>
              <DataTable
                bordered
                data={classes}
                keyExtractor={(c) => c.id}
                columns={columns}
                emptyText="No classes found."
              />
              <PrimaryButton title={saveLabel} loading={busy} onPress={handleSave} fullWidth />
            </>
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="list-outline" size={28} color={colors.textMuted} />
              <Text style={styles.placeholderText}>Create fee types first, then set amounts per class here.</Text>
            </View>
          )
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="school-outline" size={28} color={colors.textMuted} />
            <Text style={styles.placeholderText}>No classes found. Add classes in Academics first.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
