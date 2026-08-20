import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefdf3',
          100: '#d6f9e2',
          500: '#16a34a',
          600: '#15803d',
          700: '#166534',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
