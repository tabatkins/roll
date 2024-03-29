# Roll.js

🎲 An exact-results dice-rolling library, for answering dice-related stat questions.

I'm an avid D&D player, as is my brother,
and we both like working on homebrew design as well.
Part of this requires understanding dice results very well,
so you can tell if something is likely to be balanced against something else.

Previously, I'd often answer dice questions by quickly writing up some simulation code--
run 10k trials and take the average, and your result will be good enough.
But it bugged me having to rewrite that same code over and over,
handling multiple dice was trickier than I thought it could be,
and ultimately it just kinda bugged me that I was using approximations
when I knew the exact result wasn't tricky to calculate,
it just required a bit of work.

So, I wrote this library for myself,
which offers a fairly convenient JS API
for calculating dice results *precisely*,
even for complicated operations
involving multiple dice, rerolls, and complex reactions to dice results.

See [the dingus](https://tabatkins.github.io/roll/) for a script playground,
along with several pieces of example code showing off the functionality.

## `Roll` class

The `Roll` class represents the result of a die roll (or several).
It maintains a list of possible results (usually, die faces)
paired with the chance of each occurring.

For example, `Roll.d6` has a list of six such pairs,
each containing a value from 1-6 and a chance of 1/6 (approximately .16666).

## Constructing Rolls

There are several ways to construct rolls:

* `Roll.d4`/`.d6`/`.d8`/`.d10`/`.d12`/`.d20`

	These readonly properties return fresh `Roll` objects of the given number of sides.
	Exactly equivalent to `Roll.d(4)`/etc,
	just slightly easier to type for such common cases.

* `Roll.d(int D)`

	Returns a `Roll` representing a die with D sides;
	that is, whose pairs contain the values 1-D,
	and all have the same 1/D chance.

* `Roll.nd(int N, int|Roll D)`

	Returns a `Roll` representing a roll of NdD dice.
	The pairs are arrays of N values, each 1-D,
	and all have an equal 1/(D^N) chance.

	For example, `Roll.nd(3,6)` represents a 3d6 roll.
	Each result pair is a value like `[1, 2, 4]`,
	and has a 1/216 (6^3) chance.

	You can alternately pass another Roll as the D,
	and it will duplicate that roll N times,
	making a composite die.
	For example, `Roll.nd(2, Roll.d6.explode())`
	creates a roll with a pair of individually-exploding d6s
	(very distinct from `Roll.nd(2,6).explode()`,
	which only explodes when the combined roll is 12).
	(In AnyDice notation,
	these would be written `2d[explode d6]` vs `explode 2d6`.)

* `Roll.and(...(Role | any) values)`

	Combines multiple `Rolls`
	(and non-`Roll` values)
	into a single `Roll` whose results are arrays of values,
	taken from every possible combination of the inputs.

	For example, `Roll.and(Roll.d4, Roll.d6)`
	produces a `Roll` with 24 results,
	each an array of two values ranging from 1-4 and 1-6.
	(Aka `d4 + d6`.)

	Non-`Roll` values can be passed,
	and are taken as constants;
	e.g. `Roll.and(Roll.d4, 3)`
	is effectively `1d4 + 3`.

	(See also `r.and()`, which is the same function
	but as a method on existing rolls,
	if that's more convenient.)

* `Roll.parse(str diceExpr)`

	Parses a string like `2d6 + 1d4 - 5` into a Roll
	(in this case, identical to `Roll.and(Roll.nd(2,6), Roll.d4, -5)`).

	This syntax is under active development,
	but will likely be a close analog
	(or possibly an exact duplicate)
	of Roll20 Syntax,
	as it's generally pretty reasonable.

	Currently supports:

	* Addition and subtraction of terms
	* Plain numbers
	* Dice expressions, with:
		* `k`/`d`/`kh`/`kl`/`dh`/`dl` suffixes, like `4d6d1` for "4d6, drop lowest 1". Number is required.
		* `adv`/`dis` suffixes, like `1d20adv` for "1d20, rolled with advantage". A following number is optional to indicate how many rolls should be made and then the highest/lowest selected from. Elven advantage, for example, would be `1d20adv3`.

* `flat([Roll | any] values)`

	The same as `Roll.and()`,
	but as a free-standing function in the module,
	and takes a single input that's an array of the `Roll` values;
	that is, `flat([d1, d2, d3])` is identical to `Roll.any(d1, d2, d3)`.

	Especially useful when processing a multi-die roll
	in a `.flatMap()` callback,
	when you want to replace *one* of the die rolls in an array:

	```js
	// Reroll any 6s that come up, once
	Roll.nd(3,6).flatMap(faces=>
		flat(faces.map(x=> x==6 ? Roll.d6 : x))
	);

	// Tho note this can be done much easier as
	Roll.nd(3,6).replace(6, Roll.d6)
	```

* `Roll.fromFaces([any] faces)`

	Returns a `Roll` whose pairs have the values given in the array,
	and whose chances are all equally 1/(length of the array).

	Useful when constructing "odd" dice,
	like a "high variance" d6:
	`Roll.fromFaces([1, 1, 2, 5, 6, 6])`.

* `Roll.fromPairs([[value, chance]] pairs>)`

	The most manual construction method.
	Takes the exact value/chance pairs that the `Roll` should represent.
	Useful when you're doing something extremely custom.

* `new Roll(value)`

	A trivial constructor.
	Takes a single value,
	and returns a `Roll` with one pair,
	containing that value and a 100% chance.

	This exists so that the class is a pointed monad;
	it's not generally useful.

## Manipulating Rolls

Once a `Roll` has been constructed,
there are several methods for altering the result.

* `r.and(...[Roll | any] values)`

	Combines the current roll with one or more additional `Roll`s
	(or non-`Roll` values, treated as constants).
	For example, `Roll.2d6.and(Roll.d4)`
	produces a `2d6 + 1d4` result.

	This is identical to the static `Roll.and()` function;
	`d1.and(d2)` does the exact same thing as `Roll.and(d1, d2)`.

* `r.sum()`

	Replaces each roll result by the sum of its faces.

	For example, `Roll.nd(3,6).sum()` returns a Roll
	with results between 3 and 18,
	rather than more than 200 individual die-face triples.

	(Uses the `sumFaces(faces)` convenience function, also exported.)

* `r.count((function|any) target)`

	Replaces each result with a count of how many times a particular value appears among the result's faces,
	then combines identical counts together.

	If `target` is not a function, just counts how many times the `target` value appears among the faces.

	If `target` is a function, calls it on each face, and counts how many times the function returns a truthy value.

	For example, `Roll.nd(5, 10).count(x=>x>=8)`
  	counts how many faces on each possible roll of a 5d10 are 8 or higher
  	(matching how to count successes on a World of Darkness dice pool),
  	returning a roll with the chance of 0-5 successes.
  	`Roll.nd(8, 6).count(6)` will count how many times a 6 shows up
  	among 8d6.

	(Uses the `countFaces(faces, pred)` convenience function, also exported.)

* `r.replace((function|any) target, (function|any) repl)`

	Replaces some of the faces on each result.
	If `target` is not a function, it replaces any faces that match the target;
	if it is, it calls `target(face)` and replaces any that return a truthy value.

	If `repl` is not a function, it's used as the replacement for any valid targets;
	if it is, `repl(face)` is called, and the return value is used as the replacement.

	For example, `Roll.nd(2,6).replace(x=>x<=2, Roll.d6)`
	will replace any 1s and 2s in the 2d6 results
	with a fresh d6 roll.

	(Uses the `replaceFaces(faces, target, repl)` convenience function, also exported.)

* `r.keepHighest(int n=1, function key=sumFaces, function compareFn=(a,b)=>key(b)-key(a))`
* `r.dropHighest(...)`
* `r.keepLowest(...)`
* `r.dropLowest(...)`

	Keeps or drops the N highest or lowest faces of each result,
	then buckets and sorts the result.

	For example, `Roll.nd(4,6).keepHighest(2)` will give a roll
	with outcomes from 2-12 (as you'd expect for keeping 2 d6s),
	but with high numbers being vastly more common than low ones.

	If your faces are non-numeric,
	`key` and `compareFn` can be used to control
	what are considered "highest" or "lowest" faces.
	The `compareFn` must sort "highest" first to work correctly.

* `r.advantage(int n=2, function key=sumFaces, function compareFn=(a,b)=>key(b)-key(a))`
* `r.disadvantage(...)`

	Repeats the roll N times,
	taking the highest (or lowest) result
	(according to the key function),
	and returns a new `Roll` representing the outcome.

	For example, `Roll.d20.advantage()`
	will return a roll representing "roll 2d20 and take the highest":
	it will have the same 20 outcomes (1-20) as it did originally,
	but the chances will have shifted upwards,
	with 1 now having a 1/400 chance
	and 20 having a 39/400 chance.

	By default, sums the faces to determine what is "highest",
	but this can be controlled with `key` and `compareFn`,
	as per `keepHighest()`/etc.
	(These functions are implemented on top of `keepHighest(1)` and `keepLowest(1)`.)

* `r.explode({(int or function)? threshold, function? pred, function sum=sumFaces, int times=Infinity})`

	Creates an "exploding" die,
	rerolling the die when it satisfies some condition
	and adding the reroll to the original value.

	By default, rerolls based on max value;
	`Roll.nd(2, 6)` will reroll a `[6,6]` result,
	with the reroll results adding to the 12 sum.
	This is distinct from `flat([Roll.d6.explode(), Roll.d6.explode()])`,
	which is a pair of exploding d6s
	which each *individually* explode when they roll a 6.

	The optional `threshold` argument can be a number,
	in which case it rerolls whenever the roll's sum is >= the threshold;
	or it can be a function,
	which is passed a list of the Roll values
	and must return a threshold number
	(this is how the default works, by calculating the maximum sum value).
	If omitted, the threshold is the maximum value of the Roll.

	The optional `pred` argument must be a boolean function,
	returning true when the roll should explode.
	It's passed both the summed value
	and the original value,
	in case your explosion logic is complicated and based on exact face results.
	If omitted, the predicate just checks if the value is the maximum possible for the Roll.

	The `sum` function is called on each value
	before passing it to the `pred` function,
	and is expected to return a number.
	It defaults to `sumFaces()`.

	Finally, you can control how many times a die is allowed to explode.
	By default, this will use the normal logic for `.reroll()`,
	stopping the explosions when the pending rerolls are less than .01% in total.


If the convenience methods above aren't enough,
you can get low-level and manipulate Rolls more directly:

* `r.map(function cb)`

	Returns a new `Roll`
	where all the values from the original roll
	have been replaced with the result of passing them to `cb`.
	The chance of each outcome is maintained.

	For example, to represent a `1d10+3`,
	one could write `Roll.d10.map(x=>x+3)`,
	giving a `Roll` with the values 4-13,
	each still with a 10% chance.

* `r.flatMap(function cb)`

	Similar to `.map()`, except that if `cb` returns another `Roll`,
	it's "folded in" to the returned `Roll`--
	the returned `Roll`'s values are added to the parent roll,
	with its chances multiplied by the chance of the original result.

	For example, to roll a d6, but reroll a 1 result once,
	one could write: `Roll.d6.flatMap(x=>x > 1 ? x : Roll.d6)`,
	giving a roll with 11 values:
	the values 2-6 each with a 1/6 chance,
	and then then values 1-6 each with a 1/36 chance.

* `r.join()`

	The method that actually does the "fold `Roll` results into the parent `Roll`" behavior;
	`r.flatMap(cb)` is in fact just `r.map(cb).join()`.

* `r.bucket(function key=String, function join=x=>x[0])`

	Simplifies a roll by merging similar results into a single result,
	combining their chances.

	The `key` function is passed each result's value,
	and values that produce the same return value are merged
	(using the same logic as `Map`,
	so return primitives like numbers or strings,
	not objects).
	By default it stringifies,
	which works well on numbers or arrays.

	Then the list of grouped values is passed to the `join` function
	to produce the new value;
	by default it just selects the first one.
	(This is fine if all the results grouped by the `key` are in fact identical,
	but if you want to do some more complicated combination of the values,
	you can.)

	For example, in the description of `.flatMap()`
	the reroll produced multiple faces with the same value.
	This is fine numerically,
	but it will create unnecessary work
	if additional transformations are done on the value.
	Calling `.bucket()` on the the result
	will group the results by their value,
	resulting in a `Roll` that again has only 6 results (1-6),
	and the appropriate combined chances for each (1/36 for 1, 7/36 for 2-6).

* `r.reroll({function summarize, function map, function key=defaultRerollKey, function join, function cleanup, number threshold=.0001, int rollMax=1000}={})`

	This is a toughy.
	`.reroll()` is a powerful function
	that allows you to simulate the effects of arbitrary rerolls on the die,
	even theoretically infinite ones.
	In its simplest form,
	you can think of it as "`.flatMap()`, but call `.flatMap()` some more on any returned `Rolls` before `.join()`ing them all together".

	As a simple example,
	in real life you can simulate a d5 by just rolling a d6,
	and rerolling any 6s until you get a non-6 result.
	If you tried to do this with `.flatMap()`,
	as in the preceding examples,
	you'd get a `Roll` where 6s are *less likely*,
	but still *possible*.
	On the other hand,
	this can be easily done with `.reroll()`,
	using essentially the exact same code:

	```js
	Roll.d6.reroll({
		map: x => x==6 ? Roll.d6 : x
	});
	```

	Now, whenever you replace a 6 with fresh `Roll.d6`,
	the `map` callback will be called on *those* results as well,
	rerolling any 6s produced by the *second* roll.
	And then `map` will be called on the *third* d6's results,
	and the *fourth*, etc.
	This process eventually cuts off;
	by default it won't repeat this process more than 1000 times,
	and it'll stop early if,
	after a mapping pass,
	the new `Roll` results sum to a total chance of less than .0001
	(1 in 10 thousand).
	These unmapped results are dropped,
	so in the above code
	there will not be *any* 6 values in the final `Roll` at all.

	In addition to the value being mapped,
	the `map()` callback is passed the reroll # as its second argument.

	If you want to return a `Roll` and just have it flattened into the final `Roll`,
	rather than going thru another mapping pass with its values,
	you can return it as the "done" property on an object.

	For example, say you want to reroll 1s on an 8d6,
	but at most twice;
	after that they're stuck with the 1s:

	```js
	Roll.nd(8, 6).reroll({
		map(faces, rollNum) {
			// reroll 1s on any dice
			const newFaces = flat(faces.map(x => x==1 ? Roll.d6 : x));
			if(rollNum == 1) {
				// first reroll, allowed to go again if needed
				return newFaces;
			} else {
				// second reroll, no more!
				return {done:newFaces};
			}
		}
	})
	```

	The rest of `.reroll()`'s arguments let you control its behavior more finely.

	* `key` and `join`: identical to the same arguments in `.bucket()`,
		because the results are bucketed after each mapping pass
		to reduce the amount of wasted work.
		The default `key` argument will stringify the value,
		unless the value has a `.key` property itself,
		in which case that property's value is used.
		(See the `summarize` argument for how this can be useful.)

		(The default `key` function is also exported in the module as `defaultRerollKey`.)

	* `cleanup`: If there are leftover `Roll` results
		whose chances are too small,
		by default they're thrown out.
		If you pass a `cleanup` function,
		it's called with the results.
		It should return an array of results to add to the final `Roll`.

	* `summarize`: When doing complex dice operations,
		you might need to track some state across rerolls
		(more than just the dice results themselves).
		If passed, `summarize` is called on every value
		before it's passed to `map`,
		and its return value replaces the original value.

		`summarize` is passed three arguments:
		the value to be summarized,
		the *previous* summarized value that was rerolled
		(if this is a reroll pass;
		`undefined` if this is an original value),
		and the roll # like `map`.

		For example, in D&D "death saves" are represented
		by rolling a d20 over several rounds;
		after a sufficient number of successes or failures,
		you finally either stabilize or die.
		The chances of either outcome can be determined by:

		```js
		Roll.d20.reroll({
			summarize(roll, oldSummary={}) {
				return {
					successes:(roll>=10?1:0) + (oldSummary.successes || 0),
					failures:(roll<10?1:0) + (roll==1?1:0) + (oldSummary.failures || 0),
					nat20: (roll==20),
					get key() { return `${this.successes}/${this.failures}/${this.nat20}`; },
				}
			},
			map(summary) {
				if(summary.nat20) return "revive";
				if(summary.successes >= 3) return "stabilize";
				if(summary.failures >= 3) return "die";
				return Roll.d20;
			}
		})
		```

		In other words:

		* start with a d20 roll, and reroll it repeatedly.
		* summarize each result by digesting it into a count of
			total successes, total failures, and whether a "nat 20" was rolled.
			Add a key getter to allow the results to be bucketed,
			since the exact number rolled doesn't matter,
			just the counts.
		* map the summarized results,
			checking for termination conditions,
			and otherwise returning another d20 to continue rolling.

		This produces a `Roll` with three results
		(the values "revive", "stabilize", and "die"),
		each with their correct chance of occurring
		(approximately 18%, 41%, and 41%).

* `r.normalize()`

	If your `Roll`'s results' chances don't sum to 1,
	this will rescale them so they do.

* `r.normalizeFaces()`

	Ensures that your `Roll`'s values are all flat arrays;
	e.g. `1` becomes `[1]`,
	`[[1, 2], [3, 4]]` becomes `[1, 2, 3, 4]`
	etc.

	This *does* potentially change the semantics of the `Roll`;
	for example, `Roll.nd(2, Roll.nd(2,6))` is a pair of 2d6s,
	not 4d6.
	Calling `.keepHighest()` on the roll
	will give you the higher of the two 2d6 values;
	calling `.normalizeFaces.keepHighest()` will instead give you
	the highest d6 of the 4d6.

## Displaying Rolls

Once you've gotten a `Roll`,
you probably want to know its results.

* `r.roll(int? n)`

	Rolls the dice!
	Returns one of the possible values,
	weighted appropriately based on the chances.

	If `n` is passed, returns an array of `n` roll results.

* `r.average(function fn=sumFaces)`

	Returns the average value of the roll,
	weighting by chance.
	Each value is passed thru `fn` first to render it numerical.
	The default function will flatten and sum arrays,
	or return values that are already numeric.

	The `sumFaces()` function is also exported by this module,
	for convenience.
	(It's used by `.sum()` as well.)

* `r.text({string sep="", function fn=String, bool average}={})`

	Returns the results as a string of text,
	with each result looking like `<[value] [chance]%>`
	(like `<1 16.7%>` for a result from a d6).
	If `average` is truthy,
	additionally appends an `<average [value]>` to the end.
	(If not passed, it's automatically added if the average isn't NaN.)

	Each value is mapped by `fn` before being added to string,
	and all the results are joined by the `sep` string
	(defaulting to `""` so they're all on one line,
	but passing `"\n"` to put one per line can be useful).

* `r.table({fn=String, average=false}={})`

	Returns an HTML `<table>` element listing the results,
	with the first column being the value
	(first mapped thru `fn`)
	and the second column being the chance.
	If `average` is truthy,
	appends a final average row to the table.
	(If not passed, it's automatically added if the average isn't NaN.)
