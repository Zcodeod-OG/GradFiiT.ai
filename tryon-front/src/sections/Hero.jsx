const Hero = () => {
    return (
        <section className="relative min-h-[921px] flex items-center px-6 lg:px-24 py-12">

            <div className="absolute top-20 right-[-5%] w-64 h-64 bg-primary-container border-4 border-black -rotate-12 hidden lg:block"></div>

            <div className="relative z-10 max-w-4xl">

                <div className="inline-block bg-tertiary-container border-2 border-black px-4 py-1 mb-6 font-label font-bold text-sm">
                    THE FUTURE OF FASHION
                </div>

                <h1 className="text-6xl md:text-8xl lg:text-[10rem] font-black font-headline leading-[0.85] uppercase">
                    BE ANYONE, <br />
                    WEAR <span className="text-primary italic">ANYTHING</span>
                </h1>

                <p className="text-xl md:text-2xl max-w-2xl mb-12 font-semibold">
                    The world's most advanced AI engine for hyper-realistic virtual try-ons.
                </p>

                <div className="flex gap-6">
                    <button className="bg-primary text-white text-2xl font-bold px-12 py-6 border-4 border-black neo-shadow-lg">
                        Try It Now
                    </button>

                    <button className="bg-white text-black text-2xl font-bold px-12 py-6 border-4 border-black neo-shadow-lg">
                        View Lookbook
                    </button>
                </div>
            </div>
        </section>
    )
}

export default Hero