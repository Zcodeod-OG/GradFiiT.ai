import { Upload, Image } from "lucide-react";

export default function Demo() {
    return (
        <section className="px-10 py-20 grid md:grid-cols-2 gap-10 relative z-10">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
                <Upload className="mb-4 text-blue-400" />
                <h3 className="text-xl font-semibold">Upload Photo</h3>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
                <Image className="mb-4 text-pink-400" />
                <h3 className="text-xl font-semibold">See Results</h3>
            </div>
        </section>
    );
}