import test from 'node:test';
import assert from 'node:assert/strict';
import {dialTemperature} from '../src/mini-ui.js';

test('270 degree dial maps endpoints and midpoint to reviewed temperatures',()=>{
  const limits={minimum:16,maximum:28,step:0.5}, rect={left:0,top:0,width:200,height:200};
  assert.equal(dialTemperature(limits,0,200,rect),16);
  assert.equal(dialTemperature(limits,100,0,rect),22);
  assert.equal(dialTemperature(limits,200,200,rect),28);
  assert.equal(dialTemperature(limits,80,200,rect),16);
  assert.equal(dialTemperature(limits,120,200,rect),28);
});

test('dial honours Fahrenheit steps, clamps outside arc and rejects missing geometry',()=>{
  const limits={minimum:60,maximum:80,step:1},rect={left:0,top:0,width:200,height:200};
  assert.equal(dialTemperature(limits,100,0,rect,'°F'),70);
  assert.equal(dialTemperature(limits,NaN,0,rect,'°F'),null);
  assert.equal(dialTemperature(limits,0,0,{...rect,width:0},'°F'),null);
});
