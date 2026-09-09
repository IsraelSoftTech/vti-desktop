import { useFonts } from "expo-font";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

export default function MpasatWordmark() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loaded] = useFonts({
    CinzelDecorative: require("../../assets/fonts/CinzelDecorative-Black.ttf"),
  });
  const fontFamily = loaded
    ? "CinzelDecorative"
    : Platform.select({ ios: "Didot", android: "serif", default: "serif" });

  return (
    <View style={styles.wrap} accessibilityRole="header" accessibilityLabel="MPASAT">
      <View style={styles.stack}>
        <Text style={[styles.letter, { fontFamily, color: colors.primary800 }]}>MPASAT</Text>
        <Text
          pointerEvents="none"
          style={[
            styles.letter,
            styles.layer,
            { fontFamily, color: "rgba(0,0,0,0.28)", transform: [{ translateX: 1.6 }, { translateY: 2.2 }] },
          ]}
        >
          MPASAT
        </Text>
        <Text
          pointerEvents="none"
          style={[
            styles.letter,
            styles.layer,
            {
              fontFamily,
              color: colors.secondary,
              opacity: 0.85,
              transform: [{ translateX: -1 }, { translateY: -1.1 }],
            },
          ]}
        >
          MPASAT
        </Text>
        <Text pointerEvents="none" style={[styles.letter, styles.layer, { fontFamily, color: colors.primary }]}>
          MPASAT
        </Text>
      </View>
      <View style={styles.rule} />
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: {
      alignItems: "center",
      marginBottom: 18,
    },
    stack: {
      alignItems: "center",
      justifyContent: "center",
    },
    letter: {
      fontSize: 36,
      letterSpacing: 5,
      textAlign: "center",
      includeFontPadding: false,
    },
    layer: {
      ...StyleSheet.absoluteFillObject,
      textAlign: "center",
    },
    rule: {
      marginTop: 10,
      width: 72,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.secondary,
      opacity: 0.9,
    },
  });
}
