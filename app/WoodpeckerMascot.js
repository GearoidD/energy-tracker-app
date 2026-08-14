"use client";

export default function WoodpeckerMascot({ size = 56 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wpPeck {
          0%, 60%, 100% { transform: rotate(0deg); }
          68% { transform: rotate(16deg); }
          76% { transform: rotate(0deg); }
        }
        @keyframes wpSpark {
          0%, 66% { opacity: 0; }
          72% { opacity: 1; }
          82% { opacity: 0; }
        }
        @keyframes wpBob {
          0%, 60%, 100% { transform: translateY(0); }
          76% { transform: translateY(1.5px); }
        }
        .wp-mascot-peck { animation: wpPeck 1.4s ease-in-out infinite; transform-origin: 372px 168px; }
        .wp-mascot-spark { animation: wpSpark 1.4s ease-in-out infinite; opacity: 0; }
        .wp-mascot-bob { animation: wpBob 1.4s ease-in-out infinite; }
      ` }} />
      <svg width="100%" height="100%" viewBox="220 90 240 220" role="img" aria-label="Wattpryce mascot">
        <g className="wp-mascot-bob">
          <path d="M300 250 Q290 210 310 190 Q330 175 360 185 Q385 195 388 225 Q390 255 365 268 Q335 278 300 250 Z" fill="#2fa79a" />
          <path d="M300 250 Q330 262 355 258 Q345 275 320 272 Q305 265 300 250 Z" fill="#1f6e68" />
          <path d="M300 245 Q255 250 235 275 Q260 258 302 258 Z" fill="#164e49" />
          <path d="M362 250 L392 262 L370 240 Z" fill="#164e49" />

          <g className="wp-mascot-peck">
            <circle cx="372" cy="168" r="38" fill="#2fa79a" />
            <path d="M346 132 Q356 100 366 130 Q376 96 386 128 Q394 104 400 132" fill="#e8a33d" />
            <path d="M406 166 L446 170 L406 180 Z" fill="#e8a33d" />
            <circle cx="388" cy="158" r="6" fill="#0e1a1d" />
            <circle cx="390" cy="156" r="1.6" fill="#fff" />
          </g>

          <ellipse cx="340" cy="285" rx="9" ry="4" fill="#e8a33d" />
          <ellipse cx="322" cy="286" rx="9" ry="4" fill="#e8a33d" />
        </g>
        <g className="wp-mascot-spark">
          <path d="M420 170 L432 156 L424 172 L436 172 L422 190 L426 176 Z" fill="#e8a33d" />
        </g>
      </svg>
    </div>
  );
}