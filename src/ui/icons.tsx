import type { ReactNode } from 'react'

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

export const PlusIcon = () => <Svg><path d="M8 3v10M3 8h10" /></Svg>
export const MinusIcon = () => <Svg><path d="M3 8h10" /></Svg>
export const CloseIcon = () => <Svg><path d="M4 4l8 8M12 4l-8 8" /></Svg>
export const FitIcon = () => <Svg><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></Svg>
export const NoteIcon = () => <Svg><path d="M3 2.5h10v7.5l-3.5 3.5H3z" /><path d="M9.5 13.5V10H13M5.5 6h5M5.5 8.5h3" /></Svg>
export const TextIcon = () => <Svg><path d="M3 4V2.8h10V4M8 2.8v10.4M6 13.2h4" /></Svg>
export const PenIcon = () => <Svg><path d="M10.5 2.5l3 3L6 13l-3.5.5L3 10z" /><path d="M9 4l3 3" /></Svg>
export const LinkIcon = () => <Svg><rect x="1.8" y="9.5" width="4" height="4" rx="1" /><rect x="10.2" y="2.5" width="4" height="4" rx="1" /><path d="M5.8 11.5C9 11.5 7 4.5 10.2 4.5" /></Svg>
export const RectIcon = () => <Svg><rect x="2.5" y="3.5" width="11" height="9" rx="0.5" /></Svg>
export const EllipseIcon = () => <Svg><circle cx="8" cy="8" r="5.5" /></Svg>
export const TriangleIcon = () => <Svg><path d="M8 2.5l5.8 10.5H2.2z" /></Svg>
export const DiamondIcon = () => <Svg><path d="M8 2l6 6-6 6-6-6z" /></Svg>
export const BentoIcon = () => <Svg><rect x="2.5" y="2.5" width="6" height="6" rx="1" /><rect x="10.5" y="2.5" width="3" height="3" rx="1" /><rect x="10.5" y="7.5" width="3" height="6" rx="1" /><rect x="2.5" y="10.5" width="6" height="3" rx="1" /></Svg>
export const GridIcon = () => <Svg><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></Svg>
export const SearchIcon = () => <Svg><circle cx="7" cy="7" r="4.2" /><path d="M10.3 10.3L13.5 13.5" /></Svg>
export const SunIcon = () => <Svg><circle cx="8" cy="8" r="2.8" /><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1" /></Svg>
export const MoonIcon = () => <Svg><path d="M13 9.4A5.5 5.5 0 016.6 3a5.5 5.5 0 106.4 6.4z" /></Svg>
export const TrashIcon = () => <Svg><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></Svg>
export const DownloadIcon = () => <Svg><path d="M8 2.5v8M4.8 7.6L8 10.8l3.2-3.2M3 13.5h10" /></Svg>
export const UploadIcon = () => <Svg><path d="M8 10.8v-8M4.8 5.7L8 2.5l3.2 3.2M3 13.5h10" /></Svg>
export const SidebarIcon = () => <Svg><rect x="2.5" y="3" width="11" height="10" rx="2" /><path d="M6.5 3v10" /></Svg>
