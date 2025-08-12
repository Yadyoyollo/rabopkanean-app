// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // สแกนไฟล์ JavaScript/JSX/TypeScript ในโฟลเดอร์ src
    "./public/index.html",       // สแกนไฟล์ index.html ในโฟลเดอร์ public
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'], // เพิ่ม Font Inter
      },
    },
  },
  plugins: [],
}
