/* pattern.jison — parses; dependency-free JS output via `jison -o parser.js` */
%lex
%s ARR QCOUNT

%%

\/\*[^]*?\*\/                /* skip block comments */
\/\/[^\n]*                   /* skip line comments */
[\t\r\n]+                    /* skip non-space whitespace */

/\{\{/                        return 'LBRACE2';
/\}\}/                        return 'RBRACE2';

#\{                          this.begin('QCOUNT'); return 'HASH_COUNT_OPEN';
\*\{                         this.begin('QCOUNT'); return 'STAR_QCOUNT_OPEN';

<QCOUNT>\}                   this.begin('INITIAL'); return 'COUNT_CLOSE';
<QCOUNT>[ \t\r\n]+           /* skip spaces in counts */
<QCOUNT>[0-9]+               yytext = Number(yytext); return 'INTEGER';
<QCOUNT>,                    return ',';

\{                           return 'LBRACE';
\}                           return 'RBRACE';

\[                           this.begin('ARR'); return '[';
\]                           this.begin('INITIAL'); return ']';

as                           return 'AS';
Map                          return 'MAP';
Set                          return 'SET';

\(\?=                        return 'LP_LOOKAHEAD_POS';
\(\?!                        return 'LP_LOOKAHEAD_NEG';
\(                           return '(';
\)                           return ')';
\.\.                         return 'DDOT';

\?\?                         return 'QMARKQ';
\?                           return 'QMARK';
\+\?                         return 'PLUSQ';
\+                           return 'PLUS';
\*                           return 'STAR';

:                            return ':';
,                            return ',';
\.                           return '.';

_                            return 'UNDERSCORE';
[0-9]+                       yytext = Number(yytext); return 'INTEGER';
[A-Za-z_][A-Za-z0-9_]*       return 'SYMBOL';

<ARR>[ ]                     return 'ARRAY_WS';
<ARR>[ \t\r\n]+              /* skip other whitespace inside arrays */

<<EOF>>                      return 'EOF';
/lex

%start ROOT
%token SYMBOL UNDERSCORE INTEGER
%token LP_LOOKAHEAD_POS LP_LOOKAHEAD_NEG
%token QMARK QMARKQ PLUS PLUSQ STAR STAR_QCOUNT_OPEN
%token HASH_COUNT_OPEN COUNT_CLOSE
%token AS MAP SET DDOT ARRAY_WS
%token LBRACE RBRACE LBRACE2 RBRACE2
%token EOF

%%

ROOT
  : SINGLETON_PATTERN EOF                           { return $1; }
  ;

SINGLETON_PATTERN
  : LITERAL                                         { $$ = $1; }
  | ARRAY_PATTERN                                   { $$ = $1; }
  | OBJECT_PATTERN                                  { $$ = $1; }
  | MAP_PATTERN                                     { $$ = $1; }
  | SET_PATTERN                                     { $$ = $1; }
  | '(' SINGLETON_PATTERN ')'                       { $$ = $2; }
  | LOOKAHEAD_SINGLETON                             { $$ = $1; }
  | UNDERSCORE                                      { $$ = {type:'wildcard'}; }
  | SYMBOL opt_colon_singleton                      { $$ = $2 ? {type:'binding', name:$1, pattern:$2} : {type:'symbol', name:$1}; }
  ;

opt_colon_singleton
  : /* empty */                                     { $$ = null; }
  | ':' SINGLETON_PATTERN                           { $$ = $2; }
  ;

LOOKAHEAD_SINGLETON
  : LP_LOOKAHEAD_POS SINGLETON_PATTERN ')' SINGLETON_PATTERN
      { $$ = {type:'lookahead', positive:true, guard:$2, then:$4}; }
  | LP_LOOKAHEAD_NEG SINGLETON_PATTERN ')' SINGLETON_PATTERN
      { $$ = {type:'lookahead', positive:false, guard:$2, then:$4}; }
  ;

ARRAY_PATTERN
  : '[' ']'                                         { $$ = {type:'array', items:[]}; }
  | '[' ARRAY_GROUP_PATTERN ']'                     { $$ = {type:'array', items:$2}; }
  ;

ARRAY_GROUP_PATTERN
  : GROUP_ATOM (ARRAY_WS GROUP_ATOM)*               {
        const out = [$1];
        for (let i=0; i<$2.length; i++) out.push($2[i][1]);
        $$ = out;
    }
  ;

GROUP_ATOM
  : DDOT                                            { $$ = {type:'group', kind:'lazy_any'}; }
  | SYMBOL opt_colon_singleton                      { $$ = $2 ? {type:'binding', name:$1, pattern:$2} : {type:'symbol', name:$1}; }
  | '(' ARRAY_GROUP_PATTERN ')' opt_array_quant     { $$ = {type:'group', items:$2, quant:$4||null}; }
  | SINGLETON_PATTERN opt_array_quant               { $$ = $2 ? {type:'quant', pattern:$1, quant:$2} : $1; }
  | LOOKAHEAD_ARRAY_GROUP                           { $$ = $1; }
  ;

LOOKAHEAD_ARRAY_GROUP
  : LP_LOOKAHEAD_POS ARRAY_GROUP_PATTERN ')' ARRAY_GROUP_PATTERN
      { $$ = {type:'lookaheadGroup', positive:true, guard:$2, then:$4}; }
  | LP_LOOKAHEAD_NEG ARRAY_GROUP_PATTERN ')' ARRAY_GROUP_PATTERN
      { $$ = {type:'lookaheadGroup', positive:false, guard:$2, then:$4}; }
  ;

opt_array_quant
  : /* empty */                                     { $$ = null; }
  | QMARK                                           { $$ = {kind:'?', range:[0,1], greedy:true}; }
  | QMARKQ                                          { $$ = {kind:'??', range:[0,1], greedy:false}; }
  | PLUS                                            { $$ = {kind:'+', range:[1,Infinity], greedy:true}; }
  | PLUSQ                                           { $$ = {kind:'+?', range:[1,Infinity], greedy:false}; }
  | STAR                                            { $$ = {kind:'*', range:[0,Infinity], greedy:true}; }
  | STAR_QCOUNT_OPEN opt_count_body COUNT_CLOSE     { $$ = {kind:'*{ }', range:$2 || [0,Infinity], greedy:true}; }
  ;

opt_count_body
  : /* empty */                                     { $$ = null; }
  | INTEGER                                         { $$ = [$1,$1]; }
  | INTEGER ','                                     { $$ = [$1, Infinity]; }
  | INTEGER ',' INTEGER                             { $$ = [$1,$3]; }
  ;

OBJECT_PATTERN
  : LBRACE OBJECT_ASSERTION_LIST RBRACE             { $$ = {type:'object', assertions:$2}; }
  ;

MAP_PATTERN
  : LBRACE OBJECT_ASSERTION_LIST RBRACE AS MAP      { $$ = {type:'map', assertions:$2}; }
  ;

SET_PATTERN
  : LBRACE2 opt_singleton_seq RBRACE2               { $$ = {type:'set', items:$2||[]}; }
  ;

opt_singleton_seq
  : /* empty */                                     { $$ = null; }
  | SINGLETON_PATTERN                               { $$ = [$1]; }
  | opt_singleton_seq SINGLETON_PATTERN             { $$ = ($1||[]).concat([$2]); }
  ;

OBJECT_ASSERTION_LIST
  : /* empty */                                     { $$ = []; }
  | OBJECT_ASSERTION_LIST OBJECT_ASSERTION          { $1.push($2); $$ = $1; }
  ;

OBJECT_ASSERTION
  : KV_ASSERTION                                    { $$ = $1; }
  | PATH_ASSERTION                                  { $$ = $1; }
  | INDEXED_PATH_ASSERTION                          { $$ = $1; }
  | DDOT                                            { $$ = {type:'spread'}; }
  ;

KV_ASSERTION
  : SINGLETON_PATTERN '=' SINGLETON_PATTERN opt_object_count
      { $$ = {type:'kv', key:$1, value:$3, count:$4||null}; }
  ;

PATH_ASSERTION
  : SINGLETON_PATTERN '.' OBJECT_ASSERTION          { $$ = {type:'path', base:$1, assertion:$3}; }
  ;

INDEXED_PATH_ASSERTION
  : '[' SINGLETON_PATTERN ']' OBJECT_ASSERTION      { $$ = {type:'indexPath', index:$2, assertion:$4}; }
  ;

opt_object_count
  : /* empty */                                     { $$ = null; }
  | HASH_COUNT_OPEN object_count_body COUNT_CLOSE   { $$ = $2; }
  ;

object_count_body
  : '?'                                             { $$ = {range:[0,Infinity]}; }  /* #? */
  | INTEGER                                         { $$ = {range:[$1,$1]}; }
  | INTEGER ','                                     { $$ = {range:[$1,Infinity]}; }
  | INTEGER ',' INTEGER                             { $$ = {range:[$1,$3]}; }
  ;

LITERAL
  : SYMBOL                                          { $$ = {type:'literal', name:$1}; }
  ;
%%
