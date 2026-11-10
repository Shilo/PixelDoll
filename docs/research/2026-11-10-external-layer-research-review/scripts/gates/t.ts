const R = 'file:///<REPO>/app/src/lib/items/run.ts';
const m = await import(R);
console.log(Object.keys(m).filter(k=>/measured|withH4|KEY_COLL/.test(k)));
