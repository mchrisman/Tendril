# TD-31: Use case: Transitive impact / multi-hop inverse queries

## Summary

Express queries like "find all activities that transitively affect a team" — where impact flows through intermediate entities (users on that team, projects owned by that team).

## Motivation

Real-world data often has indirect relationships:
- An activity targets a user → that user belongs to a team → the team is "affected"
- An activity targets a project → that project belongs to a team → the team is "affected"
- A config change affects a service → that service depends on other services → those are also affected

This requires:
1. Polymorphic dispatch (activity targets different entity types)
2. Inverse lookups (user→team, project→team)
3. Aggregation across paths

## Example

```javascript
const store = {
  activities: [
    { id: 'a1', targetType: 'user', targetId: 'u1', action: 'promoted' },
    { id: 'a2', targetType: 'team', targetId: 't1', action: 'archived' },
    { id: 'a3', targetType: 'project', targetId: 'p1', action: 'created' },
  ],
  users: [
    { id: 'u1', name: 'Alice', teamId: 't1' },
    { id: 'u2', name: 'Bob', teamId: 't1' }
  ],
  teams: [
    { id: 't1', name: 'Frontend', projectIds: ['p1'] }
  ],
  projects: [
    { id: 'p1', name: 'Dashboard' }
  ]
};

// Goal: For team t1, find all activities that affect it:
// - a1 (targets user u1, who is on team t1)
// - a2 (directly targets team t1)
// - a3 (targets project p1, which belongs to team t1)
```

## Current Workaround

This can be expressed today using alternation, but it's verbose:

```javascript
Tendril(`{
  activities[_]:{id:$aid, targetType:$tt, targetId:$tid, action:$action}

  // Dispatch by target type and trace back to team
  (
    ($tt=(team) teams[_]:{id:$impacted=($tid)})
  | ($tt=(user) users[_]:{id:$tid, teamId:$impacted})
  | ($tt=(project) projects[_]:{id:$tid} teams[_]:{id:$impacted, projectIds:[...$tid...]})
  )
}`)
```

## What Would Help

1. **Map-as-data dispatch** (works today):
   ```
   map:{$targetType, $collectionName}
   data[$collectionName][_]:{id:$targetId}
   ```

2. **Virtual properties** (TD-30): Define `team.affectingActivities` that aggregates all paths

3. **Collect with transitivity** (TD-29): Collect all impacted team IDs, then join

## Related

- TD-29: Collect-solutions operator
- TD-30: Virtual properties via extend
- Polymorphic dispatch via map-as-data (already works)
