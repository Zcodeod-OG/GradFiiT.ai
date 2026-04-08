export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    theme: {
        extend: {
            colors: {
                primary: "#00684f",
                "primary-container": "#89f0cb",
                secondary: "#595a6b",
                "secondary-container": "#e1e1f5",
                tertiary: "#5f5d3b",
                "tertiary-container": "#fdf8cb",
                surface: "#f6f6f6",
                "on-surface": "#2d2f2f",
            },
            fontFamily: {
                headline: ["Epilogue"],
                body: ["Plus Jakarta Sans"],
                label: ["Space Grotesk"],
            },
        },
    },
    plugins: [],
}