import { memo, useId, useMemo } from 'react';
import {
  ground,
  projectShadow,
  projectSun,
  sunIsVisible,
  solarLighting,
  trajectory,
  type Point,
  type SolarDay,
  type SolarPosition,
} from '@/lib/solar';

const arch =
  'M24 431V156Q24 114 74 105Q104 64 198 68Q238 38 317 42Q370 21 400 2Q430 21 483 42Q562 38 602 68Q696 64 726 105Q776 114 776 156V431';
const star = 'M16 2L21 11L30 16L21 21L16 30L11 21L2 16L11 11Z';
const buildings = [
  [34, 0.68],
  [84, 0.95],
  [146, 0.64],
  [190, 1.24],
  [269, 0.43],
  [320, 0.67],
  [483, 0.6],
  [540, 0.43],
  [605, 1.28],
  [675, 0.81],
  [744, 0.71],
];
const stars = [
  [69, 166],
  [110, 93],
  [155, 128],
  [223, 91],
  [275, 148],
  [320, 110],
  [360, 164],
  [453, 114],
  [509, 85],
  [562, 142],
  [622, 94],
  [683, 147],
  [730, 173],
  [610, 183],
  [187, 180],
  [126, 195],
];

export type SceneMarker = {
  key: string;
  position: SolarPosition;
  selected: boolean;
};

const Skyline = memo(function Skyline() {
  return (
    <g fill="currentColor">
      <path
        d="M0 312Q81 282 160 293T326 286T470 285T620 285T800 312V355H0Z"
        opacity=".76"
      />
      {buildings.map(([x, scale], index) => (
        <g
          key={x}
          transform={`translate(${x} ${index > 6 ? 294 : 292}) scale(${scale})`}
        >
          <path d="M-30 0V-16H-24V-34C-36-51-12-55 0-73C12-55 36-51 24-34V-16H31V0Z" />
          <path d="M-42 1V-65H-46V-70H-42V-86L-37-97L-32-86V-70H-28V-65H-32V1ZM36 1V-60H32V-65H36V-76L40-85L44-76V-65H48V-60H44V1Z" />
          <path
            d="M1-73V-85M-37-97V-104"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path d="M1-91a4 4 0 1 0 4 5a3 3 0 0 1-4-5" />
          <path
            d="M-4-15v-9q4-7 8 0v9zm-13 0v-7q3-6 6 0v7zm28 0v-7q3-6 6 0v7z"
            fill="#96a7a0"
            opacity=".32"
          />
        </g>
      ))}
    </g>
  );
});

const HumanFigure = memo(function HumanFigure({
  fabric,
  cap,
}: {
  fabric: string;
  cap: string;
}) {
  return (
    <g transform={`translate(${ground.x} ${ground.y}) scale(1.65)`}>
      <ellipse cx="0" cy="1" rx="13" ry="4" fill="#0a1921" opacity=".38" />
      <path
        d="M-9-8l-1 6q-2 3 1 3l7-1 1-9M4-9l1 9 7 1q3-1 1-4l-3-6"
        fill="#282822"
      />
      <path
        d="M-7-38l-9 7-2 10 2 3 3-2 3-10m18-8 8 7 2 10-2 3-3-2-3-10"
        fill="#aa7759"
      />
      <path
        d="M-5-51v6l-8 4v13l3 16-1 5q12 5 23 0l-2-19 3-15-8-4v-6z"
        fill={fabric}
        stroke="#b6aa86"
        strokeWidth=".6"
      />
      <path
        d="M-13-42q-4 2-6 21l5 2 5-17m22-6q4 2 6 21l-5 2-5-17"
        fill={fabric}
        stroke="#a49b80"
        strokeWidth=".6"
      />
      <path
        d="M-7-36l-1 24m5-27 1 30m7-20 3 18m-17-29q9 5 18 0"
        fill="none"
        stroke="#7d765f"
        opacity=".5"
        strokeWidth=".7"
      />
      <path d="M-7-55q0-8 7-8t7 8q0 7-7 9-7-2-7-9z" fill="#986750" />
      <path d="M-7-54q7 4 14 0l-1 4q-6 4-12 0z" fill="#3d3028" />
      <path d="M-8-56v-4q1-6 8-6t8 6v4q-7 5-16 0z" fill={cap} />
      <path
        d="M-7-59q7 4 14 0m-12-3q5 3 10 0"
        fill="none"
        stroke="#a9a183"
        strokeWidth=".65"
      />
    </g>
  );
});

const silhouette = [
  [-8, 0],
  [-10, 0.13],
  [-10, 0.29],
  [-14, 0.31],
  [-18, 0.36],
  [-16, 0.56],
  [-13, 0.7],
  [-6, 0.76],
  [-5, 0.81],
  [-8, 0.86],
  [-7, 0.95],
  [-4, 1],
  [4, 1],
  [7, 0.95],
  [8, 0.86],
  [5, 0.81],
  [6, 0.76],
  [13, 0.7],
  [16, 0.56],
  [18, 0.36],
  [14, 0.31],
  [10, 0.48],
  [9, 0.29],
  [10, 0.13],
  [10, 0],
  [4, 0],
  [2, 0.17],
  [0, 0.3],
  [-2, 0.17],
  [-3, 0],
];

function HumanShadow({
  vector,
  blur,
  opacity,
}: {
  vector: Point;
  blur: string;
  opacity: number;
}) {
  const north = vector.y / ground.tilt;
  const length = Math.hypot(vector.x, north) || 1;
  const width = { x: -north / length, y: (vector.x / length) * ground.tilt };
  const points = silhouette
    .map(([offset, height]) => {
      const turn = Math.min(1, height * 4);
      const scaledOffset = offset * 1.46;
      return [
        ground.x +
          vector.x * height +
          scaledOffset * (1 - turn + turn * width.x),
        ground.y + vector.y * height + scaledOffset * turn * width.y,
      ].join(',');
    })
    .join(' ');
  return (
    <polygon
      className="scene-shadow"
      points={points}
      fill="#0b1620"
      opacity={opacity}
      filter={blur}
    />
  );
}

export function SolarScene({
  day,
  position,
  markers,
  time,
  sunLabel,
  expanded,
  onToggle,
}: {
  day: SolarDay;
  position: SolarPosition;
  markers: SceneMarker[];
  time: number;
  sunLabel: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const id = useId().replaceAll(':', '');
  const asset = (key: string) => `${id}-${key}`;
  const paint = (key: string) => `url(#${asset(key)})`;
  const path = useMemo(() => trajectory(day), [day]);
  const sun = projectSun(position);
  const shadow = projectShadow(position);
  const apex = useMemo(() => {
    if (day.transit === null) return null;
    const noon = day.position(day.transit);
    return sunIsVisible(noon.altitude) ? projectSun(noon) : null;
  }, [day]);
  const daylight = sunIsVisible(position.altitude);
  const {
    daylight: light,
    warmth,
    evening,
    stars: starlight,
  } = solarLighting(
    position.altitude,
    time - (day.transit ?? (day.start + day.end) / 2),
  );
  return (
    <svg className="solar-scene" viewBox="0 0 800 438" focusable="false">
      <defs>
        <radialGradient id={asset('sky')} cx="50%" cy="68%" r="67%">
          <stop stopColor="#fff2d5" />
          <stop offset=".52" stopColor="#a9dce8" />
          <stop offset="1" stopColor="#4999c7" />
        </radialGradient>
        <radialGradient id={asset('dusk')}>
          <stop stopColor="#ffcd78" stopOpacity=".95" />
          <stop offset="1" stopColor="#d59263" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={asset('sunset')}>
          <stop stopColor="#fe8167" stopOpacity=".9" />
          <stop offset="1" stopColor="#e46356" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={asset('floor-day')}>
          <stop stopColor="#a8bcb2" />
          <stop offset="1" stopColor="#678d94" />
        </radialGradient>
        <radialGradient id={asset('floor')}>
          <stop stopColor="#447578" />
          <stop offset="1" stopColor="#182f3b" />
        </radialGradient>
        <linearGradient id={asset('arc')}>
          <stop stopColor="#78b9b8" />
          <stop offset=".5" stopColor="#f5e2b1" />
          <stop offset="1" stopColor="#c58a64" />
        </linearGradient>
        <linearGradient id={asset('fabric')}>
          <stop stopColor="#77735e" />
          <stop offset=".42" stopColor="#dcd6c1" />
          <stop offset=".68" stopColor="#ede5cb" />
          <stop offset="1" stopColor="#a6916b" />
        </linearGradient>
        <radialGradient id={asset('sun')}>
          <stop stopColor="#fffbd5" />
          <stop offset=".65" stopColor="#ffe8a1" />
          <stop offset="1" stopColor="#ffbe58" />
        </radialGradient>
        <radialGradient id={asset('halo')}>
          <stop stopColor="#ffdc87" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffcc6b" stopOpacity="0" />
        </radialGradient>
        <pattern
          id={asset('tiles')}
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M20 0L26 14L40 20L26 26L20 40L14 26L0 20L14 14ZM0 0L14 14M40 0L26 14M0 40L14 26M40 40L26 26M20 7L33 20L20 33L7 20Z"
            stroke="#d4c299"
            fill="none"
            strokeWidth=".8"
          />
        </pattern>
        <pattern
          id={asset('frame')}
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <use
            href={`#${asset('star')}`}
            stroke="#a9bca9"
            strokeWidth=".7"
            fill="none"
          />
          <path
            d="M0 0L11 11M32 0L21 11M0 32L11 21M32 32L21 21"
            stroke="#a9bca9"
            strokeWidth=".7"
          />
        </pattern>
        <path id={asset('star')} d={star} />
        <clipPath id={asset('arch')}>
          <path d={`${arch}Z`} />
        </clipPath>
        <filter id={asset('blur')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.15" />
        </filter>
      </defs>
      <path d="M0 0H800V438H0Z" fill={paint('frame')} opacity=".15" />
      <g clipPath={paint('arch')}>
        <rect width="800" height="438" fill="#0a1b29" />
        <rect width="800" height="438" fill={paint('sky')} opacity={light} />
        <ellipse
          cx={sun.x}
          cy={Math.max(215, sun.y)}
          rx="320"
          ry="185"
          fill={paint('dusk')}
          opacity={warmth * (1 - evening * 0.65)}
        />
        <ellipse
          cx={sun.x}
          cy={Math.max(216, sun.y)}
          rx="390"
          ry="205"
          fill={paint('sunset')}
          opacity={warmth * evening}
        />
        <g fill="#f1dfb6" opacity={0.85 * starlight}>
          {stars.map(([x, y], index) => (
            <circle key={x} cx={x} cy={y} r={index % 3 === 0 ? 1.65 : 0.9} />
          ))}
          {!daylight && (
            <path d="M646 100a19 19 0 1 0 20 24a17 17 0 0 1-20-24z" />
          )}
        </g>
        <g color="#102a35">
          <Skyline />
        </g>
        <g color="#477681" opacity={light * 0.82}>
          <Skyline />
        </g>
        <ellipse
          cx={ground.x}
          cy={ground.y + 7}
          rx={ground.radius}
          ry={ground.radius * ground.tilt}
          fill="#091a23"
        />
        <g
          transform={`translate(${ground.x} ${ground.y}) scale(1 ${ground.tilt})`}
        >
          <circle r={ground.radius} fill={paint('floor')} />
          <circle r={ground.radius} fill={paint('floor-day')} opacity={light} />
          <circle
            r={ground.radius - 4}
            fill={paint('tiles')}
            opacity={0.13 + light * 0.26}
          />
          <circle
            r={ground.radius - 14}
            fill="none"
            stroke="#b6a47c"
            strokeWidth="2"
            opacity=".52"
          />
          <circle
            r={ground.radius}
            fill="none"
            stroke="#c6ac72"
            strokeWidth="2.5"
            opacity=".74"
          />
        </g>
        <path
          d={path}
          fill="none"
          stroke={light > 0.65 ? '#276172' : paint('arc')}
          strokeWidth="1.5"
          opacity=".9"
        />
        {apex && (
          <path
            d="M0-5L4 0L0 5L-4 0Z"
            fill="#eadab2"
            transform={`translate(${apex.x} ${apex.y})`}
          />
        )}
        {markers
          .filter(({ position }) => sunIsVisible(position.altitude))
          .map((marker) => {
            const point = projectSun(marker.position);
            return (
              <circle
                key={marker.key}
                cx={point.x}
                cy={point.y}
                r={marker.selected ? 6 : 3.5}
                fill={marker.selected ? '#ffe2a0' : '#c7dbcf'}
                stroke="#1a3d47"
                strokeWidth="1.2"
              />
            );
          })}
        {shadow && (
          <HumanShadow
            vector={shadow}
            blur={paint('blur')}
            opacity={Math.min(0.75, position.altitude * 0.42)}
          />
        )}
        <HumanFigure fabric={paint('fabric')} cap="#e9dec2" />
        <g
          className="scene-compass"
          fill="#e2d2a9"
          fontSize="11"
          textAnchor="middle"
        >
          <text x="163" y="343">
            E
          </text>
          <text x="637" y="343">
            W
          </text>
          <text x="400" y="407">
            N
          </text>
        </g>
      </g>
      {daylight && (
        <g
          className="scene-sun"
          role="button"
          tabIndex={0}
          aria-label={sunLabel}
          aria-expanded={expanded}
          aria-controls="solar-position-reading"
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggle();
            }
          }}
          transform={`translate(${sun.x} ${sun.y})`}
        >
          <circle className="sun-target" r="54" fill="transparent" />
          <circle r="72" pointerEvents="none" fill={paint('halo')} />
          <circle
            r="25"
            stroke="#ffe5a5"
            strokeWidth="1"
            fill="none"
            opacity=".45"
          />
          <circle r="19" fill={paint('sun')} />
        </g>
      )}
      <path
        d={arch}
        fill="none"
        stroke="#c0a978"
        strokeWidth="1"
        opacity=".74"
      />
      <path
        d={arch}
        transform="translate(8 7) scale(.98 .98)"
        fill="none"
        stroke="#bba576"
        strokeWidth=".8"
        opacity=".3"
      />
    </svg>
  );
}
