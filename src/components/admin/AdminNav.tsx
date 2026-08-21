'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/meals', label: 'Meals' },
  { href: '/admin/menus', label: 'Weekly menus' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/customers', label: 'Customers & glass' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Chef dashboard navigation">
      {links.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 snap-start items-center rounded-full px-4 py-2.5 text-sm font-bold transition ${active ? 'bg-brand-plum text-white shadow-soft' : 'bg-white text-brand-plum ring-1 ring-brand-plum/15 hover:bg-brand-plum/5 hover:ring-brand-plum/30'}`}>{link.label}</Link>;
      })}
    </nav>
  );
}
