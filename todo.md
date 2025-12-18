# Completed Issues

All issues from the review have been addressed:

## 1) `..{m,}` quantifier handling — FIXED
Quantifiers on `..` (spread) are now disallowed at parse time. They were either meaningless (since `..` is `_*?`) or a performance bomb.

**Error example:** `Quantifiers on '..' are not allowed (found '..{2,}')`

## 2) Possessive/lazy flags on Spread — N/A
This issue is moot since quantifiers on `..` are now disallowed.

## 3) Regex `/g` and `/y` flags — FIXED
These stateful flags are now disallowed at parse time to prevent "matched once then stopped matching" bugs.

**Error example:** `Regex flags 'g' and 'y' are not allowed (found /foo/g)`

## 4) `Object.is` vs `===` for numbers — FIXED
- Changed literal comparison from `Object.is` to `===` so that `0` and `-0` are treated as equal (per JS semantics)
- Added support for negative numbers (`-42`) and decimals (`3.14`) in patterns
- Updated grammar: `NUMBER := /-?[0-9]+(\.[0-9]+)?/`
