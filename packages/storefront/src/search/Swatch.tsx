/**
 * A product's thumbnail, drawn rather than fetched.
 *
 * The catalog is generated and has no photographs, so the thumbnail is the
 * product's first color with the brand's initial on it. It carries no text
 * for a screen reader, since the name beside it already says what it is.
 */

const COLOR_VALUES: Readonly<Record<string, string>> = {
    Black: '#1a1a1a',
    White: '#f4f4f4',
    Navy: '#1f2a44',
    'Navy Blue': '#253a6b',
    'Forest Green': '#2f5d3a',
    Olive: '#6b6b2e',
    Charcoal: '#3a3a3a',
    'Heather Gray': '#9a9a9a',
    Burgundy: '#6e1e2b',
    Rust: '#b7472a',
    Sand: '#d8c3a0',
    Cream: '#f1e9d2',
    'Sky Blue': '#86b7e8',
    Mustard: '#d9a521',
};

const LIGHT = new Set(['White', 'Sand', 'Cream', 'Sky Blue', 'Mustard', 'Heather Gray']);

export interface SwatchProps {
    readonly color: string | undefined;
    readonly brand: string;
    readonly size?: number;
}

export const Swatch = ({ color, brand, size = 40 }: SwatchProps) => {
    const name = color ?? 'Charcoal';
    const fill = COLOR_VALUES[name] ?? '#777777';
    const ink = LIGHT.has(name) ? '#1a1a1a' : '#ffffff';
    return (
        <svg
            className="swatch"
            width={size}
            height={size}
            viewBox="0 0 40 40"
            aria-hidden="true"
            focusable="false"
        >
            <rect width="40" height="40" rx="6" fill={fill} stroke="rgba(0,0,0,0.12)" />
            <text
                x="20"
                y="26"
                textAnchor="middle"
                fontSize="18"
                fontFamily="system-ui, sans-serif"
                fontWeight="600"
                fill={ink}
            >
                {brand.charAt(0)}
            </text>
        </svg>
    );
};
