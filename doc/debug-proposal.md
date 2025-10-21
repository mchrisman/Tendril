
```
data =      [
{ tag: 'div', children: 'before' },
{ tag: 'when', condition: true, children: 'show this' },
{ tag: 'else', children: 'or this' },
{ tag: 'span', children: 'after' }
]



pattern=`[.. @whenelse:(
      {tag = /^when$/i, @otherProps:(..)}
      {tag = /^else$/i, children = $else, ..}?
    ) ..]`

                                   `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`
    
input.[0]                          `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[0].tag                      `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[0].tag=div                  `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[0].children                 `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[0].children=before          `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[1]                          `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[1].tag                      `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[1].tag=when                 `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[1].condition                `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[1].condition=true           `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[1].children                 `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[1].children='show this'     `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[2]                          `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[2].tag                      `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[2].tag=else                 `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[2].children                 `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[2].children='or this'       `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[3]                          `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[3].tag                      `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[3].tag=span                 `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[3].children                 `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  
input.[3].children='after'         `[.. @whenelse:( {tag = /^when$/i, @otherProps:(..)} {tag = /^else$/i, children = $else, ..}? ) ..]`                  


```






