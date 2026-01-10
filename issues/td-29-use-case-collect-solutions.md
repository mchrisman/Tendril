# TD-29: Use case: Collect solutions into a set for further queries

## Summary

Add a `collect()` primitive that gathers values from a solution stream into a set, enabling negation, intersection, and aggregation queries.

## Motivation

Many queries require knowing "the set of things that matched" before making further assertions:
- Negation: `$x not in $collected`
- Intersection: items appearing in multiple places
- Aggregation: count, sum, etc.

Currently, these require JavaScript post-processing. A `collect()` operator would keep them in pattern-space.

## Proposed Syntax

```
$assignedTeamIds = collect($tid from users[_]:{teamId:$tid})
teams[_]:{id:$tid} where $tid not in $assignedTeamIds
```

For chained/transitive queries:
```
$activeUserIds = collect($uid from activities[_]:{targetType:"user", targetId:$uid})
$teamsWithActiveUsers = collect($tid from users[_]:{id:$uid, teamId:$tid} where $uid in $activeUserIds)
teams[_]:{id:$tid} where $tid not in $teamsWithActiveUsers
```

## Design Considerations

1. **Sequencing**: `collect()` introduces ordering into what's otherwise order-independent unification. The collected variable must be fully materialized before queries that reference it.

2. **Scope**: Where does `collect()` appear syntactically? Options:
   - Prefix declaration before the main pattern
   - Inline subquery syntax
   - Fluent API method

3. **Deduplication**: Should `collect()` return a set (deduplicated) or a multiset (with duplicates)?

4. **Operators**: What operations are allowed?
   - `$x in $set`
   - `$x not in $set`
   - `size($set) > N`
   - Set intersection/union?

## What This Unlocks

- Negation queries (TD-28)
- Set intersection queries
- Foundation for aggregates (count, sum)
- Chained multi-hop queries

## Related

- TD-28: Negation / find missing entities
- TD-30: Virtual properties via extend
