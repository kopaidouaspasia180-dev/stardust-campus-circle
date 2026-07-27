import {defineConfig, type UserConfigExport} from "@tarojs/cli"

export default defineConfig(async (merge, {command, mode}) => {
  const base: UserConfigExport = {
    projectName: "stardust-campus-ecosystem",
    date: "2026-07-26",
    designWidth: 750,
    deviceRatio: {
      375: 2,
      640: 1.17,
      750: 1,
      828: 0.905
    },
    sourceRoot: "src",
    outputRoot: process.env.TARO_ENV === "h5" ? "dist-h5" : "dist",
    copy: {
      patterns: [
        {
          from: "src/sitemap.json",
          to: process.env.TARO_ENV === "h5" ? "dist-h5/sitemap.json" : "dist/sitemap.json"
        }
      ],
      options: {}
    },
    plugins: ["@tarojs/plugin-framework-react"],
    framework: "react",
    compiler: "webpack5",
    cache: {enable: true},
    mini: {
      postcss: {
        pxtransform: {enable: true, config: {}},
        url: {enable: true, config: {limit: 1024}},
        cssModules: {enable: false}
      }
    },
    h5: {
      publicPath: "/campus-circle/",
      staticDirectory: "static",
      router: {
        mode: "hash",
        basename: "/campus-circle"
      },
      output: {filename: "js/[name].[hash:8].js", chunkFilename: "js/[name].[contenthash:8].js"}
    }
  }

  if (process.env.NODE_ENV === "development") {
    return merge({}, base, {env: {NODE_ENV: '"development"'}})
  }
  return merge({}, base, {env: {NODE_ENV: '"production"'}})
})
