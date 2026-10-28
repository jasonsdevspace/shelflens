// Generated from the storefront operations by scripts/persist-operations.mjs. Edit the operations, not this.
export const PERSISTED_OPERATIONS: Readonly<Record<string, string>> = {
    '3960ca1d5ba26a4c79028bb83a879f117652f124db84228f33c8300e60c387c9':
        'query Store{store{name currency locale catalogVersion viewer{group}}}',
    '463ddcc741f6ba20223714607b778a7cdb236fc1d16e2939567560d699374587':
        'query Categories{categories{id name path}}',
    '5ca215916918fe839a1d2b2c5e64b4dda59c7492f84cbee4efe0ab401b3e7375':
        'query Search($input:SearchInput!){search(input:$input){total page pageSize totalPages matching sort{by direction}items{product{sku name colors brand{name}price{min{amount currency}max{amount currency}}rating{average count}inStock}}facets{name attribute ...on ValueFacet{buckets{value count}}...on RangeFacet{ranges:buckets{from to count}}...on StatsFacet{count min max}}}}',
    '731d13d2ca8459eba1de835dc3f7c739878280e52319d26aa64680f88b443116':
        'query Suggest($phrase:String!$limit:Int!){suggest(phrase:$phrase limit:$limit){queries products{product{sku name colors brand{name}price{min{amount currency}max{amount currency}}}}}}',
    e114771ac0930e0456c5aa1f17b1a8981e24d8006db7c6006ef81f048b9ccfca:
        'query Product($sku:ID!){product(sku:$sku){sku name description material colors sizes inStock brand{name}categoryPath{id name}price{min{amount currency}max{amount currency}}rating{average count}variants{sku color size inStock price{amount currency}}}}',
};
