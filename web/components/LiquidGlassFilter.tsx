export function LiquidGlassFilter() {
  return (
    <svg className="liquid-glass-defs" aria-hidden="true" width="0" height="0">
      <defs>
        <filter
          id="liquid-glass"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href="/glass/displace.png"
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            result="map"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale="36"
            xChannelSelector="R"
            yChannelSelector="G"
            result="red"
          />
          <feColorMatrix
            in="red"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="redChannel"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale="32"
            xChannelSelector="R"
            yChannelSelector="G"
            result="green"
          />
          <feColorMatrix
            in="green"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="greenChannel"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale="28"
            xChannelSelector="R"
            yChannelSelector="G"
            result="blue"
          />
          <feColorMatrix
            in="blue"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="blueChannel"
          />
          <feBlend in="greenChannel" in2="blueChannel" mode="screen" result="gb" />
          <feBlend in="redChannel" in2="gb" mode="screen" result="rgb" />
          <feGaussianBlur in="rgb" stdDeviation="0.35" result="aberrated" />
        </filter>
        <filter id="liquid-glass-chip" x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
          <feImage
            href="/glass/displace.png"
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            result="map"
          />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="18" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
