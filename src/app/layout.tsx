import type { Metadata } from 'next';
import { Lobster_Two, Roboto } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { CartProvider } from '@/lib/cart';
import Header from '@/components/Header';
import CartDrawer from '@/components/CartDrawer';

const bodyFont = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
  display: 'swap',
});

const brandFont = Lobster_Two({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-brand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Netta's Pantry — Chef-made meals delivered across North Carolina",
  description:
    'Southern comfort food from Chef Netta, delivered weekly in returnable glass containers. Made fresh in North Carolina.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${brandFont.variable}`}>
      <body className="font-sans antialiased">
        <CartProvider>
          <Header />
          <main className="min-h-screen">{children}</main>
          <CartDrawer />
          <footer className="border-t border-brand-plum/15 bg-brand-plum text-white">
            <div className="mx-auto grid max-w-7xl gap-9 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_.8fr_.8fr] md:py-14">
              <div className="max-w-md">
                <p className="font-brand text-3xl">Netta&apos;s Pantry</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-[#d8c487]">by Your Southern Foodie</p>
                <p className="mt-5 text-sm leading-6 text-white/70">Chef-made Southern food, prepared with intention and delivered across North Carolina in reusable glass.</p>
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#d8c487]">Meal prep</h2>
                <nav className="mt-4 grid gap-3 text-sm text-white/75" aria-label="Footer meal prep navigation">
                  <Link href="/menu" className="w-fit hover:text-white">This Week&apos;s Menu</Link>
                  <Link href="/how-it-works" className="w-fit hover:text-white">How It Works</Link>
                  <Link href="/login" className="w-fit hover:text-white">Your Account</Link>
                </nav>
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#d8c487]">The wider table</h2>
                <div className="mt-4 grid gap-3 text-sm text-white/75">
                  <a href="https://yoursouthernfoodie.com/" className="w-fit hover:text-white">Your Southern Foodie</a>
                  <a href="https://yoursouthernfoodie.com/" className="w-fit hover:text-white">Catering &amp; Events</a>
                </div>
              </div>
            </div>
            <div className="border-t border-white/10">
              <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p>Made fresh in North Carolina. Glass in, glass out.</p>
                <p>© {new Date().getFullYear()} Your Southern Foodie</p>
              </div>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
