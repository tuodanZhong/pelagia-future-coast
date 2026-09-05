import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'PELAGIA · 未来海岸',
  description: '使用 WASD 与鼠标，以第一或第三人称自由探索写实滨水城市。真实人物、午后光影、道路、广场与海岸。',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
