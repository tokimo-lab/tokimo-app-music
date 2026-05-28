import { resolve } from "node:path";
import { defineTokimoApp } from "@tokimo/app-builder/vite";

export default defineTokimoApp({
  overrides: {
    resolve: {
      alias: {
        three: resolve(__dirname, "../../../packages/web/node_modules/three"),
      },
    },
  },
});
