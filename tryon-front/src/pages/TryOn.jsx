const TryOn = () => {
    return (
        <div className="pt-32 px-6 lg:px-24 min-h-screen bg-surface">

            <h1 className="text-6xl font-black mb-12">TRY-ON LAB</h1>

            <div className="border-4 border-black p-12 neo-shadow-lg bg-white text-center">

                <p className="mb-6 text-xl">
                    Upload your photo to begin AI transformation
                </p>

                <input type="file" className="mb-6" />

                <button className="px-8 py-4 bg-primary text-white border-4 border-black font-bold">
                    GENERATE
                </button>

            </div>
        </div>
    )
}

export default TryOn