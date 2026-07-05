// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightBlog from "starlight-blog";
import mermaid from "astro-mermaid";
import { remarkAlert } from "remark-github-blockquote-alert";
import { authors } from "./src/authors.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://developers.esphome.io",
  markdown: {
    remarkPlugins: [remarkAlert],
  },
  integrations: [
    mermaid({
      theme: "default",
      autoTheme: true,
    }),
    starlight({
      title: "ESPHome Developer Documentation",
      description: "Documentation for developers contributing to and building components for ESPHome.",
      logo: {
        light: "./src/assets/logo-text.svg",
        dark: "./src/assets/logo-text.svg",
        replacesTitle: true,
      },
      favicon: "/images/favicon.ico",
      customCss: ["./src/styles/alerts.css"],
      editLink: {
        baseUrl: "https://github.com/esphome/developers.esphome.io/edit/main/",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/esphome/developers.esphome.io",
        },
        {
          icon: "discord",
          label: "Discord",
          href: "https://discord.gg/KhAMKrd",
        },
      ],
      components: {
        // Adds the copyright notice site-wide and Giscus comments on blog posts.
        Footer: "./src/components/Footer.astro",
      },
      plugins: [
        starlightBlog({
          title: "Blog",
          navigation: "header-end",
          authors,
        }),
      ],
      sidebar: [
        {
          label: "Contributing",
          items: [
            "contributing/development-environment",
            "contributing/submitting-your-work",
            {
              label: "Contributing",
              items: ["contributing/code", "contributing/docs", "contributing/translations"],
            },
          ],
        },
        {
          label: "Architecture",
          items: [
            "architecture/overview",
            "architecture/core",
            {
              label: "Components",
              items: [
                "architecture/components",
                {
                  label: "Common hardware interfaces",
                  items: [
                    "architecture/components/gpio",
                    "architecture/components/i2c",
                    "architecture/components/spi",
                    "architecture/components/uart",
                  ],
                },
                "architecture/components/automations",
                "architecture/components/socket_consumption_api",
                "architecture/components/advanced",
                {
                  label: "Entity base classes",
                  collapsed: true,
                  items: [
                    "architecture/components/alarm_control_panel",
                    "architecture/components/binary_sensor",
                    "architecture/components/button",
                    "architecture/components/climate",
                    "architecture/components/cover",
                    "architecture/components/display",
                    "architecture/components/event",
                    "architecture/components/fan",
                    "architecture/components/light",
                    "architecture/components/lock",
                    "architecture/components/media_player",
                    "architecture/components/number",
                    "architecture/components/output",
                    "architecture/components/select",
                    "architecture/components/sensor",
                    "architecture/components/speaker",
                    "architecture/components/switch",
                    "architecture/components/text",
                    "architecture/components/text_sensor",
                    "architecture/components/time",
                    "architecture/components/touchscreen",
                    "architecture/components/valve",
                  ],
                },
              ],
            },
            {
              label: "API",
              items: ["architecture/api", "architecture/api/protocol_details"],
            },
            "architecture/logging",
            {
              label: "CI",
              items: ["architecture/ci", "architecture/ci/component_tests"],
            },
          ],
        },
      ],
    }),
  ],
});
