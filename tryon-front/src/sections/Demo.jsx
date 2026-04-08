const Demo = () => {
    return (
        <section className="bg-surface-container-low py-24 px-6 lg:px-24">
            <div className="max-w-7xl mx-auto">

                <div className="grid grid-cols-1 lg:grid-cols-12 border-4 border-black bg-black neo-shadow-lg">

                    {/* BEFORE */}
                    <div className="lg:col-span-6 relative aspect-[4/5] bg-white border-b-4 lg:border-b-0 lg:border-r-4 border-black">
                        <img
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBb9UNFPXviIWq3lYIoJa1H7UGjm3zDvOPLNl-jiwYUgZu7b1nHEPemH_vsa7SGIMoSfLSRaINkagmHORHV7rQLtsg-KjWk5XcgnFbq5ZcrODPQB0YNpMzokIN0Sqhe4vjysn4TAOdD3Q_uGtCE9KZYgpVbRmEvJD3D-ZxU98am-_EPOPHTA1TWwBQ1qyTtvjEtuqYnDdEDpYwRMCpQU0s6qvuxtrlNAJDGZ7mNs8le9tXlfnhGI_f2-W3eJz579i80BwnoK_T7"
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute top-6 left-6 bg-black text-white px-4 py-2 font-bold">
                            BEFORE
                        </div>
                    </div>

                    {/* AFTER */}
                    <div className="lg:col-span-6 relative aspect-[4/5] bg-white">
                        <img
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAT2BA6sJ9TwC2G18K_06kSrnVSXMJdwncuYnxNu3jHDQTNw_GrbcNgu0hRdib7HXw4o3320HKcTvYzoaxnxeYLk4X1j57tBWVm5P58-uHQgfyYerV5wDE8dHHthdaxUeIxX-_gGPezLnTvaCQuX0dPg7rzf6BplEGlQhT-VAXoWKe3f6LiSXSrbMoIxer8-gBr5S4IY2Hg2IgzNaPmH_zpFbriMzixOpZy3AWXnkbk1e6VeC5qWcVP8XZUZ2qlynLP8U8BUeVC"
                            className="absolute inset-0 w-full h-full object-cover"
                        />

                        <div className="absolute top-6 right-6 bg-primary text-white px-4 py-2 font-bold">
                            AI TRANSFORMED
                        </div>

                        <div className="absolute bottom-10 left-10 right-10 bg-white/10 backdrop-blur-md border p-6">
                            <h3 className="text-white text-2xl font-bold mb-2">
                                Cyber-Chic Pack v.2
                            </h3>
                        </div>
                    </div>

                </div>

            </div>
        </section>
    )
}

export default Demo