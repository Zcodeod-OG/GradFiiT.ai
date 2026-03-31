import { useState } from "react";
import { UploadCloud } from "lucide-react";

export default function Hero() {
    const [image, setImage] = useState(null);

    const handleUpload = (e) => {
        const file = e.target.files[0];
        if (file) setImage(URL.createObjectURL(file));
    };

    return (
        <section className="grid md:grid-cols-2 gap-12 px-12 py-20 items-center relative z-10">

            {/* Left */}
            <div>
                <h1 className="text-6xl font-extrabold leading-tight">
                    Try Your Style
                    <br />
                    <span className="bg-gradient-to-r from-purple-300 to-blue-300 bg-clip-text text-transparent">
            Before You Buy
          </span>
                </h1>

                <p className="mt-6 text-gray-400 max-w-lg">
                    Upload your photo and instantly see outfits, hairstyles, and looks powered by AI.
                </p>

                <button className="mt-8 px-8 py-3 bg-gradient-to-r from-purple-300 to-blue-300 text-black rounded-full font-semibold">
                    Try Now
                </button>
            </div>

            {/* Right */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">

                <label className="cursor-pointer block text-center p-8 border border-dashed border-gray-500 rounded-xl hover:bg-white/5 transition">
                    <UploadCloud className="mx-auto mb-3 text-purple-300" size={40} />
                    <p className="text-gray-400">Upload Image</p>
                    <input type="file" className="hidden" onChange={handleUpload} />
                </label>

                {image && (
                    <img src={image} className="mt-6 rounded-xl" />
                )}
            </div>
        </section>
    );
}