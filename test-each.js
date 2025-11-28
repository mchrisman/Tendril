import {Tendril} from './src/tendril-api.js';

const data = [
  {
    "tag": "EACH",
    "attrs": {
      "a:def": "$it as value of {$arr} by {$it.id}"
    },
    "children": [
      {
        "tag": "DIV",
        "attrs": {
          "class": "i"
        },
        "children": [
          "{ $it.id }"
        ],
        "srcId": "src:DIV:9"
      }
    ],
    "srcId": "src:EACH:8"
  }
];

try {

  const eachElsePattern = Tendril(`[..
        {tag: /^each$/i, children: $body, @other=(remainder?)}
  ..]`);
  
  console.log("Pattern:", eachElsePattern);
  const result = (eachElsePattern).find(data).editAll({body: _=>'found'})
  console.log("Result:");
 
  // expecting 1, getting 0
  console.log('count',(eachElsePattern).find(data).count())
  console.log(data) // should be edited in place
  
  // const r =(eachElsePattern).match(data).solutions().toArray().length
  // console.log("R:", r);
} catch (e) {
  console.log("Error:", e.message);
}
