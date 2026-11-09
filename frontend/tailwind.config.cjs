module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { slate: { 900: '#142d43', 800: '#25445a', 700: '#3e596d' } },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        '2xs': '0 1px 2px rgb(15 23 42 / 0.04)',
        xs: '0 1px 3px rgb(15 23 42 / 0.06)',
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
};
