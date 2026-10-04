/**
 * DarConverter design tokens.
 *
 * Every colour, radius, shadow and motion curve used by the UI lives here so
 * there is no second place to keep in sync. Component-level styling is built
 * from these in `src/styles/global.css`.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* ---- Brand: one cobalt signal. Used for the primary action, focus
               rings and active selection only — never as decoration. ---- */
        brand: {
          DEFAULT: "oklch(53% 0.185 260 / <alpha-value>)",
          deep: "oklch(45% 0.175 260 / <alpha-value>)",
          lift: "oklch(66% 0.16 260 / <alpha-value>)",
          ink: "oklch(99% 0 0 / <alpha-value>)",
          soft: "oklch(96.5% 0.028 260 / <alpha-value>)",
          "soft-ink": "oklch(40% 0.13 260 / <alpha-value>)"
        },

        /* ---- Status: never colour alone, always paired with an icon or
               word so the meaning survives without hue. ---- */
        positive: {
          DEFAULT: "oklch(48% 0.13 158 / <alpha-value>)",
          soft: "oklch(96% 0.03 158 / <alpha-value>)"
        },
        caution: {
          DEFAULT: "oklch(52% 0.13 75 / <alpha-value>)",
          soft: "oklch(96.5% 0.04 85 / <alpha-value>)"
        },
        critical: {
          DEFAULT: "oklch(50% 0.19 25 / <alpha-value>)",
          soft: "oklch(96.5% 0.025 25 / <alpha-value>)"
        }
      },

      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif"
        ],
        mono: [
          "\"JetBrains Mono\"",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace"
        ]
      },

      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["0.75rem", { lineHeight: "1.125rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.6" }],
        lg: ["1.0625rem", { lineHeight: "1.65" }],
        xl: ["1.25rem", { lineHeight: "1.7" }],
        "2xl": ["1.5rem", { lineHeight: "1.35" }],
        "3xl": ["1.875rem", { lineHeight: "1.22" }],
        "4xl": ["2.5rem", { lineHeight: "1.1" }],
        "5xl": ["3.25rem", { lineHeight: "1.04" }]
      },

      borderRadius: {
        card: "0.875rem",
        control: "0.625rem"
      },

      boxShadow: {
        /* Hairline-first. These are the only shadows in the system. */
        hair: "0 1px 2px rgb(24 24 27 / 0.04)",
        lift: "0 1px 2px rgb(24 24 27 / 0.04), 0 8px 24px -12px rgb(24 24 27 / 0.12)",
        pop: "0 12px 40px -12px rgb(24 24 27 / 0.22)"
      },

      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)"
      },
      transitionDuration: {
        120: "120ms",
        180: "180ms",
        260: "260ms"
      },

      maxWidth: {
        shell: "76rem",
        prose: "68ch"
      }
    }
  },
  plugins: []
};
