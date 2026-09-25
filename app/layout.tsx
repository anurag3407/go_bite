import type { Metadata } from 'next';
import { League_Spartan } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/lib/store/session-context';
import { CampusProvider } from '@/lib/store/campus-context';
import { CartProvider } from '@/lib/store/cart-context';
import { UiProvider } from '@/lib/store/ui-context';
import { AuthModal } from '@/components/auth/AuthModal';

const leagueSpartan = League_Spartan({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-league-spartan',
});

export const metadata: Metadata = {
  title: 'Go-Bite | Hyperlocal Campus Delivery & Concierge',
  description:
    'Order hot food, night mess, salon appointments, and laundry delivered directly to your hostel gate with 4-digit PIN verification.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${leagueSpartan.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-[#FAF6F4] text-[#1E1E24]">
        <SessionProvider>
          <UiProvider>
            <CampusProvider>
              <CartProvider>
                {children}
                {/* Mounted once, above the page, so any surface can prompt sign-in. */}
                <AuthModal />
              </CartProvider>
            </CampusProvider>
          </UiProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
