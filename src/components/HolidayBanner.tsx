import Link from "next/link";
import Image from "next/image";

export default function HolidayBanner() {
  return (
    <section
      className="bg-black text-white"
      aria-labelledby="holiday-banner-title"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d8c487]">
            Thanksgiving · Christmas · Holiday parties
          </p>
          <h2
            id="holiday-banner-title"
            className="mt-4 font-display text-4xl font-bold sm:text-5xl"
          >
            Hassle-free Holidays
          </h2>
          <p className="mt-5 max-w-xl leading-7 text-white/75">
            You make the memories. We&apos;ll make the meal.
          </p>
          <Link
            href="/holiday-cheat-sheet"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-[#d8c487] px-7 py-3 font-bold text-black transition hover:bg-[#e9d9a9]"
          >
            Explore the holiday menu
          </Link>
        </div>
        <div>
          <Image
            src="/hassle-free-holidays.png"
            alt="Hassle-free Holidays: a glazed ham with holiday side dishes"
            width={2880}
            height={2304}
            sizes="(max-width: 1023px) 100vw, 45vw"
            className="h-auto w-full rounded-panel"
          />
          <p className="mt-3 text-sm text-white/75">Pickup &amp; delivery · Meal drop-offs &amp; traditional catering</p>
        </div>
      </div>
    </section>
  );
}
