import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'PELAGIA · 未来海岸',
  description: '走进一座白色流线建筑与蓝色玻璃交织的滨水城市。使用 WASD 与鼠标，自由探索道路、广场和海岸。',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
