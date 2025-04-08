import { type DefaultTheme, defineConfig } from "vitepress";

import typedocSidebar from "../reference/typedoc-sidebar.json";
import eventkitPkg from "../../packages/eventkit/package.json";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: "en-US",
  title: "eventkit",
  description: "Declarative stream processing for Typescript",
  base: "/eventkit/",
  head: [
    [
      "script",
      {
        defer: "true",
        src: "https://assets.onedollarstats.com/stonks.js",
      },
    ],
  ],
  lastUpdated: false,
  ignoreDeadLinks: true,
  cleanUrls: true,
  themeConfig: {
    editLink: {
      pattern: "https://github.com/hntrl/eventkit/edit/main/docs/:path",
      text: "Suggest changes to this page",
    },
    search: {
      provider: "local",
    },
    nav: nav(),
    sidebar: sidebar(),

    footer: {
      message:
        "Released under the <a href='https://github.com/hntrl/eventkit/blob/main/LICENSE'>MIT License</a>.",
      copyright: "Copyright © 2025-present Hunter Lovell & eventkit contributors",
    },

    socialLinks: [{ icon: "github", link: "https://github.com/hntrl/eventkit" }],
  },
});

function nav(): DefaultTheme.NavItem[] {
  return [
    {
      text: "Guide",
      link: "/guide/what-is-eventkit",
      activeMatch: "/guide/",
    },
    {
      text: "Reference",
      link: "/reference",
      activeMatch: "/reference/",
    },
    {
      text: eventkitPkg.version,
      items: [
        {
          text: "Changelog",
          link: "https://github.com/hntrl/eventkit/blob/main/packages/eventkit/CHANGELOG.md",
        },
        {
          text: "Contributing",
          link: "https://github.com/hntrl/eventkit/blob/main/CONTRIBUTING.md",
        },
      ],
    },
  ];
}

function sidebar(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: "Introduction",
      collapsed: false,
      base: "/guide/",
      items: [
        { text: "What is eventkit?", link: "what-is-eventkit" },
        { text: "Getting Started", link: "getting-started" },
        { text: "Motivations", link: "motivations" },
      ],
    },
    {
      text: "Concepts",
      collapsed: false,
      base: "/guide/concepts/",
      items: [
        { text: "Creating Streams", link: "creating-streams" },
        { text: "Transforming Data", link: "transforming-data" },
        { text: "Observable Pattern", link: "observable-pattern" },
        { text: "Async Processing", link: "async-processing" },
        { text: "Scheduling", link: "scheduling" },
      ],
    },
    {
      text: "Examples",
      collapsed: false,
      base: "/guide/examples/",
      items: [
        { text: "Reactive Systems", link: "reactive-systems" },
        { text: "HTTP Streaming", link: "http-streaming" },
      ],
    },
    {
      text: "Reference",
      items: typedocSidebar,
    },
  ];
}
