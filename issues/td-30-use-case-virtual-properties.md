# TD-30: Use case: Virtual properties via extend

## Summary

Allow users to define virtual/derived properties that become part of the matchable structure, enabling inverse relations and computed fields without changing the underlying data.

## Motivation

The power of Tendril patterns is that they're isomorphic to the data — you write a shape that looks like what you're looking for. But this breaks down when the thing you want to match isn't literally there but is *implied* by what's there.

Examples of implied structure:
- **Inverse relations**: team→users (when data only has user→team)
- **Aggregates**: team.memberCount (derived from counting related users)
- **Transitive closures**: all ancestors of a node
- **Polymorphic expansion**: user.activities (collecting all activities targeting this user)

## Proposed Syntax

```javascript
extend data.teams[_] as $t with {
  members: data.users[_] where .teamId == $t.id,
  activeMembers: .members where .id in data.activities[_]:{targetType:"user", targetId:*}
}
```

Now patterns can reference these virtual properties:
```
data.teams[_]:{name:$tname, members:[]}           // teams with no users
data.teams[_]:{name:$tname, activeMembers:[$first, ...]}  // teams with active users
```

## What This Unlocks

1. **Inverse relations**: team→users instead of just user→team
2. **Negation via empty-array matching**: `{members: []}` means no members
3. **Aggregation**: if we add `.count`, `.sum` as virtual property builders
4. **Multi-hop joins**: without repeating the join logic everywhere
5. **Polymorphic structure**: extend different `targetType` cases differently
6. **Composition**: extensions can reference other extensions

## Design Considerations

1. **Syntax placement**: Where do `extend` declarations go?
   - Before the pattern in the Tendril string?
   - As a separate API call?
   - In a schema/config file?

2. **Lazy vs eager**: Are virtual properties computed on-demand or pre-materialized?

3. **Scope**: Are extensions global or per-pattern?

4. **Circularity**: How to handle extensions that reference each other?

## Alternative: Inline Subqueries

Instead of explicit `extend`, allow inline subquery syntax:
```
{teams[_]: {
  name: $tname,
  members: [users[_] where .teamId == ^.id ...]
}}
```

This is more ad-hoc but doesn't require a declaration step.

## Related

- TD-28: Negation / find missing entities
- TD-29: Collect-solutions operator
