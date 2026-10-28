import Image from "next/image";
import Link from "next/link";
import { Allura } from "next/font/google";

const holidayScript = Allura({ subsets: ["latin"], weight: "400", display: "swap" });

export default function HolidayHero({
  titleId,
  headingLevel = 2,
  showMenuLink = false,
  priority = false,
}: {
  titleId: string;
  headingLevel?: 1 | 2;
  showMenuLink?: boolean;
  priority?: boolean;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section
      className="relative isolate aspect-[4/3] w-full overflow-hidden bg-black text-white sm:aspect-[2/1]"
      aria-labelledby={titleId}
    >
      <Image
        src="/hassle-free-holidays-photo.jpg"
        alt="Glazed holiday ham surrounded by festive side dishes"
        fill
        priority={priority}
        sizes="100vw"
        className="object-cover object-[center_35%]"
      />
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <Heading
        id={titleId}
        aria-label="Hassle-free Holidays"
        className="absolute inset-x-0 top-[32%] -translate-y-1/2 px-4 text-center text-white drop-shadow-lg max-[360px]:top-[24%] sm:top-[24%] md:top-[28%] lg:top-[40%]"
      >
        <span className="block text-[clamp(1.75rem,5.5vw,6rem)] font-bold leading-none tracking-[0.18em]">Hassle-free</span>
        <span className={`${holidayScript.className} mt-2 block text-[clamp(4.25rem,11vw,12rem)] leading-[1.05]`}>Holidays</span>
      </Heading>
      <p className="absolute inset-x-0 bottom-10 px-4 pb-7 text-center text-xl font-medium leading-snug text-white drop-shadow-lg sm:bottom-[100px] sm:pb-10 sm:text-3xl lg:pb-14 lg:text-4xl">
        You make the memories. We&apos;ll make the meal.
      </p>
      {showMenuLink && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center px-4 sm:bottom-10">
          <Link
            href="/holiday-cheat-sheet"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#d8c487] px-7 py-2.5 text-center text-sm font-bold text-black shadow-soft transition hover:bg-[#e9d9a9] sm:min-h-12 sm:text-base"
          >
            Explore the holiday menu
          </Link>
        </div>
      )}
    </section>
  );
}
