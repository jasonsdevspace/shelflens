// Generated from the storefront operations by scripts/persist-operations.mjs. Edit the operations, not this.
export const PERSISTED_OPERATIONS: Readonly<Record<string, string>> = {
    '3960ca1d5ba26a4c79028bb83a879f117652f124db84228f33c8300e60c387c9':
        'query Store{store{name currency locale catalogVersion viewer{group}}}',
    '463ddcc741f6ba20223714607b778a7cdb236fc1d16e2939567560d699374587':
        'query Categories{categories{id name path}}',
    '731d13d2ca8459eba1de835dc3f7c739878280e52319d26aa64680f88b443116':
        'query Suggest($phrase:String!$limit:Int!){suggest(phrase:$phrase limit:$limit){queries products{product{sku name colors brand{name}price{min{amount currency}max{amount currency}}}}}}',
    ad1f2602a0218504d86ebd70506c6431131da90fc42706b534e6edad855b44bc:
        'query Product($sku:ID!){product(sku:$sku){sku name description material colors sizes inStock brand{name}categoryPath{id name}membersOnly price{memberPrice min{amount currency}max{amount currency}}rating{average count}variants{sku color size inStock price{amount currency}}}}',
    f58a72c40c1a54b8f1da8a4359af95ba3c7b80b78ccc3a3eaed5a57ae00d656d:
        'query Search($input:SearchInput!$explain:Boolean=false){search(input:$input){total page pageSize totalPages matching sort{by direction}merchandising{applied setAsideBySort}items{score@include(if:$explain)explanation@include(if:$explain){matches{typed matched field route}rules{ruleId action weight}}product{...Card}}noResults{suggestion foundWithoutFilters relaxed{phrase dropped result{total items{product{...Card}}}}popular{...Card}}facets{name attribute ...on ValueFacet{buckets{value count}}...on RangeFacet{ranges:buckets{from to count}}...on StatsFacet{count min max}}}}fragment Card on Product{sku name colors brand{name}membersOnly price{memberPrice min{amount currency}max{amount currency}}rating{average count}inStock}',
};
