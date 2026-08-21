import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/lib/cart';
import Header from '@/components/Header';
import CartDrawer from '@/components/CartDrawer';

export const metadata: Metadata = {
  title: "Netta's Pantry — Chef-made meals delivered across North Carolina",
  description:
    'Southern comfort food from Chef Netta, delivered weekly in returnable glass containers. Made fresh in North Carolina.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <CartProvider>
          <Header />
          <main className="min-h-screen">{children}</main>
          <CartDrawer />
          <footer className="border-t border-black/10 bg-white py-10 text-center text-sm text-black/50">
            <p>
              Made fresh in North Carolina. Glass in, glass out.{' '}
              <a
                href="https://yoursouthernfoodie.com/"
                className="underline hover:text-moss-600"
              >
                Catering &amp; events with Chef Netta
              </a>
            </p>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
