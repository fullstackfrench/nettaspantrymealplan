import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a1a1a',
        cream: '#faf8f4',
        brand: {
          plum: '#682952',
          gold: '#A88B43',
          brick: '#CB5439',
          muted: '#7A7A7A',
        },
        moss: { 50: '#f2f6f1', 100: '#e2ebdf', 500: '#5d7f52', 600: '#4a6742', 700: '#3a5134' },
        clay: { 100: '#f6e9de', 400: '#d99a6c', 500: '#c87f4d' },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
        brand: ['var(--font-brand)', 'Georgia', 'serif'],
      },
      borderRadius: {
        control: '0.625rem',
        panel: '0.9375rem',
      },
      boxShadow: {
        soft: '0 10px 30px -18px rgba(104, 41, 82, 0.28)',
        lift: '0 18px 42px -22px rgba(104, 41, 82, 0.34)',
      },
    },
  },
  plugins: [],
};

export default config;
