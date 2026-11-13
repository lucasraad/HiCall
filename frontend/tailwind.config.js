/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1e3a5f',
          hover: '#16304d',
        },
        surface: {
          DEFAULT: '#1f1f23',
        },
      },
    },
  },
  plugins: [],
};
