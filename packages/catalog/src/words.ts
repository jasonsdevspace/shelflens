/*
 * The vocabulary the generator draws from. Every brand and product name is
 * invented, so nothing here points at a real company or product.
 *
 * Some entries exist for the search engine's sake. A name with an accent, a
 * hyphenated name, and words with a common synonym each give the engine's
 * normalization and synonym handling real data to be tested against.
 */

export const BRANDS: readonly string[] = [
    'Northwind',
    'Harbor & Pine',
    'Cobble Lane',
    'Alder Field',
    'Tessa Mae',
    'Quillfeather',
    'Ridgeback',
    'Saltmarsh',
    'Finch & Co',
    'Marlowe Street',
    'Ostara',
    'Brightwater',
];

export interface LeafSpec {
    readonly id: string;
    readonly name: string;
    /** The product nouns this leaf produces, such as "Parka". */
    readonly nouns: readonly string[];
    readonly sizes: readonly string[];
    /** Price band in whole dollars. */
    readonly priceRange: readonly [number, number];
    readonly materials: readonly string[];
}

export interface BranchSpec {
    readonly id: string;
    readonly name: string;
    readonly leaves: readonly LeafSpec[];
}

const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const WAIST_SIZES = ['28', '30', '32', '34', '36', '38'];
const SHOE_SIZES = ['6', '7', '8', '9', '10', '11', '12', '13'];
const ONE_SIZE = ['One Size'];

const KNITS = ['Cotton', 'Organic Cotton', 'Merino Wool', 'Cotton Blend', 'Linen'];
const SHELLS = ['Recycled Nylon', 'Waxed Canvas', 'Down Fill', 'Fleece', 'Wool Blend'];
const DENIMS = ['Stretch Denim', 'Raw Denim', 'Cotton Twill', 'Corduroy'];
const LEATHERS = ['Full-Grain Leather', 'Suede', 'Vegan Leather', 'Canvas'];
const MESHES = ['Engineered Mesh', 'Knit Upper', 'Recycled Mesh'];

export const CATEGORY_TREE: readonly BranchSpec[] = [
    {
        id: 'clothing',
        name: 'Clothing',
        leaves: [
            {
                id: 'tops',
                name: 'Tops',
                nouns: ['T-Shirt', 'Tee', 'Henley', 'Polo', 'Oxford Shirt', 'Flannel Shirt'],
                sizes: APPAREL_SIZES,
                priceRange: [18, 95],
                materials: KNITS,
            },
            {
                id: 'sweaters',
                name: 'Sweaters',
                nouns: ['Sweater', 'Cardigan', 'Crewneck', 'Hoodie', 'Quarter-Zip'],
                sizes: APPAREL_SIZES,
                priceRange: [45, 180],
                materials: KNITS,
            },
            {
                id: 'bottoms',
                name: 'Bottoms',
                nouns: ['Jeans', 'Chinos', 'Joggers', 'Trousers', 'Shorts', 'Cargo Pants'],
                sizes: WAIST_SIZES,
                priceRange: [40, 160],
                materials: DENIMS,
            },
            {
                id: 'outerwear',
                name: 'Outerwear',
                nouns: [
                    'Parka',
                    'Puffer Jacket',
                    'Rain Shell',
                    'Café Racer Jacket',
                    'Trench Coat',
                    'Fleece Jacket',
                ],
                sizes: APPAREL_SIZES,
                priceRange: [90, 420],
                materials: SHELLS,
            },
            {
                id: 'dresses',
                name: 'Dresses',
                nouns: ['Wrap Dress', 'Shirt Dress', 'Midi Dress', 'Slip Dress'],
                sizes: APPAREL_SIZES,
                priceRange: [55, 220],
                materials: KNITS,
            },
        ],
    },
    {
        id: 'shoes',
        name: 'Shoes',
        leaves: [
            {
                id: 'sneakers',
                name: 'Sneakers',
                nouns: ['Sneaker', 'Court Shoe', 'Low-Top', 'High-Top', 'Slip-On'],
                sizes: SHOE_SIZES,
                priceRange: [60, 190],
                materials: LEATHERS,
            },
            {
                id: 'running',
                name: 'Running',
                nouns: ['Trail Runner', 'Road Runner', 'Racing Flat', 'Daily Trainer'],
                sizes: SHOE_SIZES,
                priceRange: [90, 220],
                materials: MESHES,
            },
            {
                id: 'boots',
                name: 'Boots',
                nouns: ['Chelsea Boot', 'Hiking Boot', 'Chukka', 'Work Boot', 'Rain Boot'],
                sizes: SHOE_SIZES,
                priceRange: [110, 320],
                materials: LEATHERS,
            },
            {
                id: 'sandals',
                name: 'Sandals',
                nouns: ['Sandal', 'Slide', 'Flip-Flop', 'Espadrille'],
                sizes: SHOE_SIZES,
                priceRange: [25, 120],
                materials: LEATHERS,
            },
        ],
    },
    {
        id: 'accessories',
        name: 'Accessories',
        leaves: [
            {
                id: 'bags',
                name: 'Bags',
                nouns: ['Backpack', 'Tote', 'Crossbody Bag', 'Duffel', 'Messenger Bag'],
                sizes: ONE_SIZE,
                priceRange: [35, 260],
                materials: ['Waxed Canvas', 'Recycled Nylon', 'Full-Grain Leather'],
            },
            {
                id: 'hats',
                name: 'Hats',
                nouns: ['Beanie', 'Baseball Cap', 'Bucket Hat', 'Wide-Brim Hat'],
                sizes: ONE_SIZE,
                priceRange: [18, 75],
                materials: ['Cotton', 'Merino Wool', 'Straw'],
            },
            {
                id: 'belts-and-scarves',
                name: 'Belts and Scarves',
                nouns: ['Belt', 'Scarf', 'Bandana'],
                sizes: ONE_SIZE,
                priceRange: [20, 110],
                materials: ['Full-Grain Leather', 'Merino Wool', 'Silk'],
            },
        ],
    },
];

export const ADJECTIVES: readonly string[] = [
    'Classic',
    'Everyday',
    'Heritage',
    'Weekend',
    'Coastal',
    'Summit',
    'Harbor',
    'Trail',
    'Studio',
    'Slim',
    'Relaxed',
    'Lightweight',
    'Essential',
    'Signature',
    'Alpine',
    'Meadow',
    'Downtown',
    'Voyager',
];

export const COLORS: readonly string[] = [
    'Black',
    'White',
    'Navy',
    'Navy Blue',
    'Forest Green',
    'Olive',
    'Charcoal',
    'Heather Gray',
    'Burgundy',
    'Rust',
    'Sand',
    'Cream',
    'Sky Blue',
    'Mustard',
];

/** Sentence fragments the description is assembled from. */
export const DESCRIPTION_OPENERS: readonly string[] = [
    'Made for every day, from the first wear on.',
    'A wardrobe staple with the details done right.',
    'Built to be worn hard and kept for years.',
    'The one you reach for without thinking.',
    'Cut for comfort and finished for the long haul.',
];

export const DESCRIPTION_FEATURES: readonly string[] = [
    'a relaxed fit through the body',
    'a slim fit with a little stretch',
    'reinforced seams at every stress point',
    'a water-resistant finish',
    'deep pockets that actually hold a phone',
    'a soft hand feel that improves with washing',
    'breathable panels where it counts',
    'a cushioned footbed for long days',
    'a grippy outsole for wet pavement',
    'an adjustable strap and a padded back',
    'a lining in contrasting color',
    'buttons made from recycled shell',
];

export const DESCRIPTION_CLOSERS: readonly string[] = [
    'Machine washable.',
    'Ships in recycled packaging.',
    'Free returns within thirty days.',
    'Available in a range of colors.',
    'Part of our year-round collection.',
];

/**
 * Words a shopper might type that the catalog says differently. Kept beside
 * the vocabulary so the two stay in step, and read by the engine's synonym
 * tests rather than built into the engine, which knows nothing about clothes.
 */
export const SYNONYM_SUGGESTIONS: readonly (readonly [string, string])[] = [
    ['trainers', 'sneakers'],
    ['jumper', 'sweater'],
    ['pants', 'trousers'],
    ['tshirt', 't-shirt'],
    ['cap', 'baseball cap'],
    ['raincoat', 'rain shell'],
    ['bag', 'tote'],
];
