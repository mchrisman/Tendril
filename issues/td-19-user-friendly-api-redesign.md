---
id: td-0019
title: User-friendly API redesign
status: backlog
priority: high
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [api, dx]
---

# DESCRIPTION

## CW 19 Nicer API

### existing

// (A) Chain-based approach with intermediate OccurrenceSet objects
Tendril(pattern).match(data).hasMatch()              // boolean
Tendril(pattern).match(data).solutions().first()     // Solution object
Tendril(pattern).find(data).solutions().toArray()    // [Solution...]
Tendril(pattern).find(data).editAll({x: 99})         // modified data
Tendril(pattern).find(data).replaceAll(newVal)       // modified data

Tendril(pattern).first(data)           // OccurrenceSet
Tendril(pattern).hasMatch(data)        // boolean
Tendril(pattern).hasAnyMatch(data)     // boolean


// (B) Convenience functions (already exist)
matches(pattern, data)       // boolean
extract(pattern, data)       // plain bindings object
extractAll(pattern, data)    // [plain bindings objects]
replace(pattern, data, fn)   // modified data

### proposal

Deprecate the existing API (A). It's too verbose, too low level. Keep it around for advanced usage, but focus on convenience methods.

Retire the existing convenience functions (B) and replace them with those below.

Note that nobody is using this language yet, so there is no issue of backward compatibility.

``````
pattern = Tendril(patternString)  // Immediate compilation, not lazy

pattern.in(data)   // Opaque 'Matcher' object, does not immediately run the engine

"in" = match substructures within
"on" = match entire data (anchored)


REPLACEMENT functions look like (solution)=>(function of solution.x, solution.y, etc) OR (static data structure)

EDIT expressions look like {x: REPLACEMENT, y:REPLACEMENT, ...}

pattern.in(data).found()
pattern.in(data).replace(fn)
pattern.in(data).replaceAll(fn)
pattern.in(data).edit(plan)
pattern.in(data).editAll(plan)

pattern.on(data).matches()
pattern.on(data).solve()
pattern.on(data).allSolutions()
pattern.on(data).replace(fn)
pattern.on(data).edit(plan)

edit({x:static, y:vars=>_, ...})
edit(fn) means edit(fn(vars))
so edit(v=>{x:v.y, y:v.x}) is like edit({x:v=>v.y, y:v=>v.x})
and edit(_=>{"0":static}) means replace the whole thing with static.

shortcut:  edit(fn) is short for edit({"0": fn}) where '0' means the whole match
So edit(_=>static) is short for replacing the match with a static structure.

e.g. invert a table: edit("x", $=>$.y, "y", $=>$.x)
```


# LOG [2026-01-05T00:49:25-08:00]

Opened.
