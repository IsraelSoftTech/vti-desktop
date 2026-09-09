import { memo, ReactNode, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import AppTopBar from "./AppTopBar";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

type Props = {
  children: ReactNode;
  notificationCount?: number;
  onNotificationsPress?: () => void;
  showHeader?: boolean;
};

function ScreenLayout({
  children,
  notificationCount = 0,
  onNotificationsPress,
  showHeader = true,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {showHeader ? (
        <AppTopBar
          notificationCount={notificationCount}
          onNotificationsPress={onNotificationsPress}
        />
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

export default memo(ScreenLayout);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
    },
  });
}
