# TD-33: Use case: Aggregation (count, sum, grouping)

## Summary

Support aggregate queries like "count of orders per user" or "total value of items in cart" within the pattern language.

## Motivation

Aggregation is fundamental to data analysis:
- Count: How many orders per customer?
- Sum: Total price of items?
- Group-by: Orders grouped by status?
- Min/Max: Highest-value order?

Currently, all aggregation requires JavaScript post-processing:
```javascript
Tendril("{orders[_]: {userId: $uid, amount: $amt}}")
  .match(data)
  .solutions()
  .reduce((acc, s) => {
    acc[s.uid] = (acc[s.uid] || 0) + s.amt;
    return acc;
  }, {});
```

## Possible Approaches

### Option A: Aggregate functions in guards
```
{users[_]: {id: $uid, name: $name}
  where count({orders[_].userId: $uid}) > 5}
```

### Option B: Virtual properties (requires TD-30)
```
extend data.users[_] as $u with {
  orderCount: count(data.orders[_] where .userId == $u.id),
  totalSpent: sum(data.orders[_].amount where .userId == $u.id)
}
// Then:
{users[_]: {name: $name, orderCount: $n} where $n > 5}
```

### Option C: Fluent API only
```javascript
Tendril(pattern)
  .match(data)
  .solutions()
  .groupBy('userId')
  .aggregate({orderCount: 'count', totalSpent: {sum: 'amount'}})
```

### Option D: Output template (requires magic-template proposal)
```javascript
Tendril("{orders[_]: {userId: $uid, amount: $amt}}")
  .match(data)
  .transformTo("{$uid: {count: count(), total: sum($amt)}}")
```

## Design Questions

1. **Where do aggregates live?** In patterns? In guards? In output templates? In fluent API?

2. **Grouping scope**: What defines the grouping boundary for an aggregate?

3. **Standard functions**: count, sum, min, max, avg — which are essential?

4. **Null handling**: What if there are no matches to aggregate?

## Related

- TD-29: Collect-solutions operator (foundation for aggregates)
- TD-30: Virtual properties (natural home for derived aggregates)
- proposal-magic-template.md (output-side aggregation)
