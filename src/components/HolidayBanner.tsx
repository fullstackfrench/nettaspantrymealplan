import Link from "next/link";

export default function HolidayBanner() {
  return (
    <section
      className="bg-black text-white"
      aria-labelledby="holiday-banner-title"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.3fr_.7fr] lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d8c487]">
            Thanksgiving · Christmas · Holiday parties
          </p>
          <h2
            id="holiday-banner-title"
            className="mt-4 font-display text-4xl font-bold sm:text-5xl"
          >
            The Holiday Cheat Sheet
          </h2>
          <p className="mt-5 max-w-xl leading-7 text-white/75">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua.
          </p>
          <Link
            href="/holiday-cheat-sheet"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-[#d8c487] px-7 py-3 font-bold text-black transition hover:bg-[#e9d9a9]"
          >
            Explore the holiday menu
          </Link>
        </div>
        <div className="border-t border-white/20 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="font-display text-2xl font-bold">
            Chef Netta’s Holiday Menu
          </p>
          <p className="mt-3 leading-7 text-white/75">
            Pickup &amp; delivery available
          </p>
          <p className="mt-2 text-sm text-white/60">
            Meal drop-offs &amp; traditional catering
          </p>
        </div>
      </div>
    </section>
  );
}
