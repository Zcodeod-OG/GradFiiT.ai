const Process = () => {
    return (
        <section className="bg-black py-32 px-6 lg:px-24 relative overflow-hidden">

            <h2 className="text-white text-5xl md:text-8xl font-black mb-24">
                THE PROCESS
            </h2>

            <div className="space-y-32">

                <div className="flex gap-12">
                    <div className="text-[8rem] font-black text-primary">01</div>
                    <div>
                        <h3 className="text-4xl text-white font-black mb-6">SNAP A PHOTO</h3>
                        <p className="text-gray-300 text-xl">
                            Upload a full body photo and AI maps your structure.
                        </p>
                    </div>
                </div>

                <div className="flex gap-12 ml-24">
                    <div className="text-[8rem] font-black text-secondary">02</div>
                    <div>
                        <h3 className="text-4xl text-white font-black mb-6">CHOOSE YOUR LOOK</h3>
                        <p className="text-gray-300 text-xl">
                            Browse outfits or upload your own.
                        </p>
                    </div>
                </div>

                <div className="flex gap-12 ml-48">
                    <div className="text-[8rem] font-black text-yellow-500">03</div>
                    <div>
                        <h3 className="text-4xl text-white font-black mb-6">SHARE & SHOP</h3>
                        <p className="text-gray-300 text-xl">
                            Get results instantly and share.
                        </p>
                    </div>
                </div>

            </div>
        </section>
    )
}

export default Process