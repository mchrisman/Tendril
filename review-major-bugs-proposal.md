


This is a complete revamp of how we interpret object patterns. 

Below is a summary of changes. Please also see:
    - review-major-bugs.md - A discovery of some serious flaws in the object matching model. The motivation for this change. 
    - README.md - Current design doc
    - README.proposed.md - Proposed change

---

## Object-semantics changes

1. **Slices are first-class**

   * Old: `K:V` was a monolithic assertion with mixed existential/universal behavior.
   * New: `K:V` always defines a **slice**; assertions are layered on top.

2. **Existence is explicit and uniform**

   * Old: `K:V` *implicitly* required existence; `K?:V` disabled it.
   * New: existence is controlled by a **KV-suffix `?`**:

     * `K:V` ⇒ slice must be nonempty
     * `K:V?` ⇒ slice may be empty

3. **Implication is explicit**

   * Old: “all matching keys satisfy V” was overloaded into `K:V` and behaved inconsistently.
   * New: `K:>V` explicitly means **no bad values** (`K ⇒ V`).

4. **Existence and implication are orthogonal**

   * Old: no way to express “implication without existence”.
   * New:

     * `K:>V`   ⇒ exists + implication
     * `K:>V?`  ⇒ implication only

5. **`K?:V` is replaced**

   * Old: `K?:V` was a distinct operator with special semantics.
   * New: `K:V?` replaces it; `?:` is deprecated or treated as syntax sugar.

---

## Remainder / closure changes

6. **Coverage-based remainder is formalized**

   * Old: remainder depended on traversal / matching paths.
   * New: remainder is defined as **keys not covered by any slice**.

7. **Remainder is strictly global**

   * Old: remainder behavior was underspecified and entangled with grouping.
   * New: `%` may appear **only once**, **only at the end** of an object pattern.

8. **`$` becomes first-class closure sugar**

   * Old: closed objects required `(?!remainder)`.
   * New: `{ … $ }` ≡ `{ … %#{0} }`.

---

## Binding changes

9. **Slice binding is explicit and stable**

   * Old: group bindings leaked across branches and paths.
   * New: `@x=(K:V?)` binds a slice value (possibly empty) deterministically.

10. **“bound but empty” vs “not bound” is now well-defined**

    * Old: optional patterns made binding presence ambiguous.
    * New:

      * `@x=(K:V?)` ⇒ `@x` always bound (empty allowed)
      * `$x=(K):V?` ⇒ `$x` bound only if a witness exists

---

## Lookahead implications

11. **Object lookaheads no longer fake existential choice**

    * Old: lookaheads were implicitly tied to existential object semantics.
    * New: lookaheads operate over **slice assertions**, not key selection.

12. **Implication no longer relies on lookahead**

    * Old: implication-like constraints required lookahead hacks.
    * New: `:>` encodes implication directly.

---

## Grammar / surface syntax

13. **No ternary colon**

    * Old: `:` / `?:` / quantifiers overloaded the operator.
    * New: `:` and `:>` are binary; `?` is a KV-suffix.

14. **Cleaner mental model**

    * Old: existential vs universal behavior depended on key pattern shape.
    * New: behavior is determined solely by explicit operators:

      * `?` → existence
      * `:>` → implication
      * `%` / `$` → closure

---

## Net effect

* Old Tendril object patterns mixed **selection**, **assertion**, and **existence**.
* New Tendril cleanly separates:
  **slice definition → existence → implication → closure**.

That’s the whole shift in one sentence.
