import type { Config } from 'tailwindcss';

const config: Config = {
  // Follow the app's own theme switch (the .dark class on <html>), not the operating system setting.
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
