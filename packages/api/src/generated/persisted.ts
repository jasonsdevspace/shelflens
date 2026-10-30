// Generated from the storefront operations by scripts/persist-operations.mjs. Edit the operations, not this.
export const PERSISTED_OPERATIONS: Readonly<Record<string, string>> = {
    '463ddcc741f6ba20223714607b778a7cdb236fc1d16e2939567560d699374587':
        'query Categories{categories{id name path}}',
    '6364550e05c98c2178ccf363fbc8c495d5cc9c0ea39e311f50b46698e27c5719':
        'query Search($input:SearchInput!$explain:Boolean=false){search(input:$input){...Results}}fragment Card on Product{sku name colors brand{name}membersOnly price{memberPrice min{amount currency}max{amount currency}}rating{average count}inStock}fragment Results on SearchResult{total page pageSize totalPages matching sort{by direction}merchandising{applied setAsideBySort}items{score@include(if:$explain)explanation@include(if:$explain){matches{typed matched field route}rules{ruleId action weight}popularity{clicks weight}}product{...Card}}noResults{suggestion foundWithoutFilters relaxed{phrase dropped result{total items{product{...Card}}}}popular{...Card}}facets{name attribute ...on ValueFacet{buckets{value count}}...on RangeFacet{ranges:buckets{from to count}}...on StatsFacet{count min max}}}',
    '731d13d2ca8459eba1de835dc3f7c739878280e52319d26aa64680f88b443116':
        'query Suggest($phrase:String!$limit:Int!){suggest(phrase:$phrase limit:$limit){queries products{product{sku name colors brand{name}price{min{amount currency}max{amount currency}}}}}}',
    '7a4d5268f4c6013a102fe689beedda204b450f4377062c93b0a2428b12ff28c5':
        'query Recommendations($sku:ID!$limit:Int=6$session:String){recommendations(sku:$sku limit:$limit session:$session){source category{id name}items{...Card}}}fragment Card on Product{sku name colors brand{name}membersOnly price{memberPrice min{amount currency}max{amount currency}}rating{average count}inStock}',
    ad1f2602a0218504d86ebd70506c6431131da90fc42706b534e6edad855b44bc:
        'query Product($sku:ID!){product(sku:$sku){sku name description material colors sizes inStock brand{name}categoryPath{id name}membersOnly price{memberPrice min{amount currency}max{amount currency}}rating{average count}variants{sku color size inStock price{amount currency}}}}',
    af560856a9c26e64ee20e289269a3236179615f05e9c0a945dac0576e2570e3f:
        'query Store{store{name currency locale catalogVersion rulesEdited viewer{group}}}',
    beccaf1eab8e94219df1864319400dd49adc3491559463464b4ea0d87d19721b:
        'query Preview($input:SearchInput!$explain:Boolean=false$rules:[RuleInput!]!){preview(input:$input rules:$rules){...Results}}fragment Card on Product{sku name colors brand{name}membersOnly price{memberPrice min{amount currency}max{amount currency}}rating{average count}inStock}fragment Results on SearchResult{total page pageSize totalPages matching sort{by direction}merchandising{applied setAsideBySort}items{score@include(if:$explain)explanation@include(if:$explain){matches{typed matched field route}rules{ruleId action weight}popularity{clicks weight}}product{...Card}}noResults{suggestion foundWithoutFilters relaxed{phrase dropped result{total items{product{...Card}}}}popular{...Card}}facets{name attribute ...on ValueFacet{buckets{value count}}...on RangeFacet{ranges:buckets{from to count}}...on StatsFacet{count min max}}}',
};
