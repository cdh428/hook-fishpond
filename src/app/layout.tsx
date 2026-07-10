import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Happy Fishing Pond | 乐钓鱼塘 | บ่อตกปลาแฮปปี้',
  description: 'Book fishing spots, order food & drinks',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
