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
  plus: ['M12 5v14M5 12h14'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6M14 11v6'],
  smile: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8 14s1.5 2 4 2 4-2 4-2', 'M9 9h.01M15 9h.01'],
  crown: ['M3 7l4 4 5-7 5 7 4-4-2 12H5z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  more: ['M12 5h.01M12 12h.01M12 19h.01'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  chevronDown: ['m6 9 6 6 6-6'],
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
