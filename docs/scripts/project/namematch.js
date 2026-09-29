// namematch.js
// How well a name matches what was typed into a search bar. Shared by the
// mock mentor search (data.js) and the admin list reordering
// (adminsearch.js), so both views agree on what "most relevant" means.

// Lower case, trimmed, runs of spaces squashed: "  Pat   KO " -> "pat ko".
export function normalizeQuery(query) {
	return String(query ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Lower is better, -1 for no match. `query` should already be normalized.
//   0  the name starts with it           "ja"     -> James Books
//   1  a later word starts with it       "bro"    -> Casey Brooks
//   2  it is somewhere inside the name   "ook"    -> James Books
//   3  every typed word starts a word    "pat ko" -> Pat Kowalski
export function matchRank(name, query) {
	const n = String(name ?? "").toLowerCase();
	if (!query) return -1;
	if (n.startsWith(query)) return 0;
	const words = n.split(/\s+/);
	if (words.some(w => w.startsWith(query))) return 1;
	if (n.includes(query)) return 2;
	const parts = query.split(" ").filter(Boolean);
	if (parts.length > 1 && parts.every(p => words.some(w => w.startsWith(p)))) return 3;
	return -1;
}

// "Casey [b]Bro[/b]oks" - the matched part in bold, for Text objects with
// BBCode on. Left as it is when the query is not one piece of the name.
export function boldMatch(name, query) {
	name = String(name ?? "");
	const at = query ? name.toLowerCase().indexOf(query) : -1;
	if (at < 0) return name;
	return name.slice(0, at) + "[b]" + name.slice(at, at + query.length) + "[/b]" + name.slice(at + query.length);
}
