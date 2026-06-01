import type { SVGProps } from 'react';

type IconName =
  | 'arrow-left'
  | 'book'
  | 'bulb'
  | 'check'
  | 'check-circle'
  | 'chevron-left-panel'
  | 'chevron-right-panel'
  | 'clock'
  | 'cloud'
  | 'copy'
  | 'database'
  | 'edit'
  | 'experiment'
  | 'file-search'
  | 'file-text'
  | 'folder'
  | 'grid'
  | 'image'
  | 'list'
  | 'loader'
  | 'lock'
  | 'log-out'
  | 'mail'
  | 'message'
  | 'more'
  | 'paperclip'
  | 'plus'
  | 'robot'
  | 'search'
  | 'settings'
  | 'share'
  | 'table'
  | 'thunderbolt'
  | 'tool'
  | 'user'
  | 'x'
  | 'x-circle';

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

const paths: Record<IconName, string[]> = {
  'arrow-left': ['M19 12H5', 'M12 19l-7-7 7-7'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z'],
  bulb: ['M9 18h6', 'M10 22h4', 'M12 2a7 7 0 0 0-4 12.75V16h8v-1.25A7 7 0 0 0 12 2z'],
  check: ['M20 6 9 17l-5-5'],
  'check-circle': ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  'chevron-left-panel': ['M15 18l-6-6 6-6', 'M3 4v16'],
  'chevron-right-panel': ['M9 18l6-6-6-6', 'M21 4v16'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  cloud: ['M17.5 19H7a5 5 0 1 1 1.1-9.88A7 7 0 0 1 21 12a4 4 0 0 1-3.5 7z'],
  copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
  database: ['M4 6c0-2.2 3.6-4 8-4s8 1.8 8 4-3.6 4-8 4-8-1.8-8-4z', 'M4 6v6c0 2.2 3.6 4 8 4s8-1.8 8-4V6', 'M4 12v6c0 2.2 3.6 4 8 4s8-1.8 8-4v-6'],
  edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
  experiment: ['M10 2v6l-5.5 9.5A3 3 0 0 0 7.1 22h9.8a3 3 0 0 0 2.6-4.5L14 8V2', 'M8 2h8', 'M7 16h10'],
  'file-search': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M10.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M12.3 15.8 15 18.5'],
  'file-text': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h6'],
  folder: ['M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M21 15l-5-5L5 21'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  loader: ['M12 2v4', 'M12 18v4', 'M4.93 4.93l2.83 2.83', 'M16.24 16.24l2.83 2.83', 'M2 12h4', 'M18 12h4'],
  lock: ['M6 10V8a6 6 0 0 1 12 0v2', 'M5 10h14v12H5z'],
  'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  mail: ['M4 4h16v16H4z', 'M22 6 12 13 2 6'],
  message: ['M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z'],
  more: ['M12 5h.01', 'M12 12h.01', 'M12 19h.01'],
  paperclip: ['M21.4 11.6 12 21a6 6 0 0 1-8.5-8.5l9.8-9.8a4 4 0 0 1 5.7 5.7L9.9 17.5a2 2 0 1 1-2.8-2.8l8.5-8.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  robot: ['M12 8V4', 'M6 12a6 6 0 0 1 12 0v6H6z', 'M8 16h.01', 'M16 16h.01'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  settings: ['M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.35 1.05V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1A1.65 1.65 0 0 0 2.95 13H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 7.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6A1.65 1.65 0 0 0 10.35 3V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.35.69.6 1 .29.29.67.47 1.05.5H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z'],
  share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v14'],
  table: ['M3 5h18v14H3z', 'M3 10h18', 'M9 5v14', 'M15 5v14'],
  thunderbolt: ['M13 2 3 14h8l-1 8 10-12h-8z'],
  tool: ['M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.8-2.8z'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  'x-circle': ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M15 9l-6 6', 'M9 9l6 6'],
};

export function Icon({ name, className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={`ui-icon ${name === 'loader' ? 'is-spinning' : ''} ${className ?? ''}`}
      fill="none"
      height="1em"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="1em"
      {...props}
    >
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
