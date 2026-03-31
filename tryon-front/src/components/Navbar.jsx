export default function Navbar() {
    return (
        <nav className="flex justify-between items-center px-12 py-6 relative z-10">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-300 to-blue-300 bg-clip-text text-transparent">
                TryOnAI
            </h1>

            <div className="space-x-8 hidden md:flex text-gray-300">
                <a href="#">Features</a>
                <a href="#">Pricing</a>
                <a href="#">FAQ</a>
            </div>

            <button className="px-5 py-2 bg-gradient-to-r from-purple-300 to-blue-300 text-black rounded-full font-semibold">
                Get Started
            </button>
        </nav>
    );
}