import Navbar from "./components/Navbar";
import Hero from "./sections/Hero";
import Features from "./sections/Features";
import About from "./sections/About";

export default function App() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-[#1e1b4b] via-[#1e293b] to-[#0f172a] text-white relative overflow-hidden">

            {/* Background glow */}
            <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] bg-purple-400/20 blur-3xl rounded-full" />
            <div className="absolute bottom-[-100px] right-[-100px] w-[400px] h-[400px] bg-blue-400/20 blur-3xl rounded-full" />

            <Navbar />
            <Hero />
            <Features />
            <About />

        </div>
    );
}