const Navbar = () => {
    return (
        <nav className="fixed top-0 w-full z-50 border-b-4 border-zinc-900 bg-white/70 backdrop-blur-lg shadow-[4px_4px_0px_0px_rgba(45,47,47,1)] flex justify-between items-center px-6 py-4">

            <div className="text-2xl font-black text-zinc-900 font-headline uppercase tracking-tighter">
                VIRTUAL.AI
            </div>

            <div className="hidden md:flex gap-8 items-center">
                <a className="text-zinc-600 hover:text-zinc-900 font-headline uppercase">Try-On</a>
                <a className="text-zinc-600 hover:text-zinc-900 font-headline uppercase">Features</a>
                <a className="text-zinc-600 hover:text-zinc-900 font-headline uppercase">Pricing</a>
                <a className="text-zinc-600 hover:text-zinc-900 font-headline uppercase">How It Works</a>
            </div>

            <button className="bg-primary text-white px-6 py-2 border-2 border-black font-label font-bold hover:-translate-y-1 transition">
                Get Started
            </button>
        </nav>
    )
}

export default Navbar