import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a1a1a',
        cream: '#faf8f4',
        moss: { 50: '#f2f6f1', 100: '#e2ebdf', 500: '#5d7f52', 600: '#4a6742', 700: '#3a5134' },
        clay: { 100: '#f6e9de', 400: '#d99a6c', 500: '#c87f4d' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
