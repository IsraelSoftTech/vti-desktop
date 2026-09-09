import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[mpasat] render crash", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>MPASAT could not open</Text>
        <Text style={styles.body}>
          {this.state.error.message || "An unexpected error stopped the app."}
        </Text>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={styles.btn}
        >
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  body: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 22,
  },
  btn: {
    backgroundColor: "#1E3A8A",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  btnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});
