`Vue3.x`的`baseParse`是编译的第一步，它的目的是将模板转换成`AST`。

`baseParse`源码：

```javascript
function baseParse(content, options = {}) {
  // 创建解析上下文
  const context = createParserContext(content, options)
  const start = getCursor(context)
  // 生成AST
  return createRoot(
    // 解析子节点
    parseChildren(context, 0 /* DATA */, []),
    getSelection(context, start)
  )
}
```

做了三件事情：

1. 创建解析上下文
2. 解析子节点
3. 生成`AST`

### 创建解析上下文

```javascript
function createParserContext(content, rawOptions) {
  const options = extend({}, defaultParserOptions)
  for (const key in rawOptions) {
    // @ts-ignore
    options[key] = rawOptions[key] || defaultParserOptions[key]
  }
  return {
    options,
    column: 1,
    line: 1,
    offset: 0,
    // 最初的原始代码
    originalSource: content,
    // 当前代码
    source: content,
    // 当前代码是否在 pre 标签内
    inPre: false,
    // 当前代码是否在 v-pre 指令的环境下
    inVPre: false,
  }
}
```

上下文的作用是，在解析模板的过程中，作为当前的解析状态。

### 解析子节点

```javascript
function parseChildren(context, mode, ancestors) {
  const parent = last(ancestors)
  const ns = parent ? parent.ns : 0 /* HTML */
  const nodes = []
  while (!isEnd(context, mode, ancestors)) {
    const s = context.source
    let node = undefined
    if (mode === 0 /* DATA */ || mode === 1 /* RCDATA */) {
      if (!context.inVPre && startsWith(s, context.options.delimiters[0])) {
        // '{{'
        node = parseInterpolation(context, mode)
      } else if (mode === 0 /* DATA */ && s[0] === "<") {
        // https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state
        if (s.length === 1) {
          emitError(context, 5 /* EOF_BEFORE_TAG_NAME */, 1)
        } else if (s[1] === "!") {
          // https://html.spec.whatwg.org/multipage/parsing.html#markup-declaration-open-state
          if (startsWith(s, "<!--")) {
            // 注释节点
            node = parseComment(context)
          } else if (startsWith(s, "<!DOCTYPE")) {
            // Ignore DOCTYPE by a limitation.
            node = parseBogusComment(context)
          } else if (startsWith(s, "<![CDATA[")) {
            if (ns !== 0 /* HTML */) {
              node = parseCDATA(context, ancestors)
            } else {
              emitError(context, 1 /* CDATA_IN_HTML_CONTENT */)
              node = parseBogusComment(context)
            }
          } else {
            emitError(context, 11 /* INCORRECTLY_OPENED_COMMENT */)
            node = parseBogusComment(context)
          }
        } else if (s[1] === "/") {
          // https://html.spec.whatwg.org/multipage/parsing.html#end-tag-open-state
          if (s.length === 2) {
            emitError(context, 5 /* EOF_BEFORE_TAG_NAME */, 2)
          } else if (s[2] === ">") {
            emitError(context, 14 /* MISSING_END_TAG_NAME */, 2)
            advanceBy(context, 3)
            continue
          } else if (/[a-z]/i.test(s[2])) {
            emitError(context, 23 /* X_INVALID_END_TAG */)
            parseTag(context, 1 /* End */, parent)
            continue
          } else {
            emitError(
              context,
              12 /* INVALID_FIRST_CHARACTER_OF_TAG_NAME */,
              2
            )
            node = parseBogusComment(context)
          }
        } else if (/[a-z]/i.test(s[1])) {
          // 元素节点
          node = parseElement(context, ancestors)
        } else if (s[1] === "?") {
          emitError(
            context,
            21 /* UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME */,
            1
          )
          node = parseBogusComment(context)
        } else {
          emitError(context, 12 /* INVALID_FIRST_CHARACTER_OF_TAG_NAME */, 1)
        }
      }
    }
    if (!node) {
      // 文本节点
      node = parseText(context, mode)
    }
    if (isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        pushNode(nodes, node[i])
      }
    } else {
      pushNode(nodes, node)
    }
  }
  
  // 处理空白符文本节点...
    
  return removedWhitespace ? nodes.filter(Boolean) : nodes
}
```

解析子节点的过程，就是根据`context.source`的不同，走到不同的分支逻辑，解析不同的节点，比较常见的节点种类：

- 插值节点
- 文本节点
- 元素节点

当解析完节点后，会进行对空白符文本节点的处理，换行符，缩进，空格都会被解析为文本节点，编译的过程就就会对着写文本节点做处理，这些处理都是无意义的，所以当节点解析完毕后，会对这些空白符文本节点做替换，最后全部过滤掉，这样就能加快编译的速度。

#### 插值节点

```javascript
function parseInterpolation(context, mode) {
  const [open, close] = context.options.delimiters
  const closeIndex = context.source.indexOf(close, open.length)
  if (closeIndex === -1) {
    emitError(context, 25 /* X_MISSING_INTERPOLATION_END */)
    return undefined
  }
  const start = getCursor(context)
  advanceBy(context, open.length)
  const innerStart = getCursor(context)
  const innerEnd = getCursor(context)
  const rawContentLength = closeIndex - open.length
  const rawContent = context.source.slice(0, rawContentLength)
  const preTrimContent = parseTextData(context, rawContentLength, mode)
  const content = preTrimContent.trim()
  const startOffset = preTrimContent.indexOf(content)
  if (startOffset > 0) {
    advancePositionWithMutation(innerStart, rawContent, startOffset)
  }
  const endOffset =
    rawContentLength - (preTrimContent.length - content.length - startOffset)
  advancePositionWithMutation(innerEnd, rawContent, endOffset)
  advanceBy(context, close.length)
  return {
    type: 5 /* INTERPOLATION */,
    content: {
      type: 4 /* SIMPLE_EXPRESSION */,
      isStatic: false,
      // Set `isConstant` to false by default and will decide in transformExpression
      isConstant: false,
      content,
      loc: getSelection(context, innerStart, innerEnd),
    },
    loc: getSelection(context, start),
  }
}
```

首先，尝试获取插值节点的结束分隔符，找不到则报错，如果找到了，通过执行`advanceBy`更新上下文中的位置信息，前进解析模板。

获取插值节点的中间内容，判断其是否包含空格，如果包含，则更新位置信息，前进解析模板。

最后，返回一个插值节点描述的对象，`type`表示节点的种类，`loc`表示节点的位置信息，`content`表示节点的内容，插值节点的内容是表达式节点，所以它的`content`也是一个节点描述对象。

#### 文本节点

```javascript
function parseText(context, mode) {
  const endTokens = ["<", context.options.delimiters[0]]
  if (mode === 3 /* CDATA */) {
    endTokens.push("]]>")
  }
  let endIndex = context.source.length
  for (let i = 0; i < endTokens.length; i++) {
    const index = context.source.indexOf(endTokens[i], 1)
    if (index !== -1 && endIndex > index) {
      endIndex = index
    }
  }
  const start = getCursor(context)
  const content = parseTextData(context, endIndex, mode)
  return {
    type: 2 /* TEXT */,
    content,
    loc: getSelection(context, start),
  }
}
```

文本节点除了纯文本节点，可能会包含插值节点或元素节点，所以文本节点需要匹配正的确结束索引，也就是`{{`和`<`前面的位置。

然后通过执行`parseTextData`获取纯文本内容，并更新位置信息，前进代码，最后返回文本节点描述对象。

#### 元素节点

```javascript
function parseElement(context, ancestors) {
  // Start tag.
  const wasInPre = context.inPre
  const wasInVPre = context.inVPre
  const parent = last(ancestors)
  const element = parseTag(context, 0 /* Start */, parent)
  const isPreBoundary = context.inPre && !wasInPre
  const isVPreBoundary = context.inVPre && !wasInVPre
  if (element.isSelfClosing || context.options.isVoidTag(element.tag)) {
    return element
  }
  // Children.
  ancestors.push(element)
  const mode = context.options.getTextMode(element, parent)
  const children = parseChildren(context, mode, ancestors)
  ancestors.pop()
  element.children = children
  // End tag.
  if (startsWithEndTagOpen(context.source, element.tag)) {
    parseTag(context, 1 /* End */, parent)
  } else {
    emitError(context, 24 /* X_MISSING_END_TAG */, 0, element.loc.start)
    if (
      context.source.length === 0 &&
      element.tag.toLowerCase() === "script"
    ) {
      const first = children[0]
      if (first && startsWith(first.loc.source, "<!--")) {
        emitError(context, 8 /* EOF_IN_SCRIPT_HTML_COMMENT_LIKE_TEXT */)
      }
    }
  }
  element.loc = getSelection(context, element.loc.start)
  if (isPreBoundary) {
    context.inPre = false
  }
  if (isVPreBoundary) {
    context.inVPre = false
  }
  return element
}
```

元素节点解析是所有节点中最复杂的，它主要做了两件事：**解析开始标签**，**递归解析子节点**。

- ##### 解析开始标签

通过执行`parseTag`解析开始标签，源码：

```javascript
function parseTag(context, type, parent) {
  // Tag open.
  const start = getCursor(context)
  const match = /^<\/?([a-z][^\t\r\n\f />]*)/i.exec(context.source)
  const tag = match[1]
  const ns = context.options.getNamespace(tag, parent)
  advanceBy(context, match[0].length)
  advanceSpaces(context)
  // save current state in case we need to re-parse attributes with v-pre
  const cursor = getCursor(context)
  const currentSource = context.source
  // Attributes.
  let props = parseAttributes(context, type)
  // check <pre> tag
  if (context.options.isPreTag(tag)) {
    context.inPre = true
  }
  // check v-pre
  if (
    !context.inVPre &&
    props.some((p) => p.type === 7 /* DIRECTIVE */ && p.name === "pre")
  ) {
    context.inVPre = true
    // reset context
    extend(context, cursor)
    context.source = currentSource
    // re-parse attrs and filter out v-pre itself
    props = parseAttributes(context, type).filter((p) => p.name !== "v-pre")
  }
  // Tag close.
  let isSelfClosing = false
  if (context.source.length === 0) {
    emitError(context, 9 /* EOF_IN_TAG */)
  } else {
    isSelfClosing = startsWith(context.source, "/>")
    if (type === 1 /* End */ && isSelfClosing) {
      emitError(context, 4 /* END_TAG_WITH_TRAILING_SOLIDUS */)
    }
    advanceBy(context, isSelfClosing ? 2 : 1)
  }
  let tagType = 0 /* ELEMENT */
  const options = context.options
  if (!context.inVPre && !options.isCustomElement(tag)) {
    const hasVIs = props.some(
      (p) => p.type === 7 /* DIRECTIVE */ && p.name === "is"
    )
    if (options.isNativeTag && !hasVIs) {
      if (!options.isNativeTag(tag)) tagType = 1 /* COMPONENT */
    } else if (
      hasVIs ||
      isCoreComponent(tag) ||
      (options.isBuiltInComponent && options.isBuiltInComponent(tag)) ||
      /^[A-Z]/.test(tag) ||
      tag === "component"
    ) {
      tagType = 1 /* COMPONENT */
    }
    if (tag === "slot") {
      tagType = 2 /* SLOT */
    } else if (
      tag === "template" &&
      props.some((p) => {
        return (
          p.type === 7 /* DIRECTIVE */ && isSpecialTemplateDirective(p.name)
        )
      })
    ) {
      tagType = 3 /* TEMPLATE */
    }
  }
  return {
    type: 1 /* ELEMENT */,
    ns,
    tag,
    tagType,
    props,
    isSelfClosing,
    children: [],
    loc: getSelection(context, start),
    codegenNode: undefined, // to be created during transform phase
  }
}
```

通过正则匹配标签名称，然后解析属性，判断当前标签是否为`pre`，判断解析的属性中是否包含`v-pre`指令，如果包含，则重置坐标信息和上下文为解析属性之前的值，并重新解析属性，且过滤掉`v-pre`属性。

接下来判断元素节点是否为自闭和标签，闭合标签会在解析完成后直接返回，因为它不包含子节点。

最后需要判断元素节点的标签类型，因为元素节点可能是`template`，组件，以及`slot`。

通过执行`parseAttributes`解析标签中的属性，源码：

```javascript
function parseAttributes(context, type) {
  const props = []
  const attributeNames = new Set()
  while (
    context.source.length > 0 &&
    !startsWith(context.source, ">") &&
    !startsWith(context.source, "/>")
  ) {
    if (startsWith(context.source, "/")) {
      emitError(context, 22 /* UNEXPECTED_SOLIDUS_IN_TAG */)
      advanceBy(context, 1)
      advanceSpaces(context)
      continue
    }
    if (type === 1 /* End */) {
      emitError(context, 3 /* END_TAG_WITH_ATTRIBUTES */)
    }
    const attr = parseAttribute(context, attributeNames)
    if (type === 0 /* Start */) {
      props.push(attr)
    }
    if (/^[^\t\r\n\f />]/.test(context.source)) {
      emitError(context, 15 /* MISSING_WHITESPACE_BETWEEN_ATTRIBUTES */)
    }
    advanceSpaces(context)
  }
  return props
}
```

解析属性的条件是，当前模板的长度大于`0`，且`>`和`/>`这两种闭合分隔符不在当前模板的起始位置时，通过执行`parseAttribute`解析属性，将解析后的属性压入`props`，最后返回。

`parseAttribute`源码：

```javascript
function parseAttribute(context, nameSet) {
  // Name.
  const start = getCursor(context)
  const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source)
  const name = match[0]
  if (nameSet.has(name)) {
    emitError(context, 2 /* DUPLICATE_ATTRIBUTE */)
  }
  nameSet.add(name)
  if (name[0] === "=") {
    emitError(context, 19 /* UNEXPECTED_EQUALS_SIGN_BEFORE_ATTRIBUTE_NAME */)
  }
  {
    const pattern = /["'<]/g
    let m
    while ((m = pattern.exec(name))) {
      emitError(
        context,
        17 /* UNEXPECTED_CHARACTER_IN_ATTRIBUTE_NAME */,
        m.index
      )
    }
  }
  advanceBy(context, name.length)
  // Value
  let value = undefined
  if (/^[\t\r\n\f ]*=/.test(context.source)) {
    advanceSpaces(context)
    advanceBy(context, 1)
    advanceSpaces(context)
    value = parseAttributeValue(context)
    if (!value) {
      emitError(context, 13 /* MISSING_ATTRIBUTE_VALUE */)
    }
  }
  const loc = getSelection(context, start)
  if (!context.inVPre && /^(v-|:|@|#)/.test(name)) {
    const match = /(?:^v-([a-z0-9-]+))?(?:(?::|^@|^#)(\[[^\]]+\]|[^\.]+))?(.+)?$/i.exec(
      name
    )
    // 指令
    const dirName =
      match[1] ||
      (startsWith(name, ":") ? "bind" : startsWith(name, "@") ? "on" : "slot")
    let arg
    
    if (match[2]) {
      const isSlot = dirName === "slot"
      const startOffset = name.indexOf(match[2])
      const loc = getSelection(
        context,
        getNewPosition(context, start, startOffset),
        getNewPosition(
          context,
          start,
          startOffset + match[2].length + ((isSlot && match[3]) || "").length
        )
      )
      // 指令对应的表达式
      let content = match[2]
      let isStatic = true
      if (content.startsWith("[")) {
        isStatic = false
        if (!content.endsWith("]")) {
          emitError(
            context,
            26 /* X_MISSING_DYNAMIC_DIRECTIVE_ARGUMENT_END */
          )
        }
        content = content.substr(1, content.length - 2)
      } else if (isSlot) {
        // #1241 special case for v-slot: vuetify relies extensively on slot
        // names containing dots. v-slot doesn't have any modifiers and Vue 2.x
        // supports such usage so we are keeping it consistent with 2.x.
        content += match[3] || ""
      }
      arg = {
        type: 4 /* SIMPLE_EXPRESSION */,
        content,
        isStatic,
        isConstant: isStatic,
        loc,
      }
    }
    if (value && value.isQuoted) {
      const valueLoc = value.loc
      valueLoc.start.offset++
      valueLoc.start.column++
      valueLoc.end = advancePositionWithClone(valueLoc.start, value.content)
      valueLoc.source = valueLoc.source.slice(1, -1)
    }
    return {
      type: 7 /* DIRECTIVE */,
      name: dirName,
      exp: value && {
        type: 4 /* SIMPLE_EXPRESSION */,
        content: value.content,
        isStatic: false,
        // Treat as non-constant by default. This can be potentially set to
        // true by `transformExpression` to make it eligible for hoisting.
        isConstant: false,
        loc: value.loc,
      },
      arg,
      modifiers: match[3] ? match[3].substr(1).split(".") : [],
      loc,
    }
  }
  return {
    type: 6 /* ATTRIBUTE */,
    name,
    value: value && {
      type: 2 /* TEXT */,
      content: value.content,
      loc: value.loc,
    },
    loc,
  }
}
```

属性解析，首先匹配属性的`name`，并添加到`nameSet`中，如果存在重复的属性，则会报错。

通过匹配，判断该属性是否有值，如果有，就通过执行`parseAttributeValue`解析对应的值。

匹配后的`name`如果为`Vue`指令，会去匹配其对应的指令`dirName`，指令如果包含了表达式，就会检测表达式是否为动态，最终会返回指令节点描述对象，指令节点的`exp`是表达式节点描述对象。

如果不是指令，则会返回普通属性节点描述对象，它的`value`就是普通的文本节点对象。

- ##### 递归解析子节点

```javascript
// Children.
ancestors.push(element)
const mode = context.options.getTextMode(element, parent)
const children = parseChildren(context, mode, ancestors)
ancestors.pop()
element.children = children
```

将解析完的元素压入到`ancestors`中，通过`parseChildren`解析子节点，解析完毕后，在弹出压入的元素，将解析好的子节点，保存到当前节点的`children`中，构建父子关系。

### 生成AST

```javascript
function createRoot(children, loc = locStub) {
  return {
    type: 0 /* ROOT */,
    children,
    helpers: [],
    components: [],
    directives: [],
    hoists: [],
    imports: [],
    cached: 0,
    temps: 0,
    codegenNode: undefined,
    loc,
  }
}
```

`AST`本质就是一个对象，它包含了一些属性，其中`children`就是之前解析的节点。