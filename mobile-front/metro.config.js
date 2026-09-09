const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "jspdf") {
    return {
      filePath: path.resolve(__dirname, "node_modules/jspdf/dist/jspdf.es.min.js"),
      type: "sourceFile",
    };
  }
  if (moduleName === "fast-png") {
    return {
      filePath: path.resolve(__dirname, "src/shims/fast-png.js"),
      type: "sourceFile",
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
