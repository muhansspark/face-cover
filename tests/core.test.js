import test from 'node:test';
import assert from 'node:assert/strict';
import {coverage,clip,deduplicate,exportSize} from '../core.js';
test('face expansion clips to every image boundary',()=>{const r=coverage({x:0,y:10,w:90,h:90,kind:'auto'},100,100,100);assert.equal(r.x,0);assert.equal(r.y,0);assert.equal(r.w,100);assert.equal(r.h,100);});
test('manually drawn coverage never changes with global margin',()=>{assert.deepEqual(coverage({x:10,y:20,w:50,h:60,kind:'manual'},100,500,500),{x:10,y:20,w:50,h:60,kind:'manual'});});
test('negative and outside detections cannot create negative dimensions',()=>{assert.deepEqual(clip({x:-10,y:90,w:30,h:50},100,100),{x:0,y:90,w:20,h:10});assert.equal(clip({x:150,y:0,w:10,h:20},100,100).w,0);});
test('overlapping tile detections merge but adjacent faces remain',()=>{const boxes=[{x:0,y:0,w:50,h:50,score:.8},{x:3,y:3,w:45,h:45,score:.9},{x:45,y:0,w:50,h:50,score:.7}];const r=deduplicate(boxes);assert.equal(r.length,2);assert.equal(r[0].score,.9);});
test('export size preserves aspect ratio, both limits, and never upscales',()=>{assert.deepEqual(exportSize(4000,3000,1600,1600),{width:1600,height:1200});assert.deepEqual(exportSize(3000,4000,1600,1200),{width:900,height:1200});assert.deepEqual(exportSize(800,600,1600,1600),{width:800,height:600});});

