import { ComponentType } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import ScreenLayout from "../../components/ScreenLayout";
import FeeManagementTab from "./FeeManagementTab";
import FeePaymentTab from "./FeePaymentTab";
import FeeCheckTab from "./FeeCheckTab";
import FeeDiscountTab from "./FeeDiscountTab";
import FeeReportsTab from "./FeeReportsTab";

function makeFeeTabScreen(Tab: ComponentType) {
  return function FeeTabScreen({ embedded = false }: { embedded?: boolean }) {
    const body = (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={embedded ? 88 : 120}
      >
        <View style={styles.body}>
          <Tab />
        </View>
      </KeyboardAvoidingView>
    );
    if (embedded) return body;
    return <ScreenLayout>{body}</ScreenLayout>;
  };
}

export const FeeManagementScreen = makeFeeTabScreen(FeeManagementTab);
export const FeePaymentScreen = makeFeeTabScreen(FeePaymentTab);
export const FeeCheckScreen = makeFeeTabScreen(FeeCheckTab);
export const FeeDiscountScreen = makeFeeTabScreen(FeeDiscountTab);
export const FeeReportsScreen = makeFeeTabScreen(FeeReportsTab);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12, minHeight: 0 },
});
