Coming soon. For now see [cheat-sheet.md](cheat-sheet.md)


---


There are four types of assertions. **Careful**, this is not obvious.

| Expression | Asserts a valid field exists       | Asserts all values are valid       |
|------------|------------------------------------|------------------------------------|
|            | `(∃(k,v) ∈ obj)(K ~= k && V ~= v)` | `(∀(k,v) ∈ obj)(K ~= k => V ~= v)` |
| `K:V`       | ✅                                  | ❌                                  |
| `each K:V`  | ✅                                  | ✅                                  |
| `K?:V`      | ❌                                  | ❌                                  |
| `each K?:V` | ❌                                  | ✅                                  |

            

