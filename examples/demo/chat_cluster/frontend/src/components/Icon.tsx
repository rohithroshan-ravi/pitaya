const PATHS = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  chat: ['M21 11.5a8.4 8.4 0 0 1-9 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.5 8.5 0 1 1 21 11.5z'],
  game: [
    'M6 7h12a4 4 0 0 1 4 4v2a4 4 0 0 1-7 2.6l-1-.6h-4l-1 .6A4 4 0 0 1 2 13v-2a4 4 0 0 1 4-4z',
    'M7 10v4M5 12h4',
    'M15.5 11h.01M17.5 13h.01',
  ],
  shuffle: ['M16 3h5v5', 'M4 20 21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  hash: ['M4 9h16M4 15h16M10 3 8 21M16 3l-2 18'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-3.5-3.5'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  users: [
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
    'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  ],
  chevron: ['m9 18 6-6-6-6'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
  stats: ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
  refresh: ['M23 4v6h-6', 'M20.5 15a9 9 0 1 1-2.1-9.4L23 10'],
  menu: ['M3 6h18M3 12h18M3 18h18'],
  close: ['M18 6 6 18M6 6l12 12'],
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

const CHANNEL_ICONS: Record<string, IconName> = { general: 'chat', game: 'game', random: 'shuffle' }

export const channelIcon = (channel: string): IconName => CHANNEL_ICONS[channel] ?? 'hash'
