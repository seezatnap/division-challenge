import { useId } from "react";

export interface BarbasolSpinnerProps {
  className?: string;
}

/**
 * Spinning shaving-cream can loader, drawn as a self-contained inline SVG.
 * Purely decorative; the surrounding loader container carries role="status".
 */
export function BarbasolSpinner({ className }: BarbasolSpinnerProps) {
  const gradientScopeId = useId();
  const bodyShadeId = `${gradientScopeId}-body-shade`;
  const chromeId = `${gradientScopeId}-chrome`;
  const domeShadeId = `${gradientScopeId}-dome-shade`;
  const shieldGlowId = `${gradientScopeId}-shield-glow`;
  const bodyClipId = `${gradientScopeId}-body-clip`;
  const madeArcId = `${gradientScopeId}-made-arc`;

  return (
    <span aria-hidden="true" className={className ? `barbasol-spinner ${className}` : "barbasol-spinner"}>
      <svg className="barbasol-spinner-svg" viewBox="0 0 200 452" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={bodyShadeId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.6" />
            <stop offset="0.08" stopColor="#000" stopOpacity="0.22" />
            <stop offset="0.2" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="0.3" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="0.86" stopColor="#000" stopOpacity="0.3" />
            <stop offset="1" stopColor="#000" stopOpacity="0.62" />
          </linearGradient>
          <linearGradient id={chromeId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#6e7683" />
            <stop offset="0.18" stopColor="#c7ccd4" />
            <stop offset="0.3" stopColor="#f2f4f7" />
            <stop offset="0.55" stopColor="#aeb5bf" />
            <stop offset="0.8" stopColor="#d8dce2" />
            <stop offset="1" stopColor="#767e8b" />
          </linearGradient>
          <linearGradient id={domeShadeId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#9aa2ad" />
            <stop offset="0.2" stopColor="#ffffff" />
            <stop offset="0.55" stopColor="#eef1f4" />
            <stop offset="0.85" stopColor="#c9ced6" />
            <stop offset="1" stopColor="#9aa2ad" />
          </linearGradient>
          <linearGradient
            gradientTransform="translate(0,166) scale(1,150)"
            gradientUnits="userSpaceOnUse"
            id={shieldGlowId}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0" stopColor="#0f1c44" />
            <stop offset="0.1" stopColor="#0057b5" />
            <stop offset="0.24" stopColor="#081239" />
            <stop offset="0.6" stopColor="#05103d" />
            <stop offset="0.74" stopColor="#0468c8" />
            <stop offset="0.92" stopColor="#0a58b4" />
            <stop offset="1" stopColor="#0d47a0" />
          </linearGradient>
          <clipPath id={bodyClipId}>
            <path d="M9,110 h182 v316 q0,16 -14,16 h-154 q-14,0 -14,-16 Z" />
          </clipPath>
        </defs>

        <g>
          <rect fill="#1a2050" height="12" rx="2" width="24" x="38" y="19" />
          <rect fill="#333d72" height="4" rx="2" width="24" x="38" y="19" />
          <path d="M60,38 v-24 q0,-6 6,-6 h68 q6,0 6,6 v24 Z" fill="#1a2050" />
          <path d="M60,38 v-24 q0,-6 6,-6 h68 q6,0 6,6 v24 Z" fill={`url(#${bodyShadeId})`} />
          <path d="M47,55 v-12 q0,-5 5,-5 h96 q5,0 5,5 v12 Z" fill="#1a2050" />
          <path d="M47,55 v-12 q0,-5 5,-5 h96 q5,0 5,5 v12 Z" fill={`url(#${bodyShadeId})`} />
        </g>

        <path d="M11,108 C14,78 44,56 66,54 h68 C156,56 186,78 189,108 Z" fill={`url(#${domeShadeId})`} />
        <rect fill={`url(#${chromeId})`} height="13" rx="6" width="184" x="8" y="100" />
        <path d="M9,110 h182 v316 q0,16 -14,16 h-154 q-14,0 -14,-16 Z" fill="#0c1b45" />

        <g clipPath={`url(#${bodyClipId})`}>
          <g transform="rotate(-16 100 350)">
            <rect fill="#f2f4f6" height="19" width="360" x="-80" y="309" />
            <rect fill="#a6aaad" height="6" width="360" x="-80" y="328" />
            <rect fill="#c50f14" height="33" width="360" x="-80" y="334" />
            <rect fill="#a6aaad" height="6" width="360" x="-80" y="367" />
            <rect fill="#f2f4f6" height="18.5" width="360" x="-80" y="373" />
            <rect fill="#a6aaad" height="3.5" width="360" x="-80" y="391.5" />
            <rect fill="#c50f14" height="105" width="360" x="-80" y="395" />
            <text
              fill="#ffffff"
              fontFamily="'Arial Narrow', 'Helvetica Neue', Arial, sans-serif"
              fontSize="29"
              fontWeight="bold"
              lengthAdjust="spacingAndGlyphs"
              letterSpacing="2.5"
              textAnchor="middle"
              textLength="110"
              x="100"
              y="360"
            >
              ORIGINAL
            </text>
          </g>

          <g fill="#e8ebef" fontFamily="'Helvetica Neue', Arial, sans-serif">
            <path d="M82,132 q18,-10 36,0" fill="none" id={madeArcId} />
            <text fontSize="6.5" fontWeight="bold" letterSpacing="1">
              <textPath href={`#${madeArcId}`} startOffset="50%" textAnchor="middle">
                MADE IN
              </textPath>
            </text>
            <text fontSize="6.5" fontWeight="bold" textAnchor="middle" x="62" y="147">
              EST.
            </text>
            <text fontSize="6.5" fontWeight="bold" textAnchor="middle" x="138" y="147">
              1919
            </text>
            <text fontSize="13" fontWeight="bold" letterSpacing="1" textAnchor="middle" x="100" y="150">
              USA
            </text>
            <path d="M56,150 q9,2.5 19,1 M125,151 q10,1.5 19,-1" fill="none" stroke="#e8ebef" strokeWidth="0.9" />
          </g>

          <path
            d="M36,199 Q100,163 164,199 C170,220 183,240 182.8,261.2 L100,316 L17.2,261.2 C17,240 30,220 36,199 Z"
            fill={`url(#${shieldGlowId})`}
          />
          <path
            d="M36,199 C30,220 17,240 17.2,261.2 L100,316 L182.8,261.2 C183,240 170,220 164,199"
            fill="none"
            stroke={`url(#${chromeId})`}
            strokeLinejoin="round"
            strokeWidth="3.5"
          />
          <path
            d="M36,199 Q100,163 164,199"
            fill="none"
            stroke={`url(#${chromeId})`}
            strokeLinecap="round"
            strokeWidth="5.5"
          />

          <g
            fontFamily="Superclarendon, 'Bookman Old Style', Georgia, 'Times New Roman', serif"
            fontStyle="italic"
            fontWeight="900"
          >
            <g transform="translate(97.9,252) scale(0.51,1)">
              <text fill="#8d94a0" fontSize="60" textAnchor="middle">
                Barbasol
              </text>
            </g>
            <g transform="translate(100,250) scale(0.51,1)">
              <text fill="#ffffff" fontSize="60" textAnchor="middle">
                Barbasol
              </text>
            </g>
            <text fill="#ffffff" fontSize="7" fontStyle="normal" fontWeight="normal" x="184" y="253">
              ®
            </text>
          </g>

          <g fill="#ffffff" fontFamily="'Helvetica Neue', Arial, sans-serif" textAnchor="middle">
            <text fontSize="12.5" fontWeight="bold" letterSpacing="1.2" x="100" y="282">
              THICK &amp; RICH
            </text>
            <text fontSize="8.5" letterSpacing="2.2" x="100" y="296">
              SHAVING CREAM
            </text>
          </g>

          <text
            fill="#f4f6f8"
            fontFamily="'Arial Narrow', 'Helvetica Neue', Arial, sans-serif"
            fontSize="7"
            fontWeight="bold"
            letterSpacing="0.3"
            textAnchor="middle"
            x="100"
            y="420"
          >
            NET WT. 10 OZ (283g)
          </text>

          <rect fill={`url(#${bodyShadeId})`} height="332" width="182" x="9" y="110" />
          <rect fill={`url(#${chromeId})`} height="11" width="182" x="9" y="431" />
          <rect fill={`url(#${bodyShadeId})`} height="11" opacity="0.5" width="182" x="9" y="431" />
          <rect fill="#2a2f38" height="1.5" width="182" x="9" y="440.5" />
        </g>
      </svg>
    </span>
  );
}
