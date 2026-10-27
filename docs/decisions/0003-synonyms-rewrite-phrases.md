# 3. Synonyms rewrite phrases, scored per typed word

**Status:** accepted

## Context

The catalog says "sneakers" and shoppers type "trainers". The catalog says "T-Shirt" and shoppers
type "tee", "tshirt" or "t shirt". A synonym rule bridges that, and the question is where it is
applied and what it is worth.

The first version expanded the query one word at a time. The golden queries found the flaw on
their first run: with "t-shirt" equivalent to "tee", the query "t shirt" expanded both "t" and
"shirt" to "tee", a product named "Coastal Tee" was credited twice for one word, and it ranked
above an actual T-Shirt.

## Options

**A. Expand each query word.** Simple, and wrong whenever a rule has more than one word on a
side, because the words of a phrase expand independently and the same indexed word is counted
once per query word it stood in for.

**B. Rewrite phrases of the query.** A rule is matched against the query as a whole phrase, and
the phrase it matched becomes one unit of the query that any of the rule's alternatives may
satisfy. This is how search engines handle multi-word synonyms.

**C. Expand at index time.** Index "tee" products under "t-shirt" as well. Any rule change means
reindexing, which the merchandiser panel in a later milestone cannot afford, and the engine
could no longer say which word the shopper typed and which the rule supplied.

## Decision

Option B, with three details that the same investigation settled.

- **An alternative is scored per word the shopper typed.** A two-word alternative standing in for
  one typed word sums two term scores and would outrank the exact match for that word. Its score
  is scaled by typed words over alternative words.
- **Field length counts words, not emitted terms.** A hyphenated word emits three terms, the
  joined form and its parts, so "Everyday T-Shirt" looked twice as long as "Coastal Tee" and lost
  on length normalization. That was the second reason the Tee won.
- **A synonym match is worth 0.6 of an exact one**, down from 0.9, so that when a catalog has
  both a Tee and a T-Shirt, a shopper who typed one gets that one first. Prefix matches are 0.7
  and corrections 0.5.

## Consequences

- Rules take effect on the next search with no reindexing, and `engine.reconfigure` swaps them
  over the same index.
- A hyphenated word in a rule is matched in both its forms, so "t-shirt" in a rule matches a
  query of "tshirt" and of "t shirt".
- The explanation on a hit names the phrase the synonym stood in for, not a single word.
- Where two rules could apply at one position, the longer phrase wins. A merchandiser wanting a
  different precedence would need a rule order, which does not exist yet.

## How it is tested

- A regression test with a Tee and a T-Shirt that fails under word-by-word expansion.
- The golden query "t shirt", and its siblings "tshirt" and "trainers", where an exact name match
  must beat the synonym.
- Unit tests for phrase variants and query rewriting.
