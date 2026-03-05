const path = require("path");
const webpack = require("webpack");
const fs = require("fs");

// Read .env file for build-time token injection
function loadEnv() {
  const envPath = path.resolve(__dirname, ".env");
  const vars = {};
  try {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
      if (match) vars[match[1]] = match[2];
    }
  } catch { /* .env not found — tokens will be empty */ }
  return vars;
}

module.exports = (env, argv) => {
  const mode = argv?.mode || "development";
  const isProduction = mode === "production";
  const envVars = loadEnv();

  return {
    mode,
    entry: {
      dashboard: ["./src/rendererPolyfills.ts", "./src/dashboard/entry.ts"],
      projector: ["./src/rendererPolyfills.ts", "./src/projector/entry.ts"],
      moduleSandbox: "./src/projector/moduleSandboxEntry.ts",
      parliament: "./src/projector/parliamentEntry.ts",
    },
    resolve: {
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      globalObject: "globalThis",
      publicPath: "auto", // Use this as the publicPath
    },
    devtool: isProduction ? false : "eval-source-map",
    node: {
      __dirname: false,
      __filename: false,
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          include: [path.resolve(__dirname, "src")],
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              presets: [
                "@babel/preset-env",
                ["@babel/preset-react", { runtime: "automatic" }],
                ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
              ],
            },
          },
        },
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              presets: [
                "@babel/preset-env",
                ["@babel/preset-react", { runtime: "automatic" }],
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            "css-loader",
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  ident: "postcss",
                  plugins: [require("tailwindcss"), require("autoprefixer")],
                },
              },
            },
          ],
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        __IUCN_TOKEN__: JSON.stringify(envVars.IUCN_API_TOKEN || ""),
      }),
    ],
    devServer: {
      static: [
        path.join(__dirname, "dist"),
        { directory: path.join(__dirname, "src/projector/views"), publicPath: "/" },
      ],
      compress: true,
      port: 9001,
      hot: true,
      liveReload: false,
      devMiddleware: {
        writeToDisk: true,
      },
      watchFiles: {
        paths: ["src/**/*"],
        options: {
          ignored: /src\/shared\/json\/userData\.json$/,
        },
      },
    },
    watchOptions: {
      ignored: /src\/shared\/json\/userData\.json$/,
    },
    target: "web",
  };
};
