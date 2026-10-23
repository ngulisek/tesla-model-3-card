/** Original, recolorable Model 3 illustration. No external image requests. */
export function carSVG() {
  return `<svg class="car-art" viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="model3-art-title">
    <title id="model3-art-title">Model 3 illustration</title>
    <defs>
      <linearGradient id="m3-body-light" x1="0" y1="0" x2="0.18" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".62"/>
        <stop offset=".28" stop-color="#fff" stop-opacity=".17"/>
        <stop offset=".54" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".8" stop-color="#000" stop-opacity=".2"/>
        <stop offset="1" stop-color="#000" stop-opacity=".58"/>
      </linearGradient>
      <linearGradient id="m3-side-light" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".24"/>
        <stop offset=".15" stop-color="#fff" stop-opacity=".02"/>
        <stop offset=".52" stop-color="#000" stop-opacity=".12"/>
        <stop offset=".76" stop-color="#fff" stop-opacity=".15"/>
        <stop offset="1" stop-color="#000" stop-opacity=".24"/>
      </linearGradient>
      <linearGradient id="m3-glass" x1=".1" y1="0" x2=".8" y2="1">
        <stop offset="0" stop-color="#607780"/>
        <stop offset=".37" stop-color="#25343d"/>
        <stop offset=".68" stop-color="#142129"/>
        <stop offset="1" stop-color="#080e13"/>
      </linearGradient>
      <linearGradient id="m3-glass-reflection" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d3e8ed" stop-opacity=".45"/>
        <stop offset=".52" stop-color="#b2d5dd" stop-opacity=".03"/>
        <stop offset="1" stop-color="#b2d5dd" stop-opacity=".1"/>
      </linearGradient>
      <linearGradient id="m3-hood" x1=".2" y1="0" x2=".5" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".28"/>
        <stop offset=".66" stop-color="#fff" stop-opacity=".04"/>
        <stop offset="1" stop-color="#000" stop-opacity=".15"/>
      </linearGradient>
      <linearGradient id="m3-dark-trim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#263238"/>
        <stop offset=".45" stop-color="#11171c"/>
        <stop offset="1" stop-color="#060a0d"/>
      </linearGradient>
      <linearGradient id="m3-rim-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#b1bdc4"/>
        <stop offset=".3" stop-color="#64737e"/>
        <stop offset=".55" stop-color="#d6dce1"/>
        <stop offset="1" stop-color="#3c4852"/>
      </linearGradient>
      <radialGradient id="m3-tire">
        <stop offset=".6" stop-color="#11161a"/>
        <stop offset=".81" stop-color="#20262c"/>
        <stop offset=".95" stop-color="#080c10"/>
        <stop offset="1" stop-color="#030608"/>
      </radialGradient>
      <radialGradient id="m3-rim">
        <stop offset="0" stop-color="#555f68"/>
        <stop offset=".35" stop-color="#222c35"/>
        <stop offset=".81" stop-color="#121b22"/>
        <stop offset="1" stop-color="#4a5761"/>
      </radialGradient>
      <radialGradient id="m3-ground">
        <stop offset="0" stop-color="#000" stop-opacity=".7"/>
        <stop offset=".65" stop-color="#000" stop-opacity=".27"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="m3-headlight" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#c8efff"/>
        <stop offset=".34" stop-color="#fff"/>
        <stop offset="1" stop-color="#a8c0ce"/>
      </linearGradient>
      <filter id="m3-light-bloom" x="-40%" y="-100%" width="180%" height="300%">
        <feGaussianBlur stdDeviation="2.5"/>
      </filter>
      <path id="m3-body-shape" d="M93 186c7-12 20-20 42-25l86-17 41-36c22-19 59-27 104-25 49 2 89 12 115 33l45 31c37 4 58 15 67 31 7 13 10 26 6 40l-23 11-6-1c1-31-17-54-43-54-28 0-47 24-46 56l-242 1c1-32-17-55-45-55-28 0-47 24-47 53l-28-3c-18-2-29-10-31-20-1-7 0-14 5-20Z"/>
      <g id="m3-wheel">
        <ellipse cx="0" cy="0" rx="38" ry="40" fill="url(#m3-tire)"/>
        <ellipse cx="0" cy="0" rx="35" ry="37" fill="none" stroke="#81909b" stroke-opacity=".12" stroke-width="1"/>
        <ellipse cx="0" cy="0" rx="28.5" ry="30" fill="url(#m3-rim)" stroke="#7c8b95" stroke-width="1.3"/>
        <ellipse cx="0" cy="0" rx="23" ry="24" fill="#121a20"/>
        <ellipse cx="0" cy="0" rx="19" ry="20" fill="none" stroke="#76808a" stroke-opacity=".3" stroke-width="5"/>
        <path d="M15-17c4 3 7 7 8 13l-6 1c-1-4-2-7-5-10Z" fill="#69757e"/>
        <g fill="url(#m3-rim-metal)">
          <path d="M-4-6-12-25l7-3L3-9 2-3Z"/>
          <path d="M-4-6-12-25l7-3L3-9 2-3Z" transform="rotate(72)"/>
          <path d="M-4-6-12-25l7-3L3-9 2-3Z" transform="rotate(144)"/>
          <path d="M-4-6-12-25l7-3L3-9 2-3Z" transform="rotate(216)"/>
          <path d="M-4-6-12-25l7-3L3-9 2-3Z" transform="rotate(288)"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z" transform="rotate(72)"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z" transform="rotate(144)"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z" transform="rotate(216)"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z" transform="rotate(288)"/>
        </g>
        <circle r="7.4" fill="#77848e"/>
        <circle r="5.8" fill="#26333d"/>
        <circle cy="-3.7" r=".7" fill="#c8d0d4"/>
        <circle cx="3.5" cy="-1.2" r=".7" fill="#c8d0d4"/>
        <circle cx="2.2" cy="3" r=".7" fill="#c8d0d4"/>
        <circle cx="-2.2" cy="3" r=".7" fill="#c8d0d4"/>
        <circle cx="-3.5" cy="-1.2" r=".7" fill="#c8d0d4"/>
        <circle r="1.8" fill="#b0bac1"/>
        <path d="M-24-18a30 30 0 0 1 46 0" fill="none" stroke="#e9f0f4" stroke-opacity=".28" stroke-width=".8"/>
      </g>
    </defs>

    <ellipse cx="347" cy="251" rx="285" ry="24" fill="url(#m3-ground)"/>
    <path d="m122 219 57 18 361-1 45-15-7-21-446-1Z" fill="#05090c"/>

    <use href="#m3-wheel" transform="translate(194 217)"/>
    <use href="#m3-wheel" transform="translate(527 214) scale(.97)"/>

    <use href="#m3-body-shape" fill="var(--car-paint, #d5dbe1)"/>
    <use href="#m3-body-shape" fill="url(#m3-body-light)"/>

    <!-- The continuous glass roof and slim window surrounds. -->
    <path d="m227 144 39-33c23-20 56-26 98-25 47 2 87 11 112 31l43 29c-102 1-198 1-292-2Z" fill="#080e13"/>
    <path d="m236 141 36-31c23-16 54-22 91-20 43 2 79 9 104 28l37 25-268-2Z" fill="url(#m3-glass)"/>
    <path d="m238 139 35-29c20-14 47-20 78-20l-25 51Z" fill="url(#m3-glass-reflection)"/>
    <path d="m335 140 21-50 14 1-11 50Z" fill="#0b1218"/>
    <path d="m361 141 11-50c40 3 72 10 94 27l32 24Z" fill="url(#m3-glass-reflection)" opacity=".45"/>
    <path d="m446 106 12 37 9 .1-12-32Z" fill="#0b1218"/>
    <path d="m267 108 69-14c40-4 82 2 116 14" fill="none" stroke="#e8f4f7" stroke-opacity=".3" stroke-width="1.2"/>
    <path d="m231 144 289 2" fill="none" stroke="#02070b" stroke-width="3.2"/>
    <path d="m230 147 289 2" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/>

    <!-- Hood, fender, doors, and the subtle lower reflected horizon. -->
    <path d="m100 181 37-17 86-18 66 8-47 16-96 11Z" fill="url(#m3-hood)"/>
    <path d="M111 179c58-2 102-9 135-18l256-4c40 0 67 3 84 11-39-7-79-8-115-6l-232 7c-49 10-95 13-128 10Z" fill="#fff" opacity=".27"/>
    <path d="M242 169c79-7 174-8 259-7-17 15-24 34-24 58l-231 3c0-21-3-39-4-54Z" fill="url(#m3-side-light)"/>
    <path d="M247 215c71-7 149-10 227-8l-2 11-224 6Z" fill="#fff" opacity=".09"/>
    <path d="M243 225c74 0 152-2 235-4l1 7-237 2Z" fill="#080f14" opacity=".69"/>
    <path d="m252 226 218-3" fill="none" stroke="#d6e1e8" stroke-opacity=".28" stroke-width="1"/>
    <path d="M289 149c-6 19-11 42-9 65 0 5 4 8 10 8m69-73-3 71m110-70c12 21 14 39 11 63" fill="none" stroke="#051018" stroke-opacity=".43" stroke-width="1.1"/>
    <path d="m292 151-7 34m75-34-2 64m111-61 5 15" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width=".7"/>
    <path d="m318 162 21-.6" stroke="#111e27" stroke-width="3.2" stroke-linecap="round"/>
    <path d="m319 161.5 18-.5" stroke="#e5edf1" stroke-opacity=".46" stroke-width=".8" stroke-linecap="round"/>
    <path d="m433 160 20 .1" stroke="#111e27" stroke-width="3.1" stroke-linecap="round"/>
    <path d="m434 159.6 17 .1" stroke="#e5edf1" stroke-opacity=".46" stroke-width=".8" stroke-linecap="round"/>

    <!-- Body-color mirror with a black base. -->
    <path d="m275 147 10 11-17 4-9-10Z" fill="#050c11"/>
    <path d="M255 144c2-4 8-5 13-3l15 6c2 2 1 5-2 6l-21 1c-5 0-8-6-5-10Z" fill="var(--car-paint, #d5dbe1)"/>
    <path d="M255 144c2-4 8-5 13-3l15 6-25 2Z" fill="#fff" opacity=".3"/>
    <path d="m257 152 23-1" stroke="#0b171f" stroke-width="2.3" stroke-linecap="round"/>

    <!-- Sculpted wheel arches sit just above the tire shoulders. -->
    <path d="M147 226c0-31 19-52 47-52s46 21 46 54M481 227c-1-31 18-54 46-54 27 0 44 22 44 51" fill="none" stroke="#071016" stroke-opacity=".48" stroke-width="2.5"/>
    <path d="M151 196c8-17 24-26 43-26 21 0 37 10 44 29m247-5c9-16 23-24 42-24 17 0 31 8 39 22" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="1.1"/>

    <!-- Front fascia: slender lamps and a low, understated intake. -->
    <path d="m104 180 14-10 42-4-12 12-31 7Z" fill="#101e28"/>
    <path d="m111 177 12-4 30-3-7 5-28 5Z" fill="url(#m3-headlight)"/>
    <path d="m112 177 37-5" stroke="#c9f1ff" stroke-opacity=".6" stroke-width="3" filter="url(#m3-light-bloom)"/>
    <path d="m111 177 37-5" stroke="#f3fbff" stroke-width="1.3" stroke-linecap="round"/>
    <path d="m99 189 28 1 12-4" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width="1"/>
    <path d="M91 204c13 6 29 7 48 6l-2 10c-16-1-29-3-39-7Z" fill="url(#m3-dark-trim)"/>
    <path d="m98 205 38 7" stroke="#475b68" stroke-opacity=".5" stroke-width=".8"/>
    <path d="m126 191 7 0-1 12-6-1Z" fill="#12202a" opacity=".78"/>
    <path d="M92 215c14 10 34 11 52 12" fill="none" stroke="#02070b" stroke-width="2"/>
    <path d="m164 164 47-10 28 2" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".9"/>

    <!-- Rear quarter, lamp, charging door, and bumper trim. -->
    <path d="m530 149 44 10 13 9-49-11Z" fill="#fff" opacity=".16"/>
    <path d="m572 165 16 5 6 10-19-6Z" fill="#320b14"/>
    <path d="m575 168 13 4 3 4-15-5Z" fill="#ed4d5a"/>
    <path d="m577 168 11 4" stroke="#ffb0b2" stroke-opacity=".6" stroke-width="1"/>
    <path d="m552 157 13 3 4 11-14-2Z" fill="none" stroke="#07121a" stroke-opacity=".42" stroke-width=".8"/>
    <path d="m580 214 18-7-1 9-20 9Z" fill="url(#m3-dark-trim)"/>
    <path d="m582 202 12-4" stroke="#c6424a" stroke-width="2" stroke-linecap="round"/>
    <path d="m531 148 47 13" fill="none" stroke="#06121b" stroke-opacity=".42" stroke-width=".8"/>
  </svg>`;
}
