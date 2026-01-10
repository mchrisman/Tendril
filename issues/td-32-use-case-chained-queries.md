# TD-32: Use case: Chained / multi-pass queries

## Summary

Support queries where one pass produces values that feed into subsequent passes, without dropping to JavaScript between them.

## Motivation

Some queries are naturally sequential:
1. Find all users who placed orders this month
2. Of those users, find ones who haven't logged in recently
3. Group by account type

Currently this requires JavaScript orchestration:
```javascript
const recentBuyers = Tendril(pattern1).match(data).solutions().map(s => s.userId);
const inactiveRecentBuyers = Tendril(pattern2).match(data)
  .solutions().filter(s => recentBuyers.includes(s.userId));
// etc.
```

## Proposed Approaches

### Option A: Fluent chaining
```javascript
Tendril("{orders[_]: {userId: $uid, date: $d} where $d > '2024-01-01'}")
  .match(data)
  .chain("{users[_]: {id: $uid, lastLogin: $login} where $login < '2024-01-01'}")
  .chain("{users[_]: {id: $uid, accountType: $type}}")
  .solutions()
  .groupBy('type')
```

### Option B: Inline WITH clause (SQL-style)
```
WITH $recentBuyers = {orders[_]: {userId: $uid, date: $d} where $d > '2024-01-01'}
{users[_]: {id: $uid, lastLogin: $login} where $uid in $recentBuyers}
```

### Option C: Let bindings in pattern
```
let $recentBuyers = collect($uid from orders[_]:{...})
in {users[_]: {id: $uid} where $uid in $recentBuyers}
```

## Trade-offs

- **Option A**: Minimal syntax changes, but mixing pattern and API
- **Option B**: SQL-familiar, but introduces "statements" to declarative language
- **Option C**: Functional style, integrates with collect() proposal

## Relationship to Collect

Chaining and `collect()` (TD-29) address similar problems:
- `collect()` gathers values *within* a pattern for later reference
- Chaining connects *separate* patterns sequentially

Both introduce sequencing. The question is whether to have one mechanism or two.

## Related

- TD-29: Collect-solutions operator
- TD-28: Negation (often needs chaining)
