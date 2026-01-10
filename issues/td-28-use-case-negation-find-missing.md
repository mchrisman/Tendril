# TD-28: Use case: Find entities with no matching related entities

## Summary

Express queries like "find all teams with no assigned users" — i.e., negation over a join.

## Motivation

A common query pattern is finding entities where a related entity does *not* exist:
- Teams with no members
- Users with no orders
- Projects with no assigned tasks

In SQL this is `LEFT JOIN ... WHERE ... IS NULL` or `NOT EXISTS`. In Prolog it's negation-as-failure.

Currently Tendril has no way to express this in a single pattern.

## Example

```javascript
const data = {
  teams: [{id: 't1', name: 'Frontend'}, {id: 't2', name: 'Backend'}],
  users: [{id: 'u1', teamId: 't1'}, {id: 'u2', teamId: 't1'}]
};

// Desired: find teams with no users
// Expected result: [{teamId: 't2', teamName: 'Backend'}]
```

## Why It's Hard

Negation-as-failure requires knowing you've exhausted the positive cases. The pattern matcher would need to:
1. Collect all `teamId` values that DO have users
2. Then find teams whose id is NOT in that set

This requires either:
- A `collect()` operator to gather solutions into a set
- Virtual/derived properties via `extend`
- Multi-pass chaining

## Possible Solutions

### Option A: Collect operator
```
$assignedTeamIds = collect($tid from {users[_].teamId: $tid})
{teams[_]: {id: $tid, name: $name}} where $tid not in $assignedTeamIds
```

### Option B: Extend with virtual properties
```
extend data.teams[_] as $t with {
  members: data.users[_] where .teamId == $t.id
}
// Then:
{teams[_]: {name: $name, members: []}}  // empty array = no members
```

### Option C: Multi-pass API
```javascript
const assignedTeamIds = Tendril("{users[_].teamId: $tid}")
  .match(data).solutions().map(s => s.tid);

Tendril("{teams[_]: {id: $tid, name: $name}}")
  .match(data)
  .solutions()
  .filter(s => !assignedTeamIds.includes(s.tid));
```

Option C works today but requires JavaScript glue code.

## Related

- TD-29: Collect-solutions operator
- TD-30: Virtual properties via extend
