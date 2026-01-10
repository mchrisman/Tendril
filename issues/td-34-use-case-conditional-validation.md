# TD-34: Use case: Context-dependent validation rules

## Summary

Express validation rules where required fields depend on other field values, like "if type is 'webhook' then url is required, but if type is 'email' then address is required."

## Motivation

Real-world schemas often have conditional requirements:
- API responses: different fields required based on `type` or `status`
- Forms: different validation based on user selections
- Configs: different required keys based on mode/environment

## Example

```javascript
const configs = [
  { type: 'webhook', url: 'https://example.com/hook' },  // valid
  { type: 'webhook' },  // invalid: missing url
  { type: 'email', address: 'user@example.com' },  // valid
  { type: 'email', url: 'https://...' },  // invalid: has url but missing address
];
```

## Current Approach

This can be expressed today using alternation with `each`:

```javascript
Tendril(`{
  (type: webhook  url: _)
| (type: email    address: _)
| (type: sms      phone: _)
}`).match(config).hasMatch()
```

Or with implication semantics (if we had them):
```javascript
// Pseudo-syntax: "if type=webhook, then url must exist"
{type: webhook} => {url: _}
```

## What Would Be Cleaner

### Option A: Implication operator
```
{type: webhook => url: _}
// "if the object has type:webhook, it must also have url:_"
```

### Option B: Conditional fields
```
{type: $t, url: _ where $t == 'webhook', address: _ where $t == 'email'}
```

### Option C: Guards on field presence
```
{type: webhook, (? url: _)}  // positive lookahead as requirement
```

## Current Status

The alternation approach works today but becomes verbose with many type variants. The `each` clause helps for "all X must have Y" but not for "if X then Y" conditionals.

## Related

- TD-25: Universal `!` suffix syntax
- `each` clause (partially addresses this)
- Implication syntax (mentioned but not yet ticketed)
