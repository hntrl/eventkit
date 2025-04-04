import { type DefaultTheme, defineConfig } from "vitepress";

import typedocSidebar from "../reference/typedoc-sidebar.json";
import eventkitPkg from "../../packages/eventkit/package.json";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: "en-US",
  title: "eventkit",
  description: "Declarative stream processing for Typescript",
  base: "/eventkit/",
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
      text: "Docs",
      link: "/what-is-eventkit",
      activeMatch: "/",
    },
    {
      text: eventkitPkg.version,
      items: [
        {
          text: "Changelog",
          link: "https://github.com/hntrl/eventkit/blob/main/CHANGELOG.md",
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
      items: [
        { text: "What is eventkit?", link: "what-is-eventkit" },
        { text: "Getting Started", link: "getting-started" },
        { text: "Motivations", link: "motivations" },
      ],
    },
    {
      text: "Concepts",
      collapsed: false,
      items: [
        { text: "Creating Streams", link: "concepts/creating-streams" },
        { text: "Transforming Data", link: "concepts/transforming-data" },
        { text: "Observable Pattern", link: "concepts/observable-pattern" },
        { text: "Async Processing", link: "concepts/async-processing" },
        { text: "Scheduling", link: "concepts/scheduling" },
      ],
    },
    {
      text: "Examples",
      collapsed: false,
      items: [
        { text: "Event Sourcing", link: "examples/event-sourcing" },
        { text: "HTTP Streaming", link: "examples/http-streaming" },
      ],
    },
    {
      text: "Reference",
      items: typedocSidebar,
    },
  ];
}
