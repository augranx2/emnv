/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Palet merah maroon — dipakai untuk kop (header gradasi hitam ->
        // maroon) dan tombol utama, menggantikan aksen amber sebelumnya.
        maroon: {
          50: "#fdf2f2",
          100: "#f9dade",
          200: "#f0b0ba",
          300: "#e0808f",
          400: "#c94f61",
          500: "#a8283a",
          600: "#8a1f2f",
          700: "#6b1826",
          800: "#4a0f1a",
          900: "#33060d",
          950: "#1a0307",
        },
      },
    },
  },
  plugins: [],
};
