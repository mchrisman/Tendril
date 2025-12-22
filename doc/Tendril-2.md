The goal is to greenhouse-grow this into an evolved, production-ready system that maintains its lightweight nature, distinctive syntax, and whatever ease-of-use it may credibly claim to have, with

- Smoothed out ergonomics (carefully, carefully)
- A polished test harness and a thorough set of unit tests.
- Impressive optimization using ideas from miniKanren, Prolog, and Dataflow constraint solvers. A power tool, not a toy, but not trying to be something it isn't.
- A clarified and well chosen market niche (not to change its current positioning so much as to clarify in what manner we need to smooth the ergonomics, and what optimizations to focus on).
- Powerful debugging tools.
- A polished user learning experience that doesn't overwhelm. I have no idea if the following is a good idea or a bad one. I'm thinking perhaps present this with three different readmes, 
    - "Tendril: Regex for structures (find/replace)"
    - "Tendril: Structured data parsing and extraction"
    - "Tendril: Relational joins on JSON"
      Each one focusing on usage patterns and examples common to that domain and not presenting more advanced topics. Then
    - "Tendril: Advanced Guide and Reference"
      If we don't do that, then at least split the README into basic and advanced. 

```
// Data

{
  planets: {Jupiter: {size: "big"}, Earth: {size: "small"}, Ceres: {size: "tiny"}},
  aka: [["Jupiter", "Jove", "Zeus"], ["Earth", "Terra"], ["Ceres", "Demeter"]]
};

// Pattern, structural imitation style
{
  planets: {
      $name: {size:$size}
  }
  aka:[.. [$name .. $alias .. | $alias=($name) ..] .. ] 
}

// Pattern, proposition style
{
   planets.$name.size: $size
   aka[$i][0]: $name
   aka[$i][_]: $alias
}

----

// project org example

// Pattern, structural imitation style
{
  users: {
    $userId: {
      contact: [ $userName, _, _, $userPhone ],
      managerId: $managerId
    }
  },
  users: {
    $managerId: { phone: $managerPhone }
  },
  projects: {
    $projectId: {
      assigneeId: $userId,
      name: $projectName
    }
  }
}

// Pattern, (mostly) proposition style
{
  users:$userId.contact:[$userName _ _ $userPhone]
  users:$userId.managerId:$managerId
  users:$managerId.phone:$managerPhone
  projects:$projectId.assigneeId:$userId
  projects:$projectId.name:$projectName
}

```
