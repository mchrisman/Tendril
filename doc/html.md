




```
<div>
    <div>Planets</div>
    <table>
       <tr><td>Planet</td><td>Size</td></tr>
       <tr><td>Jupiter (a.k.a. Jove, Zeus)</td><td>big</td></tr>
       <tr><td>Earth (a.k.a. Terra)</td><td>small</td></tr>
       <tr><td>Ceres (a.k.a. Demeter)</td><td>tiny</td></tr>
    </table>
</div>


<tr>
    (?!<td>"Planet"</td>)   <!-- ignore header -->
    <td>
        /^($x=\w++)
        |
        \(a.k.a..*\b($x=\w++)\b.*)/
    </td>
    <td>$size</td>
</tr>


<div a=b c=d> ...children </div>

=> { type:VNode tag:div attrs={a:b,c:d} children:[...]}


<>
    <when %>@children</when>
    <else>@children2</else>
</>

<when % children1=[...@children] children2=[...@children2]>


```