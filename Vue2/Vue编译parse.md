版本是Vue.js v2.6.11。   
Vue编译的第一步是`parse`，这个过程是非常复杂的，里面有很多的分支，一篇文章如果要把所有分支全部包含，将会非常的庞大。根据下面这个案例代码将这个过程走一遍，就会减少许多分支的进入。

```html
<template>
  <ul class="list" v-if="list.length">
    <li v-for="(item,index) in list" class="item">
      {{index}}:{{item}}
    </li>
  </ul>
</template>
```
`parse`的源码在`src/compiler/parser/index.js`：

```javascript
export function parse (
 template: string,
 options: CompilerOptions
): ASTElement | void {
    warn = options.warn || baseWarn

    platformIsPreTag = options.isPreTag || no
    platformMustUseProp = options.mustUseProp || no
    platformGetTagNamespace = options.getTagNamespace || no
    const isReservedTag = options.isReservedTag || no
    maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)

	transforms = pluckModuleFunction(options.modules, 'transformNode')
	preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
	postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

	delimiters = options.delimiters

    const stack = []
    const preserveWhitespace = options.preserveWhitespace !== false
    const whitespaceOption = options.whitespace
    let root
    let currentParent
    let inVPre = false
    let inPre = false
    let warned = false

    parseHTML(template, {...})	

    return root
}
```
执行`parseHTML`，`parseHTML`源码在`src/compiler/parser/html-parser.js`：
```javascript
export function parseHTML(html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last, lastTag

  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }

            advance(commentEnd + 3)
            continue
          }
        }
        

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        //...
      }

      //...
    } else {
      //...
    }

    if (html === last) {
      //...
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  function advance(n) {}
  
  function parseStartTag() {}
  
  function handleStartTag(match) {}
  
  function parseEndTag(tagName, start, end) {}

}
```
`parseHTML`是不断`while`的过程，每一次`while`都会进入下列6种情况的其中一种。

1. 注释标签

2. 条件注释标签

3. `doctype`标签

4. 结束标签

5. 开始标签
6. 文本

前5种有对应的正则

```javascript
const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`

// 开始
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 结束
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
// Doctype标签
const doctype = /^<!DOCTYPE [^>]+>/i
// 注释
const comment = /^<!\--/
// 条件注释
const conditionalComment = /^<!\[/
```
案例代码传入的`template`字符串`html`: 

```javascript
"<ul class='list' v-if='list.length'><li v-for='(item, index) in list'>{{index}}:{{item}}</li></ul>"
```

首先，判断`lastTag`，`lastTag`表示上一次解析的标签名，第一次进入显然是`undefined`，获取`<`索引是`0`，进入`textEnd === 0`分支，然后根据上面5个正则匹配，匹配到标签开始标签。

执行`parseStartTag`，定义在`parseHTML`内部：

```javascript
function parseStartTag() {
    const start = html.match(startTagOpen)
    if (start) {
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      while (
        !(end = html.match(startTagClose)) &&
        (attr = html.match(dynamicArgAttribute) || html.match(attribute))
      ) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      if (end) {
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
}
```
这个方法主要是解析开始标签的，先创建一个`match`对象，包含标签的名称`tagName`，存放标签的属性数组`attrs`，以及起始索引`start`。接着会匹配标签的属性和闭合符号`>`，匹配到属性就会向`attrs` 中`push`，然后继续循环，直到匹配到`>`，退出循环，设置`unarySlash`，设置标签的结束索引`end`，最后返回`match`。

`unarySlash`如果存在代表元素是一元标签元素，例如，`<img />`、`<br />`等。

每次匹配后，都会执行`advance`方法，

```javascript
function advance(n) {
  index += n
  html = html.substring(n)
}
```

该方法主要作用是改变`index`，同时更新字符串。

例如，当获取了`tagName`后，就会执行`advance`，字符串`html`就被更新为：

```javascript 
" class='list' v-if='list.length'><li v-for='(item, index) in list'>{{index}}:{{item}}</li></ul>"
```
这里匹配到的属性` class='list'`会以下面这个形式`push`到`attrs`中，之后我们会对这种形式进行转换。

```javascript
[
  0: " class='list'"
  1: "class"
  2: "="
  3: undefined
  4: "list"
  5: undefined
  index: 0
  input: " class='list' v-if='list.length'><li v-for='(item, index) in list'>{{index}}:{{item}}</li></ul>"
  groups: undefined
  start: 3
  end: 16
]
```

字符串被更新为：

```javascript
" v-if='list.length'><li v-for='(item, index) in list'>{{index}}:{{item}}</li></ul>"
```

再次匹配属性`v-if='list.length'`，字符串`html`被更新为：

```javascript
"><li v-for='(item, index) in list'>{{index}}:{{item}}</li></ul>"
```

匹配到`>`，字符串`html`被更新为：

```javascript
"<li v-for='(item, index) in list'>{{index}}:{{item}}</li></ul>"
```

进入`handleStartTag`，定义在`parseHTML`内部：

```javascript
function handleStartTag(match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash
    
    //...

    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
}
```

该方先将之前的`match`中的`attrs`的每个属性转化成另一种形式的对象，然后向`stack`中`push`进一个对象，`stack`是在执行`parseHTML`开始的时候定义的变量，它的作用是保证开始标签和结束标签对应，更新`lastTag`，最后执行`options.start`。

之前的属性转化后的形式是：

```javascript
{
  name: "class"
  value: "list"
  start: 4
  end: 16
}
```

执行`options.start`，源码在`src/compiler/parser/html-parser.js`:

```javascript
start (tag, attrs, unary, start, end) {
      // ...
 
      // 创建AST
      let element: ASTElement = createASTElement(tag, attrs, currentParent)

      //...

      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        //
        processFor(element)
        processIf(element)
        processOnce(element)
      }

      if (!root) {
        root = element
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(root)
        }
      }

      if (!unary) {
        currentParent = element
        stack.push(element)
      } else {
        closeElement(element)
      }
}
```

该方法执行`createASTElement`来创建`AST`对象，然后对`AST`进行扩展，最后更新`currentParent`和`stack`，这里的`stack`，和之前的`stack`作用不同，主要是为了构建`AST`树而存在的。

`createASTElement`源码在`src/compiler/parser/index.js`

```javascript
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    // 表示元素是普通节点
    type: 1,
    // 元素的标签名
    tag,
    // 元素的所有属性
    attrsList: attrs,
    // 所有属性的映射
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    // 父节点
    parent,
    // 子节点
    children: []
  }
}
```

可以看出是`AST`就是普通的对象，创建`AST`后，就对它开始做扩展，扩展就是往它身上添加一些新的属性，这些属性就是标签中属性。比如，我们例子中的`ul`标签有`class`，有`v-if`，这些属性最终被扩展到`ul`对应的`AST`上。

```javascript
// 扩展v-for
processFor(element)
// 扩展v-if
processIf(element)
// 扩展v-once
processOnce(element)
```

这几行代码的作用就是向`AST`扩展属性，`ul`中有`v-if`，我们进入`processIf(element)`，方法定义在`src/compiler/parser/index.js`

```javascript
function processIf (el) {
  const exp = getAndRemoveAttr(el, 'v-if')
  if (exp) {
    el.if = exp
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}
```

该方法首先通过`getAndRemoveAttr`获取`v-if`对应的表达式，然后向`AST`中扩展`if`属性其值为`v-if`对应的表达式，然后执行`addIfCondition`方法，扩展`ifConditions`这个属性。

`getAndRemoveAttr`源码在`src/compiler/parser/helpers.js`。

`addIfCondition`源码在`src/compiler/parser/index.js`。

```javascript
if (!root) {
    root = element
    if (process.env.NODE_ENV !== 'production') {
        checkRootConstraints(root)
    }
}
```

这里是对`root`进行初始化，第一次执行`start`，`root`是`undefined`，会进入`if(!root)`分支，对`root`进行初始化为当前`ul`的`AST`。

```javascript
if (!unary) {
    currentParent = element
    stack.push(element)
} else {
    closeElement(element)
}
```

不是一元标签元素的情况下，会将`currentParent`指向当前的`AST`，并且向`stack`中`push`它，这里的目的是为了下一次解析`ul`的子标签时需要使用到，最终目的是为了构建`AST`树。

到这里第一次`while`循环结束。

此时我们的字符串`html`：

```javascript
"<li v-for='(item, index) in list'>{{index}}:{{item}}</li></ul>"
```

第二次进入`while`解析`li`，会以同样的方式，解析标签，创建`AST`，只是有一些分支会改变。例如，`li`标签内的属性是`v-for`，扩展`AST`对象会不同于`ul`的`AST`。

扩展`v-for`会执行`processFor(element)`，源码在`src/compiler/parser/index.js`。

```javascript
export function processFor (el: ASTElement) {
  let exp
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    const res = parseFor(exp)
    if (res) {
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`,
        el.rawAttrsMap['v-for']
      )
    }
  }
}
```

和`processIf(element)`一样，通过`getAndRemoveAttr`获取`v-for`对应的表达式，表达式是就是`v-for`对应的值`(item, index) in list`，然后对它进行解析，解析后的`res`是下面这样一个对象：

```javascript
{
  for: "list"
  alias: "item"
  iterator1: "index"
}
```

将这个对象的3个属性分别扩展到`li`对应的`AST`上。

第三次进入`while`，字符串`html`是：

```javascript
"{{index}}:{{item}}</li></ul>"
```

这时候`textEnd`的是`18`，会进入`textEnd >= 0`这个分支。

```javascript
let text, rest, next
if (textEnd >= 0) {
    rest = html.slice(textEnd)
    while (
        !endTag.test(rest) &&
        !startTagOpen.test(rest) &&
        !comment.test(rest) &&
        !conditionalComment.test(rest)
    ) {
        // < in plain text, be forgiving and treat it as text
        next = rest.indexOf('<', 1)
        if (next < 0) break
        textEnd += next
        rest = html.slice(textEnd)
    }
    text = html.substring(0, textEnd)
}

if (textEnd < 0) {
    text = html
}

if (text) {
    advance(text.length)
}

if (options.chars && text) {
    options.chars(text, index - text.length, index)
}
```

`if (textEnd >= 0)`分支中的`while`循环是为了当文本节点中包含`<`符号时，会继续向后寻找`<`，截取新找到的`<`符号索引之后的字符串`html`，匹配`while`条件4种中的其中一种。

截取文本`text`。

```javascript
"{{index}}:{{item}}"
```

更新字符串`html`。

```javascript
"</li></ul>"
```

执行`chars`，源码在`src/compiler/parser/index.js`。

```javascript
chars (text: string, start: number, end: number) {
    
    //...
    const children = currentParent.children
    if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
    } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = ''
    } else if (whitespaceOption) {
        if (whitespaceOption === 'condense') {
            // in condense mode, remove the whitespace node if it contains
            // line break, otherwise condense to a single space
            text = lineBreakRE.test(text) ? '' : ' '
        } else {
            text = ' '
        }
    } else {
        text = preserveWhitespace ? ' ' : ''
    }
    if (text) {
        if (!inPre && whitespaceOption === 'condense') {
            // condense consecutive whitespaces into single space
            text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ?ASTNode
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
            child = {
                type: 2,
                expression: res.expression,
                tokens: res.tokens,
                text
            }
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
            child = {
                type: 3,
                text
            }
        }
        if (child) {
            if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
                child.start = start
                child.end = end
            }
            children.push(child)
        }
    }
},
```

这个代码还是很多很复杂的，有两步比较关键：

1. `res = parseText(text, delimiters)`，对文本节点解析。
2. `children.push(child)`，构建`AST`树。

`parseText`源码在`src/compiler/parser/text-parser.js`。

```javascript
const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  while ((match = tagRE.exec(text))) {
    index = match.index
    // push text token
    if (index > lastIndex) {
      rawTokens.push(tokenValue = text.slice(lastIndex, index))
      tokens.push(JSON.stringify(tokenValue))
    }
    // tag token
    const exp = parseFilters(match[1].trim())
    tokens.push(`_s(${exp})`)
    rawTokens.push({ '@binding': exp })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}
```

`parseText`首先会根据参数`delimiters`获取正则`tagRE`，我们这里`delimiters`为`undefined`，采用默认的正则进行匹配。第一次匹配到的`match`：

```javascript
[
    0: "{{index}}"
    1: "index"
    index: 0
    input: "{{index}}:{{item}}"
    groups: undefined
]
```

不会进入`if (index > lastIndex)`分支，获取表达式`exp`，将它转换成`_s(${exp})` `push`到`rawTokens`，同时还会转换成`{@binding:exp}` `push`到`tokens`，更新`lastIndex`为`9`，这个下次起始匹配的索引。第二次循环匹配到的`match`：

```javascript
[
    0: "{{item}}"
    1: "item"
    index: 10
    input: "{{index}}:{{item}}"
    groups: undefined
]
```

此时的`index`是`10`，`index`是匹配到结果的开始位置，满足` index > lastIndex`，会截取`text`的纯文本也就是冒号`:`，并将它`push`到`tokens`和`rawTokens`中。然后和第一次循环一样，获取表达式`exp`，将转化后的`_s(${exp})` `push`到`rawTokens`，转换后的`{@binding:exp}` `push`到`tokens`，再次更新`lastIndex`为`18`，此时不会再次进入`while`循环，因为已经匹配不到东西了。最后返回下面这个对象：

```javascript
{
    expression: "_s(index)+":"+_s(item)",
    tokens:[
        0: {@binding: "index"}
		1: ":"
		2: {@binding: "item"}
    ]    
}
```

此时`child`也就是文本`AST`就被创建好了。如下：

```javascript
child = {
    type: 2,
    expression: res.expression,
    tokens: res.tokens,
    text
}
```

`type`为`2`表示`AST`是表达式文本节点。

第四次进入`while`，字符串`html`是：

```javascript
"</li></ul>"
```

匹配结束标签，进入下面的分支。

```javascript
var endTagMatch = html.match(endTag);
if (endTagMatch) {
    var curIndex = index;
    advance(endTagMatch[0].length);
    parseEndTag(endTagMatch[1], curIndex, index);
    continue
}
```

更新字符串`html`:

```javascript
"</ul>"
```

`parseEndTag`解析结束标签，源码在`src/compiler/parser/html-parser.js`。

```javascript
function parseEndTag(tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
        lowerCasedTagName = tagName.toLowerCase()
        for (pos = stack.length - 1; pos >= 0; pos--) {
            if (stack[pos].lowerCasedTag === lowerCasedTagName) {
                break
            }
        }
    } else {
        // If no tag name is provided, clean shop
        pos = 0
    }

    if (pos >= 0) {
        // Close all the open elements, up the stack
        for (let i = stack.length - 1; i >= pos; i--) {
            if (process.env.NODE_ENV !== 'production' &&
                (i > pos || !tagName) &&
                options.warn
               ) {
                options.warn(
                    `tag <${stack[i].tag}> has no matching end tag.`,
                    { start: stack[i].start, end: stack[i].end }
                )
            }
            if (options.end) {
                options.end(stack[i].tag, start, end)
            }
        }

        // Remove the open elements from the stack
        stack.length = pos
        lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
        if (options.start) {
            options.start(tagName, [], true, start, end)
        }
    } else if (lowerCasedTagName === 'p') {
        if (options.start) {
            options.start(tagName, [], false, start, end)
        }
        if (options.end) {
            options.end(tagName, start, end)
        }
    }
}
```

该方法主要是去判断`stack`中最后一位是否和当前的结束标签匹配，此时的`stack`中包含2个元素。

```javascript
[
  0: {tag: "ul", lowerCasedTag: "ul", ...}
  1: {tag: "li", lowerCasedTag: "li", ...}
]
```

而当前的`tagName`是`li`，和`stack`中的最后一位匹配，匹配后就会`pop` `stack`中的最后一个元素，并将`lastTag`更新为`stack`中的最后一个元素的标签名。

接着执行`options.end`，源码在`src/compiler/parser/index.js`。

```javascript
end (tag, start, end) {
    const element = stack[stack.length - 1]
    // pop stack
    stack.length -= 1
    currentParent = stack[stack.length - 1]
    if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
    }
    closeElement(element)
},
```

从`stack` 中`pop`出最后一位，并将`currentParent`指向`stack`中的最后一位元素，注意这个`stack`是在`parse`中定义的，存放的是所有`AST`元素。

执行`closeElement`，源码在`src/compiler/parser/index.js`。

```javascript
function closeElement (element) {
    trimEndingWhitespace(element)
    if (!inVPre && !element.processed) {
        element = processElement(element, options)
    }
    // tree management
    if (!stack.length && element !== root) {
        // allow root elements with v-if, v-else-if and v-else
        if (root.if && (element.elseif || element.else)) {
            if (process.env.NODE_ENV !== 'production') {
                checkRootConstraints(element)
            }
            addIfCondition(root, {
                exp: element.elseif,
                block: element
            })
        } else if (process.env.NODE_ENV !== 'production') {
            warnOnce(
                `Component template should contain exactly one root element. ` +
                `If you are using v-if on multiple elements, ` +
                `use v-else-if to chain them instead.`,
                { start: element.start }
            )
        }
    }
    if (currentParent && !element.forbidden) {
        if (element.elseif || element.else) {
            processIfConditions(element, currentParent)
        } else {
            if (element.slotScope) {
                // scoped slot
                // keep it in the children list so that v-else(-if) conditions can
                // find it as the prev node.
                const name = element.slotTarget || '"default"'
                ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
            }
            currentParent.children.push(element)
            element.parent = currentParent
        }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    if (element.pre) {
        inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
        inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
        postTransforms[i](element, options)
    }
}
```

关键步骤

1. `element = processElement(element, options)`，继续扩展`AST`。
2. `currentParent.children.push(element)` 和 `element.parent = currentParent`，构建`AST`树。

`processElement`源码在`src/compiler/parser/index.js`。

```javascript
export function processElement (
 element: ASTElement,
 options: CompilerOptions
) {
    processKey(element)

    // determine whether this is a plain element after
    // removing structural attributes
    element.plain = (
        !element.key &&
        !element.scopedSlots &&
        !element.attrsList.length
    )

    processRef(element)
    processSlotContent(element)
    processSlotOutlet(element)
    processComponent(element)
    for (let i = 0; i < transforms.length; i++) {
        element = transforms[i](element, options) || element
    }
    processAttrs(element)
    return element
}
```

该方法也是为`AST`扩展一些属性，当前的`element`是`li`的`AST`，只有`v-for`，这里面不会进行任何扩展。

第五次进入`while`，字符串`html`是：

```javascript
"</ul>"
```

更新字符串`html`:

```javascript
""
```

和解析`</li>`一样，先去和`parseHTML`定义的`stack`中匹配标签名，然后执行`options.end`更新`parse`定义的`stack`与`currentParent`，执行`closeElement`，执行`processElement`，这里会有些许不同，因为`ul`元素上含有`class='list'`属性，执行下列代码。

```javascript
for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
}
```

`transforms`是一个元素都是函数的数组，它是在执行`parse`时候通过执行`pluckModuleFunction` 返回的，根据参数`options.modules`，其实就是获取`modules`中的`transformNode`函数，其中`modules`中的`class`和`style`中定义了`transformNode`函数。这个参数是在最初执行`createCompiler`时候传入的`baseOptions`中所包含的。

`pluckModuleFunction` 源码在`src/compiler/helper.js`。

`createCompiler`源码在`src/platforms/web/compiler/index.js`。

```javascript
function transformNode (el: ASTElement, options: CompilerOptions) {
    const warn = options.warn || baseWarn
    const staticClass = getAndRemoveAttr(el, 'class')
    if (process.env.NODE_ENV !== 'production' && staticClass) {
        const res = parseText(staticClass, options.delimiters)
        if (res) {
            warn(
                `class="${staticClass}": ` +
                'Interpolation inside attributes has been removed. ' +
                'Use v-bind or the colon shorthand instead. For example, ' +
                'instead of <div class="{{ val }}">, use <div :class="val">.',
                el.rawAttrsMap['class']
            )
        }
    }
    if (staticClass) {
        el.staticClass = JSON.stringify(staticClass)
    }
    const classBinding = getBindingAttr(el, 'class', false /* getStatic */)
    if (classBinding) {
        el.classBinding = classBinding
    }
}
```

会向当前`AST`扩展新属性`staticClass`，其值为`"list"`。

至此，完整的`AST`已经构建完毕，构建完的`AST`：

```javascript
{
    type: 1
    tag: "ul"
    attrsList: []
    attrsMap: {class: "list", v-if: "list.length"}
    rawAttrsMap: {
        class: {name: "class", value: "list", start: 4, end: 16}, 
        v-if: {name: "v-if", value: "list.length", start: 17, end: 35}
    }
    parent: undefined
    children: [{
            type: 1
            tag: "li"
            attrsList: []
    		attrsMap: {v-for: "(item, index) in list"}
    		rawAttrsMap: {v-for: {…}}
    		parent: {type: 1, tag: "ul", attrsList: Array(0), attrsMap: {…}, rawAttrsMap: {…}, …}
    		children: [{
                    type: 2
                    expression: "_s(index)+":"+_s(item)"
                    tokens: [
                		{@binding: "index"},
                        ":",
                        {@binding: "item"}
					]
                    text: "{{index}}:{{item}}"
                    start: 70
                    end: 88
            }]
    		start: 36
    		end: 93
    		for: "list"
    		alias: "item"
			iterator1: "index"
			plain: true
    }]
    start: 0
    end: 98
    if: "list.length"
    ifConditions: [{exp: "list.length", block: {…}}]
    plain: false
    staticClass: ""list""
}
```
