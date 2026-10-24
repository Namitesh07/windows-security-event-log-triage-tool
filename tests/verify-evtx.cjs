const fs=require('node:fs'),assert=require('node:assert/strict');
const inputs=require('../inputs'),analysis=require('../analysis');
const filename=process.argv[2];if(!filename)throw new Error('Pass the converted XML fixture path.');
const result=inputs.parseInput(fs.readFileSync(filename,'utf8'),'xml');
assert.deepEqual(result.events.map(event=>event.id),['4625','4625','4624']);
assert.ok(result.events.every(event=>event.date instanceof Date&&event.sourceRecord>0&&event.sourceLine>0));
assert.ok(result.events.every(event=>event.rawFields.some(field=>field.header==='Original Event XML'&&field.value.includes('Fictional Fieldnotes conversion fixture'))));
assert.equal(analysis.analyze(result.events).length,0,'incomplete fictional identities do not establish authentication correlations');
console.log('Actual EVTX-to-XML output is accepted by the shared input/analysis modules.');
