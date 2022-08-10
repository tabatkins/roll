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
		return Roll.fromPairs(faces.map(x=>[x, 1/x.length]))
	}

	static d(sides) {
		// Returns a Roll whose results are the integers from 1 to sides,
		// each with an equal chance of occurring.
		sides = Math.floor(sides);
		if(Number.isNaN(sides) || sides < 1) throw new RangeError(`Dice must have at least one side, got ${sides}.`)
		return Roll.fromPairs(Array.from({length:sides}, (e,i)=>[i+1, 1/sides]));
	}

	static nd(num, sides) {
		// Returns a Roll whose results are a num-length array
		// of values each between 1 and sides,
		// all with an equal chance of occuring.
		// aka nd(2, 6) gives 36 results, from [1,1] to [6,6].
		return flat(Array.from({length:num}, x=>Roll.d(sides)));
	}

	// Shorthands for common die sizes
	static get d4() { return Roll.d(4); }
	static get d6() { return Roll.d(6); }
	static get d8() { return Roll.d(8); }
	static get d10() { return Roll.d(10); }
	static get d20() { return Roll.d(20); }

	normalize() {
		// Rescales all the chances so they sum to 1.
		const total = this.results.reduce((sum, pair)=>sum + pair[1], 0);
		this.results.forEach(pair=>pair[1] /= total);
		return this;
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

	bucketBySum() {
		// Assuming the values are numbers or arrays of numbers,
		// buckets according to their sum,
		// returning a new Roll composed of the sums.
		const ret = this.bucket(sumFaces, x=>sumFaces(x[0]));
		ret.results.sort((a,b)=>a[0]-b[0]);
		return ret;
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

	average(fn=sumFaces) {
		// Assuming the values are numbers or arrays of numbers,
		// returns the average value of the Roll.
		// Can pass a fn to convert the values into a number.
		return this.results.map(([val, chance])=>{
			return fn(val)*chance;
		}).reduce((a,b)=>a+b, 0);
	}

	table({fn=String, average=false}={}) {
		// Converts the Roll into a <table> element,
		// with two columns: the value (mapped thru fn),
		// and the chance.
		// If average is truthy, adds a final row with the
		// results of .average().
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
		const ret = this.results.map(([val, chance])=>{
			return `<${fn(val)} / ${(chance*100).toFixed(2)}%>`
		});
		if(average) {
			ret.push(`<Average / ${this.average().toFixed(2)}>`);
		}
		return ret.join(sep);
	}

	advantage(n=2, key=sumFaces) {
		// Returns a new Roll that's the original roll,
		// done n times,
		// with the highest result kept.
		// key converts the result into something that can be max'd.
		return flat(Array.from({length:n}, x=>this)).map(faces=>{
			faces.sort((a,b)=>key(a)-key(b));
			return faces[faces.length-1];
		}).bucket();
	}
	disadvantage(n=2, key=sumFaces) {
		// Same as .advantage() except the lowest is kept.
		return flat(Array.from({length:n}, x=>this)).map(faces=>{
			faces.sort((a,b)=>key(a)-key(b));
			return faces[0];
		}).bucket();
	}
}

export function sumFaces(val) {
	// Convenience function for summing dice results.
	// If the value is an array, flattens and sums the values;
	// otherwise, just returns the value numberified.
	if(Array.isArray(val)) {
		return val.flat(Infinity).reduce((a,b)=>a+b, 0);
	}
	return +val;
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