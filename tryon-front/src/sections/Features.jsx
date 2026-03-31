export default function Features() {
    return (
        <section className="grid md:grid-cols-3 gap-8 px-12 py-16">
            <Card title="Outfits" desc="Try clothes instantly" />
            <Card title="Hairstyles" desc="Preview your look" />
            <Card title="AI Styling" desc="Smart suggestions" />
        </section>
    );
}

function Card({ title, desc }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-lg">
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="text-gray-400 mt-2">{desc}</p>
        </div>
    );
}