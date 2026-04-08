const Features = () => {
    return (
        <section className="py-24 px-6 lg:px-24 bg-surface">

            <h2 className="text-5xl font-black font-headline mb-12">
                ENGINEERED FOR <span className="italic text-secondary">PERFECTION</span>
            </h2>

            <div className="grid md:grid-cols-3 gap-12">

                <div className="bg-primary-container p-10 border-4 border-black neo-shadow-lg">
                    <h3 className="text-3xl font-black">Virtual Wardrobe</h3>
                </div>

                <div className="bg-secondary-container p-10 border-4 border-black neo-shadow-lg">
                    <h3 className="text-3xl font-black">AI Salon</h3>
                </div>

                <div className="bg-tertiary-container p-10 border-4 border-black neo-shadow-lg">
                    <h3 className="text-3xl font-black">Instant Fit</h3>
                </div>

            </div>
        </section>
    )
}

export default Features