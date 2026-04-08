const Pricing = () => {
    return (
        <div className="pt-32 px-6 lg:px-24 min-h-screen bg-surface">

            <h1 className="text-6xl md:text-8xl font-black font-headline mb-16">
                PRICING
            </h1>

            <div className="grid md:grid-cols-3 gap-12">

                {/* BASIC */}
                <div className="border-4 border-black p-10 neo-shadow-lg bg-white">
                    <h2 className="text-3xl font-black mb-4">Basic</h2>
                    <p className="text-5xl font-black mb-6">₹0</p>
                    <ul className="mb-8 space-y-2">
                        <li>✔ 5 Try-ons / day</li>
                        <li>✔ Basic outfits</li>
                    </ul>
                    <button className="w-full py-3 border-4 border-black font-bold">
                        START
                    </button>
                </div>

                {/* PRO */}
                <div className="border-4 border-black p-10 neo-shadow-lg bg-primary-container">
                    <h2 className="text-3xl font-black mb-4">Pro</h2>
                    <p className="text-5xl font-black mb-6">₹499</p>
                    <ul className="mb-8 space-y-2">
                        <li>✔ Unlimited Try-ons</li>
                        <li>✔ Premium outfits</li>
                        <li>✔ AI Hairstyles</li>
                    </ul>
                    <button className="w-full py-3 border-4 border-black font-bold bg-black text-white">
                        GO PRO
                    </button>
                </div>

                {/* ELITE */}
                <div className="border-4 border-black p-10 neo-shadow-lg bg-secondary-container">
                    <h2 className="text-3xl font-black mb-4">Elite</h2>
                    <p className="text-5xl font-black mb-6">₹999</p>
                    <ul className="mb-8 space-y-2">
                        <li>✔ Everything in Pro</li>
                        <li>✔ Early features</li>
                        <li>✔ Creator tools</li>
                    </ul>
                    <button className="w-full py-3 border-4 border-black font-bold">
                        UPGRADE
                    </button>
                </div>

            </div>
        </div>
    )
}

export default Pricing