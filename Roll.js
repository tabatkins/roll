import {mk} from "./DOM.js"

export class Roll {
	// Roll represents all the outcomes of a roll.
	// .results is a list of [value, chance] pairs
	// (ideally with the chances summing to 1,
	//  but I don't enforce that).

	constructor(val=[]) {
		// Point. Returns a Roll where the given value
		// has a 100% chance of occurring.
		this.results = [[val, 1]];
	}

	static fromPairs(pairs) {
		// Returns a Roll with its results set to pairs.
		const ret = new Roll();
		ret.results = pairs;
		return ret;
	}

	static fromFaces(faces) {
		// Returns a Roll whose results are each of the faces values,
		// each with an equal chance of occurring.
		return Roll.fromPairs(faces.map(x=>[x, 1/faces.length]))
	}

	static d(sides) {
		// Returns a Roll whose results are the integers from 1 to sides,
		// each with an equal chance of occurring.
		sides = Math.floor(sides);
		if(Number.isNaN(sides) || sides < 1) throw new RangeError(`Dice must have at least one side, got ${sides}.`)
		return Roll.fromPairs(Array.from({length:sides}, (e,i)=>[i+1, 1/sides]));
	}

	static nd(num, die) {
		// Returns a roll composed of N dice,
		// either duplicates of `die` or a `die`-sided dice (if `die` is a number).
		// aka nd(2, 6) gives 36 results, from [1,1] to [6,6].
		if(typeof die == "number") die = Roll.d(die);
		return flat(Array.from({length:num}, x=>die));
	}

	static and(...rolls) {
		// Convenience version of flat() that takes the dice directly,
		// rather than as an array.
		return flat(rolls);
	}

	// Shorthands for common die sizes
	static get d4() { return Roll.d(4); }
	static get d6() { return Roll.d(6); }
	static get d8() { return Roll.d(8); }
	static get d10() { return Roll.d(10); }
	static get d12() { return Roll.d(12); }
	static get d20() { return Roll.d(20); }

	static parse(s) {
		s = s.replaceAll(/\s+/g, "");
		const diceTerms = s.split(/(?=[+-])/);
		if(diceTerms[0] == "") diceTerms.shift();

		const numRe = /^([+-]?\d+)$/;
		const dieRe = /^([+-]?)(\d+)d(\d+)(?:(d|k|dh|dl|kh|kl)(\d+))?(?:(adv|dis)(\d*))?$/;
		const rolls = [];

		while(diceTerms.length > 0) {
			const diceTerm = diceTerms.shift();
			if(numRe.test(diceTerm)) {
				const [_, num] = numRe.exec(diceTerm);
				rolls.push(+num);
				continue;
			} else if (dieRe.test(diceTerm)) {
				let [_, sign, num, size, keepType, keepNum, ad, adNum] = dieRe.exec(diceTerm);
				sign = sign == "-" ? -1 : 1;
				num = +num;
				size = +size;
				keepNum = +keepNum;
				let roll = Roll.nd(num, size)
				if(keepType) {
					switch(keepType) {
					case "k":
					case "kh": roll = roll.keepHighest(keepNum); break;
					case "kl": roll = roll.keepLowest(keepNum); break;
					case "d":
					case "dl": roll = roll.dropLowest(keepNum); break;
					case "dh": roll = roll.dropHighest(keepNum); break;
					}
				}
				if(ad) {
					adNum = adNum ? +adNum : 2;
					console.log({ad, adNum})
					switch(ad) {
					case "adv": roll = roll.advantage(adNum); break;
					case "dis": roll = roll.disadvantage(adNum); break;
					}
					console.log()
				}
				roll = roll.mapFaces(x=>x*sign);
				rolls.push(roll);
				continue;
			} else {
				throw new Error(`Couldn't parse the dice term '${diceTerm}'.`);
			}
		}
		return flat(rolls);
	}

	and(...rolls) {
		// And a method version of Roll.and()
		return Roll.and(this, ...rolls)
	}

	normalize() {
		// Rescales all the chances so they sum to 1.
		const total = this.results.reduce((sum, pair)=>sum + pair[1], 0);
		this.results.forEach(pair=>pair[1] /= total);
		return this;
	}

	normalizeFaces() {
		// Ensures that each value is a flat array of values.
		// e.g. `1` becomes `[1]`,
		// `[[1, 2], [3, 4]]` becomes `[1, 2, 3, 4]`
		// etc.
		return this.map(normalizeFaces);
	}

	map(fn) {
		// Returns a new Roll where each result's value
		// is replaced with fn(value), and chance is retained.
		// (Functor map.)
		return Roll.fromPairs(this.results.map(([val, chance])=>[fn(val), chance]));
	}

	join() {
		// Returns a new Roll where, if any result values are Rolls themselves,
		// they're replaced with the results of the inner roll,
		// with the outer chance distributed to the inner results.
		// (Forgiving monadic join, where non-Roll results are left unchanged.)
		return Roll.fromPairs(this.results.flatMap(([roll, chance])=>{
			if(!(roll instanceof Roll)) {
				return [[roll, chance]];
			}
			return roll.results.map(([val, innerChance]) => [val, chance*innerChance])
		}));
	}

	flatMap(fn) {
		// Just .map(fn).join().
		// In other words, maps fn over the values, but if it returns
		// a Roll, expands that Roll's results into the outer Roll.
		return this.map(fn).join();
	}

	mapFaces(fn) {
		// Map over the faces of each result individually,
		// when you don't care about the result as a whole.
		const deepMap = (sub, fn)=> {
			if(Array.isArray(sub)) return sub.map(x=>deepMap(x, fn));
			return fn(sub);
		}
		return this.map(faces=>deepMap(faces, fn));
	}

	bucket(key=String, join=x=>x[0]) {
		// Returns a new Roll with its results combined together
		// according to the key and join functions.
		// key determines how to group similar values together,
		// join determines what how to produce the new value
		// from the grouped values.
		// Chances are automatically combined appropriately.
		const buckets = new Map();
		for(const pair of this.results) {
			const keyVal = key(pair[0]);
			if(!buckets.has(keyVal)) buckets.set(keyVal, []);
			buckets.get(keyVal).push(pair);
		}
		const newResults = [];
		for(const vals of buckets.values()) {
			let totalChance = 0;
			let justVals = [];
			for(const [val, chance] of vals) {
				totalChance += chance;
				justVals.push(val);
			}
			const newPair = [join(justVals), totalChance];
			newResults.push(newPair);
		}
		return Roll.fromPairs(newResults);
	}

	sum() {
		// Assuming the values are numbers or arrays of numbers,
		// buckets according to their sum,
		// returning a new Roll composed of the sums.
		return this.bucket(sumFaces, x=>sumFaces(x[0])).sort();
	}

	count(val) {
		// Counts the number of times val shows up in each result
		// and buckets accordingly.
		return this.map(faces=>countFaces(faces, val)).bucket().sort();
	}

	replace(pred, repl) {
		return this.flatMap(faces=>replaceFaces(faces, pred, repl)).bucket().sort();
	}

	sort(key=x=>x, sorter=undefined) {
		// Sorts the result rows.
		if(sorter) {
			this.results.sort(sorter);
		} else {
			this.results.sort((a,b)=> {
				const keyA = key(a[0]);
				const keyB = key(b[0]);
				if(keyA < keyB) return -1;
				if(keyA == keyB) return 0;
				return 1;
			});
		}
		return this;
	}

	reroll({summarize, map, key=defaultRerollKey, join, cleanup, threshold=.0001, rollMax=1000}={}) {
		// "Reroll" any or all of the results of the current Roll.
		// Similar to `roll.map(summarize).flatMap(map).bucket(key, join)`,
		// except that if map returns a Roll,
		// rather than immediately flattening the inner Roll into the outer one,
		// it re-runs the process with the inner Roll's results first.
		// This continues until either all map'd values are non-Rolls,
		// or the combined chance of remaining Roll results is less than the threshold,
		// or more than rollMax rounds of rerolls have happened.
		//
		// map can, in addition to Rolls and non-Roll results,
		// return a {done:Roll} object, which flattens the Roll into the
		// finished results as normal for flatMap(), without sending them
		// thru another reroll round.
		//
		// key looks for a .key property by default, and otherwise stringifies by default.
		//
		// If reroll hits the threshold ending condition,
		// then the remaining unresolved Roll results are passed to cleanup(),
		// which must return an array of results to add to the final Roll.
		//
		// Arg signatures:
		// * summarize(roll value, previous roll value (if this is a reroll), reroll round #)
		// * map(summarized roll value, reroll round #)
		// * key(map'd roll value)
		// * join(array of map'd roll values collected by key)
		// * cleanup(array of leftover [Roll, chance] pairs)
		//
		// For example, to craft a d5 out of a d6 by rerolling all 6s that come up:
		// Roll.d6.reroll({map(face) { if(face == 6) return Roll.d6; return face;}});
		//
		// To reroll 1s and 2s on a 2d6, once only:
		// Roll.nd(2, 6).reroll({map(faces) { return {done:flat(faces.map(x=>x<=2?Roll.d6:x))}}});

		let pairs = this.results;
		if(summarize) {
			pairs = pairs.map(([val, chance])=>[summarize(val, undefined, 1), chance]);
		}
		if(key !== false) {
			pairs = bucketList(pairs, key, join);
		}
		let finishedPairs = [];
		let unfinishedPairs = [];
		for(const [val, chance] of pairs) {
			const newVal = map(val, 1);
			if(newVal.done instanceof Roll) {
				finishedPairs.push(
					...newVal.done.results.map(
						([val, newChance])=>[val, chance*newChance]
					)
				);
			} else if(newVal instanceof Roll) unfinishedPairs.push([newVal, chance, val]);
			else finishedPairs.push([newVal, chance]);
		}
		let rollCount = 2;
		while(unfinishedPairs.length) {
			if(rollCount > rollMax) {
				throw new Error(`Got more than ${rollMax} rolls deep, you're probably infinite-looping.`)
			}
			const unfinishedChance = unfinishedPairs.reduce((sum, pair)=>sum+pair[1], 0);
			if(unfinishedChance <= threshold) break;
			let newPairs = [];
			for(const [roll, chance, oldVal] of unfinishedPairs) {
				for(let [val, newChance] of roll.results) {
					newChance *= chance;
					if(summarize) {
						val = summarize(val, oldVal, rollCount);
					}
					newPairs.push([val, newChance]);
				}
			}
			if(key !== false) {
				newPairs = bucketList(newPairs, key, join);
			}
			unfinishedPairs = [];
			for(const [val, chance] of newPairs) {
				const newVal = map(val, rollCount);
				if(newVal instanceof Roll) unfinishedPairs.push([newVal, chance, val]);
				else finishedPairs.push([newVal, chance]);
			}
			rollCount++;
		}
		if(unfinishedPairs.length && cleanup) {
			finishedPairs.push(...cleanup(unfinishedPairs));
		}
		if(key !== false) {
			finishedPairs = bucketList(finishedPairs, key, join);
		}
		return Roll.fromPairs(finishedPairs);
	}

	keepHighest(n=1, key=sumFaces, compareFn=(a,b)=>key(b)-key(a)) {
		// Keeps only the top N faces among each result.
		// compareFn should sort the faces highest-first
		return this.map(faces=>{
			return faces.slice().sort(compareFn).slice(0,n);
		}).bucket().sort(key);
	}

	dropHighest(n=1, key=sumFaces, compareFn=(a,b)=>key(b)-key(a)) {
		// Keeps only the top N faces among each result.
		// compareFn should sort the faces highest-first
		return this.map(faces=>{
			return faces.slice().sort(compareFn).slice(n);
		}).bucket().sort(key);
	}

	keepLowest(n=1, key=sumFaces, compareFn=(a,b)=>key(b)-key(a)) {
		// Keeps only the top N faces among each result.
		// compareFn should sort the faces highest-first
		return this.map(faces=>{
			return faces.slice().sort(compareFn).slice(-n);
		}).bucket().sort(key);
	}

	dropLowest(n=1, key=sumFaces, compareFn=(a,b)=>key(b)-key(a)) {
		// Keeps only the top N faces among each result.
		// key converts each face into something that can be compared
		// compareFn should sort the faces highest-first
		return this.map(faces=>{
			return faces.slice().sort(compareFn).slice(0,-n);
		}).bucket().sort(key);
	}

	advantage(n=2, key=sumFaces, compareFn=(a,b)=>key(b)-key(a)) {
		// Returns a new Roll that's the original roll,
		// done n times,
		// with the highest result kept.
		// key converts the result into something that can be max'd.
		return Roll.nd(n, this).keepHighest(1, key, compareFn)
	}

	disadvantage(n=2, key=sumFaces, compareFn=(a,b)=>key(b)-key(a)) {
		// Same as .advantage() except the lowest is kept.
		return Roll.nd(n, this).keepLowest(1, key, compareFn);
	}

	explode({threshold, pred, sum=sumFaces, times=Infinity}={}) {
		// Creates an "exploding" die -
		// whenever an "exploding" face is rolled,
		// the die is rerolled and the exploded value added to the result.
		// By default, explodes on the highest value;
		// can instead pass a threshold value (it'll explode at or above)
		// a threshold *function* (it'll be given `this` and must return a threshold number)
		// or a predicate function called with (current roll sum, exact current roll value)
		// that returns true if the value should explode.
		// Can pass a key fn to digest the result value into a number;
		// by default it's sumFaces.
		// Can optionally give a maximum number of times it can explode;
		// by default it'll just stop exploding when it gets too rare.
		if(pred) {
			// this'll be used
		} else if(typeof threshold == "number") {
			pred = x=>x>=threshold;
		} else if(threshold && typeof threshold == "object") {
			// assume it's a callable function
			threshold = threshold(this.results.map(x=>x[0]));
			pred = x=>x>=threshold;
		} else {
			// default to exploding on the maximum value
			threshold = this.results.reduce((m, r)=>Math.max(m, sum(r[0])), 0);
			pred = x=>x>=threshold;
		}
		const self = this;
		return this.reroll({
			summarize(faces, oldSummary={}) {
				const val = sum(faces);
				return {
					val,
					sum: val+(oldSummary.sum||0),
					explodes: pred(val, faces),
					get key(){ return `${this.val}:${this.sum}`; }
				};
			},
			map(val, rollNum) {
				if(rollNum > times) return val.sum;
				if(val.explodes) { return self; }
				return val.sum;
			},
		});
	}

	roll(n) {
		// Rolls the dice, returning one result at random.
		const doRoll = () => {
			const totalChance = this.results.reduce((s, r)=>s+r[1], 0);
			const r = Math.random() * totalChance;
			let soFar = 0;
			for(const [val, chance] of this.results) {
				soFar += chance;
				if(soFar >= r) return val;
			}
			// I might be able to hit this spot due to FP inaccuracy,
			// so just return the last value.
			return this.results[this.results.length-1][0];
		}
		if(n == undefined) return doRoll();
		return Array.from({length:+n}, doRoll);
	}

	average(fn=sumFaces) {
		// Assuming the values are numbers or arrays of numbers,
		// returns the average value of the Roll.
		// Can pass a fn to convert the values into a number.
		return this.results.map(([val, chance])=>{
			return fn(val)*chance;
		}).reduce((a,b)=>a+b, 0);
	}

	min(fn=sumFaces) {
		// Assuming the values are numbers or arrays of numbers,
		// returns the min value of the Roll.
		// Can pass a fn to convert the values into a number.
		return this.results.map(([val, chance])=>fn(val)).reduce((soFar,val)=>Math.min(soFar, val), Infinity);
	}

	max(fn=sumFaces) {
		// Assuming the values are numbers or arrays of numbers,
		// returns the max value of the Roll.
		// Can pass a fn to convert the values into a number.
		return this.results.map(([val, chance])=>fn(val)).reduce((soFar,val)=>Math.max(soFar, val), -Infinity);
	}

	table({fn=String, average}={}) {
		// Converts the Roll into a <table> element,
		// with two columns: the value (mapped thru fn),
		// and the chance.
		// If average is truthy, adds a final row with the
		// results of .average().
		// (If not passed, average is auto-added if it exists.)
		if(average == undefined) {
			// Try to calculate average
			let avgValue = this.average();
			if(!Number.isNaN(avgValue)) average = true;
		}
		return mk.table({},
			mk.tbody({},
				...this.results.map(([val, chance])=>
					mk.tr({},
						mk.td({}, fn(val)),
						mk.td({}, (chance*100).toFixed(2)+"%"),
					),
				),
				...(!average?[]: [mk.tr({}, mk.td({}, "Average"), mk.td({}, this.average().toFixed(2)))]),
			),
		);
	}

	text({sep="", fn=String, average=false}={}) {
		// Similar to .table() but instead returns raw text,
		// for easy viewing in text contexts like the console.
		if(average == undefined) {
			// Try to calculate average
			let avgValue = this.average();
			if(!Number.isNaN(avgValue)) average = true;
		}
		const ret = this.results.map(([val, chance])=>{
			return `<${fn(val)} / ${(chance*100).toFixed(2)}%>`
		});
		if(average) {
			ret.push(`<Average / ${this.average().toFixed(2)}>`);
		}
		return ret.join(sep);
	}
}

export function sumFaces(faces) {
	// Convenience function for summing dice results.
	// If the value is an array, flattens and sums the values;
	// otherwise, just returns the value numberified.
	faces = normalizeFaces(faces);
	return faces.reduce((sum,face)=>sum+face, 0);
}

export function countFaces(faces, pred) {
	// Convenience function for counting the number of times
	// a particular dice result comes up.
	// Works on both arrays and numeric values.
	// If val is a function, calls it on each value;
	// otherwise, just compares it.
	faces = normalizeFaces(faces);
	pred = normalizePred(pred);
	return faces.reduce((sum, face)=>pred(face) ? sum+1 : sum, 0);
}

export function replaceFaces(faces, pred, repl) {
	// Convenience function for replacing some faces of a result.
	// Calls pred on each value, passing the face;
	// when it's truthy replaces it with the repl value.
	// If pred isn't a function, just checks if it's equal to the value.
	// If repl is a function, calls it instead,
	// passing the face value, and uses the return value.
	faces = normalizeFaces(faces);
	pred = normalizePred(pred);
	faces = faces.map(face=>{
		if(!pred(face)) return face;
		if(typeof repl == "function") repl = repl(face);
		return repl;
	});
	return flat(faces);
}

export function defaultRerollKey(val) {
	// The default key function used for .reroll(),
	// exposed for convenience.
	// Returns val.key if it exists,
	// otherwise returns the stringification of val.
	if(val.key || Object.hasOwn(val, 'key')) return val.key;
	return String(val);
}

export function flat(arr) {
	// Converts an array of Rolls (and non-Roll fixed values)
	// into a Roll of arrays of values,
	// with the original Rolls expanded/combined into each result.
	// flat([d6, 5, d6]) => 2d6-ish value, with [1,5,1], [1,5,2], ..., [6,5,6]
	// Very helpful for rerolling *some* results of a multi-dice value.
	const rollIndexes = [];
	const justRolls = [];
	for(const [i, val] of enumerate(arr)) {
		if(val instanceof Roll) {
			rollIndexes.push(i);
			justRolls.push(val);
		}
	}
	if(justRolls.length == 0) {
		return new Roll(arr);
	}
	const newPairs = [];
	for(const [faces, chance] of rollCombine(justRolls).results) {
		let newResult = arr.slice();
		for(const [faceI, rollI] of enumerate(rollIndexes)) {
			newResult[rollI] = faces[faceI];
		}
		newPairs.push([newResult, chance]);
	}
	return Roll.fromPairs(newPairs);
}




/* Internal functions below, not meant to be exported */

function bucketList(pairs, key, join) {
	// Internal function.
	const buckets = new Map();
	for(const pair of pairs) {
		const keyVal = key(pair[0]);
		if(!buckets.has(keyVal)) buckets.set(keyVal, []);
		buckets.get(keyVal).push(pair);
	}
	const bucketPairs = [];
	for(const vals of buckets.values()) {
		let totalChance = 0;
		for(const [_, chance] of vals) {
			totalChance += chance;
		}
		let newVal;
		if(join) {
			newVal = join(vals.map(x=>x[0]));
		} else {
			newVal = vals[0][0];
		}
		bucketPairs.push([newVal, totalChance]);
	}
	return bucketPairs;
}

function* enumerate(arr, i=0) {
	// Internal function.
	for(const val of arr) {
		yield [i, val];
		i++;
	}
}

function* indexes(sizes) {
	// Internal function.
	// Given a list of max indexes,
	// yields lists with every combination of values
	// between 0 and max-1.
	let vals = sizes.map(_=>0);
	let limit = sizes.reduce((a,b)=>a*b, 1);
	yield [...vals];
	while(limit-->0) {
		let i = sizes.length - 1;
		vals[i]++;
		while(vals[i] >= sizes[i]) {
			vals[i] = 0;
			i--;
			vals[i]++;
			if(i == -1) return;
		}
		yield [...vals];
	}
}

function rollCombine(rolls) {
	// Internal function.
	// Given an array of rolls, returns a roll of arrays.
	// [d6, d6, d6] => 3d6
	const pairs = [];
	for(const is of indexes(rolls.map(x=>x.results.length))) {
		const selectedPairs = is.map((resultI, rollI)=>rolls[rollI].results[resultI]);
		pairs.push([
			selectedPairs.map(x=>x[0]),
			selectedPairs.reduce((chance,x)=>chance *= x[1], 1)
		])
	}
	return Roll.fromPairs(pairs);
}

function normalizeFaces(faces) {
	// Turns faces into a flat array
	if(Array.isArray(faces)) return faces.flat(Infinity);
	return [faces];
}

function normalizePred(pred) {
	// If pred is a non-function,
	// returns a function that just checks against the value.
	if(typeof pred == "function") return pred;
	return x=>x==pred;
}
